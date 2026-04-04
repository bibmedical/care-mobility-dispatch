import { NextResponse } from 'next/server';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { DEFAULT_DISPATCH_TIME_ZONE, getLocalDateKey, getTripServiceDateKey, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { getActiveMessageForDriver, resolveSystemMessageById } from '@/server/system-messages-store';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { sendTripArrivalNotifications } from '@/server/sms-confirmation-service';
import { upsertDriverDisciplineEvent, resolveDriverDisciplineEventById } from '@/server/driver-discipline-store';
import { appendTripWorkflowEvent, logTripArrivalEvent } from '@/server/trip-workflow-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';

const AUTO_NO_DEPARTURE_ALERT_TYPE = 'no-departure-alert';

const buildAutoNoDepartureAlertId = (driverId, tripId) => `auto-no-departure-${driverId}-${tripId}`;

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
  tripId,
  action,
  timestamp,
  timeLabel,
  locationSnapshot,
  riderSignatureName: riderSignatureName || '',
  compliance
});

const buildDisciplineEventForAction = ({ trip, driverId, action, timestamp, compliance }) => {
  if (!compliance?.measured || !compliance?.isLate) return null;
  const eventType = action === 'en-route' ? 'late-start' : action === 'arrived' ? 'late-pickup' : action === 'complete' ? 'late-dropoff' : '';
  if (!eventType) return null;
  const lateByMinutes = Math.max(0, Number(compliance?.lateByMinutes) || 0);
  return {
    id: `discipline-${eventType}-${trip?.id || 'trip'}`,
    driverId,
    tripId: trip?.id || '',
    eventType,
    severity: lateByMinutes >= 15 ? 'high' : 'normal',
    status: 'logged',
    summary: `${eventType.replace(/-/g, ' ')} recorded for ${trip?.rider || 'patient'}`,
    body: `${trip?.rider || 'Patient'} was ${lateByMinutes} minute${lateByMinutes === 1 ? '' : 's'} late during ${action}.`,
    occurredAt: new Date(timestamp).toISOString(),
    data: {
      lateByMinutes,
      action,
      scheduledPickup: trip?.scheduledPickup || trip?.pickup || '',
      scheduledDropoff: trip?.scheduledDropoff || trip?.dropoff || ''
    }
  };
};

const buildTripActionUpdate = (trip, action, timestamp, options = {}) => {
  const timeLabel = formatClockTime(timestamp);
  const existingWorkflow = trip?.driverWorkflow && typeof trip.driverWorkflow === 'object' ? trip.driverWorkflow : {};
  const { auditTrail: _ignoredAuditTrail, ...workflowState } = existingWorkflow;
  const compliance = buildComplianceForAction(trip, action, timestamp);
  const locationSnapshot = normalizeLocationSnapshot(options.locationSnapshot);
  const riderSignatureName = String(options.riderSignatureName || '').trim();
  const workflowEvent = buildWorkflowEvent({
    tripId: trip?.id || 'trip',
    action,
    timestamp,
    timeLabel,
    locationSnapshot,
    riderSignatureName,
    compliance
  });
  const nextWorkflow = {
    ...workflowState
  };

  if (action === 'en-route') {
    return {
      patch: {
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
      },
      workflowEvent,
      compliance,
      locationSnapshot,
      riderSignatureName,
      timeLabel
    };
  }

  if (action === 'arrived') {
    return {
      patch: {
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
      },
      workflowEvent,
      compliance,
      locationSnapshot,
      riderSignatureName,
      timeLabel
    };
  }

  if (action === 'complete') {
    return {
      patch: {
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
      },
      workflowEvent,
      compliance,
      locationSnapshot,
      riderSignatureName,
      timeLabel
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

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return authResult.response;

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
  const actionUpdate = buildTripActionUpdate(currentTrip, action, timestamp, {
    locationSnapshot: body?.locationSnapshot,
    riderSignatureName
  });
  if (!actionUpdate?.patch) {
    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  }
  const patch = actionUpdate.patch;

  const nextTrips = trips.map(trip => String(trip?.id || '').trim() === tripId ? {
    ...trip,
    ...patch
  } : trip);

  await writeNemtDispatchState({
    ...dispatchState,
    trips: nextTrips
  });

  await appendTripWorkflowEvent({
    ...actionUpdate.workflowEvent,
    driverId,
    metadata: {
      tripStatus: patch.driverTripStatus || patch.status || '',
      locationRecorded: Boolean(actionUpdate.locationSnapshot)
    }
  });

  const disciplineEvent = buildDisciplineEventForAction({
    trip: currentTrip,
    driverId,
    action,
    timestamp,
    compliance: actionUpdate.compliance
  });
  if (disciplineEvent) {
    await upsertDriverDisciplineEvent(disciplineEvent);
  }

  let arrivalNotifications = null;
  if (action === 'arrived' && !currentTrip?.arrivedAt) {
    try {
      const adminPayload = await readNemtAdminPayload();
      const driver = (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(item => String(item?.id || '').trim() === driverId) || null;
      arrivalNotifications = await sendTripArrivalNotifications({
        trip: {
          ...currentTrip,
          ...patch
        },
        driverName: String(driver?.name || currentTrip?.driverName || '').trim()
      });
      await logTripArrivalEvent({
        id: `arrival-${tripId}-${timestamp}`,
        tripId,
        driverId,
        rider: currentTrip?.rider || '',
        pickupAddress: currentTrip?.address || '',
        actualPickup: patch.actualPickup || actionUpdate.timeLabel,
        arrivalTimestamp: timestamp,
        notificationSummary: arrivalNotifications || {}
      });
    } catch (error) {
      arrivalNotifications = {
        ok: false,
        skipped: true,
        reason: error.message || 'Unable to process arrival SMS notifications.',
        results: []
      };
    }
  }

  if (['en-route', 'arrived', 'complete'].includes(action)) {
    await resolveSystemMessageById(buildAutoNoDepartureAlertId(driverId, tripId));
    await resolveDriverDisciplineEventById(buildAutoNoDepartureAlertId(driverId, tripId));
    const activeNoDepartureAlert = await getActiveMessageForDriver(driverId, AUTO_NO_DEPARTURE_ALERT_TYPE);
    if (activeNoDepartureAlert?.id) {
      await resolveSystemMessageById(activeNoDepartureAlert.id);
      await resolveDriverDisciplineEventById(activeNoDepartureAlert.id);
    }
  }

  return NextResponse.json({ ok: true, tripId, action, updatedAt: timestamp, arrivalNotifications });
  } catch (error) {
    return internalError(error);
  }
}