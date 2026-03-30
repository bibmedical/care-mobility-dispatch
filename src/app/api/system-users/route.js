import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readSystemUsersPayload, writeSystemUsersState } from '@/server/system-users-store';

const buildUnauthorizedResponse = () => NextResponse.json({
  error: 'Authentication required'
}, {
  status: 401
});

const buildForbiddenResponse = () => NextResponse.json({
  error: 'Only administrators can modify users'
}, {
  status: 403
});

export async function GET() {
  const session = await getServerSession(options);
  if (!session?.user?.id) return buildUnauthorizedResponse();

  const payload = await readSystemUsersPayload();
  return NextResponse.json(payload);
}

export async function PUT(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) return buildUnauthorizedResponse();
  if (!isAdminRole(session?.user?.role)) return buildForbiddenResponse();

  try {
    const body = await request.json();
    const payload = await writeSystemUsersState(body);
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save users'
    }, {
      status: 400
    });
  }
}
