import { buildMobileCorsPreflightResponse, jsonWithMobileCors } from '@/server/mobile-api-cors';
import { readIntegrationsState } from '@/server/integrations-store';

const normalizeUrl = value => String(value || '').trim().replace(/\/$/, '');

const resolvePublicOrigin = request => {
  const forwardedHost = normalizeUrl(request.headers.get('x-forwarded-host'));
  const forwardedProto = normalizeUrl(request.headers.get('x-forwarded-proto'));
  const host = forwardedHost || normalizeUrl(request.headers.get('host'));

  if (!host) return '';

  const normalizedHost = host.toLowerCase();
  const isLocalHost = normalizedHost.startsWith('localhost') || normalizedHost.startsWith('127.0.0.1');
  const protocol = isLocalHost ? 'http' : (forwardedProto || 'https');
  return `${protocol}://${host}`;
};

const resolveDriverAppApiBaseUrl = (request, state) => {
  const configuredApiBaseUrl = normalizeUrl(state?.driverApp?.configuredApiBaseUrl);
  if (configuredApiBaseUrl) return configuredApiBaseUrl;

  return resolvePublicOrigin(request);
};

export async function GET(request) {
  const state = await readIntegrationsState();
  const apiBaseUrl = resolveDriverAppApiBaseUrl(request, state);

  return jsonWithMobileCors(request, {
    ok: true,
    driverApp: {
      apiBaseUrl,
      configuredApiBaseUrl: normalizeUrl(state?.driverApp?.configuredApiBaseUrl),
      updatedAt: String(state?.driverApp?.updatedAt || ''),
      updatedBy: String(state?.driverApp?.updatedBy || ''),
      source: normalizeUrl(state?.driverApp?.configuredApiBaseUrl) ? 'configured' : 'service-origin'
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