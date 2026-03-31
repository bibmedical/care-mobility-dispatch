import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { verify2FASecretAndEnable } from '@/server/2fa-store';

export async function POST(req) {
  try {
    const session = await getServerSession(options);
    if (!session || session.user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { secret, token } = await req.json();

    if (!secret || !token) {
      return new Response(JSON.stringify({ error: 'Missing secret or token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (token.length !== 6 || isNaN(token)) {
      return new Response(JSON.stringify({ error: 'Invalid token format. Must be 6 digits.'  }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify and enable 2FA
    const result = await verify2FASecretAndEnable(session.user.id, secret, token);

    if (!result.success) {
      return new Response(JSON.stringify({
        error: result.error || 'Verification failed'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: '2FA successfully enabled'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error verifying 2FA:', error);
    return new Response(JSON.stringify({
      error: 'Verification failed',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
