import { NextResponse } from 'next/server';
import { readNemtAdminState, updateDriverLocation } from '@/server/nemt-admin-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const formatCheckpoint = (latitude, longitude) => `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;

const internalError = (request, error) => jsonWithMobileCors(request, { ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function POST(request) {
  try {
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
    return jsonWithMobileCors(request, { ok: false, error: 'driverId, latitude, and longitude are required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const currentDriver = drivers.find(driver => String(driver?.id || '').trim() === driverId);

  if (!currentDriver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const trackingLastSeen = Number.isFinite(sourceTimestamp) ? new Date(sourceTimestamp).toISOString() : new Date().toISOString();
  await updateDriverLocation({
    driverId,
    latitude,
    longitude,
    heading,
    speed,
    accuracy,
    city,
    checkpoint: body?.checkpoint || city || formatCheckpoint(latitude, longitude),
    trackingLastSeen
  });

  return jsonWithMobileCors(request, { ok: true, driverId, trackingLastSeen });
  } catch (error) {
    return internalError(request, error);
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}