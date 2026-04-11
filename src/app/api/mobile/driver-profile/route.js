import { NextResponse } from 'next/server';
import { normalizePhoneDigits } from '@/helpers/system-users';
import { readSystemUsersState, writeSystemUsersState } from '@/server/system-users-store';
import { getFullName } from '@/helpers/nemt-admin-model';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const splitFullName = value => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const buildSessionPayload = driver => ({
  driverId: driver.id,
  driverCode: driver.portalUsername || driver.username || '',
  name: getFullName(driver),
  username: driver.portalUsername || driver.username || '',
  email: driver.portalEmail || driver.email || '',
  phone: normalizePhoneDigits(driver.phone),
  address: String(driver.address || driver.baseAddress || '').trim(),
  timeOffAppointment: driver.timeOffAppointment || null,
  vehicleId: driver.vehicleId || '',
  passwordResetRequired: Boolean(driver.passwordResetRequired)
});

const findDriver = (drivers, driverId) => (Array.isArray(drivers) ? drivers : []).find(driver => String(driver?.id || '').trim() === String(driverId || '').trim());

export async function GET(request) {
  const driverId = request.nextUrl.searchParams.get('driverId') || '';
  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  return jsonWithMobileCors(request, { ok: true, session: buildSessionPayload(driver) });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const driverId = String(payload?.driverId || '').trim();
  const name = String(payload?.name || '').trim();
  const email = String(payload?.email || '').trim();
  const phone = normalizePhoneDigits(payload?.phone || '');
  const address = String(payload?.address || '').trim();

  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const { firstName, lastName } = splitFullName(name || getFullName(driver));

  const nextDrivers = adminState.drivers.map(item => {
    if (String(item?.id || '').trim() !== driverId) return item;
    return {
      ...item,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`.trim(),
      email: email || item.email || '',
      portalEmail: email || item.portalEmail || item.email || '',
      phone: phone || item.phone || '',
      address: address || item.address || '',
      baseAddress: address || item.baseAddress || '',
      routeStartAddress: address || item.routeStartAddress || '',
      checkpoint: address || item.checkpoint || ''
    };
  });

  const nextAdminState = await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  const updatedDriver = findDriver(nextAdminState.drivers, driverId);

  if (updatedDriver?.authUserId) {
    const usersState = await readSystemUsersState();
    const nextUsers = usersState.users.map(user => {
      if (String(user?.id || '').trim() !== String(updatedDriver.authUserId).trim()) return user;
      return {
        ...user,
        firstName,
        lastName,
        email: email || user.email || '',
        phone: phone || user.phone || ''
      };
    });

    await writeSystemUsersState({
      ...usersState,
      users: nextUsers
    });
  }

  return jsonWithMobileCors(request, { ok: true, session: {
    ...buildSessionPayload(updatedDriver),
    deviceId: request.headers.get('x-driver-device-id') || '',
    sessionToken: request.headers.get('x-driver-session-token') || ''
  } });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}