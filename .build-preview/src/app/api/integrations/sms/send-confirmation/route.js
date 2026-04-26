import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { sendTripConfirmationRequests } from '@/server/sms-confirmation-service';
import { logUserActionEvent } from '@/server/activity-logs-store';

export async function POST(request) {
  try {
    const body = await request.json();
    const tripIds = Array.isArray(body?.tripIds) ? body.tripIds : body?.tripId ? [body.tripId] : [];
    const selectedColumns = Array.isArray(body?.selectedColumns) ? body.selectedColumns : [];
    const payload = await sendTripConfirmationRequests({ tripIds, selectedColumns });
    const session = await getServerSession(options);
    if (session?.user?.id) {
      await logUserActionEvent({
        userId: session.user.id,
        userName: `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || session.user.username || 'Unknown',
        userRole: session.user.role,
        userEmail: session.user.email,
        eventLabel: `Sent confirmation SMS (${tripIds.length} trip${tripIds.length === 1 ? '' : 's'})`,
        target: 'drivers-sms',
        metadata: { tripIds }
      });
    }
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to send confirmation SMS'
    }, {
      status: 400
    });
  }
}