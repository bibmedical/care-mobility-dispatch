import { NextResponse } from 'next/server';
import { readMapTile } from '@/server/map-tiles-store';

const parseCoordinate = value => {
  const raw = String(value || '').trim();
  const withoutExt = raw.includes('.') ? raw.slice(0, raw.indexOf('.')) : raw;
  const parsed = Number(withoutExt);
  return Number.isInteger(parsed) ? parsed : null;
};

export async function GET(_request, context) {
  try {
    const params = context?.params || {};
    const tileset = String(params.tileset || '').trim() || 'default';
    const z = parseCoordinate(params.z);
    const x = parseCoordinate(params.x);
    const y = parseCoordinate(params.y);

    if (z === null || x === null || y === null) {
      return NextResponse.json({ error: 'Invalid tile coordinates.' }, { status: 400 });
    }

    const tile = await readMapTile({
      tilesetId: tileset,
      z,
      x,
      y
    });

    if (!tile) {
      return new Response('Tile not found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=60'
        }
      });
    }

    return new Response(tile.tileData, {
      status: 200,
      headers: {
        'Content-Type': tile.mimeType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to read tile.'
    }, { status: 500 });
  }
}
