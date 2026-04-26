import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { readDriverDisciplineEvents } from '@/server/driver-discipline-store';

export async function GET(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const driverId = String(searchParams.get('driverId') || '').trim();
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const limit = Number(searchParams.get('limit') || 500);
    const events = await readDriverDisciplineEvents({ driverId, activeOnly, limit });
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Unable to load driver discipline events' }, { status: 500 });
  }
}