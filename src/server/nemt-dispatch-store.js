import { readFile } from 'fs/promises';
import { getLocalDateKey, normalizeDispatchThreadRecord, normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState } from '@/server/dispatch-history-store';
import { query, queryOne, withTransaction } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production';

let ensureDispatchSchemaPromise = null;
let lastKnownDispatchState = null;

const getDispatchStorageFile = () => getStorageFilePath('nemt-dispatch.json');

const ensureDispatchSchema = async () => {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for dispatch store access.');
  }
  if (ensureDispatchSchemaPromise) return ensureDispatchSchemaPromise;
  ensureDispatchSchemaPromise = runMigrations().catch(error => {
    ensureDispatchSchemaPromise = null;
    throw error;
  });
  return ensureDispatchSchemaPromise;
};

const readLocalDispatchState = async () => {
  try {
    const raw = await readFile(getDispatchStorageFile(), 'utf8');
    return normalizePersistentDispatchState(JSON.parse(raw));
  } catch {
    return normalizePersistentDispatchState({});
  }
};

const hasMeaningfulDispatchData = state => {
  const normalized = normalizePersistentDispatchState(state || {});
  return normalized.trips.length > 0
    || normalized.routePlans.length > 0
    || normalized.dispatchThreads.length > 0
    || normalized.dailyDrivers.length > 0
    || normalized.auditLog.length > 0;
};

const writeLocalDispatchState = async nextState => {
  const normalized = normalizePersistentDispatchState(nextState);
  await writeJsonFileWithSnapshots({
    filePath: getDispatchStorageFile(),
    nextValue: normalized,
    backupName: 'nemt-dispatch-local'
  });
  return normalized;
};

// ─── READ ─────────────────────────────────────────────────────────────────────

export const readNemtDispatchState = async (options = {}) => {
  try {
    await ensureDispatchSchema();
    const includePastDates = options?.includePastDates === true;
    const prefsStateRow = await queryOne(`SELECT data FROM dispatch_ui_prefs WHERE id = 'singleton'`);
    const timeZone = prefsStateRow?.data?.timeZone;
    const todayKey = getLocalDateKey(new Date(), timeZone);
    const [tripsRes, routesRes, threadsRes, ddRes, auditRes, prefsRow] = await Promise.all([
      includePastDates
        ? query(`SELECT data FROM dispatch_trips ORDER BY updated_at DESC`)
        : query(`SELECT data FROM dispatch_trips WHERE service_date >= $1 ORDER BY updated_at DESC LIMIT 500`, [todayKey]),
      includePastDates
        ? query(`SELECT data FROM dispatch_route_plans ORDER BY updated_at DESC`)
        : query(`SELECT data FROM dispatch_route_plans WHERE service_date >= $1 ORDER BY updated_at DESC LIMIT 100`, [todayKey]),
      includePastDates
        ? query(`SELECT data FROM dispatch_threads ORDER BY driver_id`)
        : query(`SELECT data FROM dispatch_threads ORDER BY driver_id LIMIT 100`),
      includePastDates
        ? query(`SELECT data FROM dispatch_daily_drivers ORDER BY created_at DESC`)
        : query(`SELECT data FROM dispatch_daily_drivers ORDER BY created_at DESC LIMIT 50`),
      includePastDates
        ? query(`SELECT data FROM dispatch_audit_log ORDER BY occurred_at DESC`)
        : query(`SELECT data FROM dispatch_audit_log ORDER BY occurred_at DESC LIMIT 100`),
      Promise.resolve(prefsStateRow)
    ]);

    const nextState = normalizePersistentDispatchState({
      trips: tripsRes.rows.map(r => r.data),
      routePlans: routesRes.rows.map(r => r.data),
      dispatchThreads: threadsRes.rows.map(r => r.data),
      dailyDrivers: ddRes.rows.map(r => r.data),
      auditLog: auditRes.rows.map(r => r.data),
      uiPreferences: prefsRow?.data ?? {}
    });
    if (hasMeaningfulDispatchData(nextState)) {
      lastKnownDispatchState = nextState;
    }
    return nextState;
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const localState = await readLocalDispatchState();
    if (hasMeaningfulDispatchData(localState)) {
      lastKnownDispatchState = localState;
      return localState;
    }
    if (lastKnownDispatchState) {
      return lastKnownDispatchState;
    }
    return localState;
  }
};

export const readNemtDispatchThreads = async () => {
  try {
    await ensureDispatchSchema();
    const res = await query(`SELECT data FROM dispatch_threads ORDER BY driver_id LIMIT 500`);
    return res.rows.map(r => r.data).map(normalizeDispatchThreadRecord);
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const state = await readLocalDispatchState();
    return state.dispatchThreads.map(normalizeDispatchThreadRecord);
  }
};

export const readNemtDispatchThreadByDriverId = async driverId => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return null;

  try {
    await ensureDispatchSchema();
    const res = await query(`SELECT data FROM dispatch_threads WHERE driver_id = $1 LIMIT 1`, [normalizedDriverId]);
    const thread = res.rows[0]?.data || null;
    return thread ? normalizeDispatchThreadRecord(thread) : null;
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const state = await readLocalDispatchState();
    return state.dispatchThreads.map(normalizeDispatchThreadRecord).find(thread => String(thread?.driverId || '').trim() === normalizedDriverId) || null;
  }
};

export const readAssignedTripsForDriverByServiceDates = async ({ driverId, serviceDateKeys = [] }) => {
  const normalizedDriverId = String(driverId || '').trim();
  const normalizedServiceDateKeys = Array.from(new Set((Array.isArray(serviceDateKeys) ? serviceDateKeys : []).map(value => String(value || '').trim()).filter(Boolean)));
  if (!normalizedDriverId || normalizedServiceDateKeys.length === 0) return [];

  try {
    await ensureDispatchSchema();
    const res = await query(
      `SELECT data
       FROM dispatch_trips
       WHERE service_date = ANY($1::text[])
         AND ((data->>'driverId') = $2 OR (data->>'secondaryDriverId') = $2)
       ORDER BY updated_at DESC`,
      [normalizedServiceDateKeys, normalizedDriverId]
    );
    return res.rows.map(row => row.data);
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const state = await readLocalDispatchState();
    return (Array.isArray(state?.trips) ? state.trips : []).filter(trip => {
      const serviceDateKey = getLocalDateKey(new Date(trip?.serviceDate || trip?.rawServiceDate || trip?.date || 0));
      const primaryDriverId = String(trip?.driverId || '').trim();
      const secondaryDriverId = String(trip?.secondaryDriverId || '').trim();
      return normalizedServiceDateKeys.includes(String(trip?.serviceDate || trip?.rawServiceDate || '').trim() || serviceDateKey)
        && (primaryDriverId === normalizedDriverId || secondaryDriverId === normalizedDriverId);
    });
  }
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

export const writeNemtDispatchState = async (nextState, options = {}) => {
  const normalized = normalizePersistentDispatchState(nextState);
  const allowPrune = options?.allowPrune !== false;
  const allowDestructiveEmptyPrune = options?.allowDestructiveEmptyPrune === true;

  try {
    await ensureDispatchSchema();
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const localState = await writeLocalDispatchState(normalized);
    if (hasMeaningfulDispatchData(localState)) {
      lastKnownDispatchState = localState;
    }
    return localState;
  }

  const archiveResult = await withTransaction(async client => {
    const { nextState: activeState } = await archiveDispatchState(normalized, { queryExecutor: client });
    const [tripCountRow, routeCountRow, threadCountRow, dailyDriverCountRow, auditCountRow] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS count FROM dispatch_trips`),
      client.query(`SELECT COUNT(*)::int AS count FROM dispatch_route_plans`),
      client.query(`SELECT COUNT(*)::int AS count FROM dispatch_threads`),
      client.query(`SELECT COUNT(*)::int AS count FROM dispatch_daily_drivers`),
      client.query(`SELECT COUNT(*)::int AS count FROM dispatch_audit_log`)
    ]);
    const existingTripCount = Number(tripCountRow.rows[0]?.count || 0);
    const existingRouteCount = Number(routeCountRow.rows[0]?.count || 0);
    const existingThreadCount = Number(threadCountRow.rows[0]?.count || 0);
    const existingDailyDriverCount = Number(dailyDriverCountRow.rows[0]?.count || 0);
    const existingAuditCount = Number(auditCountRow.rows[0]?.count || 0);

    // ── trips: bulk upsert, keep newest by updatedAt ──────────────────────────
    if (activeState.trips.length > 0) {
      await client.query(
        `INSERT INTO dispatch_trips (id, service_date, broker_trip_id, data, updated_at)
         SELECT
           t.data->>'id',
           COALESCE(t.data->>'serviceDate', t.data->>'rawServiceDate', ''),
           COALESCE(t.data->>'brokerTripId', ''),
           t.data,
           NOW()
         FROM json_array_elements($1::json) AS t(data)
         WHERE t.data->>'id' IS NOT NULL AND t.data->>'id' != ''
         ON CONFLICT (id) DO UPDATE SET
           data = CASE
             WHEN (EXCLUDED.data->>'updatedAt')::bigint >= COALESCE((dispatch_trips.data->>'updatedAt')::bigint, 0)
             THEN EXCLUDED.data
             ELSE dispatch_trips.data
           END,
           service_date = EXCLUDED.service_date,
           broker_trip_id = EXCLUDED.broker_trip_id,
           updated_at = NOW()`,
        [JSON.stringify(activeState.trips)]
      );
      if (allowPrune) {
        const tripIds = activeState.trips.map(t => t.id);
        await client.query(`DELETE FROM dispatch_trips WHERE id != ALL($1::text[])`, [tripIds]);
      }
    } else if (allowPrune && (allowDestructiveEmptyPrune || existingTripCount === 0)) {
      await client.query(`DELETE FROM dispatch_trips`);
    }

    // ── route plans: bulk upsert ───────────────────────────────────────────────
    if (activeState.routePlans.length > 0) {
      await client.query(
        `INSERT INTO dispatch_route_plans (id, service_date, data, updated_at)
         SELECT
           t.data->>'id',
           COALESCE(t.data->>'serviceDate', t.data->>'routeDate', t.data->>'date', ''),
           t.data,
           NOW()
         FROM json_array_elements($1::json) AS t(data)
         WHERE t.data->>'id' IS NOT NULL AND t.data->>'id' != ''
         ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, service_date=EXCLUDED.service_date, updated_at=NOW()`,
        [JSON.stringify(activeState.routePlans)]
      );
      if (allowPrune) {
        const planIds = activeState.routePlans.map(p => p.id);
        await client.query(`DELETE FROM dispatch_route_plans WHERE id != ALL($1::text[])`, [planIds]);
      }
    } else if (allowPrune && (allowDestructiveEmptyPrune || existingRouteCount === 0)) {
      await client.query(`DELETE FROM dispatch_route_plans`);
    }

    // ── threads: upsert per driver ─────────────────────────────────────────────
    for (const thread of activeState.dispatchThreads) {
      if (!thread?.driverId) continue;
      await client.query(
        `INSERT INTO dispatch_threads (driver_id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (driver_id) DO UPDATE SET data=$2, updated_at=NOW()`,
        [thread.driverId, thread]
      );
    }
    if (allowPrune) {
      const threadDriverIds = activeState.dispatchThreads.map(thread => String(thread?.driverId || '').trim()).filter(Boolean);
      if (threadDriverIds.length > 0) {
        await client.query(`DELETE FROM dispatch_threads WHERE driver_id != ALL($1::text[])`, [threadDriverIds]);
      } else if (allowDestructiveEmptyPrune || existingThreadCount === 0) {
        await client.query(`DELETE FROM dispatch_threads`);
      }
    }

    // ── daily drivers: upsert ─────────────────────────────────────────────────
    for (const dd of activeState.dailyDrivers) {
      if (!dd?.id) continue;
      await client.query(
        `INSERT INTO dispatch_daily_drivers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2`,
        [dd.id, dd]
      );
    }
    if (allowPrune) {
      const dailyDriverIds = activeState.dailyDrivers.map(dd => String(dd?.id || '').trim()).filter(Boolean);
      if (dailyDriverIds.length > 0) {
        await client.query(`DELETE FROM dispatch_daily_drivers WHERE id != ALL($1::text[])`, [dailyDriverIds]);
      } else if (allowDestructiveEmptyPrune || existingDailyDriverCount === 0) {
        await client.query(`DELETE FROM dispatch_daily_drivers`);
      }
    }

    // ── audit log: insert only new entries ────────────────────────────────────
    for (const entry of activeState.auditLog) {
      if (!entry?.id) continue;
      await client.query(
        `INSERT INTO dispatch_audit_log (id, data, occurred_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, occurred_at = NOW()`,
        [entry.id, entry]
      );
    }
    if (allowPrune) {
      const auditIds = activeState.auditLog.map(entry => String(entry?.id || '').trim()).filter(Boolean);
      if (auditIds.length > 0) {
        await client.query(`DELETE FROM dispatch_audit_log WHERE id != ALL($1::text[])`, [auditIds]);
      } else if (allowDestructiveEmptyPrune || existingAuditCount === 0) {
        await client.query(`DELETE FROM dispatch_audit_log`);
      }
    }

    // ── UI preferences ────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO dispatch_ui_prefs (id, data, updated_at) VALUES ('singleton', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data=$1, updated_at=NOW()`,
      [activeState.uiPreferences ?? {}]
    );

    return activeState;
  });

  if (hasMeaningfulDispatchData(archiveResult)) {
    lastKnownDispatchState = archiveResult;
  }
  return archiveResult;
};

// ─── DRIVER TRIP UPDATE (mobile) ──────────────────────────────────────────────
// ─── DRIVER THREAD UPSERT (atomic — mobile incoming message) ─────────────────

export const upsertIncomingDriverThreadMessage = async (driverId, message) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) throw new Error('driverId is required');
  try {
    await ensureDispatchSchema();
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const state = await readLocalDispatchState();
    const existing = state.dispatchThreads.find(thread => String(thread?.driverId || '').trim() === normalizedDriverId) || { driverId: normalizedDriverId, messages: [] };
    const existingMessages = Array.isArray(existing.messages) ? existing.messages : [];
    const messageId = String(message?.id || '').trim();
    if (messageId && existingMessages.some(item => String(item?.id || '').trim() === messageId)) {
      return { ok: true, duplicate: true };
    }
    const nextThreads = state.dispatchThreads.filter(thread => String(thread?.driverId || '').trim() !== normalizedDriverId);
    nextThreads.push({ ...existing, messages: [...existingMessages, message] });
    await writeLocalDispatchState({ ...state, dispatchThreads: nextThreads });
    return { ok: true, duplicate: false };
  }
  return withTransaction(async client => {
    const res = await client.query(
      `SELECT data FROM dispatch_threads WHERE driver_id = $1 FOR UPDATE`,
      [normalizedDriverId]
    );
    const existing = res.rows[0]?.data ?? { driverId: normalizedDriverId, messages: [] };
    const existingMessages = Array.isArray(existing.messages) ? existing.messages : [];
    const messageId = String(message?.id || '').trim();
    if (messageId && existingMessages.some(m => String(m?.id || '').trim() === messageId)) {
      return { ok: true, duplicate: true };
    }
    const nextThread = { ...existing, messages: [...existingMessages, message] };
    await client.query(
      `INSERT INTO dispatch_threads (driver_id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (driver_id) DO UPDATE SET data=$2, updated_at=NOW()`,
      [normalizedDriverId, nextThread]
    );
    return { ok: true, duplicate: false };
  });
};

// ─── DRIVER TRIP UPDATE (mobile) ──────────────────────────────────────────────

export const updateTripStatusForDriver = async ({ driverId, tripId, patch }) => {
  try {
    await ensureDispatchSchema();
  } catch (error) {
    if (!shouldUseLocalFallback()) {
      throw error;
    }
    const state = await readLocalDispatchState();
    const normalizedDriverId = String(driverId || '').trim();
    const normalizedTripId = String(tripId || '').trim();
    const currentTrip = state.trips.find(trip => String(trip?.id || '').trim() === normalizedTripId);
    if (!currentTrip) return { ok: false, reason: 'not-found' };
    const tripDriverId = String(currentTrip?.driverId || '').trim();
    const tripSecondaryDriverId = String(currentTrip?.secondaryDriverId || '').trim();
    if (tripDriverId !== normalizedDriverId && tripSecondaryDriverId !== normalizedDriverId) {
      return { ok: false, reason: 'forbidden' };
    }
    const nextTrips = state.trips.map(trip => String(trip?.id || '').trim() === normalizedTripId ? { ...trip, ...patch } : trip);
    await writeLocalDispatchState({ ...state, trips: nextTrips });
    return { ok: true };
  }
  return withTransaction(async client => {
    const result = await client.query(`SELECT data FROM dispatch_trips WHERE id = $1 FOR UPDATE`, [String(tripId || '').trim()]);
    if (!result.rows.length) return { ok: false, reason: 'not-found' };
    const trip = result.rows[0].data;
    const tripDriverId = String(trip?.driverId || '').trim();
    const tripSecondaryDriverId = String(trip?.secondaryDriverId || '').trim();
    const normalizedDriverId = String(driverId || '').trim();
    if (tripDriverId !== normalizedDriverId && tripSecondaryDriverId !== normalizedDriverId) {
      return { ok: false, reason: 'forbidden' };
    }
    const updatedTrip = { ...trip, ...patch };
    await client.query(
      `UPDATE dispatch_trips SET data=$1, updated_at=NOW() WHERE id=$2`,
      [updatedTrip, String(tripId || '').trim()]
    );
    return { ok: true };
  });
};

// ─── ARCHIVE MAINTENANCE ──────────────────────────────────────────────────────

export const runDispatchArchiveMaintenance = async () => {
  const currentState = await readNemtDispatchState({ includePastDates: true });
  const { nextState, archivedDates, archiveSummaries } = await archiveDispatchState(currentState);
  if (archivedDates.length > 0) {
    await writeNemtDispatchState(nextState, { allowPrune: true, allowDestructiveEmptyPrune: true });
  }
  return { state: nextState, archivedDates, archiveSummaries };
};
