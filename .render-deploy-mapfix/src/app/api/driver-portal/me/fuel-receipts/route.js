import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { createGeniusFuelReceipt, readGeniusFuelReceipts } from '@/server/genius-store';
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

  const driverId = String(req.nextUrl.searchParams.get('driverId') || body?.driverId || '').trim();
  if (!driverId) return { error: NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 }) };

  const mobileAuth = await authorizeMobileDriverRequest(req, driverId, { allowLegacyWithoutSession: true });
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

export async function GET(req) {
  try {
    const context = await resolveDriverContext(req);
    if (context.error) return context.error;

    const driver = context.driver;

    const serviceDate = String(req.nextUrl.searchParams.get('serviceDate') || '').trim();
    const rows = await readGeniusFuelReceipts({ driverId: String(driver.id), serviceDate });

    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to load fuel receipts.' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const context = await resolveDriverContext(req, body);
    if (context.error) return context.error;

    const driver = context.driver;
    const created = await createGeniusFuelReceipt({
      driverId: String(driver.id),
      serviceDate: String(body?.serviceDate || '').trim(),
      amount: body?.amount,
      gallons: body?.gallons,
      receiptReference: String(body?.receiptReference || '').trim(),
      receiptImageUrl: String(body?.receiptImageUrl || '').trim(),
      vehicleMileage: body?.vehicleMileage,
      notes: String(body?.notes || '').trim(),
      submittedByUser: context.submittedByUser,
      submittedByRole: context.submittedByRole,
      source: 'driver-portal'
    });

    return NextResponse.json({ ok: true, receipt: created });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to save fuel receipt.' }, { status: 500 });
  }
}
