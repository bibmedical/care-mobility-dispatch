import { getLocalDateKey, normalizeDispatchThreadRecord, normalizePersistentDispatchState, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState, readDispatchHistoryArchive } from '@/server/dispatch-history-store';
import { query, queryOne, withTransaction } from '@/server/db';
import { runMigrations } from '@/server/db-schema';

const DEFAULT_RECENT_PAST_DAYS = 30;

const normalizeDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()) ? String(value || '').trim() : '';

const buildDispatchWindowDateKeys = (centerDateKey, pastDays = 0, futureDays = 0) => {
  const normalizedCenterDateKey = normalizeDateKey(centerDateKey);
  if (!normalizedCenterDateKey) return [];

  const safePastDays = Math.max(Number(pastDays) || 0, 0);
  const safeFutureDays = Math.max(Number(futureDays) || 0, 0);
  return Array.from({ length: safePastDays + safeFutureDays + 1 }, (_, index) => shiftTripDateKey(normalizedCenterDateKey, index - safePastDays)).filter(Boolean);
};

const mergeUniqueItems = (items, getKey, chooseNextItem) => {
  const itemMap = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = String(getKey(item) || '').trim();
    if (!key) continue;
    const existingItem = itemMap.get(key);
    itemMap.set(key, existingItem ? chooseNextItem(existingItem, item) : item);
  }

  return Array.from(itemMap.values());
};

const mergeDispatchThreads = threads => {
  const threadMap = new Map();

  for (const thread of Array.isArray(threads) ? threads : []) {
    const normalizedThread = normalizeDispatchThreadRecord(thread);
    const driverId = String(normalizedThread?.driverId || '').trim();
    if (!driverId) continue;
    const existingThread = threadMap.get(driverId) || { driverId, messages: [] };
    const messageMap = new Map((Array.isArray(existingThread.messages) ? existingThread.messages : []).map(message => [String(message?.id || '').trim(), message]));

    for (const message of Array.isArray(normalizedThread.messages) ? normalizedThread.messages : []) {
      const messageId = String(message?.id || '').trim();
      if (!messageId) continue;
      messageMap.set(messageId, message);
    }

    threadMap.set(driverId, {
      driverId,
      messages: Array.from(messageMap.values()).sort((left, right) => String(left?.timestamp || '').localeCompare(String(right?.timestamp || '')))
    });
  }

  return Array.from(threadMap.values());
};

const mergeDispatchStatePayloads = (liveState, archivedStates = []) => {
  const archivedPayloads = (Array.isArray(archivedStates) ? archivedStates : []).filter(Boolean);
  if (archivedPayloads.length === 0) return liveState;

  const mergedTrips = mergeUniqueItems(
    [...archivedPayloads.flatMap(state => state?.trips || []), ...(liveState?.trips || [])],
    trip => trip?.id,
    (currentTrip, nextTrip) => ((Number(nextTrip?.updatedAt) || 0) >= (Number(currentTrip?.updatedAt) || 0) ? nextTrip : currentTrip)
  );
  const mergedRoutePlans = mergeUniqueItems(
    [...archivedPayloads.flatMap(state => state?.routePlans || []), ...(liveState?.routePlans || [])],
    routePlan => routePlan?.id,
    (_, nextRoutePlan) => nextRoutePlan
  );
  const mergedDailyDrivers = mergeUniqueItems(
    [...archivedPayloads.flatMap(state => state?.dailyDrivers || []), ...(liveState?.dailyDrivers || [])],
    driver => driver?.id,
    (_, nextDriver) => nextDriver
  );
  const mergedAuditLog = mergeUniqueItems(
    [...archivedPayloads.flatMap(state => state?.auditLog || []), ...(liveState?.auditLog || [])],
    entry => entry?.id,
    (_, nextEntry) => nextEntry
  );

  return normalizePersistentDispatchState({
    ...liveState,
    trips: mergedTrips,
    routePlans: mergedRoutePlans,
    dispatchThreads: mergeDispatchThreads([...archivedPayloads.flatMap(state => state?.dispatchThreads || []), ...(liveState?.dispatchThreads || [])]),
    dailyDrivers: mergedDailyDrivers,
    auditLog: mergedAuditLog,
    uiPreferences: liveState?.uiPreferences || {}
  });
};

const loadRecentArchivedDispatchStates = async (todayKey, recentPastDays) => {
  const safeRecentPastDays = Math.max(Number(recentPastDays) || 0, 0);
  if (!todayKey || safeRecentPastDays <= 0) return [];

  const archivePromises = Array.from({ length: safeRecentPastDays }, (_, index) => readDispatchHistoryArchive(shiftTripDateKey(todayKey, -(index + 1))));
  const archiveStates = await Promise.all(archivePromises);
  return archiveStates.filter(Boolean);
};

const loadDispatchWindowArchivedStates = async dateKeys => {
  const normalizedDateKeys = Array.from(new Set((Array.isArray(dateKeys) ? dateKeys : []).map(normalizeDateKey).filter(Boolean)));
  if (normalizedDateKeys.length === 0) return [];

  const archiveStates = await Promise.all(normalizedDateKeys.map(dateKey => readDispatchHistoryArchive(dateKey)));
  return archiveStates.filter(Boolean);
};

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());

let ensureDispatchSchemaPromise = null;

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

// ─── READ ─────────────────────────────────────────────────────────────────────

export const readNemtDispatchState = async (options = {}) => {
  await ensureDispatchSchema();
  const includePastDates = options?.includePastDates === true;
  const recentPastDays = includePastDates ? 0 : Math.max(Number(options?.recentPastDays ?? DEFAULT_RECENT_PAST_DAYS) || 0, 0);
  const prefsStateRow = await queryOne(`SELECT data FROM dispatch_ui_prefs WHERE id = 'singleton'`);
  const timeZone = prefsStateRow?.data?.timeZone;
  const todayKey = getLocalDateKey(new Date(), timeZone);
  const requestedDateKey = normalizeDateKey(options?.dateKey);
  const hasScopedWindow = !includePastDates && (Boolean(requestedDateKey) || options?.windowPastDays != null || options?.windowFutureDays != null);
  const scopedDateKeys = hasScopedWindow
    ? buildDispatchWindowDateKeys(requestedDateKey || todayKey, Number(options?.windowPastDays ?? 0), Number(options?.windowFutureDays ?? 0))
    : [];
  let [tripsRes, routesRes, threadsRes, ddRes, auditRes, prefsRow] = await Promise.all([
    includePastDates
      ? query(`SELECT data FROM dispatch_trips ORDER BY updated_at DESC`)
      : hasScopedWindow
        ? query(`SELECT data FROM dispatch_trips WHERE service_date = ANY($1::text[]) OR COALESCE(service_date, '') = '' ORDER BY updated_at DESC`, [scopedDateKeys])
        : query(`SELECT data FROM dispatch_trips ORDER BY updated_at DESC`),
    includePastDates
      ? query(`SELECT data FROM dispatch_route_plans ORDER BY updated_at DESC`)
      : hasScopedWindow
        ? query(`SELECT data FROM dispatch_route_plans WHERE service_date = ANY($1::text[]) OR COALESCE(service_date, '') = '' ORDER BY updated_at DESC`, [scopedDateKeys])
        : query(`SELECT data FROM dispatch_route_plans ORDER BY updated_at DESC`),
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

  if (!includePastDates && !hasScopedWindow && tripsRes.rows.length === 0 && routesRes.rows.length === 0) {
    const latestServiceDateRow = await queryOne(
      `SELECT MAX(service_date) AS service_date
       FROM (
         SELECT service_date FROM dispatch_trips
         UNION ALL
         SELECT service_date FROM dispatch_route_plans
       ) AS dispatch_dates`
    );
    const latestServiceDate = String(latestServiceDateRow?.service_date || '').trim();

    if (latestServiceDate) {
      [tripsRes, routesRes] = await Promise.all([
        query(`SELECT data FROM dispatch_trips WHERE service_date = $1 ORDER BY updated_at DESC`, [latestServiceDate]),
        query(`SELECT data FROM dispatch_route_plans WHERE service_date = $1 ORDER BY updated_at DESC`, [latestServiceDate])
      ]);
    }
  }

  const liveState = normalizePersistentDispatchState({
    trips: tripsRes.rows.map(r => r.data),
    routePlans: routesRes.rows.map(r => r.data),
    dispatchThreads: threadsRes.rows.map(r => r.data),
    dailyDrivers: ddRes.rows.map(r => r.data),
    auditLog: auditRes.rows.map(r => r.data),
    uiPreferences: prefsRow?.data ?? {}
  });

  const archivedStates = hasScopedWindow
    ? await loadDispatchWindowArchivedStates(scopedDateKeys)
    : await loadRecentArchivedDispatchStates(todayKey, recentPastDays);
  return mergeDispatchStatePayloads(liveState, archivedStates);
};

export const readNemtDispatchThreads = async () => {
  await ensureDispatchSchema();
  const res = await query(`SELECT data FROM dispatch_threads ORDER BY driver_id LIMIT 500`);
  return res.rows.map(r => r.data).map(normalizeDispatchThreadRecord);
};

export const readNemtDispatchThreadByDriverId = async driverId => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return null;

  await ensureDispatchSchema();
  const res = await query(`SELECT data FROM dispatch_threads WHERE driver_id = $1 LIMIT 1`, [normalizedDriverId]);
  const thread = res.rows[0]?.data || null;
  return thread ? normalizeDispatchThreadRecord(thread) : null;
};

export const readAssignedTripsForDriverByServiceDates = async ({ driverId, serviceDateKeys = [] }) => {
  const normalizedDriverId = String(driverId || '').trim();
  const normalizedServiceDateKeys = Array.from(new Set((Array.isArray(serviceDateKeys) ? serviceDateKeys : []).map(value => String(value || '').trim()).filter(Boolean)));
  if (!normalizedDriverId || normalizedServiceDateKeys.length === 0) return [];

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
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

export const writeNemtDispatchState = async (nextState, options = {}) => {
  const normalized = normalizePersistentDispatchState(nextState);
  const allowPrune = options?.allowPrune === true || options?.allowTripShrink === true;
  const allowDestructiveEmptyPrune = options?.allowDestructiveEmptyPrune === true;

  await ensureDispatchSchema();

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

  return archiveResult;
};

// ─── DRIVER TRIP UPDATE (mobile) ──────────────────────────────────────────────
// ─── DRIVER THREAD UPSERT (atomic — mobile incoming message) ─────────────────

export const upsertIncomingDriverThreadMessage = async (driverId, message) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) throw new Error('driverId is required');
  await ensureDispatchSchema();
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
  const currentState = await readNemtDispatchState({ includePastDates: true });
  const { nextState, archivedDates, archiveSummaries } = await archiveDispatchState(currentState);
  if (archivedDates.length > 0) {
    await writeNemtDispatchState(nextState, { allowPrune: true, allowDestructiveEmptyPrune: true });
  }
  return { state: nextState, archivedDates, archiveSummaries };
};
