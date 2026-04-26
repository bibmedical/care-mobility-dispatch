import { NextResponse } from 'next/server';

const toCoordinatePairs = value => String(value ?? '').split(';').map(pair => pair.trim()).filter(Boolean).map(pair => {
  const [latitudeValue, longitudeValue] = pair.split(',').map(item => Number(item.trim()));
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) return null;
  return [latitudeValue, longitudeValue];
}).filter(Boolean);

const toMiles = meters => Number.isFinite(meters) ? meters / 1609.344 : null;
const toMinutes = seconds => Number.isFinite(seconds) ? seconds / 60 : null;

const buildFallbackGeometry = coordinates => coordinates.map(([latitude, longitude]) => [latitude, longitude]);

const buildOsrmUrl = (coordinates, includeAlternatives = false) => {
  const coordinateQuery = coordinates.map(([latitude, longitude]) => `${longitude},${latitude}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${coordinateQuery}?alternatives=${includeAlternatives ? 'true' : 'false'}&geometries=geojson&overview=full&steps=false`;
};

const readOsrmRoutes = async url => {
  const response = await fetch(url, {
    cache: 'no-store'
  });
  if (!response.ok) return [];

  const payload = await response.json();
  return Array.isArray(payload?.routes) ? payload.routes : [];
};

const toRouteGeometry = route => Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]) : [];

const buildSegmentedRoute = async coordinates => {
  const geometry = [];
  let distanceMeters = 0;
  let durationSeconds = 0;
  let hasDistance = true;
  let hasDuration = true;
  let usedFallbackSegment = false;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segmentCoordinates = [coordinates[index], coordinates[index + 1]];
    const routes = await readOsrmRoutes(buildOsrmUrl(segmentCoordinates));
    const route = routes[0];
    const segmentGeometry = toRouteGeometry(route);

    if (segmentGeometry.length > 1) {
      if (geometry.length > 0) {
        geometry.push(...segmentGeometry.slice(1));
      } else {
        geometry.push(...segmentGeometry);
      }

      if (Number.isFinite(route?.distance)) {
        distanceMeters += route.distance;
      } else {
        hasDistance = false;
      }
      if (Number.isFinite(route?.duration)) {
        durationSeconds += route.duration;
      } else {
        hasDuration = false;
      }
      continue;
    }

    usedFallbackSegment = true;
    hasDistance = false;
    hasDuration = false;
    const fallbackGeometry = buildFallbackGeometry(segmentCoordinates);
    if (geometry.length > 0) {
      geometry.push(...fallbackGeometry.slice(1));
    } else {
      geometry.push(...fallbackGeometry);
    }
  }

  return {
    geometry,
    distanceMiles: hasDistance ? toMiles(distanceMeters) : null,
    durationMinutes: hasDuration ? toMinutes(durationSeconds) : null,
    usedFallbackSegment
  };
};

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

  const providers = [{
    name: 'osrm',
    url: buildOsrmUrl(coordinates, includeAlternatives)
  }].filter(provider => provider.url);

  for (const provider of providers) {
    try {
      const routes = await readOsrmRoutes(provider.url);
      const route = routes[0];
      const geometry = toRouteGeometry(route);

      if (geometry.length < 2) continue;

      const alternatives = routes.slice(1).map(item => ({
        geometry: toRouteGeometry(item),
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
      }, {
        headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' }
      });
    } catch {
      // Try the next provider.
    }
  }

  try {
    const segmentedRoute = await buildSegmentedRoute(coordinates);
    if (segmentedRoute.geometry.length > 1) {
      return NextResponse.json({
        provider: segmentedRoute.usedFallbackSegment ? 'osrm-segmented-partial' : 'osrm-segmented',
        geometry: segmentedRoute.geometry,
        distanceMiles: segmentedRoute.distanceMiles,
        durationMinutes: segmentedRoute.durationMinutes,
        alternatives: [],
        isFallback: segmentedRoute.usedFallbackSegment
      }, {
        headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' }
      });
    }
  } catch {
    // Use the straight-line fallback below.
  }

  return NextResponse.json({
    provider: 'fallback',
    geometry: buildFallbackGeometry(coordinates),
    distanceMiles: null,
    durationMinutes: null,
    alternatives: [],
    isFallback: true
  }, {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' }
  });
}