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
  await query(`
    CREATE TABLE IF NOT EXISTS dispatch_state_history (
      id BIGSERIAL PRIMARY KEY,
      snapshot JSONB NOT NULL,
      trip_count INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT 'auto-backup',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
  const allowTripShrink = _options?.allowTripShrink === true;
  const actorName = String(_options?.actorName || '').trim();
  const actorId = String(_options?.actorId || '').trim();
  const actorRole = String(_options?.actorRole || '').trim();
  const shrinkReason = String(_options?.shrinkReason || '').trim();
  const isAuthorizedShrink = allowTripShrink && Boolean(actorName || actorId);
  await ensureTable();
  const currentState = await readNemtDispatchState();
  const incomingNormalized = normalizePersistentDispatchState(nextState);
  const currentTrips = Array.isArray(currentState?.trips) ? currentState.trips : [];
  const incomingTrips = Array.isArray(incomingNormalized?.trips) ? incomingNormalized.trips : [];
  const shouldProtectTripCount = !isAuthorizedShrink && incomingTrips.length < currentTrips.length;
  const nextTrips = shouldProtectTripCount ? mergeTripsByLatestUpdate(currentTrips, incomingTrips) : incomingTrips;
  const normalized = normalizePersistentDispatchState({
    ...incomingNormalized,
    trips: nextTrips
  });

  await query(
    `INSERT INTO dispatch_state_history (snapshot, trip_count, reason)
     VALUES ($1, $2, $3)`,
    [JSON.stringify(currentState), currentTrips.length, shouldProtectTripCount ? 'protected-shrink-blocked' : isAuthorizedShrink ? `admin-shrink:${shrinkReason || 'manual-delete'}:${actorName || actorId}${actorRole ? `:${actorRole}` : ''}` : 'auto-backup']
  );

  await query(
    `UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
    [JSON.stringify(normalized)]
  );
  return normalized;
};
