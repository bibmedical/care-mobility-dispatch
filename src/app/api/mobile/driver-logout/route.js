import { NextResponse } from 'next/server';
import { releaseDriverMobileSession } from '@/server/driver-mobile-session-store';

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const driverId = String(body?.driverId || '').trim();
  const deviceId = String(body?.deviceId || '').trim();
  const sessionToken = String(body?.sessionToken || '').trim();

  if (!driverId || !deviceId || !sessionToken) {
    return NextResponse.json({ ok: false, error: 'driverId, deviceId, and sessionToken are required.' }, { status: 400 });
  }

  await releaseDriverMobileSession({ driverId, deviceId, sessionToken });
  return NextResponse.json({ ok: true });
}