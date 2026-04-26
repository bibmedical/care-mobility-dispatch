import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { readNemtAdminState } from '@/server/nemt-admin-store';
import { clearDriverFuelData } from '@/server/genius-store';

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
      return { driver };
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

  return { driver };
};

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const context = await resolveDriverContext(req, body);
    if (context.error) return context.error;

    const driverId = String(context.driver.id || '').trim();
    const result = await clearDriverFuelData({ driverId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to reset fuel data.' }, { status: 500 });
  }
}
