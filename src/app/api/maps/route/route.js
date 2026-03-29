import { NextResponse } from 'next/server';

const toCoordinatePairs = value => String(value ?? '').split(';').map(pair => pair.trim()).filter(Boolean).map(pair => {
  const [latitudeValue, longitudeValue] = pair.split(',').map(item => Number(item.trim()));
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) return null;
  return [latitudeValue, longitudeValue];
}).filter(Boolean);

const toMiles = meters => Number.isFinite(meters) ? meters / 1609.344 : null;
const toMinutes = seconds => Number.isFinite(seconds) ? seconds / 60 : null;

const buildFallbackGeometry = coordinates => coordinates.map(([latitude, longitude]) => [latitude, longitude]);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const coordinates = toCoordinatePairs(searchParams.get('coordinates'));
  const includeAlternatives = ['1', 'true', 'yes'].includes(String(searchParams.get('alternatives') ?? '').trim().toLowerCase());

  if (coordinates.length < 2) {
    return NextResponse.json({
      error: 'At least two coordinates are required.'
    }, {
      status: 400
    });
  }

  const coordinateQuery = coordinates.map(([latitude, longitude]) => `${longitude},${latitude}`).join(';');
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  const mapboxUrl = mapboxToken ? `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinateQuery}?alternatives=${includeAlternatives ? 'true' : 'false'}&geometries=geojson&overview=full&steps=false&access_token=${mapboxToken}` : null;
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordinateQuery}?alternatives=${includeAlternatives ? 'true' : 'false'}&geometries=geojson&overview=full&steps=false`;

  const providers = [{
    name: 'mapbox',
    url: mapboxUrl
  }, {
    name: 'osrm',
    url: osrmUrl
  }].filter(provider => provider.url);

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        cache: 'no-store'
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const routes = Array.isArray(payload?.routes) ? payload.routes : [];
      const route = routes[0];
      const geometry = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]) : [];

      if (geometry.length < 2) continue;

      const alternatives = routes.slice(1).map(item => ({
        geometry: Array.isArray(item?.geometry?.coordinates) ? item.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]) : [],
        distanceMiles: toMiles(item?.distance),
        durationMinutes: toMinutes(item?.duration)
      })).filter(item => item.geometry.length > 1);

      return NextResponse.json({
        provider: provider.name,
        geometry,
        distanceMiles: toMiles(route.distance),
        durationMinutes: toMinutes(route.duration),
        alternatives,
        isFallback: false
      });
    } catch {
      // Try the next provider.
    }
  }

  return NextResponse.json({
    provider: 'fallback',
    geometry: buildFallbackGeometry(coordinates),
    distanceMiles: null,
    durationMinutes: null,
    alternatives: [],
    isFallback: true
  });
}