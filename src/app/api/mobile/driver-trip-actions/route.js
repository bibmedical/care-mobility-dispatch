import { NextResponse } from 'next/server';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { DEFAULT_DISPATCH_TIME_ZONE, getLocalDateKey, getTripServiceDateKey, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { getActiveMessageForDriver, readSystemMessages, resolveSystemMessageById, upsertSystemMessage } from '@/server/system-messages-store';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { sendTripArrivalNotifications } from '@/server/sms-confirmation-service';
import { sendCustomSmsRequests } from '@/server/sms-confirmation-service';
import { upsertDriverDisciplineEvent, resolveDriverDisciplineEventById } from '@/server/driver-discipline-store';
import { appendTripWorkflowEvent, logTripArrivalEvent } from '@/server/trip-workflow-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const AUTO_NO_DEPARTURE_ALERT_TYPE = 'no-departure-alert';
const DRIVER_TRIP_ALERT_TYPES = new Set(['delay-alert', 'backup-driver-request', 'uber-request']);

const buildAutoNoDepartureAlertId = (driverId, tripId) => `auto-no-departure-${driverId}-${tripId}`;
const buildWillCallActivationMessageId = (driverId, tripId) => `driver-willcall-activation-${driverId}-${tripId}`;

const generateReviewToken = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const buildDriverAssignmentCandidates = ({ driverId, driverName, driverCode }) => ({
  driverId: String(driverId || '').trim(),
  textCandidates: new Set([driverName, driverCode].map(normalizeLookupValue).filter(Boolean))
});

const isTripActivatedForCancellation = trip => {
  const normalizedStatus = normalizeLookupValue(trip?.status);
  return Boolean(
    trip?.driverWorkflow?.acceptedAt
    || trip?.enRouteAt
    || trip?.arrivedAt
    || trip?.patientOnboardAt
    || trip?.startTripAt
    || trip?.arrivedDestinationAt
    || ['accepted', 'arrived'].includes(normalizedStatus)
    || normalizedStatus.includes('progress')
    || normalizedStatus.includes('route')
    || normalizedStatus.includes('destination')
  );
};

const buildWillCallActivationMessage = ({ currentDriver, currentTrip, driverId, timestamp }) => {
  const driverName = String(currentDriver?.name || currentTrip?.driverName || '').trim() || driverId;
  const tripReference = String(currentTrip?.rideId || currentTrip?.id || '').trim() || 'Unknown trip';
  const riderName = String(currentTrip?.rider || '').trim() || 'Unknown rider';
  const pickupText = String(currentTrip?.scheduledPickup || currentTrip?.pickup || '').trim() || 'TBD';
  const activationLabel = new Date(timestamp).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return {
    id: buildWillCallActivationMessageId(driverId, String(currentTrip?.id || '').trim()),
    type: 'driver-willcall-activation',
    priority: 'high',
    audience: 'Dispatcher',
    subject: `Driver activated WillCall for trip ${tripReference}`,
    body: `${driverName} activated WillCall for trip ${tripReference} (${riderName}) at ${activationLabel}. Pickup: ${pickupText}.`,
    driverId,
    driverName,
    status: 'active',
    createdAt: new Date(timestamp).toISOString(),
    source: 'mobile-driver-app',
    deliveryMethod: 'system',
    tripId: String(currentTrip?.id || '').trim(),
    rider: riderName,
    scheduledPickup: pickupText,
    willCallActivatedAt: new Date(timestamp).toISOString()
  };
};

const parseStoredTimestamp = value => {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  const dateValue = new Date(value || 0).getTime();
  return Number.isFinite(dateValue) && dateValue > 0 ? dateValue : 0;
};

const resolveActiveDriverTripAlerts = async (driverId, tripId) => {
  const normalizedDriverId = String(driverId || '').trim();
  const normalizedTripId = String(tripId || '').trim();
  if (!normalizedDriverId || !normalizedTripId) return;

  const messages = await readSystemMessages();
  const alertsToResolve = messages.filter(message => {
    const messageDriverId = String(message?.driverId || '').trim();
    const messageTripId = String(message?.tripId || '').trim();
    const messageType = String(message?.type || '').trim();
    const messageStatus = String(message?.status || '').trim().toLowerCase();
    return messageDriverId === normalizedDriverId
      && messageTripId === normalizedTripId
      && DRIVER_TRIP_ALERT_TYPES.has(messageType)
      && messageStatus === 'active';
  });

  for (const message of alertsToResolve) {
    await resolveSystemMessageById(message.id);
  }
};

const isTripAssignedToDriver = (trip, driverMatch) => {
  const normalizedDriverId = String(driverMatch?.driverId || driverMatch || '').trim();
  const textCandidates = driverMatch?.textCandidates instanceof Set ? driverMatch.textCandidates : new Set();
  if (normalizedDriverId && (String(trip?.driverId || '').trim() === normalizedDriverId || String(trip?.secondaryDriverId || '').trim() === normalizedDriverId)) {
    return true;
  }

  const tripTextCandidates = [
    trip?.driverName,
    trip?.secondaryDriverName,
    trip?.importedDriverName,
    trip?.driver,
    trip?.assignedDriver,
    trip?.assignedDriverName
  ].map(normalizeLookupValue).filter(Boolean);

  return tripTextCandidates.some(value => textCandidates.has(value));
};

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

const normalizeRiderSignatureData = value => {
  if (!value || typeof value !== 'object') return null;
  const width = Number(value.width);
  const height = Number(value.height);
  const points = Array.isArray(value.points)
    ? value.points
      .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 900)
    : [];

  if (points.length < 8) return null;

  return {
    width: Number.isFinite(width) && width > 0 ? width : 300,
    height: Number.isFinite(height) && height > 0 ? height : 120,
    points
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
  if (['arrived-destination', 'complete'].includes(action)) return parseTripClockMinutes(trip?.scheduledDropoff || trip?.dropoff);
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
  const eventType = action === 'en-route'
    ? 'late-start'
    : action === 'arrived'
      ? 'late-pickup'
      : ['arrived-destination', 'complete'].includes(action)
        ? 'late-dropoff'
        : '';
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

  if (action === 'activate-willcall') {
    const existingActivationTimestamp = parseStoredTimestamp(trip?.willCallActivatedAt) || timestamp;
    const existingActivationIso = parseStoredTimestamp(trip?.willCallActivatedAt) > 0
      ? new Date(parseStoredTimestamp(trip?.willCallActivatedAt)).toISOString()
      : new Date(timestamp).toISOString();
    const activationTimeLabel = formatClockTime(existingActivationTimestamp);
    const activationWorkflowEvent = buildWorkflowEvent({
      tripId: trip?.id || 'trip',
      action,
      timestamp: existingActivationTimestamp,
      timeLabel: activationTimeLabel,
      locationSnapshot,
      riderSignatureName,
      compliance: {
        measured: false,
        isLate: false,
        lateByMinutes: null
      }
    });

    return {
      patch: {
        willCallOverride: 'manual',
        willCallActivatedAt: existingActivationIso,
        driverTripStatus: 'WillCall Activated',
        driverWorkflow: {
          ...nextWorkflow,
          willCallActivatedAt: existingActivationTimestamp,
          willCallActivatedTimeLabel: activationTimeLabel
        },
        updatedAt: existingActivationTimestamp
      },
      workflowEvent: activationWorkflowEvent,
      compliance: {
        measured: false,
        isLate: false,
        lateByMinutes: null
      },
      locationSnapshot,
      riderSignatureName,
      timeLabel: activationTimeLabel
    };
  }

  if (action === 'accept') {
    return {
      patch: {
        status: 'In Progress',
        driverTripStatus: 'Accepted',
        acceptedAt: timestamp,
        riderSignatureName,
        riderSignedAt: riderSignatureName ? timestamp : trip?.riderSignedAt || null,
        driverWorkflow: {
          ...nextWorkflow,
          status: 'accepted',
          acceptedAt: timestamp,
          acceptedTimeLabel: timeLabel,
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
          departureToPickupAt: timestamp,
          departureToPickupTimeLabel: timeLabel,
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
        driverTripStatus: 'Arrived Pickup',
        arrivedAt: timestamp,
        arrivalLocationSnapshot: locationSnapshot,
        driverWorkflow: {
          ...nextWorkflow,
          status: 'arrived-pickup',
          arrivalAt: timestamp,
          arrivalTimeLabel: timeLabel,
          arrivedPickupAt: timestamp,
          arrivedPickupTimeLabel: timeLabel,
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

  if (action === 'patient-onboard') {
    return {
      patch: {
        status: 'In Progress',
        driverTripStatus: 'Patient Onboard',
        actualPickup: trip?.actualPickup || timeLabel,
        patientOnboardAt: timestamp,
        driverWorkflow: {
          ...nextWorkflow,
          status: 'patient-onboard',
          patientOnboardAt: timestamp,
          patientOnboardTimeLabel: timeLabel,
          pickupAt: timestamp,
          pickupTimeLabel: timeLabel
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

  if (action === 'start-trip') {
    return {
      patch: {
        status: 'In Progress',
        driverTripStatus: 'To Destination',
        startTripAt: timestamp,
        destinationDepartureLocationSnapshot: locationSnapshot,
        driverWorkflow: {
          ...nextWorkflow,
          status: 'to-destination',
          startTripAt: timestamp,
          startTripTimeLabel: timeLabel,
          destinationDepartureAt: timestamp,
          destinationDepartureTimeLabel: timeLabel,
          destinationDepartureLocationSnapshot: locationSnapshot
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

  if (action === 'arrived-destination') {
    return {
      patch: {
        status: 'Arrived',
        driverTripStatus: 'Arrived Destination',
        arrivedDestinationAt: timestamp,
        destinationArrivalLocationSnapshot: locationSnapshot,
        driverWorkflow: {
          ...nextWorkflow,
          status: 'arrived-destination',
          arrivedDestinationAt: timestamp,
          arrivedDestinationTimeLabel: timeLabel,
          destinationArrivalAt: timestamp,
          destinationArrivalTimeLabel: timeLabel,
          destinationArrivalLocationSnapshot: locationSnapshot,
          dropoffLate: Boolean(compliance.isLate),
          dropoffLateMinutes: compliance.measured ? Math.max(0, compliance.lateByMinutes) : null
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
    const completionPhotoDataUrl = String(options.completionPhotoDataUrl || '').trim();
    return {
      patch: {
        status: 'Completed',
        driverTripStatus: 'Completed',
        completedAt: timestamp,
        completionLocationSnapshot: locationSnapshot,
        completionPhotoDataUrl,
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

  if (action === 'cancel') {
    const cancellationReason = String(options.cancellationReason || '').trim();
    const cancellationPhotoDataUrl = String(options.cancellationPhotoDataUrl || '').trim();
    return {
      patch: {
        status: 'Cancelled',
        driverTripStatus: 'Cancelled by rider',
        canceledAt: timestamp,
        cancellationReason,
        cancellationPhotoDataUrl,
        driverWorkflow: {
          ...nextWorkflow,
          status: 'cancelled'
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

const internalError = (request, error) => jsonWithMobileCors(request, { ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function POST(request) {
  try {
  const body = await request.json();
  const tripId = String(body?.tripId || '').trim();
  const driverId = String(body?.driverId || '').trim();
  const action = normalizeLookupValue(body?.action);
  const riderSignatureName = String(body?.riderSignatureName || '').trim();
  const cancellationReason = String(body?.cancellationReason || '').trim();
  const cancellationPhotoDataUrl = String(body?.cancellationPhotoDataUrl || '').trim();
  const completionPhotoDataUrl = String(body?.completionPhotoDataUrl || '').trim();
  const riderSignatureData = normalizeRiderSignatureData(body?.riderSignatureData);

  if (!tripId || !driverId || !action) {
    return jsonWithMobileCors(request, { ok: false, error: 'tripId, driverId, and action are required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId, {
    allowLegacyWithoutSession: true
  });
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminPayload = await readNemtAdminPayload();
  const currentDriver = (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(item => String(item?.id || '').trim() === driverId) || null;
  const driverMatch = buildDriverAssignmentCandidates({
    driverId,
    driverName: currentDriver?.name,
    driverCode: currentDriver?.code
  });

  const dispatchState = await readNemtDispatchState({ includePastDates: true });
  const trips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];
  const currentTrip = trips.find(trip => String(trip?.id || '').trim() === tripId);

  if (!currentTrip) {
    return jsonWithMobileCors(request, { ok: false, error: 'Trip not found.' }, { status: 404 });
  }

  if (!isTripAssignedToDriver(currentTrip, driverMatch)) {
    return jsonWithMobileCors(request, { ok: false, error: 'Trip is not assigned to this driver.' }, { status: 403 });
  }

  if (action === 'arrived' && !currentTrip?.enRouteAt) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver must mark En Route before Arrived.' }, { status: 400 });
  }

  if (action === 'patient-onboard' && !currentTrip?.arrivedAt) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver must mark Arrived Pickup before Patient Onboard.' }, { status: 400 });
  }

  if (action === 'start-trip' && !currentTrip?.patientOnboardAt && !currentTrip?.actualPickup) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver must mark Patient Onboard before Start Trip.' }, { status: 400 });
  }

  if (action === 'arrived-destination' && !currentTrip?.startTripAt && !currentTrip?.driverWorkflow?.destinationDepartureAt) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver must mark Start Trip before Arrived Destination.' }, { status: 400 });
  }

  if (action === 'complete' && !currentTrip?.arrivedDestinationAt && !currentTrip?.driverWorkflow?.destinationArrivalAt) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver must mark Arrived Destination before Complete.' }, { status: 400 });
  }

  if (action === 'complete' && !completionPhotoDataUrl) {
    return jsonWithMobileCors(request, { ok: false, error: 'Completion photo is required before closing the trip.' }, { status: 400 });
  }

  if (action === 'cancel') {
    const tripActivated = isTripActivatedForCancellation(currentTrip);
    const alreadyMoved = Boolean(currentTrip?.patientOnboardAt || currentTrip?.startTripAt || currentTrip?.arrivedDestinationAt || currentTrip?.completedAt || currentTrip?.driverWorkflow?.patientOnboardAt || currentTrip?.driverWorkflow?.startTripAt || currentTrip?.driverWorkflow?.arrivedDestinationAt || currentTrip?.driverWorkflow?.completedAt);
    if (alreadyMoved) {
      return jsonWithMobileCors(request, { ok: false, error: 'Cancel is only allowed before Patient Onboard.' }, { status: 400 });
    }
    if (!cancellationReason) {
      return jsonWithMobileCors(request, { ok: false, error: 'Cancellation reason is required.' }, { status: 400 });
    }
    if (tripActivated && !cancellationPhotoDataUrl) {
      return jsonWithMobileCors(request, { ok: false, error: 'Cancellation photo is required once the trip is in progress.' }, { status: 400 });
    }
  }

  const requestedEventTimestamp = Number(body?.eventTimestamp);
  let timestamp = Number.isFinite(requestedEventTimestamp) && requestedEventTimestamp > 0
    ? requestedEventTimestamp
    : Date.now();

  if (action === 'en-route') {
    const existingEnRouteTimestamp = parseStoredTimestamp(currentTrip?.driverWorkflow?.departureToPickupAt)
      || parseStoredTimestamp(currentTrip?.driverWorkflow?.departureAt)
      || parseStoredTimestamp(currentTrip?.enRouteAt);
    if (existingEnRouteTimestamp > 0) {
      timestamp = existingEnRouteTimestamp;
    }
  }

  if (action === 'activate-willcall') {
    const existingWillCallTimestamp = parseStoredTimestamp(currentTrip?.willCallActivatedAt);
    if (existingWillCallTimestamp > 0) {
      timestamp = existingWillCallTimestamp;
    }
  }

  const actionUpdate = buildTripActionUpdate(currentTrip, action, timestamp, {
    locationSnapshot: body?.locationSnapshot,
    riderSignatureName,
    cancellationReason,
    cancellationPhotoDataUrl,
    completionPhotoDataUrl
  });
  if (!actionUpdate?.patch) {
    return jsonWithMobileCors(request, { ok: false, error: 'Unsupported action.' }, { status: 400 });
  }
  const patch = actionUpdate.patch;
  const shouldLoadDriverRecord = ['complete', 'cancel', 'activate-willcall'].includes(action);
  const actionDriver = shouldLoadDriverRecord
    ? (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(item => String(item?.id || '').trim() === driverId) || null
    : null;

  if (action === 'accept') {
    patch.riderSignatureData = riderSignatureData;
  }

  if (action === 'complete') {
    patch.reviewRequestToken = generateReviewToken();
    patch.reviewRequestStatus = 'pending';
    patch.reviewRequestSentAt = null;
    patch.completedByDriverId = driverId;
    patch.completedByDriverName = String(actionDriver?.name || currentTrip?.driverName || '').trim() || driverId;
    patch.riderSignatureData = riderSignatureData;
  }

  if (action === 'cancel') {
    patch.canceledByDriverId = driverId;
    patch.canceledByDriverName = String(actionDriver?.name || currentTrip?.driverName || '').trim() || driverId;
  }

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

  if (action === 'activate-willcall') {
    await upsertSystemMessage(buildWillCallActivationMessage({
      currentDriver: actionDriver,
      currentTrip: {
        ...currentTrip,
        ...patch
      },
      driverId,
      timestamp
    }));
  }

  let arrivalNotifications = null;
  let reviewRequest = null;
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

  if (action === 'arrived-destination' && !(currentTrip?.arrivedDestinationAt || currentTrip?.driverWorkflow?.destinationArrivalAt)) {
    try {
      await logTripArrivalEvent({
        id: `arrival-destination-${tripId}-${timestamp}`,
        tripId,
        driverId,
        rider: currentTrip?.rider || '',
        pickupAddress: currentTrip?.destination || '',
        actualPickup: actionUpdate.timeLabel,
        arrivalTimestamp: timestamp,
        notificationSummary: {
          ok: true,
          skipped: true,
          reason: 'Destination arrival logged.'
        }
      });
    } catch {
      // Ignore destination arrival logging failure to avoid blocking trip state updates.
    }
  }

  if (action === 'complete') {
    const reviewToken = String(patch.reviewRequestToken || '').trim();
    const reviewTripId = String(currentTrip?.id || '').trim();
    const apiOrigin = new URL(request.url).origin;
    const reviewLink = `${apiOrigin}/api/mobile/driver-reviews?tripId=${encodeURIComponent(reviewTripId)}&token=${encodeURIComponent(reviewToken)}`;
    const driverDisplayName = String(patch.completedByDriverName || currentTrip?.driverName || 'your driver').trim();
    const reviewMessage = `Thanks for riding with ${driverDisplayName}. Please rate your trip from 1 to 5 stars here: ${reviewLink}`;

    try {
      const smsResult = await sendCustomSmsRequests({
        tripIds: [reviewTripId],
        message: reviewMessage
      });
      const sent = Number(smsResult?.sentCount || 0) > 0;
      reviewRequest = {
        ok: sent,
        sent,
        providerResult: smsResult
      };

      if (sent) {
        const refreshedState = await readNemtDispatchState({ includePastDates: true });
        const refreshedTrips = Array.isArray(refreshedState?.trips) ? refreshedState.trips : [];
        const nextTripsWithReviewFlag = refreshedTrips.map(trip => String(trip?.id || '').trim() === reviewTripId ? {
          ...trip,
          reviewRequestStatus: 'sent',
          reviewRequestSentAt: new Date().toISOString(),
          updatedAt: Date.now()
        } : trip);

        await writeNemtDispatchState({
          ...refreshedState,
          trips: nextTripsWithReviewFlag
        });
      }
    } catch (error) {
      reviewRequest = {
        ok: false,
        sent: false,
        error: error instanceof Error ? error.message : 'Unable to send review request SMS.'
      };
    }
  }

  if (['en-route', 'arrived', 'patient-onboard', 'start-trip', 'arrived-destination', 'complete', 'cancel'].includes(action)) {
    await resolveSystemMessageById(buildAutoNoDepartureAlertId(driverId, tripId));
    await resolveDriverDisciplineEventById(buildAutoNoDepartureAlertId(driverId, tripId));
    const activeNoDepartureAlert = await getActiveMessageForDriver(driverId, AUTO_NO_DEPARTURE_ALERT_TYPE);
    if (activeNoDepartureAlert?.id) {
      await resolveSystemMessageById(activeNoDepartureAlert.id);
      await resolveDriverDisciplineEventById(activeNoDepartureAlert.id);
    }
  }

  if (['complete', 'cancel'].includes(action)) {
    await resolveActiveDriverTripAlerts(driverId, tripId);
  }

  return jsonWithMobileCors(request, { ok: true, tripId, action, updatedAt: timestamp, arrivalNotifications, reviewRequest });
  } catch (error) {
    return internalError(request, error);
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}