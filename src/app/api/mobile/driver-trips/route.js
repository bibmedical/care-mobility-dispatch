import { NextResponse } from 'next/server';
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

export async function GET(request) {
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
  const trips = (Array.isArray(dispatchState?.trips) ? dispatchState.trips : []).filter(trip => trip?.driverId === driver.id && !isCancelledTrip(trip)).sort(sortTripsByPickupTime);

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
}