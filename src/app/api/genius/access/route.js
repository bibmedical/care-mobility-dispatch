import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { verifyPersistedSystemUserWebLoginCode } from '@/server/system-users-store';

const ALLOWED_GENIUS_USER_IDS = new Set(['user-16', 'user-20']);

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const userId = String(session?.user?.id || '').trim();
    if (!userId) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (!ALLOWED_GENIUS_USER_IDS.has(userId)) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      return Response.json({ success: false, error: '6-digit code required' }, { status: 400 });
    }

    const valid = await verifyPersistedSystemUserWebLoginCode(userId, code);
    if (!valid) {
      return Response.json({ success: false, error: 'Invalid code' }, { status: 401 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[genius/access] verification failed:', error);
    return Response.json({ success: false, error: error?.message || 'Unable to verify code' }, { status: 500 });
  }
}
