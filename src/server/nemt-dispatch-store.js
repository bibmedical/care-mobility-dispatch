import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState } from '@/server/dispatch-history-store';
import { acquireAdvisoryLock, query, withTransaction } from '@/server/db';

const DISPATCH_STATE_LOCK_KEY = 'dispatch-state-singleton';
const runQuery = async (queryExecutor, text, params) => (queryExecutor ? queryExecutor.query(text, params) : query(text, params));

const ensureTable = async queryExecutor => {
  await runQuery(queryExecutor, `
    CREATE TABLE IF NOT EXISTS dispatch_state (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      version INTEGER NOT NULL DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await runQuery(queryExecutor, `
    INSERT INTO dispatch_state (id, version, data)
    VALUES ('singleton', 1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
  await runQuery(queryExecutor, `
    CREATE TABLE IF NOT EXISTS dispatch_state_history (
      id BIGSERIAL PRIMARY KEY,
      snapshot JSONB NOT NULL,
      trip_count INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT 'auto-backup',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const readDispatchStateRow = async queryExecutor => {
  await ensureTable(queryExecutor);
  const result = await runQuery(queryExecutor, `SELECT data FROM dispatch_state WHERE id = 'singleton'`);
  return normalizePersistentDispatchState(result.rows[0]?.data ?? {});
};

const persistArchivedDispatchState = async (currentState, queryExecutor, reasonPrefix) => {
  const archiveResult = await archiveDispatchState(currentState, { queryExecutor });

  if (archiveResult.archivedDates.length > 0) {
    await runQuery(
      queryExecutor,
      `INSERT INTO dispatch_state_history (snapshot, trip_count, reason)
       VALUES ($1, $2, $3)`,
      [JSON.stringify(currentState), (Array.isArray(currentState?.trips) ? currentState.trips.length : 0), `${reasonPrefix}:${archiveResult.archivedDates.join(',')}`]
    );

    await runQuery(
      queryExecutor,
      `UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
      [JSON.stringify(archiveResult.nextState)]
    );
  }

  return archiveResult;
};

export const readNemtDispatchState = async () => {
  const currentState = await readDispatchStateRow();
  const archiveResult = await persistArchivedDispatchState(currentState, null, 'auto-archive');
  return archiveResult.nextState;
};

export const runDispatchArchiveMaintenance = async () => {
  return withTransaction(async client => {
    await acquireAdvisoryLock(client, DISPATCH_STATE_LOCK_KEY);
    const currentState = await readDispatchStateRow(client);
    const archiveResult = await persistArchivedDispatchState(currentState, client, 'cron-archive');

    return {
      archivedDates: archiveResult.archivedDates,
      archiveSummaries: archiveResult.archiveSummaries,
      state: archiveResult.nextState
    };
  });
};

const getTripUpdatedAt = trip => {
  const value = Number(trip?.updatedAt);
  return Number.isFinite(value) ? value : 0;
};

const mergeTripsByLatestUpdate = (currentTrips, incomingTrips) => {
  const mergedTripMap = new Map((Array.isArray(currentTrips) ? currentTrips : []).map(trip => [String(trip?.id || ''), trip]));
  (Array.isArray(incomingTrips) ? incomingTrips : []).forEach(incomingTrip => {
    const tripId = String(incomingTrip?.id || '');
    const currentTrip = mergedTripMap.get(tripId);
    if (!currentTrip) {
      mergedTripMap.set(tripId, incomingTrip);
      return;
    }
    mergedTripMap.set(tripId, getTripUpdatedAt(incomingTrip) >= getTripUpdatedAt(currentTrip) ? incomingTrip : currentTrip);
  });
  return Array.from(mergedTripMap.values());
};

export const writeNemtDispatchState = async (nextState, _options = {}) => {
  return withTransaction(async client => {
    await acquireAdvisoryLock(client, DISPATCH_STATE_LOCK_KEY);
    const archivedCurrent = await persistArchivedDispatchState(await readDispatchStateRow(client), client, 'auto-archive');
    return persistDispatchStateLocked(client, archivedCurrent.nextState, nextState, _options);
  });
};

const persistDispatchStateLocked = async (queryExecutor, currentState, nextState, _options = {}) => {
  const allowTripShrink = _options?.allowTripShrink === true;
  const actorName = String(_options?.actorName || '').trim();
  const actorId = String(_options?.actorId || '').trim();
  const actorRole = String(_options?.actorRole || '').trim();
  const shrinkReason = String(_options?.shrinkReason || '').trim();
  const isAuthorizedShrink = allowTripShrink && Boolean(actorName || actorId);
  const incomingNormalized = normalizePersistentDispatchState(nextState);
  const currentTrips = Array.isArray(currentState?.trips) ? currentState.trips : [];
  const incomingTrips = Array.isArray(incomingNormalized?.trips) ? incomingNormalized.trips : [];
  const shouldProtectTripCount = !isAuthorizedShrink && incomingTrips.length < currentTrips.length;
  const nextTrips = shouldProtectTripCount ? mergeTripsByLatestUpdate(currentTrips, incomingTrips) : incomingTrips;
  const normalized = normalizePersistentDispatchState({
    ...incomingNormalized,
    trips: nextTrips
  });
  const archiveResult = await archiveDispatchState(normalized, { queryExecutor });
  const finalState = archiveResult.nextState;

  await runQuery(
    queryExecutor,
    `INSERT INTO dispatch_state_history (snapshot, trip_count, reason)
     VALUES ($1, $2, $3)`,
    [JSON.stringify(currentState), currentTrips.length, `${shouldProtectTripCount ? 'protected-shrink-blocked' : isAuthorizedShrink ? `admin-shrink:${shrinkReason || 'manual-delete'}:${actorName || actorId}${actorRole ? `:${actorRole}` : ''}` : 'auto-backup'}${archiveResult.archivedDates.length > 0 ? `|auto-archive:${archiveResult.archivedDates.join(',')}` : ''}`]
  );

  await runQuery(queryExecutor, `UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`, [JSON.stringify(finalState)]);
  return finalState;
};

export const updateTripStatusForDriver = async ({ driverId, tripId, patch }) => withTransaction(async client => {
  await acquireAdvisoryLock(client, DISPATCH_STATE_LOCK_KEY);
  const archivedCurrent = await persistArchivedDispatchState(await readDispatchStateRow(client), client, 'auto-archive');
  const currentState = archivedCurrent.nextState;
  const trips = Array.isArray(currentState?.trips) ? currentState.trips : [];
  const currentTrip = trips.find(trip => String(trip?.id || '').trim() === String(tripId || '').trim());

  if (!currentTrip) {
    return { ok: false, reason: 'not-found' };
  }

  if (String(currentTrip?.driverId || '').trim() !== String(driverId || '').trim()) {
    return { ok: false, reason: 'forbidden' };
  }

  const nextTrips = trips.map(trip => String(trip?.id || '').trim() === String(tripId || '').trim() ? {
    ...trip,
    ...patch
  } : trip);

  const finalState = await persistDispatchStateLocked(client, currentState, {
    ...currentState,
    trips: nextTrips
  }, {
    actorId: String(driverId || '').trim(),
    actorName: String(driverId || '').trim(),
    actorRole: 'driver'
  });

  const updatedTrip = (Array.isArray(finalState?.trips) ? finalState.trips : []).find(trip => String(trip?.id || '').trim() === String(tripId || '').trim()) || null;

  return {
    ok: true,
    trip: updatedTrip
  };
});
