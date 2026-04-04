import { NextResponse } from 'next/server';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';

const normalizeDriverId = value => String(value || '').trim();
const normalizePushToken = value => String(value || '').trim();

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const driverId = normalizeDriverId(body?.driverId);
  const pushToken = normalizePushToken(body?.pushToken);

  if (!driverId || !pushToken) {
    return NextResponse.json({ ok: false, error: 'driverId and pushToken are required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return authResult.response;

  if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
    return NextResponse.json({ ok: false, error: 'Invalid Expo push token.' }, { status: 400 });
  }

  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];

  const driverExists = drivers.some(driver => normalizeDriverId(driver?.id) === driverId);
  if (!driverExists) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const nextDrivers = drivers.map(driver => {
    if (normalizeDriverId(driver?.id) !== driverId) return driver;

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

  return NextResponse.json({ ok: true });
}
