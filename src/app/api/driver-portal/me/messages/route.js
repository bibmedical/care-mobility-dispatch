import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { normalizeDispatchMessageRecord } from '@/helpers/nemt-dispatch-state';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { upsertSystemMessage } from '@/server/system-messages-store';

const appendIncomingDriverThreadMessage = (dispatchThreads, driverId, message) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return Array.isArray(dispatchThreads) ? dispatchThreads : [];

  const nextMessage = normalizeDispatchMessageRecord({
    id: message.id,
    direction: 'incoming',
    text: message.body,
    timestamp: message.createdAt,
    status: 'sent'
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

export async function POST(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
  }

  if (!isDriverRole(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: 'Driver access only.' }, { status: 403 });
  }

  const driver = await resolveDriverForSession(session);
  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver profile not found.' }, { status: 404 });
  }

  const body = await request.json();
  const messageText = String(body?.body || '').trim();
  if (!messageText) {
    return NextResponse.json({ ok: false, error: 'Message body is required.' }, { status: 400 });
  }

  const message = {
    id: `driver-msg-${Date.now()}`,
    type: 'driver-reply',
    priority: 'normal',
    audience: 'Dispatcher',
    subject: `Driver message from ${driver.name || driver.nickname || 'Driver'}`,
    body: messageText,
    mediaUrl: null,
    mediaType: null,
    driverId: driver.id,
    driverName: driver.name || driver.nickname || 'Driver',
    driverEmail: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    source: 'driver-web-portal',
    deliveryMethod: 'in-app'
  };

  await upsertSystemMessage(message);

  const dispatchState = await readNemtDispatchState();
  await writeNemtDispatchState({
    ...dispatchState,
    dispatchThreads: appendIncomingDriverThreadMessage(dispatchState?.dispatchThreads, driver.id, message)
  });

  return NextResponse.json({ ok: true, message });
}