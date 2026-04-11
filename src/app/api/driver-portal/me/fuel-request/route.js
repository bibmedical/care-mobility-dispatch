import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { createFuelRequest, readDriverFuelRequests } from '@/server/genius-store';

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
    }
    if (!isDriverRole(session?.user?.role)) {
      return NextResponse.json({ ok: false, error: 'Driver access only.' }, { status: 403 });
    }
    const driver = await resolveDriverForSession(session);
    if (!driver?.id) {
      return NextResponse.json({ ok: false, error: 'Driver profile not found.' }, { status: 404 });
    }
    const rows = await readDriverFuelRequests({ driverId: String(driver.id), limit: 10 });
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to load fuel requests.' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
    }
    if (!isDriverRole(session?.user?.role)) {
      return NextResponse.json({ ok: false, error: 'Driver access only.' }, { status: 403 });
    }
    const driver = await resolveDriverForSession(session);
    if (!driver?.id) {
      return NextResponse.json({ ok: false, error: 'Driver profile not found.' }, { status: 404 });
    }
    const created = await createFuelRequest({
      driverId: String(driver.id),
      driverName: String(driver.name || session.user.name || '').trim()
    });
    return NextResponse.json({ ok: true, request: created });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to submit fuel request.' }, { status: 500 });
  }
}
