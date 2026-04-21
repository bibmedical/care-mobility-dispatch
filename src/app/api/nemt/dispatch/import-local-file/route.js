import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { enrichImportedTripsWithGeocodedPositions, parseTripImportBuffer } from '@/helpers/nemt-trip-import';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const isProduction = process.env.NODE_ENV === 'production';

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

const buildMapboxUrl = query => {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&access_token=${token}`;
};

const buildNominatimUrl = query => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;

const geocodeAddress = async query => {
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
        const center = Array.isArray(payload?.features?.[0]?.center) ? payload.features[0].center : null;
        if (center?.length === 2) return [Number(center[1]), Number(center[0])];
        continue;
      }

      const result = Array.isArray(payload) ? payload[0] : null;
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [latitude, longitude];
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