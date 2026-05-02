import { readFile } from 'fs/promises';
import { query } from '@/server/db';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production' && !hasDatabaseUrl();

const getStorageFile = () => getStorageFilePath('driver-trip-requests.json');

let tableReady = false;
let localMigrationPromise = null;

const ensureTable = async () => {
  if (tableReady) return;
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for trip request storage in production');
  }

  await query(`
    CREATE TABLE IF NOT EXISTS driver_trip_requests (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      driver_id TEXT,
      requested_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_driver_trip_requests_status ON driver_trip_requests(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_driver_trip_requests_driver_id ON driver_trip_requests(driver_id)`);

  tableReady = true;
};

const sanitizeText = (value, max = 500) => String(value || '').trim().slice(0, max);

const normalizeRequest = value => ({
  id: sanitizeText(value?.id, 120),
  driverId: sanitizeText(value?.driverId, 120),
  driverName: sanitizeText(value?.driverName, 200),
  passengerName: sanitizeText(value?.passengerName, 200),
  passengerPhone: sanitizeText(value?.passengerPhone, 80),
  pickupAddress: sanitizeText(value?.pickupAddress, 500),
  dropoffAddress: sanitizeText(value?.dropoffAddress, 500),
  requestedDate: sanitizeText(value?.requestedDate, 40),
  requestedTime: sanitizeText(value?.requestedTime, 40),
  notes: sanitizeText(value?.notes, 1200),
  requestedAt: sanitizeText(value?.requestedAt, 80) || new Date().toISOString(),
  status: ['pending', 'approved', 'rejected', 'created'].includes(sanitizeText(value?.status, 20).toLowerCase())
    ? sanitizeText(value?.status, 20).toLowerCase()
    : 'created',
  reviewedAt: sanitizeText(value?.reviewedAt, 80),
  reviewedBy: sanitizeText(value?.reviewedBy, 120),
  reviewNote: sanitizeText(value?.reviewNote, 1000),
  linkedTripId: sanitizeText(value?.linkedTripId, 120)
});

const readLocalRequests = async () => {
  try {
    const raw = await readFile(getStorageFile(), 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.requests) ? parsed.requests : [];
    return rows.map(normalizeRequest).filter(row => row.id);
  } catch {
    return [];
  }
};

const writeLocalRequests = async requests => {
  await writeJsonFileWithSnapshots({
    filePath: getStorageFile(),
    nextValue: requests,
    backupName: 'driver-trip-requests-local'
  });
  return requests;
};

const maybeMigrateLocalRequestsToSql = async () => {
  if (!hasDatabaseUrl()) return;
  if (localMigrationPromise) return localMigrationPromise;

  localMigrationPromise = (async () => {
    const localRows = await readLocalRequests();
    if (!localRows.length) return;

    for (const row of localRows) {
      await query(
        `INSERT INTO driver_trip_requests (id, status, driver_id, requested_at, reviewed_at, data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           driver_id = EXCLUDED.driver_id,
           requested_at = EXCLUDED.requested_at,
           reviewed_at = EXCLUDED.reviewed_at,
           data = EXCLUDED.data,
           updated_at = NOW()`,
        [
          row.id,
          row.status,
          row.driverId || null,
          row.requestedAt ? new Date(row.requestedAt) : new Date(),
          row.reviewedAt ? new Date(row.reviewedAt) : null,
          JSON.stringify(row)
        ]
      );
    }
  })().catch(error => {
    localMigrationPromise = null;
    throw error;
  });

  return localMigrationPromise;
};

export const listDriverTripRequests = async (status = 'pending') => {
  const normalizedStatus = sanitizeText(status, 20).toLowerCase();

  try {
    await ensureTable();
    await maybeMigrateLocalRequestsToSql();
    const result = normalizedStatus === 'all'
      ? await query(`SELECT data FROM driver_trip_requests ORDER BY requested_at DESC NULLS LAST, updated_at DESC`)
      : await query(`SELECT data FROM driver_trip_requests WHERE status = $1 ORDER BY requested_at DESC NULLS LAST, updated_at DESC`, [normalizedStatus]);
    return result.rows.map(row => normalizeRequest(row.data)).filter(row => row.id);
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const rows = await readLocalRequests();
    return normalizedStatus === 'all' ? rows : rows.filter(row => row.status === normalizedStatus);
  }
};

export const getDriverTripRequestById = async requestId => {
  const normalizedId = sanitizeText(requestId, 120);
  if (!normalizedId) return null;

  try {
    await ensureTable();
    await maybeMigrateLocalRequestsToSql();
    const result = await query(`SELECT data FROM driver_trip_requests WHERE id = $1 LIMIT 1`, [normalizedId]);
    const row = result.rows[0]?.data;
    return row ? normalizeRequest(row) : null;
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const rows = await readLocalRequests();
    return rows.find(row => row.id === normalizedId) || null;
  }
};

export const upsertDriverTripRequest = async requestRow => {
  const normalized = normalizeRequest(requestRow);
  if (!normalized.id) throw new Error('id is required');

  try {
    await ensureTable();
    await maybeMigrateLocalRequestsToSql();
    await query(
      `INSERT INTO driver_trip_requests (id, status, driver_id, requested_at, reviewed_at, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         driver_id = EXCLUDED.driver_id,
         requested_at = EXCLUDED.requested_at,
         reviewed_at = EXCLUDED.reviewed_at,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [
        normalized.id,
        normalized.status,
        normalized.driverId || null,
        normalized.requestedAt ? new Date(normalized.requestedAt) : new Date(),
        normalized.reviewedAt ? new Date(normalized.reviewedAt) : null,
        JSON.stringify(normalized)
      ]
    );
    return normalized;
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const rows = await readLocalRequests();
    const nextRows = rows.some(row => row.id === normalized.id)
      ? rows.map(row => row.id === normalized.id ? normalized : row)
      : [normalized, ...rows];
    await writeLocalRequests(nextRows);
    return normalized;
  }
};
