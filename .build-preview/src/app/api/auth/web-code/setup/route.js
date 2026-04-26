import { markTemp2FASessionVerified, readTemp2FASession } from '@/server/temp-2fa-session-store';
import { setPersistedSystemUserWebLoginCode } from '@/server/system-users-store';

export async function POST(req) {
  try {
    const { tempToken, code, confirmCode } = await req.json();

    const normalizedToken = String(tempToken || '').trim();
    const normalizedCode = String(code || '').replace(/\D/g, '').slice(0, 6);
    const normalizedConfirmCode = String(confirmCode || '').replace(/\D/g, '').slice(0, 6);

    if (!normalizedToken) {
      return new Response(JSON.stringify({ error: 'Missing temporary token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (normalizedCode.length !== 6) {
      return new Response(JSON.stringify({ error: 'Code must be exactly 6 digits' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (normalizedCode !== normalizedConfirmCode) {
      return new Response(JSON.stringify({ error: 'Codes do not match' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tempSession = await readTemp2FASession(normalizedToken);
    if (!tempSession) {
      return new Response(JSON.stringify({ error: 'Invalid or expired temporary token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (tempSession.mode !== 'web-pin-setup') {
      return new Response(JSON.stringify({ error: 'Invalid setup session mode' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (tempSession.expiresAt < Date.now()) {
      return new Response(JSON.stringify({ error: 'Temporary token expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await setPersistedSystemUserWebLoginCode(tempSession.userId, normalizedCode);

    const marked = await markTemp2FASessionVerified(normalizedToken);
    if (!marked) {
      return new Response(JSON.stringify({ error: 'Verification session expired. Please sign in again.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      valid: true,
      message: 'Web code created successfully. You can now complete sign-in.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error during web code setup:', error);
    return new Response(JSON.stringify({
      error: 'Web code setup failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
