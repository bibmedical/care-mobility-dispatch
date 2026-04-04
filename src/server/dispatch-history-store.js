import {
  getLocalDateKey,
  getRouteServiceDateKey,
  getTripTimelineDateKey,
  normalizeDailyDriverRecord,
  normalizeDispatchAuditRecord,
  normalizeDispatchMessageRecord,
  normalizeDispatchThreadRecord,
  normalizePersistentDispatchState,
  normalizeRoutePlanRecord,
  normalizeTripRecord
} from '@/helpers/nemt-dispatch-state';
import { query } from '@/server/db';

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS dispatch_daily_archives (
      archive_date   TEXT PRIMARY KEY,
      data           JSONB NOT NULL DEFAULT '{}'::jsonb,
      trip_count     INTEGER NOT NULL DEFAULT 0,
      route_count    INTEGER NOT NULL DEFAULT 0,
      thread_count   INTEGER NOT NULL DEFAULT 0,
      message_count  INTEGER NOT NULL DEFAULT 0,
      audit_count    INTEGER NOT NULL DEFAULT 0,
      archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_dispatch_daily_archives_archived_at ON dispatch_daily_archives(archived_at DESC)`);
};

const compareDateKeys = (left, right) => String(left || '').localeCompare(String(right || ''));

const createEmptyArchiveDay = dateKey => ({
  dateKey,
  trips: [],
  routePlans: [],
  dispatchThreads: [],
  dailyDrivers: [],
  auditLog: [],
  uiPreferences: {}
});

const hasArchiveContent = archive => {
  if (!archive) return false;
  return (archive.trips?.length || 0) > 0 || (archive.routePlans?.length || 0) > 0 || (archive.dispatchThreads?.length || 0) > 0 || (archive.dailyDrivers?.length || 0) > 0 || (archive.auditLog?.length || 0) > 0;
};

const getArchiveBucket = (archiveMap, dateKey, uiPreferences) => {
  if (!archiveMap.has(dateKey)) {
    archiveMap.set(dateKey, createEmptyArchiveDay(dateKey));
  }
  const archive = archiveMap.get(dateKey);
  archive.uiPreferences = {
    ...(archive.uiPreferences || {}),
    ...(uiPreferences || {})
  };
  return archive;
};

const getTimestampDateKey = (value, timeZone) => {
  const dateKey = getLocalDateKey(value, timeZone);
  return dateKey || '';
};

const dedupeTrips = items => {
  const tripMap = new Map();

  (Array.isArray(items) ? items : []).forEach(item => {
    const normalizedTrip = normalizeTripRecord(item);
    const tripId = String(normalizedTrip?.id || '').trim();
    if (!tripId) return;
    const existingTrip = tripMap.get(tripId);
    if (!existingTrip) {
      tripMap.set(tripId, normalizedTrip);
      return;
    }
    const existingUpdatedAt = Number(existingTrip?.updatedAt) || 0;
    const nextUpdatedAt = Number(normalizedTrip?.updatedAt) || 0;
    tripMap.set(tripId, nextUpdatedAt >= existingUpdatedAt ? normalizedTrip : existingTrip);
  });

  return Array.from(tripMap.values());
};

const dedupeRoutePlans = items => {
  const routeMap = new Map();

  (Array.isArray(items) ? items : []).forEach(item => {
    const normalizedRoute = normalizeRoutePlanRecord(item);
    const routeId = String(normalizedRoute?.id || '').trim();
    if (!routeId) return;
    routeMap.set(routeId, {
      ...(routeMap.get(routeId) || {}),
      ...normalizedRoute,
      tripIds: Array.from(new Set([...(Array.isArray(routeMap.get(routeId)?.tripIds) ? routeMap.get(routeId).tripIds : []), ...(Array.isArray(normalizedRoute?.tripIds) ? normalizedRoute.tripIds : [])].map(value => String(value || '').trim()).filter(Boolean)))
    });
  });

  return Array.from(routeMap.values());
};

const dedupeDispatchThreads = items => {
  const threadMap = new Map();

  (Array.isArray(items) ? items : []).forEach(item => {
    const normalizedThread = normalizeDispatchThreadRecord(item);
    const driverId = String(normalizedThread?.driverId || '').trim();
    if (!driverId) return;
    const existingThread = threadMap.get(driverId) || { driverId, messages: [] };
    const messageMap = new Map((Array.isArray(existingThread.messages) ? existingThread.messages : []).map(message => [String(message?.id || '').trim(), message]));

    (Array.isArray(normalizedThread.messages) ? normalizedThread.messages : []).forEach(message => {
      const normalizedMessage = normalizeDispatchMessageRecord(message);
      const messageId = String(normalizedMessage?.id || '').trim();
      if (!messageId) return;
      messageMap.set(messageId, normalizedMessage);
    });

    threadMap.set(driverId, {
      driverId,
      messages: Array.from(messageMap.values()).sort((left, right) => String(left?.timestamp || '').localeCompare(String(right?.timestamp || '')))
    });
  });

  return Array.from(threadMap.values()).filter(thread => thread.driverId && thread.messages.length > 0);
};

const dedupeDailyDrivers = items => {
  const driverMap = new Map();

  (Array.isArray(items) ? items : []).forEach(item => {
    const normalizedDriver = normalizeDailyDriverRecord(item);
    const driverId = String(normalizedDriver?.id || '').trim();
    if (!driverId) return;
    driverMap.set(driverId, normalizedDriver);
  });

  return Array.from(driverMap.values());
};

const dedupeAuditLog = items => {
  const auditMap = new Map();

  (Array.isArray(items) ? items : []).forEach(item => {
    const normalizedEntry = normalizeDispatchAuditRecord(item);
    const entryId = String(normalizedEntry?.id || '').trim();
    if (!entryId) return;
    auditMap.set(entryId, normalizedEntry);
  });

  return Array.from(auditMap.values()).sort((left, right) => String(left?.timestamp || '').localeCompare(String(right?.timestamp || '')));
};

const countMessages = dispatchThreads => (Array.isArray(dispatchThreads) ? dispatchThreads : []).reduce((sum, thread) => sum + ((Array.isArray(thread?.messages) ? thread.messages.length : 0)), 0);

const buildArchiveSummary = archive => ({
  dateKey: archive?.dateKey || '',
  tripCount: Array.isArray(archive?.trips) ? archive.trips.length : 0,
  routeCount: Array.isArray(archive?.routePlans) ? archive.routePlans.length : 0,
  threadCount: Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads.length : 0,
  messageCount: countMessages(archive?.dispatchThreads),
  auditCount: Array.isArray(archive?.auditLog) ? archive.auditLog.length : 0
});

const mergeArchivePayload = (existingArchive, incomingArchive) => {
  const existingState = normalizePersistentDispatchState(existingArchive || {});
  const incomingState = normalizePersistentDispatchState(incomingArchive || {});
  return normalizePersistentDispatchState({
    ...existingState,
    trips: dedupeTrips([...(existingState.trips || []), ...(incomingState.trips || [])]),
    routePlans: dedupeRoutePlans([...(existingState.routePlans || []), ...(incomingState.routePlans || [])]),
    dispatchThreads: dedupeDispatchThreads([...(existingState.dispatchThreads || []), ...(incomingState.dispatchThreads || [])]),
    dailyDrivers: dedupeDailyDrivers([...(existingState.dailyDrivers || []), ...(incomingState.dailyDrivers || [])]),
    auditLog: dedupeAuditLog([...(existingState.auditLog || []), ...(incomingState.auditLog || [])]),
    uiPreferences: {
      ...(existingState.uiPreferences || {}),
      ...(incomingState.uiPreferences || {})
    }
  });
};

export const partitionDispatchStateForArchive = (state, options = {}) => {
  const normalizedState = normalizePersistentDispatchState(state || {});
  const timeZone = normalizedState?.uiPreferences?.timeZone;
  const todayDateKey = String(options?.todayDateKey || getLocalDateKey(new Date(), timeZone)).trim();

  if (!todayDateKey) {
    return {
      todayDateKey: '',
      archiveDays: [],
      nextState: normalizedState
    };
  }

  const archiveMap = new Map();
  const nextTrips = [];
  const nextRoutePlans = [];
  const nextDispatchThreads = [];
  const nextDailyDrivers = [];
  const nextAuditLog = [];
  const currentTrips = Array.isArray(normalizedState?.trips) ? normalizedState.trips : [];
  const currentRoutePlans = Array.isArray(normalizedState?.routePlans) ? normalizedState.routePlans : [];

  currentTrips.forEach(trip => {
    const dateKey = getTripTimelineDateKey(trip, currentRoutePlans, currentTrips);
    if (dateKey && compareDateKeys(dateKey, todayDateKey) < 0) {
      getArchiveBucket(archiveMap, dateKey, normalizedState.uiPreferences).trips.push(normalizeTripRecord(trip));
      return;
    }
    nextTrips.push(trip);
  });

  currentRoutePlans.forEach(routePlan => {
    const dateKey = getRouteServiceDateKey(routePlan, currentTrips);
    if (dateKey && compareDateKeys(dateKey, todayDateKey) < 0) {
      getArchiveBucket(archiveMap, dateKey, normalizedState.uiPreferences).routePlans.push(normalizeRoutePlanRecord(routePlan));
      return;
    }
    nextRoutePlans.push(routePlan);
  });

  (Array.isArray(normalizedState?.dispatchThreads) ? normalizedState.dispatchThreads : []).forEach(thread => {
    const keptMessages = [];

    (Array.isArray(thread?.messages) ? thread.messages : []).forEach(message => {
      const dateKey = getTimestampDateKey(message?.timestamp, timeZone);
      if (dateKey && compareDateKeys(dateKey, todayDateKey) < 0) {
        const archiveThreadBucket = getArchiveBucket(archiveMap, dateKey, normalizedState.uiPreferences);
        archiveThreadBucket.dispatchThreads.push({
          driverId: String(thread?.driverId || '').trim(),
          messages: [normalizeDispatchMessageRecord(message)]
        });
        return;
      }
      keptMessages.push(normalizeDispatchMessageRecord(message));
    });

    if (keptMessages.length > 0) {
      nextDispatchThreads.push({
        driverId: String(thread?.driverId || '').trim(),
        messages: keptMessages
      });
    }
  });

  (Array.isArray(normalizedState?.dailyDrivers) ? normalizedState.dailyDrivers : []).forEach(driver => {
    const dateKey = getTimestampDateKey(driver?.createdAt, timeZone);
    if (dateKey && compareDateKeys(dateKey, todayDateKey) < 0) {
      getArchiveBucket(archiveMap, dateKey, normalizedState.uiPreferences).dailyDrivers.push(normalizeDailyDriverRecord(driver));
      return;
    }
    nextDailyDrivers.push(driver);
  });

  (Array.isArray(normalizedState?.auditLog) ? normalizedState.auditLog : []).forEach(entry => {
    const dateKey = getTimestampDateKey(entry?.timestamp, timeZone);
    if (dateKey && compareDateKeys(dateKey, todayDateKey) < 0) {
      getArchiveBucket(archiveMap, dateKey, normalizedState.uiPreferences).auditLog.push(normalizeDispatchAuditRecord(entry));
      return;
    }
    nextAuditLog.push(entry);
  });

  const archiveDays = Array.from(archiveMap.values()).map(archive => ({
    ...archive,
    trips: dedupeTrips(archive.trips),
    routePlans: dedupeRoutePlans(archive.routePlans),
    dispatchThreads: dedupeDispatchThreads(archive.dispatchThreads),
    dailyDrivers: dedupeDailyDrivers(archive.dailyDrivers),
    auditLog: dedupeAuditLog(archive.auditLog)
  })).filter(hasArchiveContent).sort((left, right) => compareDateKeys(left.dateKey, right.dateKey));

  return {
    todayDateKey,
    archiveDays,
    nextState: normalizePersistentDispatchState({
      ...normalizedState,
      trips: nextTrips,
      routePlans: nextRoutePlans,
      dispatchThreads: nextDispatchThreads,
      dailyDrivers: nextDailyDrivers,
      auditLog: nextAuditLog
    })
  };
};

export const archiveDispatchState = async (state, options = {}) => {
  await ensureTable();
  const { archiveDays, nextState, todayDateKey } = partitionDispatchStateForArchive(state, options);
  const archiveSummaries = [];

  for (const archiveDay of archiveDays) {
    const existingResult = await query(`SELECT data FROM dispatch_daily_archives WHERE archive_date = $1`, [archiveDay.dateKey]);
    const existingData = existingResult.rows[0]?.data ?? {};
    const mergedArchive = mergeArchivePayload(existingData, archiveDay);
    const summary = buildArchiveSummary({
      dateKey: archiveDay.dateKey,
      ...mergedArchive
    });

    await query(
      `INSERT INTO dispatch_daily_archives (
         archive_date,
         data,
         trip_count,
         route_count,
         thread_count,
         message_count,
         audit_count,
         archived_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (archive_date) DO UPDATE SET
         data = EXCLUDED.data,
         trip_count = EXCLUDED.trip_count,
         route_count = EXCLUDED.route_count,
         thread_count = EXCLUDED.thread_count,
         message_count = EXCLUDED.message_count,
         audit_count = EXCLUDED.audit_count,
         updated_at = NOW()`,
      [archiveDay.dateKey, JSON.stringify(mergedArchive), summary.tripCount, summary.routeCount, summary.threadCount, summary.messageCount, summary.auditCount]
    );

    archiveSummaries.push(summary);
  }

  return {
    todayDateKey,
    nextState,
    archivedDates: archiveSummaries.map(item => item.dateKey),
    archiveSummaries
  };
};

export const readDispatchHistoryArchive = async dateKey => {
  const normalizedDateKey = String(dateKey || '').trim();
  if (!normalizedDateKey) return null;
  await ensureTable();
  const result = await query(
    `SELECT archive_date, data, trip_count, route_count, thread_count, message_count, audit_count, archived_at, updated_at
     FROM dispatch_daily_archives
     WHERE archive_date = $1`,
    [normalizedDateKey]
  );
  const row = result.rows[0];
  if (!row) return null;
  const archiveState = normalizePersistentDispatchState(row.data || {});
  return {
    dateKey: row.archive_date,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    summary: {
      tripCount: Number(row.trip_count) || 0,
      routeCount: Number(row.route_count) || 0,
      threadCount: Number(row.thread_count) || 0,
      messageCount: Number(row.message_count) || 0,
      auditCount: Number(row.audit_count) || 0
    },
    ...archiveState
  };
};

export const readDispatchHistoryArchiveIndex = async (limit = 60) => {
  await ensureTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 365);
  const result = await query(
    `SELECT archive_date, trip_count, route_count, thread_count, message_count, audit_count, archived_at, updated_at
     FROM dispatch_daily_archives
     ORDER BY archive_date DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(row => ({
    dateKey: row.archive_date,
    tripCount: Number(row.trip_count) || 0,
    routeCount: Number(row.route_count) || 0,
    threadCount: Number(row.thread_count) || 0,
    messageCount: Number(row.message_count) || 0,
    auditCount: Number(row.audit_count) || 0,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at
  }));
};

const readDispatchHistorySnapshots = async (limit = 2000) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 2000, 1), 10000);
  const result = await query(
    `SELECT id, snapshot, trip_count, reason, created_at
     FROM dispatch_state_history
     ORDER BY created_at ASC, id ASC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(row => ({
    id: Number(row.id) || 0,
    snapshot: normalizePersistentDispatchState(row.snapshot || {}),
    tripCount: Number(row.trip_count) || 0,
    reason: String(row.reason || '').trim(),
    createdAt: row.created_at
  }));
};

export const runDispatchHistoryBackfill = async (options = {}) => {
  await ensureTable();
  const snapshotRows = await readDispatchHistorySnapshots(options.limit);
  const archiveDateSet = new Set();
  let processedSnapshots = 0;
  let candidateArchiveDays = 0;

  for (const snapshotRow of snapshotRows) {
    const snapshotState = normalizePersistentDispatchState(snapshotRow.snapshot || {});
    const snapshotTimeZone = snapshotState?.uiPreferences?.timeZone;
    const snapshotDateKey = getLocalDateKey(snapshotRow.createdAt, snapshotTimeZone);
    if (!snapshotDateKey) continue;

    const partition = partitionDispatchStateForArchive(snapshotState, {
      todayDateKey: snapshotDateKey
    });

    if (partition.archiveDays.length === 0) continue;
    processedSnapshots += 1;
    candidateArchiveDays += partition.archiveDays.length;

    for (const archiveDay of partition.archiveDays) {
      archiveDateSet.add(archiveDay.dateKey);
    }

    await archiveDispatchState(snapshotState, {
      todayDateKey: snapshotDateKey
    });
  }

  const availableDates = await readDispatchHistoryArchiveIndex(365);

  return {
    processedSnapshots,
    candidateArchiveDays,
    archiveDates: Array.from(archiveDateSet).sort(compareDateKeys),
    totalArchivedDays: availableDates.length,
    availableDates
  };
};