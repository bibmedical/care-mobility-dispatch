import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { sendCustomSmsRequests } from '@/server/sms-confirmation-service';
import { logUserActionEvent } from '@/server/activity-logs-store';

export async function POST(request) {
  try {
    const body = await request.json();
    const tripIds = Array.isArray(body?.tripIds) ? body.tripIds : body?.tripId ? [body.tripId] : [];
    const payload = await sendCustomSmsRequests({
      tripIds,
      message: body?.message
    });
    const session = await getServerSession(options);
    if (session?.user?.id) {
      await logUserActionEvent({
        userId: session.user.id,
        userName: `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim() || session.user.username || 'Unknown',
        userRole: session.user.role,
        userEmail: session.user.email,
        eventLabel: `Sent custom SMS (${tripIds.length} trip${tripIds.length === 1 ? '' : 's'})`,
        target: 'drivers-sms',
        metadata: {
          tripIds,
          preview: String(body?.message || '').slice(0, 120)
        }
      });
    }
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to send custom SMS'
    }, {
      status: 400
    });
  }
}