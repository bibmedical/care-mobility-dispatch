import { NextResponse } from 'next/server';
import { normalizeAuthValue, normalizePhoneDigits } from '@/helpers/system-users';
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

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const identifier = String(payload?.identifier || '').trim();
  const pin = String(payload?.pin || '').trim();

  if (!identifier || !pin) {
    return NextResponse.json({ ok: false, error: 'Identifier and PIN are required.' }, { status: 400 });
  }

  const state = await readNemtAdminState();
  const driver = (Array.isArray(state?.drivers) ? state.drivers : [])
    .map(normalizeDriverTracking)
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