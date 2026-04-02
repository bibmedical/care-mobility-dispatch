import { NextResponse } from 'next/server';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const formatClockTime = value => new Date(value).toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit'
});

const buildTripActionPatch = (trip, action, timestamp) => {
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

  return null;
};

export async function POST(request) {
  const body = await request.json();
  const tripId = String(body?.tripId || '').trim();
  const driverId = String(body?.driverId || '').trim();
  const action = normalizeLookupValue(body?.action);

  if (!tripId || !driverId || !action) {
    return NextResponse.json({ ok: false, error: 'tripId, driverId, and action are required.' }, { status: 400 });
  }

  const dispatchState = await readNemtDispatchState();
  const trips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];
  const currentTrip = trips.find(trip => String(trip?.id || '').trim() === tripId);

  if (!currentTrip) {
    return NextResponse.json({ ok: false, error: 'Trip not found.' }, { status: 404 });
  }

  if (String(currentTrip?.driverId || '').trim() !== driverId) {
    return NextResponse.json({ ok: false, error: 'Trip is not assigned to this driver.' }, { status: 403 });
  }

  const timestamp = Date.now();
  const patch = buildTripActionPatch(currentTrip, action, timestamp);
  if (!patch) {
    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  }

  const nextTrips = trips.map(trip => String(trip?.id || '').trim() === tripId ? {
    ...trip,
    ...patch
  } : trip);

  await writeNemtDispatchState({
    ...dispatchState,
    trips: nextTrips
  });

  return NextResponse.json({ ok: true, tripId, action, updatedAt: timestamp });
}