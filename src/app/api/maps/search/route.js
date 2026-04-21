import { NextResponse } from 'next/server';

const US_LATITUDE_RANGE = [18, 72];
const US_LONGITUDE_RANGE = [-179, -64];

const isLikelyUsCoordinate = coordinates => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
  const [latitude, longitude] = coordinates.map(Number);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= US_LATITUDE_RANGE[0]
    && latitude <= US_LATITUDE_RANGE[1]
    && longitude >= US_LONGITUDE_RANGE[0]
    && longitude <= US_LONGITUDE_RANGE[1];
};

const buildMapboxUrl = query => {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&autocomplete=false&country=us&types=address,postcode,place,locality,neighborhood&access_token=${token}`;
};

const buildNominatimUrl = query => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=us&q=${encodeURIComponent(query)}`;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get('q') ?? '').trim();

  if (!query) {
    return NextResponse.json({
      error: 'Query is required.'
    }, {
      status: 400
    });
  }

  const providers = [{
    name: 'mapbox',
    url: buildMapboxUrl(query)
  }, {
    name: 'nominatim',
    url: buildNominatimUrl(query)
  }].filter(provider => provider.url);

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        cache: 'no-store',
        headers: provider.name === 'nominatim' ? {
          'User-Agent': 'care-mobility-dispatch/1.0'
        } : undefined
      });

      if (!response.ok) continue;

      const payload = await response.json();

      if (provider.name === 'mapbox') {
        const feature = payload?.features?.[0];
        const center = Array.isArray(feature?.center) ? feature.center : null;
        if (!center || center.length !== 2) continue;
        const coordinates = [Number(center[1]), Number(center[0])];
        if (!isLikelyUsCoordinate(coordinates)) continue;
        return NextResponse.json({
          provider: 'mapbox',
          label: feature.place_name || query,
          coordinates
        });
      }

      const result = Array.isArray(payload) ? payload[0] : null;
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const coordinates = [latitude, longitude];
      if (!isLikelyUsCoordinate(coordinates)) continue;
      return NextResponse.json({
        provider: 'nominatim',
        label: result.display_name || query,
        coordinates
      });
    } catch {
      // Try the next provider.
    }
  }

  return NextResponse.json({
    error: 'Address not found.'
  }, {
    status: 404
  });
}
