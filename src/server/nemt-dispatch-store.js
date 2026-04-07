import { readFile, writeFile } from 'fs/promises';
import { normalizeDispatchThreadRecord, normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { archiveDispatchState } from '@/server/dispatch-history-store';
import { acquireAdvisoryLock, query, queryOne, withTransaction } from '@/server/db';
import { getStorageFilePath } from '@/server/storage-paths';

const ROW_ID = 'singleton';
const LEGACY_JSON_FILE = getStorageFilePath('nemt-dispatch.json');

const parseJsonSafe = raw => JSON.parse(String(raw ?? '').replace(/^\uFEFF/, ''));

const writeLegacyDispatchFile = async state => {
  const normalized = normalizePersistentDispatchState(state);
  await writeFile(LEGACY_JSON_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
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

// One-time migration: if SQL is empty, seed from legacy JSON file (for existing deployments)
let _seeded = false;
const ensureSeeded = async () => {
  if (_seeded) return;
  _seeded = true;
  try {
    const row = await queryOne(`SELECT data FROM dispatch_state WHERE id = $1`, [ROW_ID]);
    const data = row?.data ?? {};
    const hasData =
      (Array.isArray(data?.trips) && data.trips.length > 0) ||
      (Array.isArray(data?.routePlans) && data.routePlans.length > 0) ||
      (Array.isArray(data?.dispatchThreads) && data.dispatchThreads.length > 0);
    if (hasData) return;
    const raw = await readFile(LEGACY_JSON_FILE, 'utf8');
    const parsed = parseJsonSafe(raw);
    const normalized = normalizePersistentDispatchState(parsed);
    const hasFileData =
      (Array.isArray(normalized?.trips) && normalized.trips.length > 0) ||
      (Array.isArray(normalized?.routePlans) && normalized.routePlans.length > 0);
    if (hasFileData) {
      await query(`UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = $2`, [normalized, ROW_ID]);
      console.log('[dispatch-store] Migrated dispatch_state from legacy JSON file.');
    }
  } catch {
    // JSON file doesn't exist or is invalid — start fresh from SQL
  }
};

export const readNemtDispatchState = async () => {
  try {
    await ensureSeeded();
    const row = await queryOne(`SELECT data FROM dispatch_state WHERE id = $1`, [ROW_ID]);
    return normalizePersistentDispatchState(row?.data ?? {});
  } catch {
    // DB unavailable — fall back to legacy JSON file
    try {
      const raw = await readFile(LEGACY_JSON_FILE, 'utf8');
      const parsed = parseJsonSafe(raw);
      return normalizePersistentDispatchState(parsed);
    } catch {
      return normalizePersistentDispatchState({});
    }
  }
};

export const readNemtDispatchThreads = async () => {
  try {
    await ensureSeeded();
    const row = await queryOne(`SELECT data->'dispatchThreads' AS dispatch_threads FROM dispatch_state WHERE id = $1`, [ROW_ID]);
    const threads = Array.isArray(row?.dispatch_threads) ? row.dispatch_threads : [];
    return threads.map(normalizeDispatchThreadRecord);
  } catch {
    const state = await readNemtDispatchState();
    const threads = Array.isArray(state?.dispatchThreads) ? state.dispatchThreads : [];
    return threads.map(normalizeDispatchThreadRecord);
  }
};

export const writeNemtDispatchState = async nextState => {
  const currentState = await readNemtDispatchState();
  const normalized = normalizePersistentDispatchState({
    ...nextState,
    trips: mergeTripsByLatestUpdate(currentState?.trips, nextState?.trips)
  });

  try {
    await ensureSeeded();
    await query(`UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = $2`, [normalized, ROW_ID]);
    return normalized;
  } catch {
    return await writeLegacyDispatchFile(normalized);
  }
};

export const updateTripStatusForDriver = async ({ driverId, tripId, patch }) => {
  try {
    return await withTransaction(async client => {
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
      await client.query(`UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = $2`, [nextData, ROW_ID]);
      return { ok: true };
    });
  } catch {
    const currentData = await readNemtDispatchState();
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
    await writeLegacyDispatchFile({ ...currentData, trips: updatedTrips });
    return { ok: true };
  }
};

export const runDispatchArchiveMaintenance = async () => {
  const currentState = await readNemtDispatchState();
  const { nextState, archivedDates, archiveSummaries } = await archiveDispatchState(currentState);
  if (archivedDates.length > 0) {
    try {
      await query(`UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = $2`, [nextState, ROW_ID]);
    } catch {
      await writeLegacyDispatchFile(nextState);
    }
  }
  return { state: nextState, archivedDates, archiveSummaries };
};
