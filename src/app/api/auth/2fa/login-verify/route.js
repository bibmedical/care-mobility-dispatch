import { verify2FAToken } from '@/server/2fa-store';
import { markTemp2FASessionVerified, readTemp2FASession } from '@/server/temp-2fa-session-store';
import { verifyPersistedSystemUserWebLoginCode } from '@/server/system-users-store';

export async function POST(req) {
  try {
    const { tempToken, code } = await req.json();

    if (!tempToken || !code) {
      return new Response(JSON.stringify({ error: 'Missing tempToken or code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (code.length !== 6 || isNaN(code)) {
      return new Response(JSON.stringify({ error: 'Invalid code format. Must be 6 digits.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get temp session
    const tempSession = await readTemp2FASession(tempToken);

    if (!tempSession) {
      return new Response(JSON.stringify({ error: 'Invalid or expired temporary token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if expired
    if (tempSession.expiresAt < Date.now()) {
      return new Response(JSON.stringify({ error: 'Temporary token expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let result = { valid: false, error: 'Invalid verification code' };
    if (tempSession.mode === 'web-pin') {
      const validPin = await verifyPersistedSystemUserWebLoginCode(tempSession.userId, code);
      result = validPin ? { valid: true } : { valid: false, error: 'Invalid web code' };
    } else if (tempSession.mode === 'web-pin-setup') {
      result = { valid: false, error: 'You must create your web code first.' };
    } else {
      result = await verify2FAToken(tempSession.userId, code);
    }

    if (!result.valid) {
      return new Response(JSON.stringify({
        valid: false,
        error: result.error || 'Invalid code'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const marked = await markTemp2FASessionVerified(tempToken);
    if (!marked) {
      return new Response(JSON.stringify({
        valid: false,
        error: 'Verification session expired. Please sign in again.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      valid: true,
      message: 'Verification complete. You can now finish signing in.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error during 2FA login verification:', error);
    return new Response(JSON.stringify({
      error: 'Verification failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
