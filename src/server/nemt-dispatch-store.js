import { mkdir, readFile, writeFile } from 'fs/promises';
import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('nemt-dispatch.json');

const parseJsonSafe = raw => JSON.parse(String(raw ?? '').replace(/^\uFEFF/, ''));

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify(normalizePersistentDispatchState(), null, 2), 'utf8');
  }
};

export const readNemtDispatchState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  return normalizePersistentDispatchState(parseJsonSafe(fileContents));
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
  await ensureStorageFile();
  const currentState = await readNemtDispatchState();
  const normalized = normalizePersistentDispatchState({
    ...nextState,
    trips: mergeTripsByLatestUpdate(currentState?.trips, nextState?.trips)
  });
  await writeJsonFileWithSnapshots({
    filePath: STORAGE_FILE,
    nextValue: normalized,
    backupName: 'nemt-dispatch'
  });
  return normalized;
};
