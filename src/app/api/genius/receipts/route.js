import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { isDriverRole } from '@/helpers/system-users';
import { resolveDriverForSession } from '@/server/driver-portal';
import { createGeniusFuelReceipt, readGeniusFuelReceipts } from '@/server/genius-store';

const ALLOWED_GENIUS_USER_IDS = new Set(['user-16', 'user-20']);

const canAccessAsGeniusAdmin = userId => ALLOWED_GENIUS_USER_IDS.has(String(userId || '').trim());

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '').trim();
    if (!userId) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const requestedDriverId = String(req.nextUrl.searchParams.get('driverId') || '').trim();
    const serviceDate = String(req.nextUrl.searchParams.get('serviceDate') || '').trim();

    if (canAccessAsGeniusAdmin(userId)) {
      const rows = await readGeniusFuelReceipts({ driverId: requestedDriverId, serviceDate });
      return Response.json({ success: true, rows });
    }

    if (isDriverRole(session?.user?.role)) {
      const linkedDriver = await resolveDriverForSession(session);
      if (!linkedDriver?.id) {
        return Response.json({ success: false, error: 'Driver profile not found' }, { status: 404 });
      }
      const rows = await readGeniusFuelReceipts({ driverId: String(linkedDriver.id), serviceDate });
      return Response.json({ success: true, rows });
    }

    return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
  } catch (error) {
    console.error('[genius/receipts] GET failed:', error);
    return Response.json({ success: false, error: error?.message || 'Unable to load receipts' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '').trim();
    if (!userId) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedDriverId = String(body?.driverId || '').trim();
    const serviceDate = String(body?.serviceDate || '').trim();
    const amount = body?.amount;
    const gallons = body?.gallons;
    const receiptReference = String(body?.receiptReference || '').trim();
    const receiptImageUrl = String(body?.receiptImageUrl || '').trim();
    const notes = String(body?.notes || '').trim();

    if (canAccessAsGeniusAdmin(userId)) {
      const created = await createGeniusFuelReceipt({
        driverId: requestedDriverId,
        serviceDate,
        amount,
        gallons,
        receiptReference,
        receiptImageUrl,
        notes,
        submittedByUser: userId,
        submittedByRole: String(session?.user?.role || '').trim() || 'admin',
        source: 'admin'
      });
      return Response.json({ success: true, receipt: created });
    }

    if (isDriverRole(session?.user?.role)) {
      const linkedDriver = await resolveDriverForSession(session);
      if (!linkedDriver?.id) {
        return Response.json({ success: false, error: 'Driver profile not found' }, { status: 404 });
      }
      const created = await createGeniusFuelReceipt({
        driverId: String(linkedDriver.id),
        serviceDate,
        amount,
        gallons,
        receiptReference,
        receiptImageUrl,
        notes,
        submittedByUser: userId,
        submittedByRole: String(session?.user?.role || '').trim() || 'driver',
        source: 'driver-portal'
      });
      return Response.json({ success: true, receipt: created });
    }

    return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
  } catch (error) {
    console.error('[genius/receipts] POST failed:', error);
    return Response.json({ success: false, error: error?.message || 'Unable to save receipt' }, { status: 500 });
  }
}
