import { verify2FAToken } from '@/server/2fa-store';

export async function POST(req) {
  try {
    const { userId, token } = await req.json();

    if (!userId || !token) {
      return new Response(JSON.stringify({ error: 'Missing userId or token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (token.length !== 6 || isNaN(token)) {
      return new Response(JSON.stringify({ error: 'Invalid token format. Must be 6 digits.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify token
    const result = await verify2FAToken(userId, token);

    if (!result.valid) {
      return new Response(JSON.stringify({
        valid: false,
        error: result.error || 'Invalid 2FA code'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      valid: true,
      message: '2FA verification successful'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error during 2FA verification:', error);
    return new Response(JSON.stringify({
      error: 'Verification failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
