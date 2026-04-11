import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { submitFuelRequestReceipt, createGeniusFuelReceipt } from '@/server/genius-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { readNemtAdminState } from '@/server/nemt-admin-store';

const findDriverById = async driverId => {
  const adminState = await readNemtAdminState();
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  return drivers.find(driver => String(driver?.id || '').trim() === String(driverId || '').trim()) || null;
};

const resolveDriverContext = async (req, body = null) => {
  const session = await getServerSession(authOptions);
  if (session?.user?.id && isDriverRole(session?.user?.role)) {
    const driver = await resolveDriverForSession(session);
    if (driver?.id) {
      return {
        driver,
        submittedByUser: String(session.user.id || '').trim(),
        submittedByRole: String(session.user.role || '').trim() || 'driver'
      };
    }
  }

  const driverId = String(body?.driverId || '').trim();
  if (!driverId) return { error: NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };

  const mobileAuth = await authorizeMobileDriverRequest(req, driverId);
  if (mobileAuth.response) return { error: mobileAuth.response };

  const driver = await findDriverById(driverId);
  if (!driver?.id) {
    return { error: NextResponse.json({ ok: false, error: 'Driver profile not found.' }, { status: 404 }) };
  }

  return {
    driver,
    submittedByUser: `mobile:${driverId}`,
    submittedByRole: 'driver-mobile'
  };
};

export async function POST(req, { params }) {
  try {
    const body = await req.json().catch(() => ({}));
    const context = await resolveDriverContext(req, body);
    if (context.error) return context.error;

    const driver = context.driver;

    const requestId = String(params?.id || '').trim();
    if (!requestId) {
      return NextResponse.json({ ok: false, error: 'Request ID is required.' }, { status: 400 });
    }

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
      submittedByUser: context.submittedByUser,
      submittedByRole: context.submittedByRole,
      source: 'fuel-request'
    });

    return NextResponse.json({ ok: true, request: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to submit receipt.' }, { status: 500 });
  }
}
