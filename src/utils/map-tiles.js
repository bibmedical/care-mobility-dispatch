const localTileUrl = process.env.NEXT_PUBLIC_LOCAL_TILE_URL?.trim();
const localTileProbeTimeoutMs = Number(process.env.NEXT_PUBLIC_LOCAL_TILE_PROBE_TIMEOUT_MS || 2500);

const openStreetMapConfig = {
  provider: 'openstreetmap',
  attribution: '&copy; OpenStreetMap contributors',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

const darkMapConfig = {
  provider: 'carto-dark',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};

const localMapConfig = {
  provider: 'local',
  attribution: '&copy; OpenStreetMap contributors',
  url: localTileUrl || openStreetMapConfig.url
};

export const MAP_PROVIDER_OPTIONS = [{
  value: 'auto',
  label: 'Auto'
}, {
  value: 'openstreetmap',
  label: 'OpenStreetMap'
}, {
  value: 'local',
  label: localTileUrl ? 'Local Tiles' : 'Local Tiles (configure env)'
}];

export const hasLocalMapTilesConfigured = Boolean(localTileUrl);

export const hasMapboxConfigured = false;

let localTileProbePromise = null;
let localTileProbeResult = null;

const PROBE_TILE = {
  z: 2,
  x: 1,
  y: 1
};

const resolveTileUrl = (template, tile) => String(template || '')
  .replaceAll('{s}', 'a')
  .replaceAll('{z}', String(tile.z))
  .replaceAll('{x}', String(tile.x))
  .replaceAll('{y}', String(tile.y))
  .replaceAll('{r}', '');

const getLightOrDarkFallback = themeMode => String(themeMode ?? 'light').trim().toLowerCase() === 'dark' ? darkMapConfig : openStreetMapConfig;

export const probeLocalMapTilesAvailability = async () => {
  if (!hasLocalMapTilesConfigured) return false;
  if (localTileProbeResult !== null) return localTileProbeResult;
  if (localTileProbePromise) return localTileProbePromise;

  localTileProbePromise = (async () => {
    try {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), Math.max(500, localTileProbeTimeoutMs))
        : null;

      try {
        const response = await fetch(resolveTileUrl(localMapConfig.url, PROBE_TILE), {
          cache: 'no-store',
          signal: controller?.signal
        });
        localTileProbeResult = response.ok;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch {
      localTileProbeResult = false;
    } finally {
      localTileProbePromise = null;
    }
    return localTileProbeResult;
  })();

  return localTileProbePromise;
};

export const resetLocalMapTilesProbe = () => {
  localTileProbePromise = null;
  localTileProbeResult = null;
};

export const getMapTileConfig = (providerPreference, themeMode = 'light') => {
  const normalized = String(providerPreference ?? 'auto').trim().toLowerCase();
  const normalizedThemeMode = String(themeMode ?? 'light').trim().toLowerCase();
  if (normalized === 'auto' && hasLocalMapTilesConfigured) {
    return localMapConfig;
  }
  if (normalized === 'local' && hasLocalMapTilesConfigured) {
    return localMapConfig;
  }
  if (normalizedThemeMode === 'dark') {
    return darkMapConfig;
  }
  return openStreetMapConfig;
};

export const getMapTileConfigWithFallback = (providerPreference, themeMode = 'light', canUseLocalTiles = true) => {
  const normalized = String(providerPreference ?? 'auto').trim().toLowerCase();
  const shouldAttemptLocal = hasLocalMapTilesConfigured && (normalized === 'auto' || normalized === 'local');

  if (shouldAttemptLocal && !canUseLocalTiles) {
    return normalized === 'local' ? openStreetMapConfig : getLightOrDarkFallback(themeMode);
  }

  return getMapTileConfig(providerPreference, themeMode);
};

export const mapTilesConfig = getMapTileConfig();