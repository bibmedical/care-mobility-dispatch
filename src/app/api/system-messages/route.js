import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import {
  readSystemMessages,
  resolveSystemMessageById,
  upsertSystemMessage
} from '@/server/system-messages-store';

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });

export async function GET() {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();

  const messages = await readSystemMessages();
  return NextResponse.json({ messages });
}

export async function POST(request) {
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
  return NextResponse.json({ message: saved });
}

export async function PATCH(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();

  const { id, action } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  if (action === 'resolve') {
    const updated = await resolveSystemMessageById(id);
    if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    return NextResponse.json({ message: updated });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
