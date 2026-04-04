import { NextResponse } from 'next/server';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { DEFAULT_DISPATCH_TIME_ZONE, getLocalDateKey, getTripServiceDateKey, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const formatClockTime = value => new Date(value).toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit'
});

const normalizeLocationSnapshot = value => {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(value.accuracy)) ? Number(value.accuracy) : null,
    speed: Number.isFinite(Number(value.speed)) ? Number(value.speed) : null,
    heading: Number.isFinite(Number(value.heading)) ? Number(value.heading) : null,
    timestamp: Number.isFinite(Number(value.timestamp)) ? Number(value.timestamp) : Date.now()
  };
};

const getCurrentClockMinutes = timestamp => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_DISPATCH_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  const dayPeriod = String(parts.find(part => part.type === 'dayPeriod')?.value || '').toLowerCase();
  const normalizedHour = dayPeriod === 'pm' && hour < 12 ? hour + 12 : dayPeriod === 'am' && hour === 12 ? 0 : hour;
  return normalizedHour * 60 + minute;
};

const getScheduledMinutesForAction = (trip, action) => {
  if (action === 'complete') return parseTripClockMinutes(trip?.scheduledDropoff || trip?.dropoff);
  return parseTripClockMinutes(trip?.scheduledPickup || trip?.pickup);
};

const buildComplianceForAction = (trip, action, timestamp) => {
  const serviceDateKey = getTripServiceDateKey(trip);
  const currentDateKey = getLocalDateKey(timestamp, DEFAULT_DISPATCH_TIME_ZONE);
  const scheduledMinutes = getScheduledMinutesForAction(trip, action);
  if (!serviceDateKey || serviceDateKey !== currentDateKey || scheduledMinutes == null) {
    return {
      currentDateKey,
      serviceDateKey,
      scheduledMinutes,
      measured: false,
      lateByMinutes: null,
      isLate: false
    };
  }

  const actualMinutes = getCurrentClockMinutes(timestamp);
  const lateByMinutes = actualMinutes - scheduledMinutes;
  return {
    currentDateKey,
    serviceDateKey,
    scheduledMinutes,
    measured: true,
    actualMinutes,
    lateByMinutes,
    isLate: lateByMinutes > 0
  };
};

const buildWorkflowEvent = ({ tripId, action, timestamp, timeLabel, locationSnapshot, riderSignatureName, compliance }) => ({
  id: `${tripId}-${action}-${timestamp}`,
  action,
  timestamp,
  timeLabel,
  locationSnapshot,
  riderSignatureName: riderSignatureName || '',
  compliance
});

const buildTripActionPatch = (trip, action, timestamp, options = {}) => {
  const timeLabel = formatClockTime(timestamp);
  const existingWorkflow = trip?.driverWorkflow && typeof trip.driverWorkflow === 'object' ? trip.driverWorkflow : {};
  const compliance = buildComplianceForAction(trip, action, timestamp);
  const locationSnapshot = normalizeLocationSnapshot(options.locationSnapshot);
  const riderSignatureName = String(options.riderSignatureName || '').trim();
  const auditTrail = Array.isArray(existingWorkflow.auditTrail) ? existingWorkflow.auditTrail : [];
  const nextWorkflow = {
    ...existingWorkflow,
    auditTrail: [...auditTrail, buildWorkflowEvent({
      tripId: trip?.id || 'trip',
      action,
      timestamp,
      timeLabel,
      locationSnapshot,
      riderSignatureName,
      compliance
    })]
  };

  if (action === 'en-route') {
    return {
      status: 'In Progress',
      driverTripStatus: 'En Route',
      enRouteAt: timestamp,
      departureLocationSnapshot: locationSnapshot,
      driverWorkflow: {
        ...nextWorkflow,
        status: 'en-route',
        departureAt: timestamp,
        departureTimeLabel: timeLabel,
        departureLocationSnapshot: locationSnapshot,
        startedLate: Boolean(compliance.isLate),
        startLateMinutes: compliance.measured ? Math.max(0, compliance.lateByMinutes) : null
      },
      updatedAt: timestamp
    };
  }

  if (action === 'arrived') {
    return {
      status: 'Arrived',
      driverTripStatus: 'Arrived',
      arrivedAt: timestamp,
      arrivalLocationSnapshot: locationSnapshot,
      actualPickup: trip?.actualPickup || timeLabel,
      driverWorkflow: {
        ...nextWorkflow,
        status: 'arrived',
        arrivalAt: timestamp,
        arrivalTimeLabel: timeLabel,
        arrivalLocationSnapshot: locationSnapshot,
        pickupLate: Boolean(compliance.isLate),
        pickupLateMinutes: compliance.measured ? Math.max(0, compliance.lateByMinutes) : null
      },
      updatedAt: timestamp
    };
  }

  if (action === 'complete') {
    return {
      status: 'Completed',
      driverTripStatus: 'Completed',
      completedAt: timestamp,
      completionLocationSnapshot: locationSnapshot,
      actualDropoff: trip?.actualDropoff || timeLabel,
      riderSignatureName,
      riderSignedAt: riderSignatureName ? timestamp : trip?.riderSignedAt || null,
      driverWorkflow: {
        ...nextWorkflow,
        status: 'completed',
        completedAt: timestamp,
        completedTimeLabel: timeLabel,
        completionLocationSnapshot: locationSnapshot,
        dropoffLate: Boolean(compliance.isLate),
        dropoffLateMinutes: compliance.measured ? Math.max(0, compliance.lateByMinutes) : null,
        riderSignatureName: riderSignatureName || existingWorkflow?.riderSignatureName || '',
        riderSignedAt: riderSignatureName ? timestamp : existingWorkflow?.riderSignedAt || null
      },
      updatedAt: timestamp
    };
  }

  return null;
};

const internalError = error => NextResponse.json({ ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function POST(request) {
  try {
  const body = await request.json();
  const tripId = String(body?.tripId || '').trim();
  const driverId = String(body?.driverId || '').trim();
  const action = normalizeLookupValue(body?.action);
  const riderSignatureName = String(body?.riderSignatureName || '').trim();

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

  if (action === 'arrived' && !currentTrip?.enRouteAt) {
    return NextResponse.json({ ok: false, error: 'Driver must mark En Route before Arrived.' }, { status: 400 });
  }

  if (action === 'complete' && !currentTrip?.arrivedAt) {
    return NextResponse.json({ ok: false, error: 'Driver must mark Arrived before Complete.' }, { status: 400 });
  }

  if (action === 'complete' && !riderSignatureName) {
    return NextResponse.json({ ok: false, error: 'Rider signature is required before completing the trip.' }, { status: 400 });
  }

  const timestamp = Date.now();
  const patch = buildTripActionPatch(currentTrip, action, timestamp, {
    locationSnapshot: body?.locationSnapshot,
    riderSignatureName
  });
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
  } catch (error) {
    return internalError(error);
  }
}