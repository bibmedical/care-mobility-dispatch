import { logLogoutEvent } from '@/server/activity-logs-store';

export async function POST(req) {
  try {
    const { userId } = await req.json();
    
    if (!userId) {
      return Response.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const logEntry = await logLogoutEvent(userId);
    return Response.json({ success: true, logEntry });
  } catch (error) {
    console.error('Error logging logout:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
