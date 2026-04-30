import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { updateTripStatusForDriver } from '@/server/nemt-dispatch-store';

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const formatClockTime = value => new Date(value).toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit'
});

const buildTripActionPatch = (trip, action, timestamp, options = {}) => {
  const timeLabel = formatClockTime(timestamp);

  if (action === 'en-route') {
    return {
      status: 'In Progress',
      driverTripStatus: 'En Route',
      enRouteAt: timestamp,
      updatedAt: timestamp
    };
  }

  if (action === 'arrived') {
    return {
      status: 'Arrived',
      driverTripStatus: 'Arrived',
      arrivedAt: timestamp,
      actualPickup: trip?.actualPickup || timeLabel,
      updatedAt: timestamp
    };
  }

  if (action === 'complete') {
    return {
      status: 'Completed',
      driverTripStatus: 'Completed',
      completedAt: timestamp,
      actualDropoff: trip?.actualDropoff || timeLabel,
      updatedAt: timestamp
    };
  }

  if (action === 'reject') {
    return {
      status: 'Driver Rejected',
      driverTripStatus: 'Driver Rejected',
      driverRejectedAt: timestamp,
      driverRejectionReason: options?.rejectionReason || '',
      updatedAt: timestamp
    };
  }

  return null;
};

const internalError = error => NextResponse.json({ ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function POST(request) {
  try {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
  }

  if (!isDriverRole(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: 'Driver access only.' }, { status: 403 });
  }

  const driver = await resolveDriverForSession(session);
  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver profile not found.' }, { status: 404 });
  }

  const body = await request.json();
  const tripId = String(body?.tripId || '').trim();
  const action = normalizeLookupValue(body?.action);
  const rejectionReason = String(body?.rejectionReason || '').trim();

  if (!tripId || !action) {
    return NextResponse.json({ ok: false, error: 'tripId and action are required.' }, { status: 400 });
  }

  const timestamp = Date.now();
  const patch = buildTripActionPatch({}, action, timestamp, { rejectionReason });
  if (!patch) {
    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  }

  const result = await updateTripStatusForDriver({
    driverId: driver.id,
    tripId,
    patch
  });

  if (!result.ok && result.reason === 'not-found') {
    return NextResponse.json({ ok: false, error: 'Trip not found.' }, { status: 404 });
  }

  if (!result.ok && result.reason === 'forbidden') {
    return NextResponse.json({ ok: false, error: 'Trip is not assigned to this driver.' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, tripId, action, updatedAt: timestamp });
  } catch (error) {
    return internalError(error);
  }
}