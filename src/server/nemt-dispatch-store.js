import { readFile } from 'fs/promises';
import { getLocalDateKey, getRouteServiceDateKey, getTripServiceDateKey, normalizeDispatchMessageRecord, normalizeDispatchThreadRecord, normalizePersistentDispatchState, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState, createDispatchRestorePoint, readDispatchHistoryArchive, readDispatchRestorePointById } from '@/server/dispatch-history-store';
import { query, queryOne, withTransaction } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const DEFAULT_RECENT_PAST_DAYS = 30;
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production' && !hasDatabaseUrl();

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

const getNemtDispatchStorageFile = () => getStorageFilePath('nemt-dispatch.json');

const readLocalNemtDispatchState = async () => {
  try {
    const raw = await readFile(getNemtDispatchStorageFile(), 'utf8');
    return normalizePersistentDispatchState(JSON.parse(raw));
  } catch {
    return normalizePersistentDispatchState({});
  }
};

const applyScopedLocalDispatchState = (state, options = {}) => {
  const normalizedState = normalizePersistentDispatchState(state);
  const includePastDates = options?.includePastDates === true;
  const requestedDateKey = normalizeDateKey(options?.dateKey);
  const hasScopedWindow = !includePastDates && (Boolean(requestedDateKey) || options?.windowPastDays != null || options?.windowFutureDays != null);

  if (!hasScopedWindow) {
    return normalizedState;
  }

  const scopedDateKeys = new Set(buildDispatchWindowDateKeys(requestedDateKey || getLocalDateKey(new Date()), Number(options?.windowPastDays ?? 0), Number(options?.windowFutureDays ?? 0)));
  if (scopedDateKeys.size === 0) {
    return normalizedState;
  }

  const scopedTrips = normalizedState.trips.filter(trip => {
    const serviceDateKey = getTripServiceDateKey(trip);
    return !serviceDateKey || scopedDateKeys.has(serviceDateKey);
  });

  const scopedRoutePlans = normalizedState.routePlans.filter(routePlan => {
    const routeDateKey = getRouteServiceDateKey(routePlan, normalizedState.trips);
    return !routeDateKey || scopedDateKeys.has(routeDateKey);
  });

  return normalizePersistentDispatchState({
    ...normalizedState,
    trips: scopedTrips,
    routePlans: scopedRoutePlans
  });
};

const writeLocalNemtDispatchState = async nextState => {
  const normalized = normalizePersistentDispatchState(nextState);
  await writeJsonFileWithSnapshots({
    filePath: getNemtDispatchStorageFile(),
    nextValue: normalized,
    backupName: 'nemt-dispatch-local'
  });
  return normalized;
};

const mergeLocalDispatchStateForWrite = (currentState, nextState) => {
  const normalizedCurrentState = normalizePersistentDispatchState(currentState);
  const normalizedNextState = normalizePersistentDispatchState(nextState);

  return normalizePersistentDispatchState({
    ...normalizedCurrentState,
    trips: mergeUniqueItems(
      [...normalizedCurrentState.trips, ...normalizedNextState.trips],
      trip => trip?.id,
      (_, nextTrip) => nextTrip
    ),
    routePlans: mergeUniqueItems(
      [...normalizedCurrentState.routePlans, ...normalizedNextState.routePlans],
      routePlan => routePlan?.id,
      (_, nextRoutePlan) => nextRoutePlan
    ),
    dispatchThreads: mergeDispatchThreads([
      ...normalizedCurrentState.dispatchThreads,
      ...normalizedNextState.dispatchThreads
    ]),
    dailyDrivers: mergeUniqueItems(
      [...normalizedCurrentState.dailyDrivers, ...normalizedNextState.dailyDrivers],
      driver => driver?.id,
      (_, nextDriver) => nextDriver
    ),
    auditLog: mergeUniqueItems(
      [...normalizedCurrentState.auditLog, ...normalizedNextState.auditLog],
      entry => entry?.id,
      (_, nextEntry) => nextEntry
    ),
    uiPreferences: normalizedNextState.uiPreferences ?? normalizedCurrentState.uiPreferences ?? {}
  });
};

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
  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for dispatch store access.');
    }
    const localState = await readLocalNemtDispatchState();
    return applyScopedLocalDispatchState(localState, options);
  }

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
  if (!hasDatabaseUrl()) {
    const state = await readLocalNemtDispatchState();
    return (Array.isArray(state?.dispatchThreads) ? state.dispatchThreads : []).map(normalizeDispatchThreadRecord);
  }

  await ensureDispatchSchema();
  const res = await query(`SELECT data FROM dispatch_threads ORDER BY driver_id LIMIT 500`);
  return res.rows.map(r => r.data).map(normalizeDispatchThreadRecord);
};

export const readNemtDispatchThreadByDriverId = async driverId => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return null;

  if (!hasDatabaseUrl()) {
    const state = await readLocalNemtDispatchState();
    const thread = (Array.isArray(state?.dispatchThreads) ? state.dispatchThreads : []).find(item => String(item?.driverId || '').trim() === normalizedDriverId);
    return thread ? normalizeDispatchThreadRecord(thread) : null;
  }

  await ensureDispatchSchema();
  const res = await query(`SELECT data FROM dispatch_threads WHERE driver_id = $1 LIMIT 1`, [normalizedDriverId]);
  const thread = res.rows[0]?.data || null;
  return thread ? normalizeDispatchThreadRecord(thread) : null;
};

export const upsertDispatchThreadMessageByDriver = async (driverId, message) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) throw new Error('driverId is required');

  const normalizedMessage = normalizeDispatchMessageRecord(message);
  if (!normalizedMessage.text && normalizedMessage.attachments.length === 0) {
    throw new Error('message text or attachments are required');
  }

  if (!hasDatabaseUrl()) {
    const state = await readLocalNemtDispatchState();
    const existingThreads = Array.isArray(state?.dispatchThreads) ? state.dispatchThreads : [];
    const existingThread = existingThreads.find(thread => String(thread?.driverId || '').trim() === normalizedDriverId) || { driverId: normalizedDriverId, messages: [] };
    const existingMessages = Array.isArray(existingThread.messages) ? existingThread.messages : [];
    const existingIndex = existingMessages.findIndex(currentMessage => String(currentMessage?.id || '').trim() === normalizedMessage.id);
    const nextMessages = existingIndex >= 0
      ? existingMessages.map((currentMessage, index) => index === existingIndex ? normalizedMessage : currentMessage)
      : [...existingMessages, normalizedMessage];
    const nextThread = normalizeDispatchThreadRecord({
      ...existingThread,
      driverId: normalizedDriverId,
      messages: nextMessages
    });
    const nextState = normalizePersistentDispatchState({
      ...state,
      dispatchThreads: existingThreads.some(thread => String(thread?.driverId || '').trim() === normalizedDriverId)
        ? existingThreads.map(thread => String(thread?.driverId || '').trim() === normalizedDriverId ? nextThread : thread)
        : [...existingThreads, nextThread]
    });
    await writeLocalNemtDispatchState(nextState);
    return nextThread;
  }

  await ensureDispatchSchema();
  return withTransaction(async client => {
    const res = await client.query(
      `SELECT data FROM dispatch_threads WHERE driver_id = $1 FOR UPDATE`,
      [normalizedDriverId]
    );
    const existing = res.rows[0]?.data ?? { driverId: normalizedDriverId, messages: [] };
    const existingMessages = Array.isArray(existing.messages) ? existing.messages : [];
    const existingIndex = existingMessages.findIndex(currentMessage => String(currentMessage?.id || '').trim() === normalizedMessage.id);
    const nextMessages = existingIndex >= 0
      ? existingMessages.map((currentMessage, index) => index === existingIndex ? normalizedMessage : currentMessage)
      : [...existingMessages, normalizedMessage];
    const nextThread = normalizeDispatchThreadRecord({
      ...existing,
      driverId: normalizedDriverId,
      messages: nextMessages
    });

    await client.query(
      `INSERT INTO dispatch_threads (driver_id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (driver_id) DO UPDATE SET data=$2, updated_at=NOW()`,
      [normalizedDriverId, nextThread]
    );
    return nextThread;
  });
};

export const readAssignedTripsForDriverByServiceDates = async ({ driverId, serviceDateKeys = [] }) => {
  const normalizedDriverId = String(driverId || '').trim();
  const normalizedServiceDateKeys = Array.from(new Set((Array.isArray(serviceDateKeys) ? serviceDateKeys : []).map(value => String(value || '').trim()).filter(Boolean)));
  if (!normalizedDriverId || normalizedServiceDateKeys.length === 0) return [];

  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for dispatch store access.');
    }

    const state = await readLocalNemtDispatchState();
    return (Array.isArray(state?.trips) ? state.trips : []).filter(trip => {
      const serviceDate = String(trip?.serviceDate || trip?.rawServiceDate || '').trim();
      return normalizedServiceDateKeys.includes(serviceDate)
        && (String(trip?.driverId || '').trim() === normalizedDriverId || String(trip?.secondaryDriverId || '').trim() === normalizedDriverId);
    });
  }

  await ensureDispatchSchema();
  const res = await query(
    `SELECT data
     FROM dispatch_trips
     WHERE (service_date = ANY($1::text[]) OR COALESCE(service_date, '') = '')
       AND ((data->>'driverId') = $2 OR (data->>'secondaryDriverId') = $2)
     ORDER BY updated_at DESC`,
    [normalizedServiceDateKeys, normalizedDriverId]
  );
  return res.rows.map(row => row.data).filter(trip => normalizedServiceDateKeys.includes(getTripServiceDateKey(trip)));
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

export const writeNemtDispatchState = async (nextState, options = {}) => {
  const normalized = normalizePersistentDispatchState(nextState);
  const allowPrune = options?.allowPrune === true || options?.allowTripShrink === true;
  const allowScopedTripShrink = options?.allowTripShrink === true;
  const allowDestructiveEmptyPrune = options?.allowDestructiveEmptyPrune === true;
  const pruneScopeDateKeys = allowScopedTripShrink
    ? buildDispatchWindowDateKeys(
      normalizeDateKey(options?.pruneDateKey),
      Number(options?.pruneWindowPastDays ?? 0),
      Number(options?.pruneWindowFutureDays ?? 0)
    )
    : [];

  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for dispatch store access.');
    }
    if (allowPrune) {
      return await writeLocalNemtDispatchState(normalized);
    }

    const currentLocalState = await readLocalNemtDispatchState();
    const mergedLocalState = mergeLocalDispatchStateForWrite(currentLocalState, normalized);
    return await writeLocalNemtDispatchState(mergedLocalState);
  }

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
           data = EXCLUDED.data,
           service_date = EXCLUDED.service_date,
           broker_trip_id = EXCLUDED.broker_trip_id,
           updated_at = NOW()
         WHERE COALESCE((EXCLUDED.data->>'updatedAt')::bigint, 0) >= COALESCE((dispatch_trips.data->>'updatedAt')::bigint, 0)`,
        [JSON.stringify(activeState.trips)]
      );
      if (allowPrune) {
        const tripIds = activeState.trips.map(t => t.id);
        if (allowScopedTripShrink && pruneScopeDateKeys.length > 0) {
          await client.query(
            `DELETE FROM dispatch_trips WHERE service_date = ANY($1::text[]) AND id != ALL($2::text[])`,
            [pruneScopeDateKeys, tripIds]
          );
        } else {
          await client.query(`DELETE FROM dispatch_trips WHERE id != ALL($1::text[])`, [tripIds]);
        }
      }
    } else if (allowPrune && (allowDestructiveEmptyPrune || existingTripCount === 0 || (allowScopedTripShrink && pruneScopeDateKeys.length > 0))) {
      if (allowScopedTripShrink && pruneScopeDateKeys.length > 0) {
        await client.query(`DELETE FROM dispatch_trips WHERE service_date = ANY($1::text[])`, [pruneScopeDateKeys]);
      } else {
        await client.query(`DELETE FROM dispatch_trips`);
      }
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
        if (allowScopedTripShrink && pruneScopeDateKeys.length > 0) {
          await client.query(
            `DELETE FROM dispatch_route_plans WHERE service_date = ANY($1::text[]) AND id != ALL($2::text[])`,
            [pruneScopeDateKeys, planIds]
          );
        } else {
          await client.query(`DELETE FROM dispatch_route_plans WHERE id != ALL($1::text[])`, [planIds]);
        }
      }
    } else if (allowPrune && (allowDestructiveEmptyPrune || existingRouteCount === 0 || (allowScopedTripShrink && pruneScopeDateKeys.length > 0))) {
      if (allowScopedTripShrink && pruneScopeDateKeys.length > 0) {
        await client.query(`DELETE FROM dispatch_route_plans WHERE service_date = ANY($1::text[])`, [pruneScopeDateKeys]);
      } else {
        await client.query(`DELETE FROM dispatch_route_plans`);
      }
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
    if (allowPrune && !allowScopedTripShrink) {
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
    if (allowPrune && !allowScopedTripShrink) {
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
    if (allowPrune && !allowScopedTripShrink) {
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

    // ── restore points: automatic snapshots every ~4h per active service date ─
    const restorePointDateKeys = new Set();
    activeState.trips.forEach(trip => {
      const dateKey = String(getTripServiceDateKey(trip) || '').trim();
      if (dateKey) restorePointDateKeys.add(dateKey);
    });
    activeState.routePlans.forEach(routePlan => {
      const dateKey = String(getRouteServiceDateKey(routePlan, activeState.trips) || '').trim();
      if (dateKey) restorePointDateKeys.add(dateKey);
    });
    for (const dateKey of restorePointDateKeys) {
      await createDispatchRestorePoint({
        serviceDateKey: dateKey,
        state: activeState,
        reason: 'auto-4h',
        force: false,
        intervalHours: 4
      }, {
        queryExecutor: client
      });
    }

    return activeState;
  });

  return archiveResult;
};

// ─── DRIVER TRIP UPDATE (mobile) ──────────────────────────────────────────────
// ─── DRIVER THREAD UPSERT (atomic — mobile incoming message) ─────────────────

export const upsertIncomingDriverThreadMessage = async (driverId, message) => {
  const messageId = String(message?.id || '').trim();
  const existingThread = messageId ? await readNemtDispatchThreadByDriverId(driverId) : null;
  const existingMessages = Array.isArray(existingThread?.messages) ? existingThread.messages : [];
  if (messageId && existingMessages.some(currentMessage => String(currentMessage?.id || '').trim() === messageId)) {
    return { ok: true, duplicate: true };
  }
  await upsertDispatchThreadMessageByDriver(driverId, message);
  return { ok: true, duplicate: false };
};

// ─── DRIVER TRIP UPDATE (mobile) ──────────────────────────────────────────────

const normalizeAssignmentValue = value => String(value ?? '').trim().toLowerCase();

const buildDriverAssignmentCandidates = ({ driverId, driverName, driverCode }) => ({
  driverId: String(driverId || '').trim(),
  textCandidates: new Set([driverName, driverCode].map(normalizeAssignmentValue).filter(Boolean))
});

const tripMatchesDriverAssignment = (trip, driverMatch) => {
  const normalizedDriverId = String(driverMatch?.driverId || '').trim();
  const textCandidates = driverMatch?.textCandidates instanceof Set ? driverMatch.textCandidates : new Set();
  if (normalizedDriverId && (String(trip?.driverId || '').trim() === normalizedDriverId || String(trip?.secondaryDriverId || '').trim() === normalizedDriverId)) {
    return true;
  }

  const tripTextCandidates = [
    trip?.driverName,
    trip?.secondaryDriverName,
    trip?.importedDriverName,
    trip?.driver,
    trip?.assignedDriver,
    trip?.assignedDriverName
  ].map(normalizeAssignmentValue).filter(Boolean);

  return tripTextCandidates.some(value => textCandidates.has(value));
};

export const updateTripStatusForDriver = async ({ driverId, driverName = '', driverCode = '', tripId, patch }) => {
  if (!hasDatabaseUrl()) {
    const driverMatch = buildDriverAssignmentCandidates({ driverId, driverName, driverCode });
    const normalizedTripId = String(tripId || '').trim();
    const state = await readLocalNemtDispatchState();
    const currentTrips = Array.isArray(state?.trips) ? state.trips : [];
    const existingTrip = currentTrips.find(trip => String(trip?.id || '').trim() === normalizedTripId);
    if (!existingTrip) return { ok: false, reason: 'not-found' };
    if (!tripMatchesDriverAssignment(existingTrip, driverMatch)) {
      return { ok: false, reason: 'forbidden' };
    }
    const nextState = normalizePersistentDispatchState({
      ...state,
      trips: currentTrips.map(trip => String(trip?.id || '').trim() === normalizedTripId ? { ...trip, ...patch } : trip)
    });
    await writeLocalNemtDispatchState(nextState);
    return { ok: true };
  }

  await ensureDispatchSchema();
  return withTransaction(async client => {
    const result = await client.query(`SELECT data FROM dispatch_trips WHERE id = $1 FOR UPDATE`, [String(tripId || '').trim()]);
    if (!result.rows.length) return { ok: false, reason: 'not-found' };
    const trip = result.rows[0].data;
    const driverMatch = buildDriverAssignmentCandidates({ driverId, driverName, driverCode });
    if (!tripMatchesDriverAssignment(trip, driverMatch)) {
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

export const restoreDispatchDayFromRestorePoint = async ({ restorePointId, actorName = '' } = {}) => {
  const restorePoint = await readDispatchRestorePointById(restorePointId);
  if (!restorePoint) {
    throw new Error('Restore point not found');
  }

  const currentState = await readNemtDispatchState({ includePastDates: true });
  const serviceDateKey = String(restorePoint.serviceDateKey || '').trim();
  const restoreSnapshot = normalizePersistentDispatchState(restorePoint.snapshot || {});

  const keepTrips = (Array.isArray(currentState?.trips) ? currentState.trips : []).filter(trip => String(getTripServiceDateKey(trip) || '').trim() !== serviceDateKey);
  const keepRoutePlans = (Array.isArray(currentState?.routePlans) ? currentState.routePlans : []).filter(routePlan => String(getRouteServiceDateKey(routePlan, currentState?.trips) || '').trim() !== serviceDateKey);

  const nextAuditLog = [
    ...((Array.isArray(currentState?.auditLog) ? currentState.auditLog : [])),
    {
      id: `restore-point-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: 'restore-day-from-point',
      entityType: 'dispatch',
      entityId: serviceDateKey,
      source: 'dispatcher-history',
      timestamp: new Date().toISOString(),
      summary: `Restored ${serviceDateKey} from restore point #${restorePoint.id}`,
      metadata: {
        restorePointId: restorePoint.id,
        serviceDateKey,
        actorName: String(actorName || '').trim()
      }
    }
  ];

  const nextState = normalizePersistentDispatchState({
    ...currentState,
    trips: [...keepTrips, ...(Array.isArray(restoreSnapshot?.trips) ? restoreSnapshot.trips : [])],
    routePlans: [...keepRoutePlans, ...(Array.isArray(restoreSnapshot?.routePlans) ? restoreSnapshot.routePlans : [])],
    dispatchThreads: Array.isArray(currentState?.dispatchThreads) ? currentState.dispatchThreads : [],
    dailyDrivers: Array.isArray(currentState?.dailyDrivers) ? currentState.dailyDrivers : [],
    auditLog: nextAuditLog
  });

  await writeNemtDispatchState(nextState, {
    allowTripShrink: true,
    allowPrune: true,
    pruneDateKey: serviceDateKey,
    pruneWindowPastDays: 0,
    pruneWindowFutureDays: 0,
    allowDestructiveEmptyPrune: true
  });

  return {
    ok: true,
    restorePointId: restorePoint.id,
    serviceDateKey,
    tripCount: Array.isArray(restoreSnapshot?.trips) ? restoreSnapshot.trips.length : 0,
    routeCount: Array.isArray(restoreSnapshot?.routePlans) ? restoreSnapshot.routePlans.length : 0
  };
};
