import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { approveFuelRequest } from '@/server/genius-store';

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
    }
    const requestId = String(params?.id || '').trim();
    if (!requestId) {
      return NextResponse.json({ ok: false, error: 'Request ID is required.' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const updated = await approveFuelRequest({
      requestId,
      approvedByUser: String(session.user.name || session.user.id || '').trim(),
      approvedAmount: body?.approvedAmount,
      transferMethod: String(body?.transferMethod || '').trim(),
      transferReference: String(body?.transferReference || '').trim(),
      transferNotes: String(body?.transferNotes || '').trim()
    });
    return NextResponse.json({ ok: true, request: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to approve request.' }, { status: 500 });
  }
}
