import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { enrichImportedTripsWithGeocodedPositions, parseTripImportBuffer } from '@/helpers/nemt-trip-import';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const isProduction = process.env.NODE_ENV === 'production';
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
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&country=us&access_token=${token}`;
};

const normalizeCandidatePath = rawValue => path.normalize(String(rawValue || '').trim());

const getAllowedRoots = () => {
  const homeDir = os.homedir();
  return [
    process.cwd(),
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Documents')
  ].map(entry => path.normalize(entry));
};

const isPathAllowed = absolutePath => {
  const normalizedAbsolutePath = path.normalize(absolutePath).toLowerCase();
  return getAllowedRoots().some(rootPath => normalizedAbsolutePath.startsWith(rootPath.toLowerCase()));
};

const buildNominatimUrl = query => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=us&q=${encodeURIComponent(query)}`;
const buildCensusUrl = query => `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`;

const geocodeAddress = async query => {
  const providers = [{
    name: 'mapbox',
    url: buildMapboxUrl(query)
  }, {
    name: 'census',
    url: buildCensusUrl(query)
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
        if (isLikelyUsCoordinate(coordinates)) return coordinates;
        continue;
      }

      if (provider.name === 'census') {
        const match = payload?.result?.addressMatches?.[0];
        const coordinates = [Number(match?.coordinates?.y), Number(match?.coordinates?.x)];
        if (isLikelyUsCoordinate(coordinates)) return coordinates;
        continue;
      }

      const result = Array.isArray(payload) ? payload[0] : null;
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      const coordinates = [latitude, longitude];
      if (isLikelyUsCoordinate(coordinates)) return coordinates;
    } catch {
      // Try next provider.
    }
  }

  return null;
};

export async function POST(request) {
  if (isProduction) {
    return NextResponse.json({ error: 'Local file path import is disabled in production. Upload the file from your device instead.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const candidatePath = normalizeCandidatePath(body?.path);

    if (!candidatePath) {
      return NextResponse.json({ error: 'Missing local file path.' }, { status: 400 });
    }

    if (!path.isAbsolute(candidatePath)) {
      return NextResponse.json({ error: 'Use a full local path.' }, { status: 400 });
    }

    const extension = path.extname(candidatePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: 'Only .csv, .xlsx, and .xls files are allowed.' }, { status: 400 });
    }

    if (!isPathAllowed(candidatePath)) {
      return NextResponse.json({ error: 'That path is outside the allowed local folders.' }, { status: 403 });
    }

    const fileBuffer = await readFile(candidatePath);
    const parsedImport = parseTripImportBuffer(fileBuffer);
    const trips = await enrichImportedTripsWithGeocodedPositions(parsedImport.trips, geocodeAddress);
    return NextResponse.json({
      ...parsedImport,
      trips
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Could not read the local file.' }, { status: 500 });
  }
}