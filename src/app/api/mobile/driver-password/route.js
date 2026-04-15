import { isDriverPasswordResetRequired } from '@/helpers/nemt-admin-model';
import { normalizeAuthValue, normalizePhoneDigits } from '@/helpers/system-users';
import { readSystemUsersState, writeSystemUsersState } from '@/server/system-users-store';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const findDriver = (drivers, driverId) => (Array.isArray(drivers) ? drivers : []).find(driver => String(driver?.id || '').trim() === String(driverId || '').trim());

const findLinkedSystemUser = (users, driver) => {
  const driverAuthUserId = String(driver?.authUserId || '').trim();
  const candidateEmails = new Set([
    normalizeAuthValue(driver?.email),
    normalizeAuthValue(driver?.portalEmail)
  ].filter(Boolean));
  const candidateUsernames = new Set([
    normalizeAuthValue(driver?.username),
    normalizeAuthValue(driver?.portalUsername)
  ].filter(Boolean));
  const candidatePhones = new Set([
    normalizePhoneDigits(driver?.phone),
    normalizePhoneDigits(driver?.mobilePhone),
    normalizePhoneDigits(driver?.contactPhone)
  ].filter(Boolean));

  return (Array.isArray(users) ? users : []).find(user => {
    const userId = String(user?.id || '').trim();
    const username = normalizeAuthValue(user?.username);
    const email = normalizeAuthValue(user?.email);
    const phone = normalizePhoneDigits(user?.phone);

    if (driverAuthUserId && userId === driverAuthUserId) return true;
    if (email && candidateEmails.has(email)) return true;
    if (username && candidateUsernames.has(username)) return true;
    return Boolean(phone) && candidatePhones.has(phone);
  }) || null;
};

const matchesCurrentPassword = ({ driver, linkedUser, currentPassword }) => {
  const nextPassword = String(currentPassword || '').trim();
  if (!nextPassword) return false;

  const driverPassword = String(driver?.password || '').trim();
  const linkedPassword = String(linkedUser?.password || '').trim();
  return nextPassword === driverPassword || nextPassword === linkedPassword;
};

const buildSessionPayload = (driver, request) => ({
  driverId: driver.id,
  driverCode: driver.portalUsername || driver.username || '',
  name: String(driver.displayName || `${driver.firstName || ''} ${driver.lastName || ''}`).trim(),
  username: driver.portalUsername || driver.username || '',
  email: driver.portalEmail || driver.email || '',
  phone: String(driver.phone || '').replace(/\D+/g, ''),
  address: String(driver.address || driver.baseAddress || '').trim(),
  timeOffAppointment: driver.timeOffAppointment || null,
  vehicleId: driver.vehicleId || '',
  passwordResetRequired: isDriverPasswordResetRequired(driver),
  deviceId: request.headers.get('x-driver-device-id') || '',
  sessionToken: request.headers.get('x-driver-session-token') || ''
});

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const driverId = String(payload?.driverId || '').trim();
  const currentPassword = String(payload?.currentPassword || '').trim();
  const newPassword = String(payload?.newPassword || '').trim();

  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  if (!newPassword) {
    return jsonWithMobileCors(request, { ok: false, error: 'New password is required.' }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return jsonWithMobileCors(request, { ok: false, error: 'Password must be at least 6 characters long.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const usersState = await readSystemUsersState();
  const passwordChangedAt = new Date().toISOString();
  const linkedUser = findLinkedSystemUser(usersState?.users, driver);

  if (!isDriverPasswordResetRequired(driver) && !matchesCurrentPassword({ driver, linkedUser, currentPassword })) {
    return jsonWithMobileCors(request, { ok: false, error: 'Current password is incorrect.' }, { status: 400 });
  }

  const nextDrivers = (Array.isArray(adminState?.drivers) ? adminState.drivers : []).map(item => {
    if (String(item?.id || '').trim() !== driverId) return item;
    return {
      ...item,
      authUserId: linkedUser?.id || item?.authUserId || '',
      password: newPassword,
      passwordResetRequired: false,
      passwordChangedAt
    };
  });

  const nextAdminState = await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  if (linkedUser) {
    const nextUsers = (Array.isArray(usersState?.users) ? usersState.users : []).map(user => String(user?.id || '').trim() === String(linkedUser.id || '').trim()
      ? {
          ...user,
          password: newPassword,
          passwordChangedAt
        }
      : user);

    await writeSystemUsersState({
      ...usersState,
      users: nextUsers
    });
  }

  const updatedDriver = findDriver(nextAdminState.drivers, driverId);
  return jsonWithMobileCors(request, {
    ok: true,
    session: buildSessionPayload(updatedDriver, request)
  });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}