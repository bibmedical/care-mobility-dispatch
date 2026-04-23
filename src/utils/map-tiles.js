const mapboxAccessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
const mapboxStyleId = process.env.NEXT_PUBLIC_MAPBOX_STYLE_ID?.trim() || 'mapbox/streets-v12';

const openStreetMapConfig = {
  provider: 'openstreetmap',
  attribution: '&copy; OpenStreetMap contributors',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

export const MAP_PROVIDER_OPTIONS = [{
  value: 'auto',
  label: 'Auto'
}, {
  value: 'openstreetmap',
  label: 'OpenStreetMap'
}, {
  value: 'mapbox',
  label: 'Mapbox'
}];

export const hasMapboxConfigured = Boolean(mapboxAccessToken);

const getMapboxConfig = () => ({
  provider: 'mapbox',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
  url: `https://api.mapbox.com/styles/v1/${mapboxStyleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxAccessToken}`
});

export const getMapTileConfig = providerPreference => {
  if (providerPreference === 'openstreetmap') {
    return openStreetMapConfig;
  }

  if (providerPreference === 'mapbox') {
    return hasMapboxConfigured ? getMapboxConfig() : openStreetMapConfig;
  }

  return openStreetMapConfig;
};

export const mapTilesConfig = getMapTileConfig();