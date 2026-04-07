import { NextResponse } from 'next/server';
import { normalizeDispatchMessageRecord } from '@/helpers/nemt-dispatch-state';
import { normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readSystemMessages, upsertSystemMessage } from '@/server/system-messages-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const normalizeLookupValue = value => normalizeAuthValue(value);

const normalizeDriverIdentitySet = (...values) => {
  const identities = new Set();
  values.forEach(value => {
    const normalized = normalizeLookupValue(value);
    if (normalized) identities.add(normalized);
  });
  return identities;
};

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

const mapDispatchThreadMessageToMobileMessage = (entry, normalizedDriverId, driverName) => {
  const messageId = String(entry?.id || '').trim() || `dispatch-thread-${Date.now()}`;
  const messageText = String(entry?.text || '').trim();
  const attachments = Array.isArray(entry?.attachments) ? entry.attachments : [];
  const photoAttachment = attachments.find(item => String(item?.dataUrl || '').trim());
  const mediaUrl = String(photoAttachment?.dataUrl || '').trim();
  const mediaType = String(photoAttachment?.mimeType || (String(photoAttachment?.kind || '').toLowerCase() === 'photo' ? 'image/jpeg' : '')).trim() || null;

  const isDriverOutgoing = String(entry?.direction || '').toLowerCase() === 'incoming';

  return {
    id: messageId,
    type: 'dispatch-message',
    priority: 'normal',
    audience: isDriverOutgoing ? 'Dispatcher' : 'Driver',
    subject: isDriverOutgoing
      ? `Driver message from ${driverName || 'Driver'}`
      : `[From: Dispatch] Dispatch message for ${driverName || 'driver'}`,
    body: messageText || (mediaUrl ? '[Attachment]' : ''),
    mediaUrl: mediaUrl || null,
    mediaType,
    driverId: normalizedDriverId,
    driverName: driverName || null,
    driverEmail: null,
    status: 'active',
    createdAt: entry?.timestamp || new Date().toISOString(),
    resolvedAt: null,
    source: isDriverOutgoing ? 'mobile-driver-app' : 'dispatcher-web',
    deliveryMethod: 'in-app'
  };
};

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

    const normalizedDriverId = String(driver?.id || '').trim();
    const driverIdentitySet = normalizeDriverIdentitySet(
      normalizedDriverId,
      driverLookup,
      driver?.code,
      driver?.portalUsername,
      driver?.username,
      driver?.email,
      driver?.name,
      driver?.nickname,
      `${driver?.firstName || ''} ${driver?.lastName || ''}`
    );

    const messages = await readSystemMessages();
    const visibleSystemMessages = messages.filter(message => {
      const messageDriverId = String(message?.driverId || '').trim();
      if (!messageDriverId) return true;
      return driverIdentitySet.has(normalizeLookupValue(messageDriverId));
    });

    const dispatchState = await readNemtDispatchState();
    const dispatchThreads = Array.isArray(dispatchState?.dispatchThreads) ? dispatchState.dispatchThreads : [];
    const matchedThread = dispatchThreads.find(thread => driverIdentitySet.has(normalizeLookupValue(thread?.driverId)));
    const mappedThreadMessages = Array.isArray(matchedThread?.messages)
      ? matchedThread.messages.map(entry => mapDispatchThreadMessageToMobileMessage(entry, normalizedDriverId, driver?.name)).filter(message => String(message?.id || '').trim())
      : [];

    const mergedById = new Map();
    [...visibleSystemMessages, ...mappedThreadMessages].forEach(message => {
      const key = String(message?.id || '').trim();
      if (!key) return;
      if (mergedById.has(key)) return;
      mergedById.set(key, message);
    });

    const visibleMessages = Array.from(mergedById.values()).sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0));

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