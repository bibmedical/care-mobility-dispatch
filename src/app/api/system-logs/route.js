import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { clearAllActivityLogs, getAllActivityLogs, getActivityLogsByRole, getActivityLogsByUserId, getActivityLogsSummary, logPresenceHeartbeat, logUserActionEvent } from '@/server/activity-logs-store';

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

    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : null;
    const normalizedEventLabel = eventLabel.toLowerCase();
    const isPresenceHeartbeat = normalizedEventLabel === 'presence heartbeat' || String(metadata?.kind || '').toLowerCase() === 'presence-heartbeat';
    const isClearAllRequest = normalizedEventLabel === 'clear all logs' || body?.action === 'clear-all';
    const ipAddress = String(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim();

    if (isClearAllRequest) {
      const remaining = await clearAllActivityLogs();
      return Response.json({ success: true, remaining });
    }

    if (isPresenceHeartbeat) {
      const minIntervalMs = Number(process.env.PRESENCE_HEARTBEAT_MIN_INTERVAL_MS || 60_000);
      const logEntry = await logPresenceHeartbeat({
        userId: session.user.id,
        userName: session.user.username || session.user.name || session.user.email || 'Unknown',
        userRole: session.user.role || 'unknown',
        userEmail: session.user.email || 'unknown',
        ipAddress,
        metadata,
        minIntervalMs
      });

      return Response.json({ success: true, logEntry });
    }

    const logEntry = await logUserActionEvent({
      userId: session.user.id,
      userName: session.user.username || session.user.name || session.user.email || 'Unknown',
      userRole: session.user.role || 'unknown',
      userEmail: session.user.email || 'unknown',
      ipAddress,
      eventLabel,
      target: String(body?.target || ''),
      metadata
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
