import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { createGeniusPayoutRun, readGeniusPayoutRuns } from '@/server/genius-store';

const ALLOWED_GENIUS_USER_IDS = new Set(['user-16', 'user-20']);

const assertGeniusAdmin = userId => {
  if (!ALLOWED_GENIUS_USER_IDS.has(String(userId || '').trim())) {
    throw new Error('Forbidden');
  }
};

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '').trim();
    if (!userId) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    assertGeniusAdmin(userId);

    const serviceDate = String(req.nextUrl.searchParams.get('serviceDate') || '').trim();
    const driverId = String(req.nextUrl.searchParams.get('driverId') || '').trim();
    const rows = await readGeniusPayoutRuns({ serviceDate, driverId, limit: 120 });

    return Response.json({ success: true, rows });
  } catch (error) {
    const status = String(error?.message || '').toLowerCase() === 'forbidden' ? 403 : 500;
    return Response.json({ success: false, error: status === 403 ? 'Forbidden' : error?.message || 'Unable to load payout receipts' }, { status });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '').trim();
    if (!userId) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    assertGeniusAdmin(userId);

    const body = await req.json().catch(() => ({}));
    const created = await createGeniusPayoutRun({
      serviceDate: String(body?.serviceDate || '').trim(),
      driverId: String(body?.driverId || '').trim(),
      createdByUser: userId
    });

    return Response.json({ success: true, payout: created });
  } catch (error) {
    const status = String(error?.message || '').toLowerCase() === 'forbidden' ? 403 : 500;
    return Response.json({ success: false, error: status === 403 ? 'Forbidden' : error?.message || 'Unable to create payout receipt' }, { status });
  }
}
