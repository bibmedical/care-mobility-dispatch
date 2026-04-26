import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { getLocalDateKey } from '@/helpers/nemt-dispatch-state';
import { isAdminRole } from '@/helpers/system-users';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';

const internalError = error => NextResponse.json({ error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedDateKey = String(searchParams.get('date') || '').trim() || getLocalDateKey(new Date());
    const windowPastDays = Math.max(Number(searchParams.get('windowPastDays') ?? 1) || 0, 0);
    const windowFutureDays = Math.max(Number(searchParams.get('windowFutureDays') ?? 1) || 0, 0);
    const payload = await readNemtDispatchState({
      dateKey: requestedDateKey,
      windowPastDays,
      windowFutureDays
    });
    return NextResponse.json(payload);
  } catch (error) {
    return internalError(error);
  }
}

export async function PUT(request) {
  const body = await request.json();
  const allowTripShrink = request.headers.get('x-dispatch-allow-trip-shrink') === '1';
  const shrinkReason = String(request.headers.get('x-dispatch-shrink-reason') || '').trim();
  const pruneDateKey = String(request.headers.get('x-dispatch-prune-date') || '').trim();
  const pruneWindowPastDays = Math.max(Number(request.headers.get('x-dispatch-prune-window-past-days') ?? 0) || 0, 0);
  const pruneWindowFutureDays = Math.max(Number(request.headers.get('x-dispatch-prune-window-future-days') ?? 0) || 0, 0);
  const session = await getServerSession(options);

  if (allowTripShrink) {
    if (!session?.user?.id) {
      return NextResponse.json({
        error: 'Authentication required for destructive dispatch actions'
      }, {
        status: 401
      });
    }

    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({
        error: 'Only administrators can delete dispatch trips'
      }, {
        status: 403
      });
    }
  }

  try {
    const nextState = await writeNemtDispatchState(body, {
      allowTripShrink,
      shrinkReason,
      pruneDateKey,
      pruneWindowPastDays,
      pruneWindowFutureDays,
      actorId: String(session?.user?.id || ''),
      actorName: String(session?.user?.name || session?.user?.username || session?.user?.email || '').trim(),
      actorRole: String(session?.user?.role || '').trim()
    });
    return NextResponse.json({
      ...nextState,
      ok: true
    });
  } catch (error) {
    return internalError(error);
  }
}
