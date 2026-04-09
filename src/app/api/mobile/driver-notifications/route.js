import { NextResponse } from 'next/server';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';
import { normalizeAuthValue } from '@/helpers/system-users';

const normalizeDriverId = value => String(value || '').trim();
const normalizePushToken = value => String(value || '').trim();
const normalizeLookupValue = value => normalizeAuthValue(String(value || '').trim());

const buildDriverLookupSet = driver => {
  const entries = [
    driver?.id,
    driver?.authUserId,
    driver?.code,
    driver?.portalUsername,
    driver?.username,
    driver?.email,
    driver?.portalEmail,
    driver?.name,
    driver?.nickname,
    `${driver?.firstName || ''} ${driver?.lastName || ''}`
  ];
  const set = new Set();
  entries.forEach(entry => {
    const normalized = normalizeLookupValue(entry);
    if (normalized) set.add(normalized);
  });
  return set;
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const driverId = normalizeDriverId(body?.driverId);
  const pushToken = normalizePushToken(body?.pushToken);

  if (!driverId || !pushToken) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId and pushToken are required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid Expo push token.' }, { status: 400 });
  }

  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];

  const matchedDriver = drivers.find(driver => buildDriverLookupSet(driver).has(normalizeLookupValue(driverId))) || null;
  if (!matchedDriver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const canonicalDriverId = normalizeDriverId(matchedDriver?.id);

  const nextDrivers = drivers.map(driver => {
    if (normalizeDriverId(driver?.id) !== canonicalDriverId) return driver;

    const currentTokens = Array.isArray(driver?.mobilePushTokens) ? driver.mobilePushTokens.map(normalizePushToken).filter(Boolean) : [];
    const nextTokens = [pushToken, ...currentTokens.filter(token => token !== pushToken)].slice(0, 5);

    return {
      ...driver,
      mobilePushTokens: nextTokens,
      lastMobilePushTokenAt: new Date().toISOString()
    };
  });

  await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  return jsonWithMobileCors(request, { ok: true });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}
