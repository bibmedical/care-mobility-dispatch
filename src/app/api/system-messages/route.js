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
  if (!driverId && !driverName) return [];

  const adminState = await readNemtAdminState();
  const driver = resolveAdminDriverByLookup(adminState, driverId, driverName);
  const tokens = Array.isArray(driver?.mobilePushTokens) ? driver.mobilePushTokens : [];
  return tokens.map(token => String(token || '').trim()).filter(Boolean);
};

const sendExpoPush = async (pushTokens, message) => {
  if (!Array.isArray(pushTokens) || pushTokens.length === 0) return;

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
    sound: 'default',
    title: pushTitle,
    body: pushBody,
    data: {
      driverId: message.driverId || null,
      messageId: message.id
    }
  }));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXPO_PUSH_TIMEOUT_MS);

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    // Push delivery failures should not block dispatch message creation.
  }
};

export async function GET() {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return unauthorized();

    const messages = await readSystemMessages();
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
