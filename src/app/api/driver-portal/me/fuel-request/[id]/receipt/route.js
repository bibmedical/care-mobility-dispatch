import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { submitFuelRequestReceipt, createGeniusFuelReceipt } from '@/server/genius-store';

export async function POST(req, { params }) {
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

    const requestId = String(params?.id || '').trim();
    if (!requestId) {
      return NextResponse.json({ ok: false, error: 'Request ID is required.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // Submit the receipt fields onto the fuel_request row
    const updated = await submitFuelRequestReceipt({
      requestId,
      receiptImageUrl: String(body?.receiptImageUrl || '').trim(),
      gallons: body?.gallons,
      vehicleMileage: body?.vehicleMileage
    });

    // Mirror into genius_fuel_receipts so Genius billing sees it automatically
    const today = new Date().toISOString().slice(0, 10);
    await createGeniusFuelReceipt({
      driverId: String(driver.id),
      serviceDate: String(body?.serviceDate || today),
      amount: Number(updated.approvedAmount) || 0,
      gallons: updated.gallons,
      receiptReference: String(updated.transferReference || updated.transferMethod || 'Fuel Request').trim(),
      receiptImageUrl: String(updated.receiptImageUrl || '').trim(),
      vehicleMileage: updated.vehicleMileage,
      notes: `Fuel request approved by ${updated.approvedByUser || 'dispatcher'}. ${updated.transferNotes || ''}`.trim(),
      submittedByUser: String(session.user.id),
      submittedByRole: 'driver',
      source: 'fuel-request'
    });

    return NextResponse.json({ ok: true, request: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to submit receipt.' }, { status: 500 });
  }
}
