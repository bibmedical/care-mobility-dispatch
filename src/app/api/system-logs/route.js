import { getAllActivityLogs, getActivityLogsByRole, getActivityLogsByUserId, getActivityLogsSummary } from '@/server/activity-logs-store';

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
