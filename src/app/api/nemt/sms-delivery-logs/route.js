import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { readSmsDeliveryLogs } from '@/server/sms-delivery-log-store';

export async function GET(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tripId = String(searchParams.get('tripId') || '').trim();
    const driverId = String(searchParams.get('driverId') || '').trim();
    const limit = Number(searchParams.get('limit') || 200);
    const logs = await readSmsDeliveryLogs({ tripId, driverId, limit });
    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Unable to load SMS delivery logs' }, { status: 500 });
  }
}