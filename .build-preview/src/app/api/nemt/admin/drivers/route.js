import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { readNemtAdminDriversPayload } from '@/server/nemt-admin-store';

const buildUnauthorizedResponse = () => NextResponse.json({
  error: 'Authentication required'
}, {
  status: 401
});

const internalError = error => NextResponse.json({ error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET() {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return buildUnauthorizedResponse();

    const payload = await readNemtAdminDriversPayload();
    return NextResponse.json(payload);
  } catch (error) {
    return internalError(error);
  }
}