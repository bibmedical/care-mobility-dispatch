import { verify2FAToken } from '@/server/2fa-store';
import { deleteTemp2FASession, readTemp2FASession } from '@/server/temp-2fa-session-store';

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
      return new Response(JSON.stringify({ error: 'Invalid or expired temp token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if expired
    if (tempSession.expiresAt < Date.now()) {
      await deleteTemp2FASession(tempToken);
      return new Response(JSON.stringify({ error: 'Temp token expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify 2FA code
    const result = await verify2FAToken(tempSession.userId, code);

    if (!result.valid) {
      return new Response(JSON.stringify({
        valid: false,
        error: result.error || 'Invalid 2FA code'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Clean up temp session
    await deleteTemp2FASession(tempToken);

    return new Response(JSON.stringify({
      valid: true,
      message: '2FA verified. You can now complete signin.'
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
