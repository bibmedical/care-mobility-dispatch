import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readBlacklistState, writeBlacklistState } from '@/server/blacklist-store';

export async function GET() {
  const state = await readBlacklistState();
  return NextResponse.json(state);
}

export async function PUT(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({
        error: 'Authentication required'
      }, {
        status: 401
      });
    }
    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({
        error: 'Only administrators can modify blacklist'
      }, {
        status: 403
      });
    }

    const body = await request.json();
    const payload = await writeBlacklistState(body, {
      allowDelete: true
    });
    return NextResponse.json({
      ...payload,
      ok: true
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Unable to save blacklist'
    }, {
      status: 400
    });
  }
}