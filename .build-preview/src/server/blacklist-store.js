import { readFile } from 'fs/promises';
import { query } from '@/server/db';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production' && !hasDatabaseUrl();
let localMigrationPromise = null;

const normalizeBlacklistEntry = value => ({
  id: String(value?.id ?? `bl-${Date.now()}`),
  name: String(value?.name ?? '').trim(),
  phone: String(value?.phone ?? '').trim(),
  category: String(value?.category ?? 'Do Not Schedule'),
  status: String(value?.status ?? 'Active'),
  holdUntil: String(value?.holdUntil ?? ''),
  notes: String(value?.notes ?? '').trim(),
  source: String(value?.source ?? 'Dispatcher'),
  createdAt: String(value?.createdAt ?? new Date().toISOString()),
  updatedAt: String(value?.updatedAt ?? new Date().toISOString())
});

const normalizeBlacklistState = value => ({
  version: 1,
  entries: Array.isArray(value?.entries) ? value.entries.map(normalizeBlacklistEntry).filter(entry => entry.name || entry.phone) : []
});

const getBlacklistStorageFile = () => getStorageFilePath('blacklist-entries.json');

const readLocalBlacklistState = async () => {
  try {
    const raw = await readFile(getBlacklistStorageFile(), 'utf8');
    return normalizeBlacklistState(JSON.parse(raw));
  } catch {
    return normalizeBlacklistState({ entries: [] });
  }
};

const writeLocalBlacklistState = async state => {
  await writeJsonFileWithSnapshots({
    filePath: getBlacklistStorageFile(),
    nextValue: state,
    backupName: 'blacklist-local'
  });
  return state;
};

const maybeMigrateLocalBlacklistToSql = async () => {
  if (!hasDatabaseUrl()) return;
  if (localMigrationPromise) return localMigrationPromise;

  localMigrationPromise = (async () => {
    const localState = await readLocalBlacklistState();
    const localEntries = Array.isArray(localState?.entries) ? localState.entries : [];
    if (localEntries.length === 0) return;

    await query(
      `INSERT INTO blacklist_entries (id, name, phone, category, status, hold_until, notes, source, created_at, updated_at)
       SELECT 
         e->>'id', e->>'name', e->>'phone', e->>'category', e->>'status',
         e->>'holdUntil', e->>'notes', e->>'source', e->>'createdAt', e->>'updatedAt'
       FROM json_array_elements($1::json) AS e
       ON CONFLICT (id) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), blacklist_entries.name),
         phone = COALESCE(NULLIF(EXCLUDED.phone, ''), blacklist_entries.phone),
         category = COALESCE(NULLIF(EXCLUDED.category, ''), blacklist_entries.category),
         status = COALESCE(NULLIF(EXCLUDED.status, ''), blacklist_entries.status),
         hold_until = COALESCE(NULLIF(EXCLUDED.hold_until, ''), blacklist_entries.hold_until),
         notes = COALESCE(NULLIF(EXCLUDED.notes, ''), blacklist_entries.notes),
         source = COALESCE(NULLIF(EXCLUDED.source, ''), blacklist_entries.source),
         updated_at = COALESCE(NULLIF(EXCLUDED.updated_at, ''), blacklist_entries.updated_at)`,
      [JSON.stringify(localEntries)]
    );
  })().catch(error => {
    localMigrationPromise = null;
    throw error;
  });

  return localMigrationPromise;
};

let tableReady = false;

const ensureTable = async () => {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for blacklist storage in production');
  }
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS blacklist_entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Do Not Schedule',
      status TEXT NOT NULL DEFAULT 'Active',
      hold_until TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'Dispatcher',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    )
  `);
  // Migration: if columns were created as TIMESTAMPTZ in a previous schema, convert to TEXT
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'blacklist_entries'
          AND column_name = 'created_at'
          AND data_type = 'timestamp with time zone'
      ) THEN
        ALTER TABLE blacklist_entries
          ALTER COLUMN created_at TYPE TEXT USING COALESCE(created_at::text, ''),
          ALTER COLUMN updated_at TYPE TEXT USING COALESCE(updated_at::text, '');
      END IF;
    END $$;
  `);
  tableReady = true;
};

export const readBlacklistState = async () => {
  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for blacklist storage in production');
    }
    return readLocalBlacklistState();
  }

  await ensureTable();
  await maybeMigrateLocalBlacklistToSql();
  const result = await query(`SELECT * FROM blacklist_entries ORDER BY created_at DESC`);
  const entries = result.rows.map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    category: r.category,
    status: r.status,
    holdUntil: r.hold_until,
    notes: r.notes,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
  return normalizeBlacklistState({ entries });
};

export const writeBlacklistState = async (nextState, options = {}) => {
  const allowDelete = options?.allowDelete === true;
  const currentState = await readBlacklistState();
  const normalized = normalizeBlacklistState(nextState);

  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for blacklist storage in production');
    }
    if (allowDelete) {
      await writeLocalBlacklistState(normalized);
      return normalized;
    }

    const mergedEntriesMap = new Map();

    currentState.entries.forEach(entry => {
      mergedEntriesMap.set(String(entry.id || ''), entry);
    });

    normalized.entries.forEach(entry => {
      mergedEntriesMap.set(String(entry.id || ''), {
        ...mergedEntriesMap.get(String(entry.id || '')),
        ...entry
      });
    });

    const mergedEntries = Array.from(mergedEntriesMap.values()).filter(entry => entry.name || entry.phone);
    const nextLocalState = normalizeBlacklistState({ entries: mergedEntries });
    await writeLocalBlacklistState(nextLocalState);
    return nextLocalState;
  }

  await ensureTable();
  await maybeMigrateLocalBlacklistToSql();

  if (allowDelete) {
    await query(`DELETE FROM blacklist_entries`);
    if (normalized.entries.length > 0) {
      const entriesJson = JSON.stringify(normalized.entries);
      await query(
        `INSERT INTO blacklist_entries (id, name, phone, category, status, hold_until, notes, source, created_at, updated_at)
         SELECT 
           e->>'id', e->>'name', e->>'phone', e->>'category', e->>'status',
           e->>'holdUntil', e->>'notes', e->>'source', e->>'createdAt', e->>'updatedAt'
         FROM json_array_elements($1::json) AS e
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, phone=EXCLUDED.phone, category=EXCLUDED.category, 
           status=EXCLUDED.status, hold_until=EXCLUDED.hold_until, notes=EXCLUDED.notes, 
           source=EXCLUDED.source, updated_at=EXCLUDED.updated_at`,
        [entriesJson]
      );
    }
    return normalized;
  }

  const mergedEntriesMap = new Map();

  currentState.entries.forEach(entry => {
    mergedEntriesMap.set(String(entry.id || ''), entry);
  });

  normalized.entries.forEach(entry => {
    mergedEntriesMap.set(String(entry.id || ''), {
      ...mergedEntriesMap.get(String(entry.id || '')),
      ...entry
    });
  });

  const mergedEntries = Array.from(mergedEntriesMap.values()).filter(entry => entry.name || entry.phone);

  if (mergedEntries.length > 0) {
    const entriesJson = JSON.stringify(mergedEntries);
    await query(
      `INSERT INTO blacklist_entries (id, name, phone, category, status, hold_until, notes, source, created_at, updated_at)
       SELECT 
         e->>'id', e->>'name', e->>'phone', e->>'category', e->>'status',
         e->>'holdUntil', e->>'notes', e->>'source', e->>'createdAt', e->>'updatedAt'
       FROM json_array_elements($1::json) AS e
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, phone=EXCLUDED.phone, category=EXCLUDED.category, 
         status=EXCLUDED.status, hold_until=EXCLUDED.hold_until, notes=EXCLUDED.notes, 
         source=EXCLUDED.source, updated_at=EXCLUDED.updated_at`,
      [entriesJson]
    );
  }
  return normalizeBlacklistState({ entries: mergedEntries });
};