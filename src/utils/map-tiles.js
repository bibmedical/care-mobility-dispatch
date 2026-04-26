const localTileUrl = process.env.NEXT_PUBLIC_LOCAL_TILE_URL?.trim();

const openStreetMapConfig = {
  provider: 'openstreetmap',
  attribution: '&copy; OpenStreetMap contributors',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
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

export const getMapTileConfig = providerPreference => {
  const normalized = String(providerPreference ?? 'auto').trim().toLowerCase();
  if (normalized === 'local' && hasLocalMapTilesConfigured) {
    return localMapConfig;
  }
  return openStreetMapConfig;
};

export const mapTilesConfig = getMapTileConfig();