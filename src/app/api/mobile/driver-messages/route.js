import { NextResponse } from 'next/server';
import { normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminPayload } from '@/server/nemt-admin-store';
import { readNemtDispatchThreadByDriverId, readNemtDispatchThreads, upsertIncomingDriverThreadMessage } from '@/server/nemt-dispatch-store';
import { readActiveSystemMessagesByDriverIds, readSystemMessages, upsertSystemMessage } from '@/server/system-messages-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const normalizeLookupValue = value => normalizeAuthValue(value);
const MOBILE_MESSAGES_MAX_ITEMS = 200;
const DRIVER_ALERT_TYPES = new Set(['delay-alert', 'backup-driver-request', 'uber-request']);

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

const safeReadVisibleSystemMessages = async ({ driverIdentitySet, normalizedDriverId }) => {
  try {
    const directMessages = await readActiveSystemMessagesByDriverIds([normalizedDriverId], MOBILE_MESSAGES_MAX_ITEMS);
    if (directMessages.length > 0) {
      return directMessages.slice(0, MOBILE_MESSAGES_MAX_ITEMS);
    }

    const messages = await readSystemMessages();
    const visible = [];

    for (const message of messages) {
      const messageDriverId = String(message?.driverId || '').trim();
      const messageDriverName = String(message?.driverName || '').trim();
      if (!messageDriverId && !messageDriverName) continue;
      if (String(message?.status || '').trim().toLowerCase() === 'resolved') continue;

      const normalizedMessageDriverId = normalizeLookupValue(messageDriverId);
      const normalizedMessageDriverName = normalizeLookupValue(messageDriverName);
      const directIdentityMatch = (normalizedMessageDriverId && driverIdentitySet.has(normalizedMessageDriverId))
        || (normalizedMessageDriverName && driverIdentitySet.has(normalizedMessageDriverName));

      if (directIdentityMatch) {
        visible.push(message);
        continue;
      }

      let canonicalMatch = false;
      if (messageDriverId) {
        const resolvedById = await resolveDriverByLookup(messageDriverId);
        canonicalMatch = String(resolvedById?.id || '').trim() === normalizedDriverId;
      }

      if (!canonicalMatch && messageDriverName) {
        const resolvedByName = await resolveDriverByLookup(messageDriverName);
        canonicalMatch = String(resolvedByName?.id || '').trim() === normalizedDriverId;
      }

      if (canonicalMatch) {
        visible.push(message);
      }
    }

    return visible.slice(0, MOBILE_MESSAGES_MAX_ITEMS);
  } catch (error) {
    console.warn('[mobile/driver-messages] readSystemMessages failed, continuing with dispatch thread fallback:', error?.message || error);
    return [];
  }
};

const safeReadMappedThreadMessages = async ({ driverIdentitySet, normalizedDriverId, driverName }) => {
  try {
    const directThread = await readNemtDispatchThreadByDriverId(normalizedDriverId);
    const matchedThread = directThread && driverIdentitySet.has(normalizeLookupValue(directThread?.driverId))
      ? directThread
      : (await readNemtDispatchThreads()).find(thread => driverIdentitySet.has(normalizeLookupValue(thread?.driverId)));
    return Array.isArray(matchedThread?.messages)
      ? matchedThread.messages.map(entry => mapDispatchThreadMessageToMobileMessage(entry, normalizedDriverId, driverName)).filter(message => String(message?.id || '').trim())
      : [];
  } catch (error) {
    console.warn('[mobile/driver-messages] readNemtDispatchThreads failed, continuing with system messages fallback:', error?.message || error);
    return [];
  }
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const driverLookup = searchParams.get('driverId') || searchParams.get('driverCode');

    if (!driverLookup) {
      return jsonWithMobileCors(request, { ok: false, error: 'driverId or driverCode is required.' }, { status: 400 });
    }

    const authResult = await authorizeMobileDriverRequest(request, driverLookup, {
      allowLegacyWithoutSession: true
    });
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

    const [visibleSystemMessages, mappedThreadMessages] = await Promise.all([
      safeReadVisibleSystemMessages({ driverIdentitySet, normalizedDriverId }),
      safeReadMappedThreadMessages({ driverIdentitySet, normalizedDriverId, driverName: driver?.name })
    ]);

    const mergedById = new Map();
    [...visibleSystemMessages, ...mappedThreadMessages].forEach(message => {
      const key = String(message?.id || '').trim();
      if (!key) return;
      if (mergedById.has(key)) return;
      mergedById.set(key, message);
    });

    const visibleMessages = Array.from(mergedById.values())
      .sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0))
      .slice(0, MOBILE_MESSAGES_MAX_ITEMS);

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

  const authResult = await authorizeMobileDriverRequest(request, driverLookup, {
    allowLegacyWithoutSession: true
  });
  if (authResult.response) return withMobileCors(authResult.response, request);

  const driver = await resolveDriverByLookup(driverLookup);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const normalizedType = String(body.type || 'driver-reply').trim();
  const tripId = String(body.tripId || '').trim();
  const stableAlertId = DRIVER_ALERT_TYPES.has(normalizedType) && tripId
    ? `driver-alert-${String(driver?.id || '').trim()}-${tripId}-${normalizedType}`
    : '';

  if (stableAlertId) {
    const existingMessage = (await readSystemMessages()).find(message => String(message?.id || '').trim() === stableAlertId) || null;
    if (existingMessage && String(existingMessage.status || '').trim().toLowerCase() === 'resolved') {
      return jsonWithMobileCors(request, { ok: true, suppressed: true, message: null });
    }
  }

  const message = {
    id: stableAlertId || body.id || `driver-msg-${Date.now()}`,
    type: normalizedType,
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
    deliveryMethod: body.deliveryMethod || 'in-app',
    tripId: tripId || null
  };

  await upsertSystemMessage(message);
  const incomingMessage = {
    id: message.id,
    direction: 'incoming',
    text: message.body,
    timestamp: message.createdAt,
    status: 'sent',
    attachments: message.mediaUrl ? [{
      id: `${message.id}-media`,
      kind: String(message.mediaType || '').toLowerCase().includes('image') ? 'photo' : 'document',
      name: String(message.mediaType || '').toLowerCase().includes('image') ? 'Driver photo' : 'Driver attachment',
      mimeType: String(message.mediaType || '').trim(),
      dataUrl: String(message.mediaUrl || '').trim()
    }] : []
  };
  await upsertIncomingDriverThreadMessage(String(driver?.id || '').trim(), incomingMessage);
  return jsonWithMobileCors(request, { ok: true, message });
  } catch (error) {
    return internalError(request, error);
  }
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}