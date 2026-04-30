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

const runQuery = async (queryExecutor, text, params) => (queryExecutor ? queryExecutor.query(text, params) : query(text, params));

let tableReady = false;
let restorePointsTableReady = false;

const ensureTable = async queryExecutor => {
  if (tableReady) return;
  await runQuery(queryExecutor, `
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
  await runQuery(queryExecutor, `CREATE INDEX IF NOT EXISTS idx_dispatch_daily_archives_archived_at ON dispatch_daily_archives(archived_at DESC)`);
  tableReady = true;
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

const normalizeDriverId = value => String(value || '').trim();

const getArchiveDriverLabel = (driverId, archive) => {
  const normalizedDriverId = normalizeDriverId(driverId);
  if (!normalizedDriverId) return 'No driver';

  const tripDriver = (Array.isArray(archive?.trips) ? archive.trips : []).find(trip => normalizeDriverId(trip?.driverId) === normalizedDriverId || normalizeDriverId(trip?.secondaryDriverId) === normalizedDriverId);
  if (tripDriver?.driverName) return String(tripDriver.driverName).trim();

  const routeDriver = (Array.isArray(archive?.routePlans) ? archive.routePlans : []).find(routePlan => normalizeDriverId(routePlan?.driverId) === normalizedDriverId || normalizeDriverId(routePlan?.secondaryDriverId) === normalizedDriverId);
  if (routeDriver?.driverName) return String(routeDriver.driverName).trim();

  const dailyDriver = (Array.isArray(archive?.dailyDrivers) ? archive.dailyDrivers : []).find(driver => normalizeDriverId(driver?.id) === normalizedDriverId);
  if (dailyDriver) {
    return [dailyDriver.firstName, dailyDriver.lastNameOrOrg].filter(Boolean).join(' ').trim() || normalizedDriverId;
  }

  return normalizedDriverId;
};

const buildArchiveDriverDaySummary = (archive, dateKey, driverId, fallbackSummary = null) => {
  const normalizedDriverId = normalizeDriverId(driverId);
  const trips = (Array.isArray(archive?.trips) ? archive.trips : []).filter(trip => normalizeDriverId(trip?.driverId) === normalizedDriverId || normalizeDriverId(trip?.secondaryDriverId) === normalizedDriverId);
  const routeCount = (Array.isArray(archive?.routePlans) ? archive.routePlans : []).filter(routePlan => normalizeDriverId(routePlan?.driverId) === normalizedDriverId || normalizeDriverId(routePlan?.secondaryDriverId) === normalizedDriverId || (Array.isArray(routePlan?.tripIds) ? routePlan.tripIds : []).some(tripId => trips.some(trip => String(trip?.id || '').trim() === String(tripId || '').trim()))).length;
  const thread = (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).find(item => normalizeDriverId(item?.driverId) === normalizedDriverId);
  const messages = Array.isArray(thread?.messages) ? thread.messages.length : 0;
  return {
    dateKey,
    label: getArchiveDriverLabel(normalizedDriverId, archive),
    tripCount: trips.length,
    routeCount,
    messageCount: messages,
    archivedAt: fallbackSummary?.archivedAt || archive?.archivedAt || null,
    updatedAt: fallbackSummary?.updatedAt || archive?.updatedAt || null
  };
};

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
  const queryExecutor = options?.queryExecutor;
  await ensureTable(queryExecutor);
  const { archiveDays, nextState, todayDateKey } = partitionDispatchStateForArchive(state, options);
  const archiveSummaries = [];

  for (const archiveDay of archiveDays) {
    const existingResult = await runQuery(queryExecutor, `SELECT data FROM dispatch_daily_archives WHERE archive_date = $1`, [archiveDay.dateKey]);
    const existingData = existingResult.rows[0]?.data ?? {};
    const mergedArchive = mergeArchivePayload(existingData, archiveDay);
    const summary = buildArchiveSummary({
      dateKey: archiveDay.dateKey,
      ...mergedArchive
    });

    await runQuery(
      queryExecutor,
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

export const readDispatchHistoryDriverIndex = async (limit = 365) => {
  await ensureTable();
  const safeLimit = Math.min(Math.max(Number(limit) || 365, 1), 365);
  const result = await query(
    `SELECT archive_date, data, trip_count, route_count, thread_count, message_count, audit_count, archived_at, updated_at
     FROM dispatch_daily_archives
     ORDER BY archive_date DESC
     LIMIT $1`,
    [safeLimit]
  );

  const driverMap = new Map();

  result.rows.forEach(row => {
    const archive = normalizePersistentDispatchState(row.data || {});
    const dateKey = String(row.archive_date || '').trim();
    if (!dateKey) return;

    const archiveSummary = {
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
      tripCount: Number(row.trip_count) || 0,
      routeCount: Number(row.route_count) || 0,
      threadCount: Number(row.thread_count) || 0,
      messageCount: Number(row.message_count) || 0,
      auditCount: Number(row.audit_count) || 0
    };

    const archiveDriverIds = new Set();
    (Array.isArray(archive?.trips) ? archive.trips : []).forEach(trip => {
      if (normalizeDriverId(trip?.driverId)) archiveDriverIds.add(normalizeDriverId(trip.driverId));
      if (normalizeDriverId(trip?.secondaryDriverId)) archiveDriverIds.add(normalizeDriverId(trip.secondaryDriverId));
    });
    (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).forEach(thread => {
      if (normalizeDriverId(thread?.driverId)) archiveDriverIds.add(normalizeDriverId(thread.driverId));
    });
    (Array.isArray(archive?.routePlans) ? archive.routePlans : []).forEach(routePlan => {
      if (normalizeDriverId(routePlan?.driverId)) archiveDriverIds.add(normalizeDriverId(routePlan.driverId));
      if (normalizeDriverId(routePlan?.secondaryDriverId)) archiveDriverIds.add(normalizeDriverId(routePlan.secondaryDriverId));
    });
    (Array.isArray(archive?.dailyDrivers) ? archive.dailyDrivers : []).forEach(driver => {
      if (normalizeDriverId(driver?.id)) archiveDriverIds.add(normalizeDriverId(driver.id));
    });

    archiveDriverIds.forEach(driverId => {
      const daySummary = buildArchiveDriverDaySummary({
        ...archive,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at
      }, dateKey, driverId, archiveSummary);
      if (daySummary.tripCount === 0 && daySummary.routeCount === 0 && daySummary.messageCount === 0) return;

      const existingEntry = driverMap.get(driverId) || {
        driverId,
        label: getArchiveDriverLabel(driverId, archive),
        archivedDayCount: 0,
        tripCount: 0,
        routeCount: 0,
        messageCount: 0,
        days: []
      };

      existingEntry.label = existingEntry.label || getArchiveDriverLabel(driverId, archive);
      existingEntry.archivedDayCount += 1;
      existingEntry.tripCount += daySummary.tripCount;
      existingEntry.routeCount += daySummary.routeCount;
      existingEntry.messageCount += daySummary.messageCount;
      existingEntry.days.push(daySummary);
      driverMap.set(driverId, existingEntry);
    });
  });

  return Array.from(driverMap.values()).map(entry => ({
    ...entry,
    days: [...entry.days].sort((left, right) => String(right.dateKey || '').localeCompare(String(left.dateKey || '')))
  })).sort((left, right) => String(left.label || left.driverId).localeCompare(String(right.label || right.driverId)));
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

const ensureRestorePointsTable = async queryExecutor => {
  if (restorePointsTableReady) return;
  await runQuery(queryExecutor, `
    CREATE TABLE IF NOT EXISTS dispatch_restore_points (
      id            BIGSERIAL PRIMARY KEY,
      service_date  TEXT NOT NULL,
      reason        TEXT NOT NULL DEFAULT 'manual',
      data          JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runQuery(queryExecutor, `CREATE INDEX IF NOT EXISTS idx_dispatch_restore_points_service_date_created_at ON dispatch_restore_points(service_date, created_at DESC)`);
  restorePointsTableReady = true;
};

const buildDispatchDaySnapshot = (state, serviceDateKey) => {
  const normalizedState = normalizePersistentDispatchState(state || {});
  const normalizedDateKey = String(serviceDateKey || '').trim();
  if (!normalizedDateKey) return null;

  const dayTrips = (Array.isArray(normalizedState?.trips) ? normalizedState.trips : []).filter(trip => {
    const tripDateKey = getTripTimelineDateKey(trip, normalizedState.routePlans, normalizedState.trips);
    return tripDateKey === normalizedDateKey;
  }).map(normalizeTripRecord);

  const dayTripRouteIds = new Set(dayTrips.map(trip => normalizeDriverId(trip?.routeId)).filter(Boolean));

  const dayRoutePlans = (Array.isArray(normalizedState?.routePlans) ? normalizedState.routePlans : []).filter(routePlan => {
    const routeDateKey = getRouteServiceDateKey(routePlan, normalizedState.trips);
    if (routeDateKey === normalizedDateKey) return true;
    const routeId = normalizeDriverId(routePlan?.id);
    if (routeId && dayTripRouteIds.has(routeId)) return true;
    const routeTripIds = Array.isArray(routePlan?.tripIds) ? routePlan.tripIds : [];
    return routeTripIds.some(tripId => dayTrips.some(trip => String(trip?.id || '').trim() === String(tripId || '').trim()));
  }).map(normalizeRoutePlanRecord);

  const dayDriverIds = new Set();
  dayTrips.forEach(trip => {
    const primaryDriverId = normalizeDriverId(trip?.driverId);
    const secondaryDriverId = normalizeDriverId(trip?.secondaryDriverId);
    if (primaryDriverId) dayDriverIds.add(primaryDriverId);
    if (secondaryDriverId) dayDriverIds.add(secondaryDriverId);
  });
  dayRoutePlans.forEach(routePlan => {
    const primaryDriverId = normalizeDriverId(routePlan?.driverId);
    const secondaryDriverId = normalizeDriverId(routePlan?.secondaryDriverId);
    if (primaryDriverId) dayDriverIds.add(primaryDriverId);
    if (secondaryDriverId) dayDriverIds.add(secondaryDriverId);
  });

  const dayThreads = (Array.isArray(normalizedState?.dispatchThreads) ? normalizedState.dispatchThreads : [])
    .filter(thread => dayDriverIds.has(normalizeDriverId(thread?.driverId)))
    .map(normalizeDispatchThreadRecord);

  const dayAuditLog = (Array.isArray(normalizedState?.auditLog) ? normalizedState.auditLog : []).filter(entry => {
    const entryDate = getTimestampDateKey(entry?.timestamp || entry?.occurredAt, normalizedState?.uiPreferences?.timeZone);
    return entryDate === normalizedDateKey;
  }).map(normalizeDispatchAuditRecord);

  return normalizePersistentDispatchState({
    trips: dayTrips,
    routePlans: dayRoutePlans,
    dispatchThreads: dayThreads,
    dailyDrivers: [],
    auditLog: dayAuditLog,
    uiPreferences: normalizedState?.uiPreferences || {}
  });
};

const shouldCreateAutomaticRestorePoint = async (queryExecutor, serviceDateKey, intervalHours = 4) => {
  const normalizedDateKey = String(serviceDateKey || '').trim();
  if (!normalizedDateKey) return false;

  const result = await runQuery(
    queryExecutor,
    `SELECT created_at
     FROM dispatch_restore_points
     WHERE service_date = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedDateKey]
  );
  const latest = result.rows[0]?.created_at ? new Date(result.rows[0].created_at) : null;
  if (!latest || Number.isNaN(latest.getTime())) return true;
  return (Date.now() - latest.getTime()) >= intervalHours * 60 * 60 * 1000;
};

export const createDispatchRestorePoint = async ({ serviceDateKey, state, reason = 'manual', force = false, intervalHours = 4 } = {}, options = {}) => {
  const queryExecutor = options?.queryExecutor;
  await ensureRestorePointsTable(queryExecutor);

  const normalizedDateKey = String(serviceDateKey || '').trim();
  if (!normalizedDateKey) return null;

  const snapshotState = buildDispatchDaySnapshot(state, normalizedDateKey);
  if (!snapshotState || ((snapshotState?.trips?.length || 0) === 0 && (snapshotState?.routePlans?.length || 0) === 0)) {
    return null;
  }

  const normalizedReason = String(reason || 'manual').trim() || 'manual';
  if (!force && normalizedReason === 'auto-4h') {
    const allowCreate = await shouldCreateAutomaticRestorePoint(queryExecutor, normalizedDateKey, intervalHours);
    if (!allowCreate) return null;
  }

  const inserted = await runQuery(
    queryExecutor,
    `INSERT INTO dispatch_restore_points (service_date, reason, data, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, service_date, reason, created_at`,
    [normalizedDateKey, normalizedReason, JSON.stringify(snapshotState)]
  );

  const row = inserted.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id) || 0,
    serviceDateKey: String(row.service_date || '').trim(),
    reason: String(row.reason || '').trim(),
    createdAt: row.created_at,
    tripCount: snapshotState.trips.length,
    routeCount: snapshotState.routePlans.length
  };
};

export const readDispatchRestorePoints = async (serviceDateKey, limit = 24) => {
  await ensureRestorePointsTable();
  const normalizedDateKey = String(serviceDateKey || '').trim();
  if (!normalizedDateKey) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 200);
  const result = await query(
    `SELECT id, service_date, reason, created_at,
            COALESCE(jsonb_array_length(data->'trips'), 0) AS trip_count,
            COALESCE(jsonb_array_length(data->'routePlans'), 0) AS route_count
     FROM dispatch_restore_points
     WHERE service_date = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [normalizedDateKey, safeLimit]
  );
  return result.rows.map(row => ({
    id: Number(row.id) || 0,
    serviceDateKey: String(row.service_date || '').trim(),
    reason: String(row.reason || '').trim(),
    createdAt: row.created_at,
    tripCount: Number(row.trip_count) || 0,
    routeCount: Number(row.route_count) || 0
  }));
};

export const readDispatchRestorePointById = async restorePointId => {
  await ensureRestorePointsTable();
  const normalizedId = Number(restorePointId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;

  const result = await query(
    `SELECT id, service_date, reason, data, created_at
     FROM dispatch_restore_points
     WHERE id = $1
     LIMIT 1`,
    [normalizedId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const snapshot = normalizePersistentDispatchState(row.data || {});
  return {
    id: Number(row.id) || 0,
    serviceDateKey: String(row.service_date || '').trim(),
    reason: String(row.reason || '').trim(),
    createdAt: row.created_at,
    snapshot
  };
};