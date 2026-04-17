import { NextResponse } from 'next/server';
import { DEFAULT_DISPATCH_TIME_ZONE, getLocalDateKey, getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, normalizeTripRecord, parseTripClockMinutes, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { readNemtAdminPayload, readNemtAdminState } from '@/server/nemt-admin-store';
import { readAssignedTripsForDriverByServiceDates } from '@/server/nemt-dispatch-store';
import { getActiveMessageForDriver, resolveSystemMessageById, upsertSystemMessage } from '@/server/system-messages-store';
import { readTripWorkflowEventsByTripIds } from '@/server/trip-workflow-store';
import { resolveDriverDisciplineEventById, upsertDriverDisciplineEvent } from '@/server/driver-discipline-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const AUTO_NO_DEPARTURE_ALERT_TYPE = 'no-departure-alert';
const AUTO_NO_DEPARTURE_THRESHOLD_MINUTES = 5;

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const isTripAssignedToDriver = (trip, driverId) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return false;
  return String(trip?.driverId || '').trim() === normalizedDriverId || String(trip?.secondaryDriverId || '').trim() === normalizedDriverId;
};

const isCancelledTrip = trip => ['cancelled', 'canceled'].includes(normalizeLookupValue(trip?.status));

const isRehabTrip = trip => {
  const normalizedStatus = normalizeLookupValue(trip?.status);
  if (['rehab', 'hospital', 'hospital-rehab'].includes(normalizedStatus)) return true;

  const startDate = String(trip?.hospitalStatus?.startDate || '').trim();
  const endDate = String(trip?.hospitalStatus?.endDate || '').trim();
  if (!startDate || !endDate) return false;
  const todayKey = getLocalDateKey(Date.now(), DEFAULT_DISPATCH_TIME_ZONE);
  return todayKey >= startDate && todayKey <= endDate;
};

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

const hasWillCallPickupMarker = trip => {
  const effectivePickupText = String(trip?.scheduledPickup || trip?.pickup || '').trim().toLowerCase();
  if (!effectivePickupText) return false;
  const normalizedPickup = effectivePickupText.replace(/\s+/g, '');
  if (['11:59pm', '11:59p.m.', '11:59p'].includes(normalizedPickup)) return true;
  return ['tbd', 'willcall', 'will call', '23', '23:'].some(marker => effectivePickupText === marker || effectivePickupText.startsWith(marker));
};

const getEffectiveTripStatus = trip => {
  const normalizedStatus = String(trip?.status || '').trim();
  const normalizedStatusToken = normalizedStatus.toLowerCase().replace(/\s+/g, '');
  const normalizedOverride = String(trip?.willCallOverride || '').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(normalizedStatusToken)) return 'Cancelled';
  if (normalizedOverride === 'off') return normalizedStatusToken === 'willcall' ? 'Unassigned' : normalizedStatus || 'Unassigned';
  if (normalizedOverride === 'manual') return 'WillCall';
  if (normalizedStatusToken === 'willcall') return 'WillCall';
  if (hasWillCallPickupMarker(trip)) return 'WillCall';
  return normalizedStatus || 'Unassigned';
};

const buildDriverWorkflowState = (trip, workflowEvents = []) => {
  const existingWorkflow = trip?.driverWorkflow && typeof trip.driverWorkflow === 'object' ? trip.driverWorkflow : null;
  const fallbackAuditTrail = Array.isArray(existingWorkflow?.auditTrail) ? existingWorkflow.auditTrail : [];
  const auditTrail = workflowEvents.length > 0 ? workflowEvents.map(event => ({
    id: event.id,
    action: event.action,
    timestamp: event.timestamp,
    timeLabel: event.timeLabel,
    riderSignatureName: event.riderSignatureName,
    compliance: event.compliance || null
  })) : fallbackAuditTrail;
  if (!existingWorkflow && auditTrail.length === 0) return null;
  return {
    ...(existingWorkflow || {}),
    auditTrail
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
    patientOnboardAt: normalizedTrip.patientOnboardAt || normalizedTrip.driverWorkflow?.patientOnboardAt || null,
    startTripAt: normalizedTrip.startTripAt || normalizedTrip.driverWorkflow?.startTripAt || null,
    arrivedDestinationAt: normalizedTrip.arrivedDestinationAt || normalizedTrip.driverWorkflow?.arrivedDestinationAt || null,
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
    driverWorkflow: buildDriverWorkflowState(normalizedTrip, workflowEvents)
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

    const todayServiceDateKey = getLocalDateKey(Date.now(), DEFAULT_DISPATCH_TIME_ZONE);
    const nextDayServiceDateKey = shiftTripDateKey(todayServiceDateKey, 1);
    const assignedTrips = await readAssignedTripsForDriverByServiceDates({
      driverId: driver.id,
      serviceDateKeys: [todayServiceDateKey, nextDayServiceDateKey]
    });
    const driverTrips = (Array.isArray(assignedTrips) ? assignedTrips : []).filter(trip => {
      const serviceDateKey = getTripServiceDateKey(trip);
      return isTripAssignedToDriver(trip, driver.id) && [todayServiceDateKey, nextDayServiceDateKey].includes(serviceDateKey) && !isCancelledTrip(trip) && !isRehabTrip(trip);
    }).sort(sortTripsByPickupTime);
    const workflowEventsByTripId = await readTripWorkflowEventsByTripIds(driverTrips.map(trip => trip?.id));
    const trips = driverTrips.map(trip => {
      const mappedTrip = mapTripForDriver(trip, workflowEventsByTripId.get(String(trip?.id || '').trim()) || []);
      return {
        ...mappedTrip,
        isNextDayTrip: mappedTrip.serviceDate === nextDayServiceDateKey
      };
    });
    const activeTrip = trips.find(trip => String(trip?.status || '').trim().toLowerCase() !== 'completed') || trips[0] || null;
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