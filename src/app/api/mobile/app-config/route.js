import { buildMobileCorsPreflightResponse, jsonWithMobileCors } from '@/server/mobile-api-cors';
import { readIntegrationsState } from '@/server/integrations-store';

const normalizeUrl = value => String(value || '').trim().replace(/\/$/, '');

const resolveDriverAppApiBaseUrl = (request, state) => {
  const configuredApiBaseUrl = normalizeUrl(state?.driverApp?.apiBaseUrl);
  if (configuredApiBaseUrl) return configuredApiBaseUrl;

  try {
    return normalizeUrl(new URL(request.url).origin);
  } catch {
    return '';
  }
};

export async function GET(request) {
  const state = await readIntegrationsState();
  const apiBaseUrl = resolveDriverAppApiBaseUrl(request, state);

  return jsonWithMobileCors(request, {
    ok: true,
    driverApp: {
      apiBaseUrl,
      configuredApiBaseUrl: normalizeUrl(state?.driverApp?.apiBaseUrl),
      updatedAt: String(state?.driverApp?.updatedAt || ''),
      updatedBy: String(state?.driverApp?.updatedBy || ''),
      source: normalizeUrl(state?.driverApp?.apiBaseUrl) ? 'configured' : 'service-origin'
    }
  }, {
    headers: {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
    }
  });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}
