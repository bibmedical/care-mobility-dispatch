import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';

export async function GET() {
  const payload = await readNemtDispatchState();
  return NextResponse.json(payload);
}

export async function PUT(request) {
  const body = await request.json();
  const allowTripShrink = request.headers.get('x-dispatch-allow-trip-shrink') === '1';
  const shrinkReason = String(request.headers.get('x-dispatch-shrink-reason') || '').trim();
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

  const nextState = await writeNemtDispatchState(body, {
    allowTripShrink,
    shrinkReason,
    actorId: String(session?.user?.id || ''),
    actorName: String(session?.user?.name || session?.user?.username || session?.user?.email || '').trim(),
    actorRole: String(session?.user?.role || '').trim()
  });
  return NextResponse.json({
    ...nextState,
    ok: true
  });
}
