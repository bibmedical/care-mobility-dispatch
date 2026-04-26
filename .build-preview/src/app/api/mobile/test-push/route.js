import { NextResponse } from 'next/server';
import { readNemtAdminState } from '@/server/nemt-admin-store';
import { normalizeAuthValue } from '@/helpers/system-users';

const normalizeValue = value => normalizeAuthValue(String(value || '').trim());

const buildDriverLookupSet = driver => {
  const entries = [
    driver?.id,
    driver?.username,
    driver?.email,
    driver?.portalUsername,
    driver?.displayName,
    `${driver?.firstName || ''} ${driver?.lastName || ''}`
  ];
  const set = new Set();
  entries.forEach(entry => {
    const normalized = normalizeValue(entry);
    if (normalized) set.add(normalized);
  });
  return set;
};

const resolveDriver = (adminState, lookupValue) => {
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const normalized = normalizeValue(lookupValue);
  if (!normalized) return null;
  return drivers.find(driver => buildDriverLookupSet(driver).has(normalized)) || null;
};

const sendPushToExpo = async (tokens) => {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    console.log('[TEST PUSH] No tokens provided');
    return { sent: 0, error: 'No tokens' };
  }

  const payload = tokens.map(to => ({
    to,
    sound: true,
    priority: 'high',
    badge: 1,
    vibrate: [100, 50, 100],
    title: 'Test Push from Dispatch',
    body: 'If you see this message, push notifications are working! ✅',
    data: {
      testPush: true,
      timestamp: new Date().toISOString()
    }
  }));

  console.log('[TEST PUSH] Sending to Expo', {
    tokenCount: tokens.length,
    payloadSize: JSON.stringify(payload).length
  });

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    const responseData = await response.json().catch(() => ({}));
    
    console.log('[TEST PUSH] Expo response', {
      status: response.status,
      data: responseData
    });

    return {
      sent: tokens.length,
      status: response.status,
      expoResponse: responseData
    };
  } catch (error) {
    console.error('[TEST PUSH] Error', { message: error?.message });
    return { sent: 0, error: error?.message };
  }
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const driver = searchParams.get('driver')?.trim();
  
  if (!driver) {
    return NextResponse.json({
      error: 'Missing driver parameter',
      example: '/api/mobile/test-push?driver=drv-yanelis-user-3'
    }, { status: 400 });
  }

  try {
    const adminState = await readNemtAdminState();
    const foundDriver = resolveDriver(adminState, driver);

    if (!foundDriver) {
      return NextResponse.json({
        error: 'Driver not found',
        searched: driver,
        availableDriverIds: (adminState?.drivers || []).map(d => ({
          id: d?.id,
          name: d?.displayName
        }))
      }, { status: 404 });
    }

    const tokens = Array.isArray(foundDriver?.mobilePushTokens)
      ? foundDriver.mobilePushTokens.map(t => String(t || '').trim()).filter(Boolean)
      : [];

    console.log('[TEST PUSH] Found driver', {
      driverId: foundDriver.id,
      driverName: foundDriver.displayName,
      tokenCount: tokens.length,
      tokens
    });

    if (tokens.length === 0) {
      return NextResponse.json({
        driverId: foundDriver.id,
        driverName: foundDriver.displayName,
        error: 'No push tokens registered for this driver',
        suggestion: 'Open the driver app and wait for it to register a token'
      }, { status: 400 });
    }

    const pushResult = await sendPushToExpo(tokens);

    return NextResponse.json({
      success: true,
      driverId: foundDriver.id,
      driverName: foundDriver.displayName,
      tokenCount: tokens.length,
      tokens,
      pushResult
    });
  } catch (error) {
    console.error('[TEST PUSH] Server error', error);
    return NextResponse.json({
      error: 'Server error',
      message: error?.message
    }, { status: 500 });
  }
}
