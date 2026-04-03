import { NextResponse } from 'next/server';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';

const formatCheckpoint = (latitude, longitude) => `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;

export async function POST(request) {
  const body = await request.json();
  const driverId = String(body?.driverId || '').trim();
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const heading = body?.heading == null ? null : Number(body.heading);
  const speed = body?.speed == null ? null : Number(body.speed);
  const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
  const city = String(body?.city || '').trim();
  const sourceTimestamp = Number(body?.timestamp);

  if (!driverId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ ok: false, error: 'driverId, latitude, and longitude are required.' }, { status: 400 });
  }

  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const currentDriver = drivers.find(driver => String(driver?.id || '').trim() === driverId);

  if (!currentDriver) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const trackingLastSeen = Number.isFinite(sourceTimestamp) ? new Date(sourceTimestamp).toISOString() : new Date().toISOString();
  const nextDrivers = drivers.map(driver => String(driver?.id || '').trim() === driverId ? {
    ...driver,
    position: [latitude, longitude],
    trackingSource: 'android',
    trackingLastSeen,
    checkpoint: body?.checkpoint || city || formatCheckpoint(latitude, longitude),
    city,
    heading,
    speed,
    accuracy
  } : driver);

  await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  return NextResponse.json({ ok: true, driverId, trackingLastSeen });
}