#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import initSqlJs from 'sql.js';

const { Pool } = pg;

const ROOT = process.cwd();
const DEFAULT_TILESET_ID = 'orlando';
const DEFAULT_TILESET_NAME = 'Orlando Offline';
const DEFAULT_BATCH_SIZE = 1000;

const parseArgs = argv => {
  const args = argv.slice(2);

  const getArgValue = (name, fallback = '') => {
    const prefix = `--${name}=`;
    const matched = args.find(item => item.startsWith(prefix));
    if (!matched) return fallback;
    return String(matched.slice(prefix.length)).trim();
  };

  const hasFlag = name => args.includes(`--${name}`);

  return {
    filePath: getArgValue('file', ''),
    tilesetId: getArgValue('tileset', DEFAULT_TILESET_ID) || DEFAULT_TILESET_ID,
    tilesetName: getArgValue('name', DEFAULT_TILESET_NAME) || DEFAULT_TILESET_NAME,
    batchSize: Math.max(100, Number(getArgValue('batch', DEFAULT_BATCH_SIZE)) || DEFAULT_BATCH_SIZE),
    replace: !hasFlag('append')
  };
};

const parseEnvFile = async filePath => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const env = {};

    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index <= 0) return;
      const key = trimmed.slice(0, index).replace(/^export\s+/, '').trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });

    return env;
  } catch {
    return {};
  }
};

const getDatabaseUrl = async () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const localEnv = await parseEnvFile(path.join(ROOT, '.env.local'));
  return String(localEnv.DATABASE_URL || '').trim();
};

const normalizeTilesetId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || DEFAULT_TILESET_ID;

const ensureTables = async client => {
  await client.query(`
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
};

const parseMetadata = db => {
  const metadata = {};
  try {
    const rows = db.exec('SELECT name, value FROM metadata');
    const values = rows?.[0]?.values || [];
    for (const [name, value] of values) {
      metadata[String(name)] = value;
    }
  } catch {
    // Some MBTiles files might not have metadata table.
  }
  return metadata;
};

const inferMimeType = metadata => {
  const format = String(metadata?.format || 'png').trim().toLowerCase();
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  if (format === 'pbf' || format === 'mvt') return 'application/x-protobuf';
  return 'image/png';
};

const toInteger = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
};

const tmsToXyzY = (z, tileRow) => ((1 << z) - 1) - tileRow;

const insertBatch = async (client, tilesetId, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const values = [];
  const params = [];

  rows.forEach((row, index) => {
    const base = index * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(tilesetId, row.z, row.x, row.y, row.tileData);
  });

  await client.query(
    `INSERT INTO map_tiles (tileset_id, z, x, y, tile_data)
     VALUES ${values.join(', ')}
     ON CONFLICT (tileset_id, z, x, y)
     DO UPDATE SET tile_data = EXCLUDED.tile_data, updated_at = NOW()`,
    params
  );
};

const main = async () => {
  const { filePath, tilesetId, tilesetName, batchSize, replace } = parseArgs(process.argv);

  if (!filePath) {
    console.error('Usage: npm run import:mbtiles -- --file=storage/maps/orlando.mbtiles --tileset=orlando --name="Orlando Offline"');
    process.exit(1);
  }

  const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const normalizedTilesetId = normalizeTilesetId(tilesetId);

  const databaseUrl = await getDatabaseUrl();
  if (!databaseUrl) {
    console.error('DATABASE_URL is required. Set it in environment or .env.local');
    process.exit(1);
  }

  console.log(`Loading MBTiles file: ${absoluteFilePath}`);
  const fileBuffer = await fs.readFile(absoluteFilePath);

  const SQL = await initSqlJs({});
  const mbDb = new SQL.Database(new Uint8Array(fileBuffer));

  const metadata = parseMetadata(mbDb);
  const minZoom = toInteger(metadata?.minzoom || 0);
  const maxZoom = toInteger(metadata?.maxzoom || 0);
  const format = String(metadata?.format || 'png').trim().toLowerCase();
  const mimeType = inferMimeType(metadata);

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  let importedCount = 0;

  try {
    await client.query('BEGIN');
    await ensureTables(client);

    await client.query(
      `INSERT INTO map_tilesets (id, name, min_zoom, max_zoom, format, mime_type, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         min_zoom = EXCLUDED.min_zoom,
         max_zoom = EXCLUDED.max_zoom,
         format = EXCLUDED.format,
         mime_type = EXCLUDED.mime_type,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [normalizedTilesetId, tilesetName, minZoom, maxZoom, format, mimeType, JSON.stringify(metadata)]
    );

    if (replace) {
      await client.query('DELETE FROM map_tiles WHERE tileset_id = $1', [normalizedTilesetId]);
    }

    const statement = mbDb.prepare('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles');
    const pendingRows = [];

    while (statement.step()) {
      const row = statement.getAsObject();
      const z = toInteger(row.zoom_level);
      const x = toInteger(row.tile_column);
      const tileRow = toInteger(row.tile_row);
      const y = tmsToXyzY(z, tileRow);

      pendingRows.push({
        z,
        x,
        y,
        tileData: Buffer.from(row.tile_data)
      });

      if (pendingRows.length >= batchSize) {
        await insertBatch(client, normalizedTilesetId, pendingRows);
        importedCount += pendingRows.length;
        pendingRows.length = 0;
        if (importedCount % (batchSize * 10) === 0) {
          console.log(`Imported ${importedCount} tiles...`);
        }
      }
    }

    if (pendingRows.length > 0) {
      await insertBatch(client, normalizedTilesetId, pendingRows);
      importedCount += pendingRows.length;
    }

    statement.free();

    await client.query('COMMIT');

    console.log('Done.');
    console.log(`Tileset: ${normalizedTilesetId}`);
    console.log(`Tiles imported: ${importedCount}`);
    console.log(`Use URL template: /api/maps/tiles/${normalizedTilesetId}/{z}/{x}/{y}.png`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    mbDb.close();
  }
};

await main();
