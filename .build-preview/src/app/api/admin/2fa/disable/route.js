import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { disable2FA } from '@/server/2fa-store';

export async function POST(req) {
  try {
    const session = await getServerSession(options);
    if (!session || session.user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await disable2FA(session.user.id);

    if (!result.success) {
      return new Response(JSON.stringify({
        error: result.error || 'Failed to disable 2FA'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: '2FA successfully disabled'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    return new Response(JSON.stringify({
      error: 'Failed to disable 2FA',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
