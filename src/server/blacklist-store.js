import { query } from '@/server/db';

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

const ensureTable = async () => {
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
};

export const readBlacklistState = async () => {
  await ensureTable();
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

export const writeBlacklistState = async nextState => {
  await ensureTable();
  const normalized = normalizeBlacklistState(nextState);
  await query(`DELETE FROM blacklist_entries`);
  for (const entry of normalized.entries) {
    await query(
      `INSERT INTO blacklist_entries (id, name, phone, category, status, hold_until, notes, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, phone=$3, category=$4, status=$5, hold_until=$6, notes=$7, source=$8, updated_at=$10`,
      [entry.id, entry.name, entry.phone, entry.category, entry.status, entry.holdUntil, entry.notes, entry.source, entry.createdAt, entry.updatedAt]
    );
  }
  return normalized;
};