import { NextResponse } from 'next/server';
import { authorizePersistedSystemUser } from '@/server/system-users-store';
import { isDriverRole, normalizeAuthValue, normalizePhoneDigits } from '@/helpers/system-users';
import { getFullName, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { readNemtAdminState } from '@/server/nemt-admin-store';

const normalizeLookupValue = value => normalizeAuthValue(value);

const buildDriverCode = (driver, state) => {
  const dispatchDriver = mapAdminDataToDispatchDrivers({
    ...state,
    drivers: [driver]
  })[0];

  return dispatchDriver?.code || '';
};

const matchesDriverIdentifier = (driver, state, identifier) => {
  const lookupValue = normalizeLookupValue(identifier);
  if (!lookupValue) return false;

  const driverCode = normalizeLookupValue(buildDriverCode(driver, state));
  const candidates = [
    driver.id,
    driver.username,
    driver.portalUsername,
    driver.email,
    driver.portalEmail,
    getFullName(driver),
    driverCode
  ].map(normalizeLookupValue).filter(Boolean);

  return candidates.includes(lookupValue);
};

const findDriverFromAuthUser = (drivers, authUser) => {
  const normalizedUsername = normalizeLookupValue(authUser?.username);
  const normalizedEmail = normalizeLookupValue(authUser?.email);

  return drivers.find(driver => {
    const sameAuthUser = String(driver?.authUserId || '').trim() === String(authUser?.id || '').trim();
    if (sameAuthUser) return true;

    const sameUsername = normalizedUsername && normalizeLookupValue(driver?.username) === normalizedUsername;
    const samePortalUsername = normalizedUsername && normalizeLookupValue(driver?.portalUsername) === normalizedUsername;
    const sameEmail = normalizedEmail && normalizeLookupValue(driver?.email) === normalizedEmail;
    const samePortalEmail = normalizedEmail && normalizeLookupValue(driver?.portalEmail) === normalizedEmail;

    return sameUsername || samePortalUsername || sameEmail || samePortalEmail;
  });
};

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const identifier = String(payload?.identifier || payload?.email || '').trim();
  const password = String(payload?.password || '').trim();
  const pin = String(payload?.pin || '').trim();

  const state = await readNemtAdminState();
  const normalizedDrivers = (Array.isArray(state?.drivers) ? state.drivers : []).map(normalizeDriverTracking);

  // Primary auth path: same credentials as web (identifier + password).
  if (identifier && password) {
    try {
      const authUser = await authorizePersistedSystemUser({
        identifier,
        password,
        clientType: 'android'
      });

      if (!isDriverRole(authUser?.role)) {
        return NextResponse.json({ ok: false, error: 'This account is not a driver profile.' }, { status: 403 });
      }

      const driver = findDriverFromAuthUser(normalizedDrivers, authUser);
      if (!driver) {
        return NextResponse.json({ ok: false, error: 'Driver profile not found.' }, { status: 404 });
      }

      if (normalizeLookupValue(driver.profileStatus) !== 'active') {
        return NextResponse.json({ ok: false, error: 'Driver profile is not active.' }, { status: 403 });
      }

      const driverCode = buildDriverCode(driver, state);

      return NextResponse.json({
        ok: true,
        session: {
          driverId: driver.id,
          driverCode,
          name: getFullName(driver),
          username: authUser.username || driver.portalUsername || driver.username || '',
          email: authUser.email || driver.portalEmail || driver.email || '',
          phone: normalizePhoneDigits(driver.phone),
          vehicleId: driver.vehicleId || '',
          passwordResetRequired: Boolean(driver.passwordResetRequired)
        }
      });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Invalid credentials.' }, { status: 401 });
    }
  }

  // Legacy fallback path: identifier + mobile PIN.
  if (!identifier || !pin) {
    return NextResponse.json({ ok: false, error: 'Identifier and PIN are required.' }, { status: 400 });
  }

  const driver = normalizedDrivers
    .find(item => matchesDriverIdentifier(item, state, identifier));

  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  if (normalizeLookupValue(driver.profileStatus) !== 'active') {
    return NextResponse.json({ ok: false, error: 'Driver profile is not active.' }, { status: 403 });
  }

  if (!String(driver.mobilePin || '').trim()) {
    return NextResponse.json({ ok: false, error: 'Driver PIN has not been configured.' }, { status: 403 });
  }

  if (String(driver.mobilePin).trim() !== pin) {
    return NextResponse.json({ ok: false, error: 'Invalid PIN.' }, { status: 401 });
  }

  const driverCode = buildDriverCode(driver, state);

  return NextResponse.json({
    ok: true,
    session: {
      driverId: driver.id,
      driverCode,
      name: getFullName(driver),
      username: driver.portalUsername || driver.username || '',
      email: driver.portalEmail || driver.email || '',
      phone: normalizePhoneDigits(driver.phone),
      vehicleId: driver.vehicleId || '',
      passwordResetRequired: Boolean(driver.passwordResetRequired)
    }
  });
}