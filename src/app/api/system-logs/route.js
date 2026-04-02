import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getAllActivityLogs, getActivityLogsByRole, getActivityLogsByUserId, getActivityLogsSummary, logUserActionEvent } from '@/server/activity-logs-store';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role'); // 'admin', 'driver', 'attendant', etc.
    const userId = searchParams.get('userId');
    const summary = searchParams.get('summary') === 'true';

    if (summary) {
      const stats = await getActivityLogsSummary();
      return Response.json(stats);
    }

    let logs;
    if (userId) {
      logs = await getActivityLogsByUserId(userId);
    } else if (role) {
      logs = await getActivityLogsByRole(role);
    } else {
      logs = await getAllActivityLogs();
    }

    return Response.json({ success: true, logs });
  } catch (error) {
    console.error('Error in system logs API:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const eventLabel = String(body?.eventLabel || '').trim();
    if (!eventLabel) {
      return Response.json({ success: false, error: 'eventLabel is required' }, { status: 400 });
    }

    const logEntry = await logUserActionEvent({
      userId: session.user.id,
      userName: session.user.username || session.user.name || session.user.email || 'Unknown',
      userRole: session.user.role || 'unknown',
      userEmail: session.user.email || 'unknown',
      eventLabel,
      target: String(body?.target || ''),
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : null
    });

    return Response.json({ success: true, logEntry });
  } catch (error) {
    console.error('Error creating system log event:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
