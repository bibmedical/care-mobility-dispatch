import { normalizeDispatchThreadRecord, normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState } from '@/server/dispatch-history-store';
import { query, queryOne, withTransaction } from '@/server/db';
import { runMigrations } from '@/server/db-schema';

let ensureDispatchSchemaPromise = null;

const ensureDispatchSchema = async () => {
  if (ensureDispatchSchemaPromise) return ensureDispatchSchemaPromise;
  ensureDispatchSchemaPromise = runMigrations().catch(error => {
    ensureDispatchSchemaPromise = null;
    throw error;
  });
  return ensureDispatchSchemaPromise;
};

// ─── READ ─────────────────────────────────────────────────────────────────────

export const readNemtDispatchState = async () => {
  await ensureDispatchSchema();
  // Get today's date key to filter recent data only
  const todayKey = new Date().toISOString().split('T')[0];
  const [tripsRes, routesRes, threadsRes, ddRes, auditRes, prefsRow] = await Promise.all([
    query(`SELECT data FROM dispatch_trips WHERE service_date >= $1 ORDER BY updated_at DESC LIMIT 5000`, [todayKey]),
    query(`SELECT data FROM dispatch_route_plans WHERE service_date >= $1 ORDER BY updated_at DESC LIMIT 1000`, [todayKey]),
    query(`SELECT data FROM dispatch_threads ORDER BY driver_id LIMIT 500`),
    query(`SELECT data FROM dispatch_daily_drivers ORDER BY created_at DESC LIMIT 100`),
    query(`SELECT data FROM dispatch_audit_log ORDER BY occurred_at DESC LIMIT 500`),
    queryOne(`SELECT data FROM dispatch_ui_prefs WHERE id = 'singleton'`)
  ]);

  return normalizePersistentDispatchState({
    trips: tripsRes.rows.map(r => r.data),
    routePlans: routesRes.rows.map(r => r.data),
    dispatchThreads: threadsRes.rows.map(r => r.data),
    dailyDrivers: ddRes.rows.map(r => r.data),
    auditLog: auditRes.rows.map(r => r.data),
    uiPreferences: prefsRow?.data ?? {}
  });
};

export const readNemtDispatchThreads = async () => {
  await ensureDispatchSchema();
  const res = await query(`SELECT data FROM dispatch_threads ORDER BY driver_id LIMIT 500`);
  return res.rows.map(r => r.data).map(normalizeDispatchThreadRecord);
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

export const writeNemtDispatchState = async nextState => {
  await ensureDispatchSchema();
  const normalized = normalizePersistentDispatchState(nextState);

  await withTransaction(async client => {
    // ── trips: bulk upsert, keep newest by updatedAt ──────────────────────────
    if (normalized.trips.length > 0) {
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
        [JSON.stringify(normalized.trips)]
      );
      // remove trips not in this save
      const tripIds = normalized.trips.map(t => t.id);
      await client.query(`DELETE FROM dispatch_trips WHERE id != ALL($1::text[])`, [tripIds]);
    } else {
      await client.query(`DELETE FROM dispatch_trips`);
    }

    // ── route plans: bulk upsert ───────────────────────────────────────────────
    if (normalized.routePlans.length > 0) {
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
        [JSON.stringify(normalized.routePlans)]
      );
      const planIds = normalized.routePlans.map(p => p.id);
      await client.query(`DELETE FROM dispatch_route_plans WHERE id != ALL($1::text[])`, [planIds]);
    } else {
      await client.query(`DELETE FROM dispatch_route_plans`);
    }

    // ── threads: upsert per driver ─────────────────────────────────────────────
    for (const thread of normalized.dispatchThreads) {
      if (!thread?.driverId) continue;
      await client.query(
        `INSERT INTO dispatch_threads (driver_id, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (driver_id) DO UPDATE SET data=$2, updated_at=NOW()`,
        [thread.driverId, thread]
      );
    }

    // ── daily drivers: upsert ─────────────────────────────────────────────────
    for (const dd of normalized.dailyDrivers) {
      if (!dd?.id) continue;
      await client.query(
        `INSERT INTO dispatch_daily_drivers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2`,
        [dd.id, dd]
      );
    }

    // ── audit log: insert only new entries ────────────────────────────────────
    for (const entry of normalized.auditLog) {
      if (!entry?.id) continue;
      await client.query(
        `INSERT INTO dispatch_audit_log (id, data, occurred_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO NOTHING`,
        [entry.id, entry]
      );
    }

    // ── UI preferences ────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO dispatch_ui_prefs (id, data, updated_at) VALUES ('singleton', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data=$1, updated_at=NOW()`,
      [normalized.uiPreferences ?? {}]
    );
  });

  return normalized;
};

// ─── DRIVER TRIP UPDATE (mobile) ──────────────────────────────────────────────

export const updateTripStatusForDriver = async ({ driverId, tripId, patch }) => {
  await ensureDispatchSchema();
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
  const currentState = await readNemtDispatchState();
  const { nextState, archivedDates, archiveSummaries } = await archiveDispatchState(currentState);
  if (archivedDates.length > 0) {
    await writeNemtDispatchState(nextState);
  }
  return { state: nextState, archivedDates, archiveSummaries };
};
