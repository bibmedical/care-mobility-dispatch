import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { readDriverDisciplineEvents } from '@/server/driver-discipline-store';

export async function GET() {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const events = await readDriverDisciplineEvents();
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Unable to load driver discipline events' }, { status: 500 });
  }
}