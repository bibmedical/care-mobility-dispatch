import { NextResponse } from 'next/server';
import { normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readSystemMessages, upsertSystemMessage } from '@/server/system-messages-store';

const normalizeLookupValue = value => normalizeAuthValue(value);

const resolveDriverByLookup = async lookup => {
  const adminPayload = await readNemtAdminPayload();
  const lookupValue = normalizeLookupValue(lookup);
  return (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(driver => {
    return [driver?.id, driver?.code, driver?.name, driver?.nickname].map(normalizeLookupValue).filter(Boolean).includes(lookupValue);
  }) || null;
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const driverLookup = searchParams.get('driverId') || searchParams.get('driverCode');

  if (!driverLookup) {
    return NextResponse.json({ ok: false, error: 'driverId or driverCode is required.' }, { status: 400 });
  }

  const driver = await resolveDriverByLookup(driverLookup);
  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const messages = await readSystemMessages();
  const visibleMessages = messages.filter(message => {
    const messageDriverId = String(message?.driverId || '').trim();
    return !messageDriverId || messageDriverId === driver.id;
  }).sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0));

  return NextResponse.json({ ok: true, messages: visibleMessages, driverId: driver.id });
}

export async function POST(request) {
  const body = await request.json();
  const driverLookup = body?.driverId || body?.driverCode;
  const messageText = String(body?.body || '').trim();

  if (!driverLookup || !messageText) {
    return NextResponse.json({ ok: false, error: 'driverId or driverCode and body are required.' }, { status: 400 });
  }

  const driver = await resolveDriverByLookup(driverLookup);
  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const message = {
    id: body.id || `driver-msg-${Date.now()}`,
    type: body.type || 'driver-reply',
    priority: body.priority || 'normal',
    audience: 'Dispatcher',
    subject: body.subject || `Driver message from ${driver.name}`,
    body: messageText,
    driverId: driver.id,
    driverName: driver.name,
    driverEmail: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    source: 'mobile-driver-app',
    deliveryMethod: body.deliveryMethod || 'in-app'
  };

  await upsertSystemMessage(message);
  return NextResponse.json({ ok: true, message });
}