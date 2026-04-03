import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { query } from '@/server/db';

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS dispatch_state (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      version INTEGER NOT NULL DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    INSERT INTO dispatch_state (id, version, data)
    VALUES ('singleton', 1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
};

export const readNemtDispatchState = async () => {
  await ensureTable();
  const result = await query(`SELECT data FROM dispatch_state WHERE id = 'singleton'`);
  const raw = result.rows[0]?.data ?? {};
  return normalizePersistentDispatchState(raw);
};

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

export const writeNemtDispatchState = async nextState => {
  await ensureTable();
  const currentState = await readNemtDispatchState();
  const normalized = normalizePersistentDispatchState({
    ...nextState,
    trips: mergeTripsByLatestUpdate(currentState?.trips, nextState?.trips)
  });
  await query(
    `UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
    [JSON.stringify(normalized)]
  );
  return normalized;
};
