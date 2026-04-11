import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import {
  clearSystemMessageMediaById,
  readSystemMessages,
  resolveSystemMessageById,
  resolveMessagesByDriverId,
  reactivateMessagesByDriverId,
  upsertSystemMessage
} from '@/server/system-messages-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { readNemtAdminState } from '@/server/nemt-admin-store';
import { normalizeAuthValue } from '@/helpers/system-users';

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });
const badRequest = message => NextResponse.json({ error: message }, { status: 400 });
const internalError = error => NextResponse.json({ error: error?.message || 'Unable to process system messages' }, { status: 500 });
const MOBILE_ALERT_TYPES = new Set(['delay-alert', 'backup-driver-request', 'uber-request']);
const EXPO_PUSH_TIMEOUT_MS = 2500;
const MAX_SUBJECT_LENGTH = 240;
const MAX_BODY_LENGTH = 5000;
const MAX_MEDIA_DATA_URL_LENGTH = 1_600_000;

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

const resolveAdminDriverByLookup = (adminState, lookupDriverId, lookupDriverName = '') => {
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const lookupValues = [lookupDriverId, lookupDriverName]
    .map(normalizeLookupValue)
    .filter(Boolean);
  if (lookupValues.length === 0) return null;

  return drivers.find(driver => {
    const lookupSet = buildDriverLookupSet(driver);
    return lookupValues.some(value => lookupSet.has(value));
  }) || null;
};

const removeMessageMediaFromDispatchThreads = dispatchState => {
  let removed = false;
  const nextThreads = (Array.isArray(dispatchState?.dispatchThreads) ? dispatchState.dispatchThreads : []).map(thread => ({
    ...thread,
    messages: Array.isArray(thread?.messages)
      ? thread.messages.map(message => {
        if (String(message?.id || '').trim() !== String(dispatchState?.targetMessageId || '').trim()) return message;
        if (!Array.isArray(message?.attachments) || message.attachments.length === 0) return message;
        removed = true;
        return {
          ...message,
          attachments: []
        };
      })
      : []
  }));

  return {
    removed,
    nextThreads
  };
};

const readDriverPushTokens = async (driverId, driverName = '') => {
  if (!driverId && !driverName) {
    console.log('[PUSH DEBUG] readDriverPushTokens: No driverId or driverName provided');
    return [];
  }

  const adminState = await readNemtAdminState();
  const driver = resolveAdminDriverByLookup(adminState, driverId, driverName);
  
  console.log('[PUSH DEBUG] readDriverPushTokens', {
    driverId,
    driverName,
    foundDriver: driver ? driver.id : null,
    foundDriverName: driver ? driver.displayName : null,
    tokenCount: driver?.mobilePushTokens?.length || 0,
    tokens: driver?.mobilePushTokens || []
  });

  const tokens = Array.isArray(driver?.mobilePushTokens) ? driver.mobilePushTokens : [];
  return tokens.map(token => String(token || '').trim()).filter(Boolean);
};

const sendExpoPush = async (pushTokens, message) => {
  if (!Array.isArray(pushTokens) || pushTokens.length === 0) {
    console.log('[PUSH DEBUG] No tokens to send', {
      tokensCount: pushTokens?.length,
      messageId: message?.id,
      driverId: message?.driverId
    });
    return;
  }

  const normalizedSubject = String(message?.subject || '').trim().toLowerCase();
  const normalizedBody = String(message?.body || '').trim().toLowerCase();
  const isRouteTomorrowMessage = normalizedSubject.includes('route') && normalizedSubject.includes('tomorrow')
    || normalizedBody.includes('route') && normalizedBody.includes('tomorrow');

  const pushTitle = isRouteTomorrowMessage
    ? 'Dispatch update'
    : (message.subject || 'Dispatch update');
  const pushBody = isRouteTomorrowMessage
    ? 'You receive the route for tomorrow.'
    : (message.body || 'You have a new message from dispatch.');

  const payload = pushTokens.map(to => ({
    to,
    sound: true,
    priority: 'high',
    badge: 1,
    vibrate: [100, 50, 100],
    title: pushTitle,
    body: pushBody,
    data: {
      driverId: message.driverId || null,
      messageId: message.id
    }
  }));

  console.log('[PUSH DEBUG] Sending to Expo', {
    tokenCount: pushTokens.length,
    tokens: pushTokens,
    messageId: message?.id,
    driverId: message?.driverId,
    payloadSize: JSON.stringify(payload).length
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXPO_PUSH_TIMEOUT_MS);

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const responseData = await response.json().catch(() => ({}));
      console.log('[PUSH DEBUG] Expo response', {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        messageId: message?.id
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Push delivery failures should not block dispatch message creation.
    console.error('[PUSH DEBUG] Error sending push', {
      error: error?.message,
      messageId: message?.id,
      driverId: message?.driverId
    });
  }
};

export async function GET(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return unauthorized();

    const searchParams = request?.nextUrl?.searchParams || new URL(request.url).searchParams;
    const alertsOnly = ['1', 'true', 'yes'].includes(String(searchParams.get('alertsOnly') || '').trim().toLowerCase());
    const includeMedia = !['0', 'false', 'no'].includes(String(searchParams.get('includeMedia') || '').trim().toLowerCase());
    const statusFilter = String(searchParams.get('status') || '').trim().toLowerCase();
    const parsedLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), 500) : 0;

    let messages = await readSystemMessages();

    if (alertsOnly) {
      messages = messages.filter(message => {
        const messageType = String(message?.type || '').trim();
        return Boolean(message?.driverId) && String(message?.source || '').trim() === 'mobile-driver-app' && MOBILE_ALERT_TYPES.has(messageType);
      });
    }

    if (statusFilter) {
      messages = messages.filter(message => String(message?.status || '').trim().toLowerCase() === statusFilter);
    }

    messages = [...messages].sort((left, right) => new Date(right?.createdAt || 0) - new Date(left?.createdAt || 0));

    if (limit > 0) {
      messages = messages.slice(0, limit);
    }

    if (!includeMedia) {
      messages = messages.map(message => ({
        ...message,
        mediaUrl: null
      }));
    }

    return NextResponse.json({ messages });
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return unauthorized();

    const body = await request.json();
    const normalizedSubject = String(body.subject || '(no subject)').trim().slice(0, MAX_SUBJECT_LENGTH);
    const normalizedBody = String(body.body || '').trim();
    const normalizedMediaUrl = String(body.mediaUrl || '').trim();
    const normalizedType = String(body.type || 'manual').trim() || 'manual';
    const normalizedDriverId = String(body.driverId || '').trim() || null;

    if (normalizedBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Message body exceeds ${MAX_BODY_LENGTH} characters.` }, { status: 413 });
    }
    if (normalizedMediaUrl.length > MAX_MEDIA_DATA_URL_LENGTH) {
      return NextResponse.json({ error: 'Attachment payload is too large. Please send a smaller image.' }, { status: 413 });
    }
    if (!normalizedBody && !normalizedMediaUrl) {
      return badRequest('Message body or media attachment is required.');
    }
    if (normalizedType === 'dispatch-message' && !normalizedDriverId) {
      return badRequest('driverId is required for dispatch-message.');
    }

    const msg = {
      id: body.id || `sysmsg-${Date.now()}`,
      type: normalizedType,
      priority: body.priority || 'normal',
      audience: body.audience || 'System',
      subject: normalizedSubject,
      body: normalizedBody,
      driverId: normalizedDriverId,
      driverName: body.driverName || null,
      driverEmail: body.driverEmail || null,
      expirationDate: body.expirationDate || null,
      daysUntilExpiry: body.daysUntilExpiry ?? null,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastEmailSentAt: body.lastEmailSentAt || null,
      emailSentCount: body.emailSentCount || 0,
      resolvedAt: null,
      source: body.source || null,
      deliveryMethod: body.deliveryMethod || null,
      mediaUrl: normalizedMediaUrl || null,
      mediaType: body.mediaType || null
    };

    const saved = await upsertSystemMessage(msg);
    const driverPushTokens = await readDriverPushTokens(saved.driverId, saved.driverName);
    await sendExpoPush(driverPushTokens, saved);
    return NextResponse.json({ message: saved });
  } catch (error) {
    return internalError(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return unauthorized();

    const { id, action } = await request.json();
    if (!id) return badRequest('Missing id');

    if (action === 'resolve') {
      const updated = await resolveSystemMessageById(id);
      if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      return NextResponse.json({ message: updated });
    }

    if (action === 'resolve-by-driver') {
      if (!id) return badRequest('Missing driverId');
      await resolveMessagesByDriverId(id);
      const messages = await readSystemMessages();
      return NextResponse.json({ messages });
    }

    if (action === 'reactivate-by-driver') {
      if (!id) return badRequest('Missing driverId');
      await reactivateMessagesByDriverId(id);
      const messages = await readSystemMessages();
      return NextResponse.json({ messages });
    }

    if (action === 'remove-media') {
      const dispatchState = await readNemtDispatchState();
      const { removed, nextThreads } = removeMessageMediaFromDispatchThreads({
        ...dispatchState,
        targetMessageId: id
      });
      const updated = await clearSystemMessageMediaById(id);

      if (!updated && !removed) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }

      if (removed) {
        await writeNemtDispatchState({
          ...dispatchState,
          dispatchThreads: nextThreads
        });
      }

      return NextResponse.json({
        message: updated || {
          id,
          mediaUrl: null,
          mediaType: null,
          mediaDeletedAt: new Date().toISOString()
        },
        removedFromDispatchThread: removed
      });
    }

    return badRequest('Unknown action');
  } catch (error) {
    return internalError(error);
  }
}
