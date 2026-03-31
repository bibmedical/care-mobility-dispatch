import { authorizePersistedSystemUser } from '@/server/system-users-store';
import { is2FAEnabled } from '@/server/2fa-store';
import { getRecentFailures, logLoginFailure } from '@/server/login-failures-store';
import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const TEMP_2FA_FILE = getStorageFilePath('temp-2fa-sessions.json');
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

const writeTempSession = async (sessions) => {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    await writeFile(TEMP_2FA_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing temp 2FA session:', error);
  }
};

const readTempSessions = async () => {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(TEMP_2FA_FILE, 'utf8');
    return JSON.parse(content) || {};
  } catch {
    return {};
  }
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
        error: 'Username o password incorrecto.',
        attemptsLeft,
        message: attemptsLeft > 0 ? `Credenciales invalidas. Te quedan ${attemptsLeft} intento(s) antes del bloqueo temporal.` : 'Credenciales invalidas.'
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
        
        // Store temp session with expiration (5 minutes)
        const sessions = await readTempSessions();
        sessions[tempToken] = {
          userId: user.id,
          email: user.email,
          username: user.username,
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000
        };
        
        // Clean up expired sessions
        Object.keys(sessions).forEach(key => {
          if (sessions[key].expiresAt < Date.now()) {
            delete sessions[key];
          }
        });

        await writeTempSession(sessions);

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
