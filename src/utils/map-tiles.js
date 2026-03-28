const mapboxAccessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
const mapboxStyleId = process.env.NEXT_PUBLIC_MAPBOX_STYLE_ID?.trim() || 'mapbox/streets-v12';

const openStreetMapConfig = {
  provider: 'openstreetmap',
  attribution: '&copy; OpenStreetMap contributors',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

export const getMapTileConfig = () => {
  if (!mapboxAccessToken) {
    return openStreetMapConfig;
  }

  return {
    provider: 'mapbox',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
    url: `https://api.mapbox.com/styles/v1/${mapboxStyleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxAccessToken}`
  };
};

export const mapTilesConfig = getMapTileConfig();