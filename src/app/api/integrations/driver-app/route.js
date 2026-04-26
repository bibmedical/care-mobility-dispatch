import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

const normalizeUrl = value => String(value || '').trim().replace(/\/$/, '');

const normalizeManagedUrl = value => {
  const normalizedValue = normalizeUrl(value);
  if (!normalizedValue) return '';

  try {
    const parsed = new URL(normalizedValue);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp = process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (!isHttps && !isLocalHttp) {
      throw new Error('Driver app API URL must use HTTPS.');
    }
    return normalizedValue;
  } catch (error) {
    if (error instanceof Error && error.message) throw error;
    throw new Error('Driver app API URL must be a valid absolute URL.');
  }
};

const buildPayload = (request, state) => {
  const configuredApiBaseUrl = normalizeUrl(state?.driverApp?.apiBaseUrl);
  const currentServiceOrigin = (() => {
    try {
      return normalizeUrl(new URL(request.url).origin);
    } catch {
      return '';
    }
  })();

  return {
    ok: true,
    driverApp: {
      apiBaseUrl: configuredApiBaseUrl,
      resolvedApiBaseUrl: configuredApiBaseUrl || currentServiceOrigin,
      currentServiceOrigin,
      notes: String(state?.driverApp?.notes || ''),
      updatedAt: String(state?.driverApp?.updatedAt || ''),
      updatedBy: String(state?.driverApp?.updatedBy || '')
    }
  };
};

export async function GET(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Only administrators can modify driver app settings' }, { status: 403 });
  }

  const state = await readIntegrationsState();
  return NextResponse.json(buildPayload(request, state));
}

export async function PUT(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Only administrators can modify driver app settings' }, { status: 403 });
  }

  try {
    const currentState = await readIntegrationsState();
    const body = await request.json();
    const apiBaseUrl = normalizeManagedUrl(body?.driverApp?.apiBaseUrl ?? body?.apiBaseUrl ?? '');
    const notes = String(body?.driverApp?.notes ?? body?.notes ?? '').trim();
    const savedState = await writeIntegrationsState({
      ...currentState,
      driverApp: {
        ...currentState?.driverApp,
        apiBaseUrl,
        notes,
        updatedAt: new Date().toISOString(),
        updatedBy: String(session?.user?.name || session?.user?.email || session?.user?.id || '')
      }
    });

    return NextResponse.json(buildPayload(request, savedState));
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to save driver app settings' }, { status: 400 });
  }
}
