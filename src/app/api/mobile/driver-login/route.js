import { NextResponse } from 'next/server';
import { authorizePersistedSystemUser } from '@/server/system-users-store';
import { buildDriverSessionError, claimDriverMobileSession } from '@/server/driver-mobile-session-store';
import { normalizeAuthValue, normalizePhoneDigits } from '@/helpers/system-users';
import { getFullName, mapAdminDataToDispatchDrivers, normalizeDriverGpsSettings, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { readNemtAdminState } from '@/server/nemt-admin-store';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors } from '@/server/mobile-api-cors';

const normalizeLookupValue = value => normalizeAuthValue(value);
const isLocalPasswordlessDriverLoginEnabled = () => process.env.NODE_ENV !== 'production';

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

const findDriverFromDirectCredentials = (drivers, state, identifier, password) => {
  const normalizedIdentifier = normalizeLookupValue(identifier);
  const normalizedPassword = normalizeLookupValue(password);
  if (!normalizedIdentifier || !normalizedPassword) return null;

  return drivers.find(driver => {
    const identifierMatches = matchesDriverIdentifier(driver, state, normalizedIdentifier);
    if (!identifierMatches) return false;

    const storedPassword = normalizeLookupValue(driver?.password);
    return Boolean(storedPassword) && storedPassword === normalizedPassword;
  }) || null;
};

const buildDriverSessionPayload = async (driver, baseSession, deviceId) => {
  const claimedSession = await claimDriverMobileSession({
    driverId: driver.id,
    driverName: getFullName(driver),
    deviceId
  });

  return {
    ...baseSession,
    deviceId: claimedSession.deviceId,
    sessionToken: claimedSession.sessionToken
  };
};

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const identifier = String(payload?.identifier || payload?.email || '').trim();
  const password = String(payload?.password || '').trim();
  const pin = String(payload?.pin || '').trim();
  const deviceId = String(payload?.deviceId || '').trim();

  if (!deviceId) {
    return jsonWithMobileCors(request, { ok: false, error: 'Device ID is required.', code: 'driver-session-device-required' }, { status: 400 });
  }

  let state = await readNemtAdminState();
  let normalizedDrivers = (Array.isArray(state?.drivers) ? state.drivers : []).map(normalizeDriverTracking);

  if (identifier && !password && !pin && isLocalPasswordlessDriverLoginEnabled()) {
    const driver = normalizedDrivers.find(item => matchesDriverIdentifier(item, state, identifier));

    if (!driver) {
      return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
    }

    const profileStatus = normalizeLookupValue(driver.profileStatus || 'active');
    if (profileStatus !== 'active') {
      return jsonWithMobileCors(request, { ok: false, error: 'Driver profile is not active.' }, { status: 403 });
    }

    const driverCode = buildDriverCode(driver, state);

    try {
      return jsonWithMobileCors(request, {
        ok: true,
        session: await buildDriverSessionPayload(driver, {
          driverId: driver.id,
          driverCode,
          name: getFullName(driver),
          username: driver.portalUsername || driver.username || '',
          email: driver.portalEmail || driver.email || '',
          phone: normalizePhoneDigits(driver.phone),
          vehicleId: driver.vehicleId || '',
          passwordResetRequired: Boolean(driver.passwordResetRequired),
          gpsSettings: normalizeDriverGpsSettings(driver?.gpsSettings)
        }, deviceId)
      });
    } catch (error) {
      const sessionError = error?.code ? error : buildDriverSessionError('Unable to create driver session.', 500, 'driver-session-create-failed');
      return jsonWithMobileCors(request, { ok: false, error: sessionError.message, code: sessionError.code }, { status: Number(sessionError.status) || 500 });
    }
  }

  // Primary auth path: same credentials as web (identifier + password).
  if (identifier && password) {
    try {
      let authUser = null;
      let driver = null;

      try {
        authUser = await authorizePersistedSystemUser({
          identifier,
          password,
          clientType: 'android'
        });
        driver = findDriverFromAuthUser(normalizedDrivers, authUser);
      } catch (authError) {
        driver = findDriverFromDirectCredentials(normalizedDrivers, state, identifier, password);
        if (!driver) throw authError;
      }

      if (!driver) {
        // System users sync may have just rebuilt drivers; re-read admin state before failing.
        const refreshedState = await readNemtAdminState();
        const refreshedDrivers = (Array.isArray(refreshedState?.drivers) ? refreshedState.drivers : []).map(normalizeDriverTracking);
        const refreshedAuthDriver = findDriverFromAuthUser(refreshedDrivers, authUser);
        const refreshedDirectDriver = findDriverFromDirectCredentials(refreshedDrivers, refreshedState, identifier, password);
        const refreshedIdentifierDriver = refreshedDrivers.find(item => matchesDriverIdentifier(item, refreshedState, identifier));
        driver = refreshedAuthDriver || refreshedDirectDriver || refreshedIdentifierDriver || null;
        state = refreshedState;
        normalizedDrivers = refreshedDrivers;
      }

      if (!driver) {
        return jsonWithMobileCors(request, { ok: false, error: 'Driver profile not found.' }, { status: 404 });
      }

      const profileStatus = normalizeLookupValue(driver.profileStatus || 'active');
      if (profileStatus !== 'active') {
        return jsonWithMobileCors(request, { ok: false, error: 'Driver profile is not active.' }, { status: 403 });
      }

      const driverCode = buildDriverCode(driver, state);

      return jsonWithMobileCors(request, {
        ok: true,
        session: await buildDriverSessionPayload(driver, {
          driverId: driver.id,
          driverCode,
          name: getFullName(driver),
          username: authUser?.username || driver.portalUsername || driver.username || '',
          email: authUser?.email || driver.portalEmail || driver.email || '',
          phone: normalizePhoneDigits(driver.phone),
          vehicleId: driver.vehicleId || '',
          passwordResetRequired: Boolean(driver.passwordResetRequired),
          gpsSettings: normalizeDriverGpsSettings(driver?.gpsSettings)
        }, deviceId)
      });
    } catch (error) {
      if (error?.code === 'driver-session-conflict' || error?.code === 'driver-session-bad-request') {
        return jsonWithMobileCors(request, { ok: false, error: error.message, code: error.code }, { status: Number(error.status) || 409 });
      }
      return jsonWithMobileCors(request, { ok: false, error: error instanceof Error ? error.message : 'Invalid credentials.' }, { status: 401 });
    }
  }

  // Legacy fallback path: identifier + mobile PIN.
  if (!identifier || !pin) {
    return jsonWithMobileCors(request, { ok: false, error: 'Identifier and PIN are required.' }, { status: 400 });
  }

  const driver = normalizedDrivers
    .find(item => matchesDriverIdentifier(item, state, identifier));

  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const profileStatus = normalizeLookupValue(driver.profileStatus || 'active');
  if (profileStatus !== 'active') {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver profile is not active.' }, { status: 403 });
  }

  if (!String(driver.mobilePin || '').trim()) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver PIN has not been configured.' }, { status: 403 });
  }

  if (String(driver.mobilePin).trim() !== pin) {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid PIN.' }, { status: 401 });
  }

  const driverCode = buildDriverCode(driver, state);

  try {
    return jsonWithMobileCors(request, {
      ok: true,
      session: await buildDriverSessionPayload(driver, {
        driverId: driver.id,
        driverCode,
        name: getFullName(driver),
        username: driver.portalUsername || driver.username || '',
        email: driver.portalEmail || driver.email || '',
        phone: normalizePhoneDigits(driver.phone),
        vehicleId: driver.vehicleId || '',
        passwordResetRequired: Boolean(driver.passwordResetRequired),
        gpsSettings: normalizeDriverGpsSettings(driver?.gpsSettings)
      }, deviceId)
    });
  } catch (error) {
    const sessionError = error?.code ? error : buildDriverSessionError('Unable to create driver session.', 500, 'driver-session-create-failed');
    return jsonWithMobileCors(request, { ok: false, error: sessionError.message, code: sessionError.code }, { status: Number(sessionError.status) || 500 });
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}