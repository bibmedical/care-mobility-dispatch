import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { readFuelRequests } from '@/server/genius-store';

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
    }
    const status = String(req.nextUrl.searchParams.get('status') || '').trim();
    const rows = await readFuelRequests({ status, limit: 200 });
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to load fuel requests.' }, { status: 500 });
  }
}
