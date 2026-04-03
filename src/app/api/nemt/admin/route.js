import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readNemtAdminPayload, writeNemtAdminState } from '@/server/nemt-admin-store';

const buildUnauthorizedResponse = () => NextResponse.json({
  error: 'Authentication required'
}, {
  status: 401
});

const buildForbiddenResponse = () => NextResponse.json({
  error: 'Only administrators can modify admin data'
}, {
  status: 403
});

const internalError = error => NextResponse.json({ error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET() {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return buildUnauthorizedResponse();

    const payload = await readNemtAdminPayload();
    return NextResponse.json(payload);
  } catch (error) {
    return internalError(error);
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return buildUnauthorizedResponse();
    if (!isAdminRole(session?.user?.role)) return buildForbiddenResponse();

    const body = await request.json();
    const nextState = await writeNemtAdminState(body);
    return NextResponse.json({
      ...nextState,
      ok: true
    });
  } catch (error) {
    return internalError(error);
  }
}
