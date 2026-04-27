import { query, queryOne } from '@/server/db';
import { runMigrations } from '@/server/db-schema';

let mapTilesTablesReadyPromise = null;

const normalizeTilesetId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'default';

const toInteger = value => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const validateTileCoordinate = ({ z, x, y }) => {
  if (!Number.isInteger(z) || z < 0 || z > 30) return false;
  const maxCoord = 2 ** z;
  if (!Number.isInteger(x) || x < 0 || x >= maxCoord) return false;
  if (!Number.isInteger(y) || y < 0 || y >= maxCoord) return false;
  return true;
};

export const ensureMapTilesTables = async () => {
  if (mapTilesTablesReadyPromise) return mapTilesTablesReadyPromise;

  mapTilesTablesReadyPromise = (async () => {
    await runMigrations();
    await query(`
      CREATE TABLE IF NOT EXISTS map_tilesets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        min_zoom INTEGER NOT NULL DEFAULT 0,
        max_zoom INTEGER NOT NULL DEFAULT 0,
        format TEXT NOT NULL DEFAULT 'png',
        mime_type TEXT NOT NULL DEFAULT 'image/png',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS map_tiles (
        tileset_id TEXT NOT NULL REFERENCES map_tilesets(id) ON DELETE CASCADE,
        z INTEGER NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        tile_data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tileset_id, z, x, y)
      );

      CREATE INDEX IF NOT EXISTS idx_map_tilesets_updated_at ON map_tilesets(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_map_tiles_lookup ON map_tiles(tileset_id, z, x, y);
    `);
  })().catch(error => {
    mapTilesTablesReadyPromise = null;
    throw error;
  });

  return mapTilesTablesReadyPromise;
};

export const upsertMapTileset = async ({ id, name, minZoom = 0, maxZoom = 0, format = 'png', mimeType = 'image/png', metadata = {} }) => {
  await ensureMapTilesTables();
  const normalizedId = normalizeTilesetId(id);
  const row = await queryOne(
    `INSERT INTO map_tilesets (id, name, min_zoom, max_zoom, format, mime_type, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      min_zoom = EXCLUDED.min_zoom,
      max_zoom = EXCLUDED.max_zoom,
      format = EXCLUDED.format,
      mime_type = EXCLUDED.mime_type,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
     RETURNING id, name, min_zoom, max_zoom, format, mime_type, metadata, created_at, updated_at`,
    [
      normalizedId,
      String(name || normalizedId).trim(),
      Math.max(0, Number(minZoom) || 0),
      Math.max(0, Number(maxZoom) || 0),
      String(format || 'png').trim() || 'png',
      String(mimeType || 'image/png').trim() || 'image/png',
      JSON.stringify(metadata || {})
    ]
  );

  return row;
};

export const readMapTile = async ({ tilesetId, z, x, y }) => {
  await ensureMapTilesTables();

  const normalizedTilesetId = normalizeTilesetId(tilesetId);
  const parsedZ = toInteger(z);
  const parsedX = toInteger(x);
  const parsedY = toInteger(y);

  if (!validateTileCoordinate({ z: parsedZ, x: parsedX, y: parsedY })) {
    return null;
  }

  const row = await queryOne(
    `SELECT t.tile_data, s.mime_type
     FROM map_tiles t
     INNER JOIN map_tilesets s ON s.id = t.tileset_id
     WHERE t.tileset_id = $1 AND t.z = $2 AND t.x = $3 AND t.y = $4
     LIMIT 1`,
    [normalizedTilesetId, parsedZ, parsedX, parsedY]
  );

  if (!row?.tile_data) return null;

  return {
    mimeType: String(row.mime_type || 'image/png').trim() || 'image/png',
    tileData: row.tile_data
  };
};
