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
}];

export const getMapTileConfig = () => openStreetMapConfig;

export const mapTilesConfig = getMapTileConfig();