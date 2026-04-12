import { authorizePersistedSystemUser, findPersistedSystemUserByIdentifier } from '@/server/system-users-store';
import { getRecentFailures, logLoginFailure } from '@/server/login-failures-store';
import { createTemp2FASession } from '@/server/temp-2fa-session-store';
import { hasActiveWebSession, revokeOtherWebAuthSessions } from '@/server/web-auth-session-store';
import { randomBytes } from 'crypto';
const MAX_LOGIN_FAILURES = parseInt(process.env.LOGIN_MAX_FAILURES || '5', 10);
const LOGIN_LOCK_WINDOW_MINUTES = parseInt(process.env.LOGIN_LOCK_WINDOW_MINUTES || '15', 10);
const isLocalPasswordlessWebEnabled = () => process.env.NODE_ENV !== 'production';
const isWebDuplicateSessionGuardEnabled = () => String(process.env.ENABLE_WEB_SESSION_GUARD || '').trim().toLowerCase() === 'true';

const normalizeIp = value => {
  const raw = String(value ?? '').split(',')[0].trim();
  if (!raw) return '';
  if (raw === '::1' || raw === '127.0.0.1' || raw === '::ffff:127.0.0.1') return 'localhost';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const getRequestIp = req => normalizeIp(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '');

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
    message: `Account temporarily locked due to too many attempts. Time remaining: ${lockRemaining}. Contact your administrator.`,
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
    const requestIp = getRequestIp(req);
    const { identifier, password, forceSessionTakeover } = await req.json();
    const shouldForceSessionTakeover = String(forceSessionTakeover || '').trim().toLowerCase() === 'true';

    if (!identifier || (!password && !isLocalPasswordlessWebEnabled())) {
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
      user = !String(password || '').trim() && isLocalPasswordlessWebEnabled()
        ? await findPersistedSystemUserByIdentifier(identifier)
        : await authorizePersistedSystemUser({
          identifier,
          password,
          clientType: 'web'
        });
    } catch (authError) {
      const authMessage = String(authError?.message || '');
      if (authMessage.includes('DATABASE_URL is not set')) {
        return new Response(JSON.stringify({
          error: 'Local database is not configured.',
          message: 'Set DATABASE_URL in .env.local to enable local SQL user login.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

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
        error: 'Invalid username or password.',
        attemptsLeft,
        message: attemptsLeft > 0 ? `Invalid credentials. ${attemptsLeft} attempt(s) left before temporary lock.` : 'Invalid credentials.'
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

    const hasActiveSession = isWebDuplicateSessionGuardEnabled()
      ? await hasActiveWebSession(user.id, { requestIp })
      : false;
    if (hasActiveSession) {
      if (shouldForceSessionTakeover) {
        await revokeOtherWebAuthSessions(user.id, {
          reason: 'Forced takeover during pre-login validation'
        });
      } else {
      return new Response(JSON.stringify({
        error: 'This account is already active in another web session.',
        message: 'This account is already active in another web session. Sign out there first, then try again.',
        canForceTakeover: true
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
      }
    }

    const storedWebCode = String(user?.webLoginCode || '').replace(/\D/g, '').slice(0, 6);

    // Generate temporary challenge token for mandatory web code setup/verification.
    const tempToken = randomBytes(32).toString('hex');
    const challengeMode = storedWebCode.length === 6 ? 'web-pin' : 'web-pin-setup';
    await createTemp2FASession({
      token: tempToken,
      userId: user.id,
      email: user.email,
      username: user.username,
      mode: challengeMode
    });

    return new Response(JSON.stringify({
      requires2FA: true,
      tempToken,
      method: challengeMode,
      requiresCodeSetup: challengeMode === 'web-pin-setup',
      message: challengeMode === 'web-pin-setup'
        ? 'For security, you must create your 6-digit web code before signing in.'
        : 'Enter your 6-digit web code to complete sign-in.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error in pre-login check:', error);
    return new Response(JSON.stringify({
      error: 'Pre-login validation failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
