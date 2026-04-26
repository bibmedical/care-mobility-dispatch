import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

export async function GET() {
  const state = await readIntegrationsState();
  return NextResponse.json({
    apiConfigs: Array.isArray(state?.customApis) ? state.customApis : []
  });
}

export async function PUT(request) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }
    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({ ok: false, error: 'Only administrators can modify API configuration' }, { status: 403 });
    }

    const body = await request.json();
    const currentState = await readIntegrationsState();
    const apiConfigs = Array.isArray(body?.apiConfigs) ? body.apiConfigs : [];
    const payload = await writeIntegrationsState({
      ...currentState,
      customApis: apiConfigs
    });

    return NextResponse.json({
      ok: true,
      apiConfigs: Array.isArray(payload?.customApis) ? payload.customApis : []
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Unable to save API configuration'
    }, {
      status: 400
    });
  }
}
