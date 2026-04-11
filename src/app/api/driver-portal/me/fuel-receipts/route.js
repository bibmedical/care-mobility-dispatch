import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { createGeniusFuelReceipt, readGeniusFuelReceipts } from '@/server/genius-store';

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

    const serviceDate = String(req.nextUrl.searchParams.get('serviceDate') || '').trim();
    const rows = await readGeniusFuelReceipts({ driverId: String(driver.id), serviceDate });

    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to load fuel receipts.' }, { status: 500 });
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

    const body = await req.json().catch(() => ({}));
    const created = await createGeniusFuelReceipt({
      driverId: String(driver.id),
      serviceDate: String(body?.serviceDate || '').trim(),
      amount: body?.amount,
      gallons: body?.gallons,
      receiptReference: String(body?.receiptReference || '').trim(),
      receiptImageUrl: String(body?.receiptImageUrl || '').trim(),
      vehicleMileage: body?.vehicleMileage,
      notes: String(body?.notes || '').trim(),
      submittedByUser: String(session.user.id || '').trim(),
      submittedByRole: String(session.user.role || '').trim() || 'driver',
      source: 'driver-portal'
    });

    return NextResponse.json({ ok: true, receipt: created });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to save fuel receipt.' }, { status: 500 });
  }
}
