import { NextResponse } from 'next/server';
import { DEFAULT_DISPATCH_TIME_ZONE, getLocalDateKey, getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, normalizeTripRecord, parseTripClockMinutes, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { readNemtAdminPayload, readNemtAdminState } from '@/server/nemt-admin-store';
import { readNemtDispatchState } from '@/server/nemt-dispatch-store';
import { getActiveMessageForDriver, resolveSystemMessageById, upsertSystemMessage } from '@/server/system-messages-store';
import { readTripWorkflowEventsByTripIds } from '@/server/trip-workflow-store';
import { resolveDriverDisciplineEventById, upsertDriverDisciplineEvent } from '@/server/driver-discipline-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const AUTO_NO_DEPARTURE_ALERT_TYPE = 'no-departure-alert';
const AUTO_NO_DEPARTURE_THRESHOLD_MINUTES = 5;

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const buildDriverAssignmentCandidates = ({ driverId, driverName, driverCode }) => ({
  driverId: String(driverId || '').trim(),
  textCandidates: new Set([driverName, driverCode].map(normalizeLookupValue).filter(Boolean))
});

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

const isCancelledTrip = trip => ['cancelled', 'canceled'].includes(normalizeLookupValue(trip?.status));

const sortTripsByPickupTime = (leftTrip, rightTrip) => {
  const leftTime = Number.isFinite(leftTrip?.pickupSortValue) ? leftTrip.pickupSortValue : Number.MAX_SAFE_INTEGER;
  const rightTime = Number.isFinite(rightTrip?.pickupSortValue) ? rightTrip.pickupSortValue : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip?.id || '').localeCompare(String(rightTrip?.id || ''));
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

const buildAutoNoDepartureAlertId = (driverId, tripId) => `auto-no-departure-${driverId}-${tripId}`;

const getTrackingAgeMinutes = trackingLastSeen => {
  const timestamp = new Date(trackingLastSeen || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
};

const buildAutoNoDepartureAlert = ({ driver, driverState, trip, now }) => {
  if (!driver || !trip) return null;
  if (trip.enRouteAt || trip.arrivedAt || trip.completedAt || trip.isWillCall) return null;

  const serviceDateKey = getTripServiceDateKey(trip);
  const currentDateKey = getLocalDateKey(now, DEFAULT_DISPATCH_TIME_ZONE);
  if (!serviceDateKey || serviceDateKey !== currentDateKey) return null;

  const scheduledMinutes = parseTripClockMinutes(trip.scheduledPickup || trip.pickup);
  if (scheduledMinutes == null) return null;

  const lateByMinutes = getCurrentClockMinutes(now) - scheduledMinutes;
  if (lateByMinutes < AUTO_NO_DEPARTURE_THRESHOLD_MINUTES) return null;

  const trackingAgeMinutes = getTrackingAgeMinutes(driverState?.trackingLastSeen);
  const trackingLine = trackingAgeMinutes == null
    ? 'No recent GPS check-in recorded from the driver app.'
    : trackingAgeMinutes <= 10
      ? `Latest GPS check-in was ${trackingAgeMinutes} minute${trackingAgeMinutes === 1 ? '' : 's'} ago.`
      : `GPS feed is stale by ${trackingAgeMinutes} minutes.`;

  return {
    id: buildAutoNoDepartureAlertId(driver.id, trip.id),
    type: AUTO_NO_DEPARTURE_ALERT_TYPE,
    priority: lateByMinutes >= 15 ? 'high' : 'normal',
    audience: 'Dispatch Leadership',
    subject: `${driver.name || 'Driver'} has not gone en route for ${trip.rider || 'the next rider'}`,
    body: `${driver.name || 'Driver'} is ${lateByMinutes} minute${lateByMinutes === 1 ? '' : 's'} late to leave for ${trip.rider || 'the assigned rider'} (${trip.scheduledPickup || trip.pickup || 'pickup time pending'}). ${trackingLine} Escalate to Carlos, Lexy, Rober, and Balby.`,
    driverId: driver.id,
    driverName: driver.name || '',
    status: 'active',
    createdAt: new Date(now).toISOString(),
    source: 'auto-driver-ops',
    deliveryMethod: 'system',
    tripId: trip.id,
    tripStatus: trip.status,
    rider: trip.rider || '',
    serviceDate: serviceDateKey,
    scheduledPickup: trip.scheduledPickup || trip.pickup || '',
    lateByMinutes,
    trackingLastSeen: driverState?.trackingLastSeen || null,
    trackingAgeMinutes
  };
};

const getEffectiveTripStatus = trip => {
  const normalizedStatus = String(trip?.status || '').trim();
  const normalizedStatusToken = normalizedStatus.toLowerCase().replace(/\s+/g, '');
  const normalizedOverride = String(trip?.willCallOverride || '').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(normalizedStatusToken)) return 'Cancelled';
  if (normalizedOverride === 'off') return normalizedStatusToken === 'willcall' ? 'Unassigned' : normalizedStatus || 'Unassigned';
  if (normalizedOverride === 'manual') return 'WillCall';
  if (normalizedStatusToken === 'willcall') return 'WillCall';
  return normalizedStatus || 'Unassigned';
};

const isDriverTripInProgress = trip => {
  if (!trip) return false;
  const normalizedStatus = String(trip?.status || '').trim().toLowerCase();
  const workflowStatus = String(trip?.driverWorkflow?.status || '').trim().toLowerCase();
  if (
    normalizedStatus.includes('completed')
    || normalizedStatus.includes('cancelled')
    || normalizedStatus.includes('canceled')
    || workflowStatus === 'complete'
    || workflowStatus === 'completed'
    || workflowStatus === 'cancel'
    || workflowStatus === 'cancelled'
    || workflowStatus === 'canceled'
  ) {
    return false;
  }
  return Boolean(
    trip?.driverWorkflow?.acceptedAt
    || trip?.driverWorkflow?.departureAt
    || trip?.driverWorkflow?.departureToPickupAt
    || trip?.driverWorkflow?.arrivalAt
    || trip?.driverWorkflow?.arrivedPickupAt
    || trip?.driverWorkflow?.patientOnboardAt
    || trip?.driverWorkflow?.startTripAt
    || trip?.driverWorkflow?.destinationDepartureAt
    || trip?.driverWorkflow?.arrivedDestinationAt
    || trip?.enRouteAt
    || trip?.arrivedAt
    || trip?.patientOnboardAt
    || trip?.startTripAt
    || trip?.arrivedDestinationAt
  );
};

const buildWorkflowStateFromEvents = workflowEvents => {
  const sortedEvents = [...(Array.isArray(workflowEvents) ? workflowEvents : [])]
    .filter(event => event && typeof event === 'object')
    .sort((left, right) => Number(left?.timestamp || 0) - Number(right?.timestamp || 0));

  if (!sortedEvents.length) return null;

  const workflowState = {
    status: '',
    acceptedAt: null,
    acceptedTimeLabel: '',
    willCallActivatedAt: null,
    willCallActivatedTimeLabel: '',
    departureAt: null,
    departureTimeLabel: '',
    departureToPickupAt: null,
    departureToPickupTimeLabel: '',
    departureLocationSnapshot: null,
    arrivalAt: null,
    arrivalTimeLabel: '',
    arrivedPickupAt: null,
    arrivedPickupTimeLabel: '',
    arrivalLocationSnapshot: null,
    patientOnboardAt: null,
    patientOnboardTimeLabel: '',
    pickupAt: null,
    pickupTimeLabel: '',
    startTripAt: null,
    startTripTimeLabel: '',
    destinationDepartureAt: null,
    destinationDepartureTimeLabel: '',
    destinationDepartureLocationSnapshot: null,
    arrivedDestinationAt: null,
    arrivedDestinationTimeLabel: '',
    destinationArrivalAt: null,
    destinationArrivalTimeLabel: '',
    destinationArrivalLocationSnapshot: null,
    completedAt: null,
    completedTimeLabel: '',
    completionLocationSnapshot: null,
    startedLate: false,
    startLateMinutes: null,
    pickupLate: false,
    pickupLateMinutes: null,
    dropoffLate: false,
    dropoffLateMinutes: null,
    riderSignatureName: '',
    riderSignedAt: null,
    auditTrail: sortedEvents.map(event => ({
      id: event.id,
      action: event.action,
      timestamp: event.timestamp,
      timeLabel: event.timeLabel,
      riderSignatureName: event.riderSignatureName,
      compliance: event.compliance || null
    }))
  };

  for (const event of sortedEvents) {
    const action = String(event?.action || '').trim().toLowerCase();
    const timestamp = Number(event?.timestamp || 0) || null;
    const timeLabel = String(event?.timeLabel || '').trim();
    const riderSignatureName = String(event?.riderSignatureName || '').trim();
    const locationSnapshot = event?.locationSnapshot && typeof event.locationSnapshot === 'object' ? event.locationSnapshot : null;
    const compliance = event?.compliance && typeof event.compliance === 'object' ? event.compliance : null;

    if (riderSignatureName) {
      workflowState.riderSignatureName = riderSignatureName;
      workflowState.riderSignedAt = timestamp;
    }

    if (action === 'activate-willcall') {
      workflowState.status = 'willcall';
      workflowState.willCallActivatedAt = timestamp;
      workflowState.willCallActivatedTimeLabel = timeLabel;
    }

    if (action === 'accept') {
      workflowState.status = 'accepted';
      workflowState.acceptedAt = timestamp;
      workflowState.acceptedTimeLabel = timeLabel;
    }

    if (action === 'en-route') {
      workflowState.status = 'en-route';
      workflowState.departureAt = timestamp;
      workflowState.departureTimeLabel = timeLabel;
      workflowState.departureToPickupAt = timestamp;
      workflowState.departureToPickupTimeLabel = timeLabel;
      workflowState.departureLocationSnapshot = locationSnapshot;
      workflowState.startedLate = Boolean(compliance?.isLate);
      workflowState.startLateMinutes = compliance?.measured ? Math.max(0, Number(compliance?.lateByMinutes) || 0) : null;
    }

    if (action === 'arrived') {
      workflowState.status = 'arrived-pickup';
      workflowState.arrivalAt = timestamp;
      workflowState.arrivalTimeLabel = timeLabel;
      workflowState.arrivedPickupAt = timestamp;
      workflowState.arrivedPickupTimeLabel = timeLabel;
      workflowState.arrivalLocationSnapshot = locationSnapshot;
      workflowState.pickupLate = Boolean(compliance?.isLate);
      workflowState.pickupLateMinutes = compliance?.measured ? Math.max(0, Number(compliance?.lateByMinutes) || 0) : null;
    }

    if (action === 'patient-onboard') {
      workflowState.status = 'patient-onboard';
      workflowState.patientOnboardAt = timestamp;
      workflowState.patientOnboardTimeLabel = timeLabel;
      workflowState.pickupAt = timestamp;
      workflowState.pickupTimeLabel = timeLabel;
    }

    if (action === 'start-trip') {
      workflowState.status = 'to-destination';
      workflowState.startTripAt = timestamp;
      workflowState.startTripTimeLabel = timeLabel;
      workflowState.destinationDepartureAt = timestamp;
      workflowState.destinationDepartureTimeLabel = timeLabel;
      workflowState.destinationDepartureLocationSnapshot = locationSnapshot;
    }

    if (action === 'arrived-destination') {
      workflowState.status = 'arrived-destination';
      workflowState.arrivedDestinationAt = timestamp;
      workflowState.arrivedDestinationTimeLabel = timeLabel;
      workflowState.destinationArrivalAt = timestamp;
      workflowState.destinationArrivalTimeLabel = timeLabel;
      workflowState.destinationArrivalLocationSnapshot = locationSnapshot;
      workflowState.dropoffLate = Boolean(compliance?.isLate);
      workflowState.dropoffLateMinutes = compliance?.measured ? Math.max(0, Number(compliance?.lateByMinutes) || 0) : null;
    }

    if (action === 'complete') {
      workflowState.status = 'completed';
      workflowState.completedAt = timestamp;
      workflowState.completedTimeLabel = timeLabel;
      workflowState.completionLocationSnapshot = locationSnapshot;
      workflowState.dropoffLate = Boolean(compliance?.isLate);
      workflowState.dropoffLateMinutes = compliance?.measured ? Math.max(0, Number(compliance?.lateByMinutes) || 0) : null;
    }

    if (action === 'cancel') {
      workflowState.status = 'cancelled';
    }
  }

  return workflowState;
};

const buildDriverWorkflowState = (trip, workflowEvents = []) => {
  const existingWorkflow = trip?.driverWorkflow && typeof trip.driverWorkflow === 'object' ? trip.driverWorkflow : null;
  const eventWorkflow = buildWorkflowStateFromEvents(workflowEvents);
  if (eventWorkflow) return eventWorkflow;

  const sanitizedWorkflow = {
    willCallActivatedAt: trip?.willCallActivatedAt || existingWorkflow?.willCallActivatedAt || null,
    willCallActivatedTimeLabel: String(existingWorkflow?.willCallActivatedTimeLabel || '').trim(),
    departureAt: trip?.enRouteAt || null,
    departureTimeLabel: trip?.enRouteAt ? String(existingWorkflow?.departureTimeLabel || '').trim() : '',
    departureToPickupAt: trip?.enRouteAt || null,
    departureToPickupTimeLabel: trip?.enRouteAt ? String(existingWorkflow?.departureToPickupTimeLabel || existingWorkflow?.departureTimeLabel || '').trim() : '',
    arrivalAt: trip?.arrivedAt || null,
    arrivalTimeLabel: trip?.arrivedAt ? String(existingWorkflow?.arrivalTimeLabel || '').trim() : '',
    arrivedPickupAt: trip?.arrivedAt || null,
    arrivedPickupTimeLabel: trip?.arrivedAt ? String(existingWorkflow?.arrivedPickupTimeLabel || existingWorkflow?.arrivalTimeLabel || '').trim() : '',
    patientOnboardAt: trip?.patientOnboardAt || null,
    patientOnboardTimeLabel: trip?.patientOnboardAt ? String(existingWorkflow?.patientOnboardTimeLabel || '').trim() : '',
    pickupAt: trip?.patientOnboardAt || null,
    pickupTimeLabel: trip?.patientOnboardAt ? String(existingWorkflow?.pickupTimeLabel || existingWorkflow?.patientOnboardTimeLabel || '').trim() : '',
    startTripAt: trip?.startTripAt || null,
    startTripTimeLabel: trip?.startTripAt ? String(existingWorkflow?.startTripTimeLabel || '').trim() : '',
    destinationDepartureAt: trip?.startTripAt || null,
    destinationDepartureTimeLabel: trip?.startTripAt ? String(existingWorkflow?.destinationDepartureTimeLabel || existingWorkflow?.startTripTimeLabel || '').trim() : '',
    arrivedDestinationAt: trip?.arrivedDestinationAt || null,
    arrivedDestinationTimeLabel: trip?.arrivedDestinationAt ? String(existingWorkflow?.arrivedDestinationTimeLabel || '').trim() : '',
    destinationArrivalAt: trip?.arrivedDestinationAt || null,
    destinationArrivalTimeLabel: trip?.arrivedDestinationAt ? String(existingWorkflow?.destinationArrivalTimeLabel || existingWorkflow?.arrivedDestinationTimeLabel || '').trim() : '',
    completedAt: trip?.completedAt || null,
    completedTimeLabel: trip?.completedAt ? String(existingWorkflow?.completedTimeLabel || '').trim() : '',
    riderSignatureName: String(existingWorkflow?.riderSignatureName || '').trim(),
    riderSignedAt: trip?.riderSignedAt || existingWorkflow?.riderSignedAt || null,
    auditTrail: []
  };

  sanitizedWorkflow.status = sanitizedWorkflow.completedAt
    ? 'completed'
    : trip?.canceledAt
      ? 'cancelled'
      : sanitizedWorkflow.arrivedDestinationAt
        ? 'arrived-destination'
        : sanitizedWorkflow.startTripAt
          ? 'to-destination'
          : sanitizedWorkflow.patientOnboardAt
            ? 'patient-onboard'
            : sanitizedWorkflow.arrivedPickupAt
              ? 'arrived-pickup'
              : sanitizedWorkflow.departureToPickupAt
                ? 'en-route'
                : sanitizedWorkflow.willCallActivatedAt
                  ? 'willcall'
                  : '';

  const hasWorkflowState = Boolean(
    sanitizedWorkflow.status
    || sanitizedWorkflow.willCallActivatedAt
    || sanitizedWorkflow.departureToPickupAt
    || sanitizedWorkflow.arrivedPickupAt
    || sanitizedWorkflow.patientOnboardAt
    || sanitizedWorkflow.startTripAt
    || sanitizedWorkflow.arrivedDestinationAt
    || sanitizedWorkflow.completedAt
  );

  if (!hasWorkflowState) return null;

  return {
    ...sanitizedWorkflow
  };
};

const getTripPatientPhone = trip => {
  return String(
    trip?.patientPhoneNumber
    || trip?.patientPhone
    || trip?.phone
    || trip?.phoneNumber
    || trip?.memberPhone
    || trip?.mobile
    || trip?.riderPhone
    || ''
  ).trim();
};

const mapTripForDriver = (trip, workflowEvents = []) => {
  const normalizedTrip = normalizeTripRecord(trip);
  const driverWorkflow = buildDriverWorkflowState(normalizedTrip, workflowEvents);
  const effectiveStatus = getEffectiveTripStatus(normalizedTrip);
  const rawNotes = String(normalizedTrip.notes || normalizedTrip.note || normalizedTrip.comments || '').trim();
  const subMobilityType = String(normalizedTrip.subMobilityType || '').trim();
  const wheelText = `${normalizedTrip.mobilityType || ''} ${normalizedTrip.vehicleType || ''} ${subMobilityType} ${rawNotes}`.toLowerCase();
  const wheelChairIsXL = /(\bxl\b|extra\s*large)/i.test(wheelText);
  const wheelChairFoldable = /(fold|foldable|can\s*fold|foldo)/i.test(wheelText);
  const confirmationStatus = String(normalizedTrip?.confirmation?.status || '').trim();
  const providerSnapshot = normalizedTrip?.providerSnapshot && typeof normalizedTrip.providerSnapshot === 'object' ? normalizedTrip.providerSnapshot : null;
  const localOverrides = normalizedTrip?.localOverrides && typeof normalizedTrip.localOverrides === 'object' ? normalizedTrip.localOverrides : null;
  const providerNotes = String(providerSnapshot?.notes || '').trim();
  const providerScheduledPickup = String(providerSnapshot?.scheduledPickup || providerSnapshot?.pickup || '').trim();
  const providerScheduledDropoff = String(providerSnapshot?.scheduledDropoff || providerSnapshot?.dropoff || '').trim();
  const hasPickupTimeOverride = Boolean(localOverrides?.pickupTime) && Boolean(providerScheduledPickup) && providerScheduledPickup !== String(normalizedTrip.scheduledPickup || '').trim();
  const hasDropoffTimeOverride = Boolean(localOverrides?.dropoffTime) && Boolean(providerScheduledDropoff) && providerScheduledDropoff !== String(normalizedTrip.scheduledDropoff || '').trim();
  const hasNotesOverride = Boolean(localOverrides?.notes) && providerNotes !== rawNotes;

  return {
    id: normalizedTrip.id,
    rideId: normalizedTrip.rideId || '',
    rider: normalizedTrip.rider || '',
    pickup: normalizedTrip.pickup || normalizedTrip.scheduledPickup || '',
    dropoff: normalizedTrip.dropoff || normalizedTrip.scheduledDropoff || '',
    scheduledPickup: normalizedTrip.scheduledPickup || '',
    scheduledDropoff: normalizedTrip.scheduledDropoff || '',
    actualPickup: normalizedTrip.actualPickup || '',
    actualDropoff: normalizedTrip.actualDropoff || '',
    serviceDate: getTripServiceDateKey(normalizedTrip),
    address: normalizedTrip.address || '',
    pickupZip: normalizedTrip.pickupZip || normalizedTrip.fromZipcode || '',
    destination: normalizedTrip.destination || '',
    dropoffZip: normalizedTrip.destinationZip || normalizedTrip.doZip || '',
    notes: rawNotes,
    note: rawNotes,
    providerNotes,
    providerScheduledPickup,
    providerScheduledDropoff,
    hasPickupTimeOverride,
    hasDropoffTimeOverride,
    hasNotesOverride,
    patientPhoneNumber: getTripPatientPhone(normalizedTrip),
    patientPhone: String(normalizedTrip.patientPhone || '').trim(),
    phone: String(normalizedTrip.phone || '').trim(),
    phoneNumber: String(normalizedTrip.phoneNumber || '').trim(),
    memberPhone: String(normalizedTrip.memberPhone || '').trim(),
    riderPhone: String(normalizedTrip.riderPhone || '').trim(),
    mobile: String(normalizedTrip.mobile || '').trim(),
    assistanceNeeds: normalizedTrip.assistanceNeeds || '',
    mobilityType: normalizedTrip.mobilityType || '',
    subMobilityType,
    assistLevel: normalizedTrip.assistLevel || '',
    hasServiceAnimal: Boolean(normalizedTrip.hasServiceAnimal),
    wheelChairIsXL,
    wheelChairFoldable,
    confirmationStatus,
    confirmationSentAt: String(normalizedTrip?.confirmation?.sentAt || '').trim() || '',
    confirmationRespondedAt: String(normalizedTrip?.confirmation?.respondedAt || '').trim() || '',
    createdAt: normalizedTrip.createdAt || null,
    updatedAt: normalizedTrip.updatedAt || null,
    status: effectiveStatus,
    vehicleType: normalizedTrip.vehicleType || '',
    miles: Number(normalizedTrip.miles) || 0,
    leg: normalizedTrip.legLabel || normalizedTrip.leg || '',
    brokerTripId: String(normalizedTrip.brokerTripId || '').trim(),
    punctualityLabel: getTripPunctualityLabel(normalizedTrip),
    punctualityVariant: getTripPunctualityVariant(normalizedTrip),
    lateMinutes: getTripLateMinutesDisplay(normalizedTrip),
    isWillCall: effectiveStatus === 'WillCall',
    enRouteAt: normalizedTrip.enRouteAt || null,
    arrivedAt: normalizedTrip.arrivedAt || null,
    patientOnboardAt: normalizedTrip.patientOnboardAt || driverWorkflow?.patientOnboardAt || null,
    startTripAt: normalizedTrip.startTripAt || driverWorkflow?.startTripAt || null,
    arrivedDestinationAt: normalizedTrip.arrivedDestinationAt || driverWorkflow?.arrivedDestinationAt || null,
    completedAt: normalizedTrip.completedAt || null,
    riderSignatureName: String(normalizedTrip.riderSignatureName || '').trim(),
    riderSignedAt: normalizedTrip.riderSignedAt || null,
    canceledAt: normalizedTrip.canceledAt || null,
    canceledByDriverId: String(normalizedTrip.canceledByDriverId || '').trim(),
    canceledByDriverName: String(normalizedTrip.canceledByDriverName || '').trim(),
    cancellationReason: String(normalizedTrip.cancellationReason || '').trim(),
    cancellationPhotoDataUrl: String(normalizedTrip.cancellationPhotoDataUrl || '').trim(),
    completionPhotoDataUrl: String(normalizedTrip.completionPhotoDataUrl || '').trim(),
    willCallActivatedAt: normalizedTrip.willCallActivatedAt || null,
    willCallPickupDeadlineAt: normalizedTrip.willCallPickupDeadlineAt || null,
    driverWorkflow
  };
};

const internalError = (request, error) => jsonWithMobileCors(request, { ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get('driverId');
    const driverCode = searchParams.get('driverCode');
    const lookupValue = normalizeLookupValue(driverId || driverCode);

    if (!lookupValue) {
      return jsonWithMobileCors(request, {
        ok: false,
        error: 'driverId or driverCode is required.'
      }, { status: 400 });
    }

    const authResult = await authorizeMobileDriverRequest(request, lookupValue);
    if (authResult.response) return withMobileCors(authResult.response, request);

    const [adminPayload, adminState] = await Promise.all([
      readNemtAdminPayload(),
      readNemtAdminState()
    ]);

    const driver = (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(item => {
      const idMatches = normalizeLookupValue(item?.id) === lookupValue;
      const codeMatches = normalizeLookupValue(item?.code) === lookupValue;
      return idMatches || codeMatches;
    });

    if (!driver) {
      return jsonWithMobileCors(request, {
        ok: false,
        error: 'Driver not found.'
      }, { status: 404 });
    }

    const driverMatch = buildDriverAssignmentCandidates({
      driverId: driver.id,
      driverName: driver.name,
      driverCode: driver.code
    });

    const todayServiceDateKey = getLocalDateKey(Date.now(), DEFAULT_DISPATCH_TIME_ZONE);
    const nextDayServiceDateKey = shiftTripDateKey(todayServiceDateKey, 1);
    const dispatchState = await readNemtDispatchState({ includePastDates: true });
    const assignedTrips = (Array.isArray(dispatchState?.trips) ? dispatchState.trips : []).filter(trip => {
      return isTripAssignedToDriver(trip, driverMatch) && !isCancelledTrip(trip);
    }).sort(sortTripsByPickupTime);
    const workflowEventsByTripId = await readTripWorkflowEventsByTripIds(assignedTrips.map(trip => trip?.id));
    const mappedAssignedTrips = assignedTrips.map(trip => {
      const mappedTrip = mapTripForDriver(trip, workflowEventsByTripId.get(String(trip?.id || '').trim()) || []);
      return {
        ...mappedTrip,
        isNextDayTrip: mappedTrip.serviceDate === nextDayServiceDateKey
      };
    });
    const trips = mappedAssignedTrips.filter(trip => {
      const serviceDateKey = String(trip?.serviceDate || '').trim();
      if (!serviceDateKey) return true;
      if (serviceDateKey === todayServiceDateKey || serviceDateKey === nextDayServiceDateKey) return true;
      return isDriverTripInProgress(trip);
    });
    const activeTrip = trips.find(trip => isDriverTripInProgress(trip)) || null;
    const driverState = (Array.isArray(adminState?.drivers) ? adminState.drivers : []).find(item => String(item?.id || '').trim() === String(driver.id).trim()) || null;

    const now = Date.now();
    const autoAlert = buildAutoNoDepartureAlert({
      driver,
      driverState,
      trip: activeTrip,
      now
    });
    const existingActiveAlert = await getActiveMessageForDriver(driver.id, AUTO_NO_DEPARTURE_ALERT_TYPE);

    if (autoAlert) {
      await upsertSystemMessage(autoAlert);
      await upsertDriverDisciplineEvent({
        id: autoAlert.id,
        driverId: autoAlert.driverId,
        tripId: autoAlert.tripId,
        eventType: 'no-departure',
        severity: autoAlert.priority === 'high' ? 'high' : 'normal',
        status: 'active',
        summary: autoAlert.subject,
        body: autoAlert.body,
        sourceMessageId: autoAlert.id,
        occurredAt: autoAlert.createdAt,
        data: {
          lateByMinutes: autoAlert.lateByMinutes,
          scheduledPickup: autoAlert.scheduledPickup,
          trackingAgeMinutes: autoAlert.trackingAgeMinutes,
          serviceDate: autoAlert.serviceDate
        }
      });
      if (existingActiveAlert?.id && existingActiveAlert.id !== autoAlert.id) {
        await resolveSystemMessageById(existingActiveAlert.id);
        await resolveDriverDisciplineEventById(existingActiveAlert.id);
      }
    } else if (existingActiveAlert?.id) {
      await resolveSystemMessageById(existingActiveAlert.id);
      await resolveDriverDisciplineEventById(existingActiveAlert.id);
    }

    return jsonWithMobileCors(request, {
      ok: true,
      driver: {
        id: driver.id,
        code: driver.code,
        name: driver.name,
        vehicle: driver.vehicle,
        live: driver.live
      },
      trips,
      activeTrip,
      updatedAt: now
    });
  } catch (error) {
    return internalError(request, error);
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}