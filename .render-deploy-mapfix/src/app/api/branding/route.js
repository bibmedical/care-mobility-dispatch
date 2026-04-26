import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { DEFAULT_BRANDING_SETTINGS, normalizeBrandingSettings } from '@/helpers/branding';
import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';

const buildBrandingPayload = state => ({
  ok: true,
  branding: normalizeBrandingSettings(state?.branding || DEFAULT_BRANDING_SETTINGS)
});

export async function GET() {
  const state = await readIntegrationsState();
  return NextResponse.json(buildBrandingPayload(state), {
    headers: {
      // Cache branding config for 2 min; serve stale for up to 10 min while revalidating.
      // This eliminates the round-trip delay on every login/page load.
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600'
    }
  });
}

export async function PUT(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const currentState = await readIntegrationsState();
    const body = await request.json();
    const branding = normalizeBrandingSettings({
      ...currentState?.branding,
      ...body,
      updatedAt: new Date().toISOString()
    });

    const savedState = await writeIntegrationsState({
      ...currentState,
      branding
    });

    return NextResponse.json(buildBrandingPayload(savedState));
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to save branding settings' }, { status: 400 });
  }
}