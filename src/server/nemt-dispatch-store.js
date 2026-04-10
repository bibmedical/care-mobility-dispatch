import { readFile } from 'fs/promises';
import { getLocalDateKey, normalizeDispatchThreadRecord, normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState } from '@/server/dispatch-history-store';
import { query, queryOne, withTransaction } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

let ensureDispatchSchemaPromise = null;
let lastKnownDispatchState = null;

const DISPATCH_STORAGE_FILE = getStorageFilePath('nemt-dispatch.json');

const ensureDispatchSchema = async () => {
  if (ensureDispatchSchemaPromise) return ensureDispatchSchemaPromise;
  ensureDispatchSchemaPromise = runMigrations().catch(error => {
    ensureDispatchSchemaPromise = null;
    throw error;
  });
  return ensureDispatchSchemaPromise;
};

const readLocalDispatchState = async () => {
  try {
    const raw = await readFile(DISPATCH_STORAGE_FILE, 'utf8');
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
    filePath: DISPATCH_STORAGE_FILE,
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
  } catch {
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
  } catch {
    const state = await readLocalDispatchState();
    return state.dispatchThreads.map(normalizeDispatchThreadRecord);
  }
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

export const writeNemtDispatchState = async (nextState, options = {}) => {
  const normalized = normalizePersistentDispatchState(nextState);
  const allowPrune = options?.allowPrune === true;

  try {
    await ensureDispatchSchema();
  } catch {
    const localState = await writeLocalDispatchState(normalized);
    if (hasMeaningfulDispatchData(localState)) {
      lastKnownDispatchState = localState;
    }
    return localState;
  }

  const archiveResult = await withTransaction(async client => {
    const { nextState: activeState } = await archiveDispatchState(normalized, { queryExecutor: client });

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
    } else if (allowPrune) {
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
    } else if (allowPrune) {
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
      } else {
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
      } else {
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
      } else {
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
  } catch {
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
  } catch {
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
    await writeNemtDispatchState(nextState, { allowPrune: true });
  }
  return { state: nextState, archivedDates, archiveSummaries };
};
