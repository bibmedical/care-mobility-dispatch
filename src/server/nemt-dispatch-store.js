import { normalizeDispatchThreadRecord, normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState } from '@/server/dispatch-history-store';
import { acquireAdvisoryLock, query, queryOne, withTransaction } from '@/server/db';

const ROW_ID = 'singleton';

const getTripUpdatedAt = trip => {
  const value = Number(trip?.updatedAt);
  return Number.isFinite(value) ? value : 0;
};

const mergeTripsByLatestUpdate = (currentTrips, incomingTrips) => {
  const currentTripMap = new Map((Array.isArray(currentTrips) ? currentTrips : []).map(trip => [String(trip?.id || ''), trip]));
  return (Array.isArray(incomingTrips) ? incomingTrips : []).map(incomingTrip => {
    const tripId = String(incomingTrip?.id || '');
    const currentTrip = currentTripMap.get(tripId);
    if (!currentTrip) return incomingTrip;
    return getTripUpdatedAt(incomingTrip) >= getTripUpdatedAt(currentTrip) ? incomingTrip : currentTrip;
  });
};

const upsertDispatchState = async normalizedState => {
  await query(
    `
      INSERT INTO dispatch_state (id, version, data, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id)
      DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data, updated_at = NOW()
    `,
    [ROW_ID, Number(normalizedState?.version || 1), normalizedState]
  );
};

export const readNemtDispatchState = async () => {
  const row = await queryOne(`SELECT data FROM dispatch_state WHERE id = $1`, [ROW_ID]);
  return normalizePersistentDispatchState(row?.data ?? {});
};

export const readNemtDispatchThreads = async () => {
  const row = await queryOne(`SELECT data->'dispatchThreads' AS dispatch_threads FROM dispatch_state WHERE id = $1`, [ROW_ID]);
  const threads = Array.isArray(row?.dispatch_threads) ? row.dispatch_threads : [];
  return threads.map(normalizeDispatchThreadRecord);
};

export const writeNemtDispatchState = async nextState => {
  const currentState = await readNemtDispatchState();
  const normalized = normalizePersistentDispatchState({
    ...nextState,
    trips: mergeTripsByLatestUpdate(currentState?.trips, nextState?.trips)
  });
  await upsertDispatchState(normalized);
  return normalized;
};

export const updateTripStatusForDriver = async ({ driverId, tripId, patch }) => {
  return withTransaction(async client => {
    await acquireAdvisoryLock(client, 'dispatch-state-update');
    const result = await client.query(`SELECT data FROM dispatch_state WHERE id = $1`, [ROW_ID]);
    const currentData = normalizePersistentDispatchState(result.rows[0]?.data ?? {});
    const trips = Array.isArray(currentData?.trips) ? currentData.trips : [];
    const tripIndex = trips.findIndex(trip => String(trip?.id || '').trim() === String(tripId || '').trim());
    if (tripIndex === -1) return { ok: false, reason: 'not-found' };
    const trip = trips[tripIndex];
    const tripDriverId = String(trip?.driverId || '').trim();
    const tripSecondaryDriverId = String(trip?.secondaryDriverId || '').trim();
    const normalizedDriverId = String(driverId || '').trim();
    if (tripDriverId !== normalizedDriverId && tripSecondaryDriverId !== normalizedDriverId) {
      return { ok: false, reason: 'forbidden' };
    }
    const updatedTrips = [...trips];
    updatedTrips[tripIndex] = { ...trip, ...patch };
    const nextData = normalizePersistentDispatchState({ ...currentData, trips: updatedTrips });
    await client.query(
      `
        INSERT INTO dispatch_state (id, version, data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id)
        DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data, updated_at = NOW()
      `,
      [ROW_ID, Number(nextData?.version || 1), nextData]
    );
    return { ok: true };
  });
};

export const runDispatchArchiveMaintenance = async () => {
  const currentState = await readNemtDispatchState();
  const { nextState, archivedDates, archiveSummaries } = await archiveDispatchState(currentState);
  if (archivedDates.length > 0) {
    await upsertDispatchState(nextState);
  }
  return { state: nextState, archivedDates, archiveSummaries };
};
