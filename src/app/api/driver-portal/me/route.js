import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, normalizeTripRecord } from '@/helpers/nemt-dispatch-state';
import { isDriverRole } from '@/helpers/system-users';
import { getFullName } from '@/helpers/nemt-admin-model';
import { resolveDriverForSession } from '@/server/driver-portal';
import { readNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readSystemMessages } from '@/server/system-messages-store';

const normalizeLookupValue = value => String(value ?? '').trim().toLowerCase();

const isCancelledTrip = trip => ['cancelled', 'canceled'].includes(normalizeLookupValue(trip?.status));

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
    assistanceNeeds: normalizedTrip.assistanceNeeds || '',
    mobilityType: normalizedTrip.mobilityType || '',
    assistLevel: normalizedTrip.assistLevel || '',
    hasServiceAnimal: Boolean(normalizedTrip.hasServiceAnimal),
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

const getDocumentUrl = value => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.dataUrl || value.url || value.path || '').trim();
};

const internalError = error => NextResponse.json({ ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET() {
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

  const dispatchState = await readNemtDispatchState();
  const messages = await readSystemMessages();
  const trips = (Array.isArray(dispatchState?.trips) ? dispatchState.trips : [])
    .filter(trip => String(trip?.driverId || '').trim() === String(driver.id || '').trim() && !isCancelledTrip(trip))
    .sort((leftTrip, rightTrip) => {
      const leftTime = Number.isFinite(leftTrip?.pickupSortValue) ? leftTrip.pickupSortValue : Number.MAX_SAFE_INTEGER;
      const rightTime = Number.isFinite(rightTrip?.pickupSortValue) ? rightTrip.pickupSortValue : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(leftTrip?.id || '').localeCompare(String(rightTrip?.id || ''));
    })
    .map(mapTripForDriver);

  const visibleMessages = messages.filter(message => {
    const messageDriverId = String(message?.driverId || '').trim();
    return !messageDriverId || messageDriverId === String(driver.id || '').trim();
  }).slice(0, 25);

  return NextResponse.json({
    ok: true,
    driver: {
      id: driver.id,
      authUserId: driver.authUserId || '',
      name: getFullName(driver),
      username: driver.portalUsername || driver.username || '',
      email: driver.portalEmail || driver.email || '',
      phone: driver.phone || '',
      vehicleId: driver.vehicleId || '',
      vehicleLabel: driver.vehicleLabel || driver.vehicle || '',
      live: driver.live || 'Offline',
      checkpoint: driver.checkpoint || 'Base dispatch',
      profilePhotoUrl: getDocumentUrl(driver?.documents?.profilePhoto),
      documents: {
        profilePhoto: driver?.documents?.profilePhoto ?? null,
        licenseFront: driver?.documents?.licenseFront ?? null,
        licenseBack: driver?.documents?.licenseBack ?? null,
        insuranceCertificate: driver?.documents?.insuranceCertificate ?? null,
        w9Document: driver?.documents?.w9Document ?? null,
        trainingCertificate: driver?.documents?.trainingCertificate ?? null
      }
    },
    trips,
    activeTrip: trips[0] ?? null,
    messages: visibleMessages,
    updatedAt: Date.now()
  });
  } catch (error) {
    return internalError(error);
  }
}