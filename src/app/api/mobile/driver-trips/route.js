import { NextResponse } from 'next/server';
import { getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, normalizeTripRecord } from '@/helpers/nemt-dispatch-state';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchState } from '@/server/nemt-dispatch-store';

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const isCancelledTrip = trip => ['cancelled', 'canceled'].includes(normalizeLookupValue(trip?.status));

const sortTripsByPickupTime = (leftTrip, rightTrip) => {
  const leftTime = Number.isFinite(leftTrip?.pickupSortValue) ? leftTrip.pickupSortValue : Number.MAX_SAFE_INTEGER;
  const rightTime = Number.isFinite(rightTrip?.pickupSortValue) ? rightTrip.pickupSortValue : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip?.id || '').localeCompare(String(rightTrip?.id || ''));
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

const mapTripForDriver = trip => {
  const normalizedTrip = normalizeTripRecord(trip);
  const effectiveStatus = getEffectiveTripStatus(normalizedTrip);

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
    notes: String(normalizedTrip.notes || normalizedTrip.note || normalizedTrip.comments || '').trim(),
    patientPhoneNumber: normalizedTrip.patientPhoneNumber || '',
    status: effectiveStatus,
    vehicleType: normalizedTrip.vehicleType || '',
    miles: Number(normalizedTrip.miles) || 0,
    leg: normalizedTrip.legLabel || normalizedTrip.leg || '',
    brokerTripId: String(normalizedTrip.brokerTripId || '').trim(),
    punctualityLabel: getTripPunctualityLabel(normalizedTrip),
    punctualityVariant: getTripPunctualityVariant(normalizedTrip),
    lateMinutes: getTripLateMinutesDisplay(normalizedTrip),
    isWillCall: effectiveStatus === 'WillCall'
  };
};

const internalError = error => NextResponse.json({ ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET(request) {
  try {
  const { searchParams } = new URL(request.url);
  const driverId = searchParams.get('driverId');
  const driverCode = searchParams.get('driverCode');
  const lookupValue = normalizeLookupValue(driverId || driverCode);

  if (!lookupValue) {
    return NextResponse.json({
      ok: false,
      error: 'driverId or driverCode is required.'
    }, { status: 400 });
  }

  const adminPayload = await readNemtAdminPayload();
  const driver = (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(item => {
    const idMatches = normalizeLookupValue(item?.id) === lookupValue;
    const codeMatches = normalizeLookupValue(item?.code) === lookupValue;
    return idMatches || codeMatches;
  });

  if (!driver) {
    return NextResponse.json({
      ok: false,
      error: 'Driver not found.'
    }, { status: 404 });
  }

  const dispatchState = await readNemtDispatchState();
  const trips = (Array.isArray(dispatchState?.trips) ? dispatchState.trips : []).filter(trip => trip?.driverId === driver.id && !isCancelledTrip(trip)).sort(sortTripsByPickupTime).map(mapTripForDriver);

  return NextResponse.json({
    ok: true,
    driver: {
      id: driver.id,
      code: driver.code,
      name: driver.name,
      vehicle: driver.vehicle,
      live: driver.live
    },
    trips,
    activeTrip: trips[0] ?? null,
    updatedAt: Date.now()
  });
  } catch (error) {
    return internalError(error);
  }
}