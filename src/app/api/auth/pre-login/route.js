import { authorizePersistedSystemUser } from '@/server/system-users-store';
import { is2FAEnabled } from '@/server/2fa-store';
import { getRecentFailures, logLoginFailure } from '@/server/login-failures-store';
import { createTemp2FASession } from '@/server/temp-2fa-session-store';
import { randomBytes } from 'crypto';
const MAX_LOGIN_FAILURES = parseInt(process.env.LOGIN_MAX_FAILURES || '5', 10);
const LOGIN_LOCK_WINDOW_MINUTES = parseInt(process.env.LOGIN_LOCK_WINDOW_MINUTES || '15', 10);

const formatRemainingTime = totalSeconds => {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const buildLockoutResponse = (remainingMs, reason = 'Too many failed login attempts.') => {
  const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const lockRemaining = formatRemainingTime(retryAfterSeconds);

  return new Response(JSON.stringify({
    error: 'Account temporarily locked.',
    isBlocked: true,
    retryAfterSeconds,
    lockRemaining,
    contactAdmin: true,
    message: `Account temporarily locked due to too many attempts. Time remaining: ${lockRemaining}. Contact your admin.`,
    reason
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds)
    }
  });
};

const getLockRemainingMs = failures => {
  if (!Array.isArray(failures) || failures.length < MAX_LOGIN_FAILURES) {
    return 0;
  }

  const lockAnchor = failures[failures.length - MAX_LOGIN_FAILURES];
  if (!lockAnchor?.timestamp) {
    return 0;
  }

  const lockWindowMs = LOGIN_LOCK_WINDOW_MINUTES * 60 * 1000;
  return lockAnchor.timestamp + lockWindowMs - Date.now();
};

export async function POST(req) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();

    // Check lockout before validating credentials.
    const recentFailures = await getRecentFailures(normalizedIdentifier, LOGIN_LOCK_WINDOW_MINUTES);
    const lockRemainingMs = getLockRemainingMs(recentFailures);
    if (lockRemainingMs > 0) {
      return buildLockoutResponse(lockRemainingMs);
    }

    let user = null;
    try {
      // Verify credentials.
      user = await authorizePersistedSystemUser({
        identifier,
        password,
        clientType: 'web'
      });
    } catch (authError) {
      await logLoginFailure({
        identifier: normalizedIdentifier,
        reason: authError?.message || 'Invalid credentials',
        clientType: 'web',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      });

      const updatedFailures = await getRecentFailures(normalizedIdentifier, LOGIN_LOCK_WINDOW_MINUTES);
      const updatedLockRemainingMs = getLockRemainingMs(updatedFailures);
      if (updatedLockRemainingMs > 0) {
        return buildLockoutResponse(updatedLockRemainingMs);
      }

      const attemptsLeft = Math.max(0, MAX_LOGIN_FAILURES - updatedFailures.length);
      return new Response(JSON.stringify({
        error: 'Incorrect username or password.',
        attemptsLeft,
        message: attemptsLeft > 0 ? `Invalid credentials. You have ${attemptsLeft} attempt(s) left before temporary lockout.` : 'Invalid credentials.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user has 2FA enabled and is admin
    if (user.role === 'admin') {
      const twoFAEnabled = await is2FAEnabled(user.id);

      if (twoFAEnabled) {
        // Generate temporary token for 2FA verification
        const tempToken = randomBytes(32).toString('hex');

        await createTemp2FASession({
          token: tempToken,
          userId: user.id,
          email: user.email,
          username: user.username,
        });

        return new Response(JSON.stringify({
          requires2FA: true,
          tempToken,
          message: 'Please verify with 2FA'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // No 2FA required, proceed with normal login
    return new Response(JSON.stringify({
      requires2FA: false,
      message: 'Credentials verified. Please complete signin.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in pre-login check:', error);
    return new Response(JSON.stringify({
      error: 'Pre-login check failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
