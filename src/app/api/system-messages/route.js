import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import {
  readSystemMessages,
  resolveSystemMessageById,
  upsertSystemMessage
} from '@/server/system-messages-store';
import { readNemtAdminState } from '@/server/nemt-admin-store';

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });
const badRequest = message => NextResponse.json({ error: message }, { status: 400 });
const internalError = error => NextResponse.json({ error: error?.message || 'Unable to process system messages' }, { status: 500 });

const readDriverPushTokens = async driverId => {
  if (!driverId) return [];

  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const driver = drivers.find(item => String(item?.id || '').trim() === String(driverId).trim());
  const tokens = Array.isArray(driver?.mobilePushTokens) ? driver.mobilePushTokens : [];
  return tokens.map(token => String(token || '').trim()).filter(Boolean);
};

const sendExpoPush = async (pushTokens, message) => {
  if (!Array.isArray(pushTokens) || pushTokens.length === 0) return;

  const payload = pushTokens.map(to => ({
    to,
    sound: 'default',
    title: message.subject || 'Dispatch update',
    body: message.body || 'You have a new message from dispatch.',
    data: {
      driverId: message.driverId || null,
      messageId: message.id
    }
  }));

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
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
    const msg = {
      id: body.id || `sysmsg-${Date.now()}`,
      type: body.type || 'manual',
      priority: body.priority || 'normal',
      audience: body.audience || 'System',
      subject: body.subject || '(no subject)',
      body: body.body || '',
      driverId: body.driverId || null,
      driverName: body.driverName || null,
      driverEmail: body.driverEmail || null,
      expirationDate: body.expirationDate || null,
      daysUntilExpiry: body.daysUntilExpiry ?? null,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastEmailSentAt: body.lastEmailSentAt || null,
      emailSentCount: body.emailSentCount || 0,
      resolvedAt: null
    };

    const saved = await upsertSystemMessage(msg);
    const driverPushTokens = await readDriverPushTokens(saved.driverId);
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

    return badRequest('Unknown action');
  } catch (error) {
    return internalError(error);
  }
}
