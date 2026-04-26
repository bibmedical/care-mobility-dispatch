import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { getAllFailureLogs } from '@/server/login-failures-store';

export async function GET(req) {
  try {
    // Check authentication
    const session = await getServerSession(options);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin
    if (session.user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get query parameters
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    // Fetch logs
    const logs = await getAllFailureLogs(Math.min(limit, 500)); // Max 500

    return new Response(JSON.stringify({
      success: true,
      count: logs.length,
      logs
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching login failures:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch login failure logs',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
