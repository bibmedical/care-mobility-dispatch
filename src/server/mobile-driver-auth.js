import { NextResponse } from 'next/server';
import { validateDriverMobileSession } from '@/server/driver-mobile-session-store';

export const buildMobileDriverAuthErrorResponse = error => {
  const message = error instanceof Error ? error.message : 'Driver session is invalid.';
  const status = Number(error?.status) || 401;
  const code = String(error?.code || 'driver-session-invalid');
  return NextResponse.json({ ok: false, error: message, code }, { status });
};

export const authorizeMobileDriverRequest = async (request, driverId, options = {}) => {
  const normalizedDriverId = String(driverId || '').trim();
  const deviceIdHeader = String(request.headers.get('x-driver-device-id') || '').trim();
  const sessionTokenHeader = String(request.headers.get('x-driver-session-token') || '').trim();
  const allowLegacyWithoutSession = options.allowLegacyWithoutSession === true;

  if (allowLegacyWithoutSession && normalizedDriverId && (!deviceIdHeader || !sessionTokenHeader)) {
    return {
      session: {
        driverId: normalizedDriverId,
        driverName: '',
        deviceId: '',
        sessionToken: '',
        createdAt: '',
        lastSeenAt: ''
      }
    };
  }

  try {
    const session = await validateDriverMobileSession({
      driverId: normalizedDriverId,
      deviceId: deviceIdHeader,
      sessionToken: sessionTokenHeader,
      touch: options.touch !== false
    });
    return { session };
  } catch (error) {
    return {
      response: buildMobileDriverAuthErrorResponse(error)
    };
  }
};