import { NextResponse } from 'next/server';
import { normalizeDispatchMessageRecord } from '@/helpers/nemt-dispatch-state';
import { normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readSystemMessages, upsertSystemMessage } from '@/server/system-messages-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const normalizeLookupValue = value => normalizeAuthValue(value);

const resolveDriverByLookup = async lookup => {
  const adminPayload = await readNemtAdminPayload();
  const lookupValue = normalizeLookupValue(lookup);
  const dispatchDriver = (Array.isArray(adminPayload?.dispatchDrivers) ? adminPayload.dispatchDrivers : []).find(driver => {
    return [driver?.id, driver?.code, driver?.name, driver?.nickname].map(normalizeLookupValue).filter(Boolean).includes(lookupValue);
  }) || null;

  if (dispatchDriver) return dispatchDriver;

  return (Array.isArray(adminPayload?.drivers) ? adminPayload.drivers : []).find(driver => {
    return [driver?.id, driver?.portalUsername, driver?.username, driver?.email, driver?.name, `${driver?.firstName || ''} ${driver?.lastName || ''}`].map(normalizeLookupValue).filter(Boolean).includes(lookupValue);
  }) || null;
};

const appendIncomingDriverThreadMessage = (dispatchThreads, driverId, message) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return Array.isArray(dispatchThreads) ? dispatchThreads : [];

  const nextMessage = normalizeDispatchMessageRecord({
    id: message.id,
    direction: 'incoming',
    text: message.body,
    timestamp: message.createdAt,
    status: 'sent',
    attachments: message?.mediaUrl ? [{
      id: `${message.id}-media`,
      kind: String(message?.mediaType || '').toLowerCase().includes('image') ? 'photo' : 'document',
      name: String(message?.mediaType || '').toLowerCase().includes('image') ? 'Driver photo' : 'Driver attachment',
      mimeType: String(message?.mediaType || '').trim(),
      dataUrl: String(message?.mediaUrl || '').trim()
    }] : []
  });

  const currentThreads = Array.isArray(dispatchThreads) ? dispatchThreads : [];
  const existingThread = currentThreads.find(thread => String(thread?.driverId || '').trim() === normalizedDriverId);

  if (!existingThread) {
    return [...currentThreads, {
      driverId: normalizedDriverId,
      messages: [nextMessage]
    }];
  }

  const existingMessages = Array.isArray(existingThread.messages) ? existingThread.messages : [];
  if (existingMessages.some(entry => String(entry?.id || '').trim() === nextMessage.id)) {
    return currentThreads;
  }

  return currentThreads.map(thread => String(thread?.driverId || '').trim() === normalizedDriverId ? {
    ...thread,
    messages: [...existingMessages, nextMessage]
  } : thread);
};

const internalError = (request, error) => jsonWithMobileCors(request, { ok: false, error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET(request) {
  try {
  const { searchParams } = new URL(request.url);
  const driverLookup = searchParams.get('driverId') || searchParams.get('driverCode');

  if (!driverLookup) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId or driverCode is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverLookup);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const driver = await resolveDriverByLookup(driverLookup);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const messages = await readSystemMessages();
  const normalizedDriverId = String(driver?.id || '').trim();
  const visibleMessages = messages.filter(message => {
    const messageDriverId = String(message?.driverId || '').trim();
    return !messageDriverId || messageDriverId === normalizedDriverId;
  }).sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0));

  return jsonWithMobileCors(request, { ok: true, messages: visibleMessages, driverId: normalizedDriverId });
  } catch (error) {
    return internalError(request, error);
  }
}

export async function POST(request) {
  try {
  const body = await request.json();
  const driverLookup = body?.driverId || body?.driverCode;
  const messageText = String(body?.body || '').trim();
  const mediaUrl = String(body?.mediaUrl || '').trim();
  const mediaType = String(body?.mediaType || '').trim();

  if (!driverLookup || (!messageText && !mediaUrl)) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId or driverCode and at least one of body/mediaUrl are required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverLookup);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const driver = await resolveDriverByLookup(driverLookup);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const message = {
    id: body.id || `driver-msg-${Date.now()}`,
    type: body.type || 'driver-reply',
    priority: body.priority || 'normal',
    audience: 'Dispatcher',
    subject: body.subject || `Driver message from ${driver.name}`,
    body: messageText,
    mediaUrl: mediaUrl || null,
    mediaType: mediaType || null,
    driverId: String(driver?.id || '').trim(),
    driverName: driver.name,
    driverEmail: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    source: 'mobile-driver-app',
    deliveryMethod: body.deliveryMethod || 'in-app'
  };

  await upsertSystemMessage(message);
  const dispatchState = await readNemtDispatchState();
  await writeNemtDispatchState({
    ...dispatchState,
    dispatchThreads: appendIncomingDriverThreadMessage(dispatchState?.dispatchThreads, String(driver?.id || '').trim(), message)
  });
  return jsonWithMobileCors(request, { ok: true, message });
  } catch (error) {
    return internalError(request, error);
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}