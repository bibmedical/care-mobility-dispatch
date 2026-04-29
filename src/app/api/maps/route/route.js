import { NextResponse } from 'next/server';

const MAX_ROUTE_COORDINATES = 60;
const EARTH_RADIUS_MILES = 3958.8;
const FALLBACK_SPEED_MPH = 28;
const OSRM_REQUEST_TIMEOUT_MS = 6000;

const toCoordinatePairs = value => String(value ?? '').split(';').map(pair => pair.trim()).filter(Boolean).map(pair => {
  const [latitudeValue, longitudeValue] = pair.split(',').map(item => Number(item.trim()));
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) return null;
  return [latitudeValue, longitudeValue];
}).filter(Boolean);

const toMiles = meters => Number.isFinite(meters) ? meters / 1609.344 : null;
const toMinutes = seconds => Number.isFinite(seconds) ? seconds / 60 : null;

const toRadians = value => value * (Math.PI / 180);

const getSegmentDistanceMiles = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return null;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getPathDistanceMiles = coordinates => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  let totalMiles = 0;
  let hasSegment = false;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segmentMiles = getSegmentDistanceMiles(coordinates[index], coordinates[index + 1]);
    if (!Number.isFinite(segmentMiles)) continue;
    totalMiles += segmentMiles;
    hasSegment = true;
  }
  return hasSegment ? totalMiles : null;
};

const estimateDurationMinutesFromMiles = miles => Number.isFinite(miles) && miles >= 0 ? Math.max(1, Math.round(miles / FALLBACK_SPEED_MPH * 60)) : null;

const buildFallbackGeometry = coordinates => coordinates.map(([latitude, longitude]) => [latitude, longitude]);

const buildOsrmUrl = (coordinates, includeAlternatives = false) => {
  const coordinateQuery = coordinates.map(([latitude, longitude]) => `${longitude},${latitude}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${coordinateQuery}?alternatives=${includeAlternatives ? 'true' : 'false'}&geometries=geojson&overview=full&steps=false`;
};

const readOsrmRoutes = async url => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, OSRM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: abortController.signal
    });
    if (!response.ok) return [];

    const payload = await response.json();
    return Array.isArray(payload?.routes) ? payload.routes : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

const toRouteGeometry = route => Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]) : [];

const buildSegmentedRoute = async coordinates => {
  const geometry = [];
  let distanceMeters = 0;
  let durationSeconds = 0;
  let hasDistance = true;
  let hasDuration = true;
  let usedFallbackSegment = false;
  let estimatedDistanceMiles = 0;
  let estimatedDurationMinutes = 0;

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
        estimatedDistanceMiles += toMiles(route.distance) || 0;
      } else {
        hasDistance = false;
        const fallbackSegmentMiles = getPathDistanceMiles(segmentCoordinates);
        if (Number.isFinite(fallbackSegmentMiles)) {
          estimatedDistanceMiles += fallbackSegmentMiles;
        }
      }
      if (Number.isFinite(route?.duration)) {
        durationSeconds += route.duration;
        estimatedDurationMinutes += toMinutes(route.duration) || 0;
      } else {
        hasDuration = false;
        const fallbackSegmentMinutes = estimateDurationMinutesFromMiles(getPathDistanceMiles(segmentCoordinates));
        if (Number.isFinite(fallbackSegmentMinutes)) {
          estimatedDurationMinutes += fallbackSegmentMinutes;
        }
      }
      continue;
    }

    usedFallbackSegment = true;
    hasDistance = false;
    hasDuration = false;
    const fallbackSegmentMiles = getPathDistanceMiles(segmentCoordinates);
    if (Number.isFinite(fallbackSegmentMiles)) {
      estimatedDistanceMiles += fallbackSegmentMiles;
      estimatedDurationMinutes += estimateDurationMinutesFromMiles(fallbackSegmentMiles) || 0;
    }
    const fallbackGeometry = buildFallbackGeometry(segmentCoordinates);
    if (geometry.length > 0) {
      geometry.push(...fallbackGeometry.slice(1));
    } else {
      geometry.push(...fallbackGeometry);
    }
  }

  return {
    geometry,
    distanceMiles: hasDistance ? toMiles(distanceMeters) : estimatedDistanceMiles > 0 ? estimatedDistanceMiles : getPathDistanceMiles(coordinates),
    durationMinutes: hasDuration ? toMinutes(durationSeconds) : estimatedDurationMinutes > 0 ? estimatedDurationMinutes : estimateDurationMinutesFromMiles(getPathDistanceMiles(coordinates)),
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

  if (coordinates.length > MAX_ROUTE_COORDINATES) {
    const fallbackMiles = getPathDistanceMiles(coordinates);
    return NextResponse.json({
      provider: 'fallback-capped',
      geometry: buildFallbackGeometry(coordinates),
      distanceMiles: fallbackMiles,
      durationMinutes: estimateDurationMinutesFromMiles(fallbackMiles),
      alternatives: [],
      isFallback: true,
      warning: `Route request exceeded ${MAX_ROUTE_COORDINATES} coordinates.`
    }, {
      headers: { 'Cache-Control': 'no-store' }
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
        distanceMiles: Number.isFinite(item?.distance) ? toMiles(item.distance) : getPathDistanceMiles(toRouteGeometry(item)),
        durationMinutes: Number.isFinite(item?.duration) ? toMinutes(item.duration) : estimateDurationMinutesFromMiles(getPathDistanceMiles(toRouteGeometry(item)))
      })).filter(item => item.geometry.length > 1);

      const routeDistanceMiles = Number.isFinite(route?.distance) ? toMiles(route.distance) : getPathDistanceMiles(geometry);
      const routeDurationMinutes = Number.isFinite(route?.duration) ? toMinutes(route.duration) : estimateDurationMinutesFromMiles(routeDistanceMiles);

      return NextResponse.json({
        provider: provider.name,
        geometry,
        distanceMiles: routeDistanceMiles,
        durationMinutes: routeDurationMinutes,
        alternatives,
        isFallback: false
      }, {
        headers: { 'Cache-Control': 'no-store' }
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
        headers: { 'Cache-Control': 'no-store' }
      });
    }
  } catch {
    // Use the straight-line fallback below.
  }

  return NextResponse.json({
    provider: 'fallback',
    geometry: buildFallbackGeometry(coordinates),
    distanceMiles: getPathDistanceMiles(coordinates),
    durationMinutes: estimateDurationMinutesFromMiles(getPathDistanceMiles(coordinates)),
    alternatives: [],
    isFallback: true
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}