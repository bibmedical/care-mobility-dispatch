import { mkdir, readFile, writeFile } from 'fs/promises';
import { buildInitialAdminData, buildStableDriverId, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('nemt-admin.json');

const parseJsonSafe = raw => {
  const normalized = String(raw ?? '').replace(/^\uFEFF/, '');
  return JSON.parse(normalized);
};

const isMeaningfulDocumentValue = value => {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') {
    return Boolean(String(value.dataUrl || value.url || value.path || value.name || '').trim());
  }
  return false;
};

const mergeDriverDocuments = (currentDriver, nextDriver) => {
  const currentDocuments = currentDriver?.documents && typeof currentDriver.documents === 'object' ? currentDriver.documents : {};
  const nextDocuments = nextDriver?.documents && typeof nextDriver.documents === 'object' ? nextDriver.documents : {};
  const allDocumentKeys = new Set([...Object.keys(currentDocuments), ...Object.keys(nextDocuments)]);

  if (allDocumentKeys.size === 0) {
    return nextDriver;
  }

  const mergedDocuments = {};
  allDocumentKeys.forEach(key => {
    const nextValue = nextDocuments[key];
    const currentValue = currentDocuments[key];
    mergedDocuments[key] = isMeaningfulDocumentValue(nextValue) ? nextValue : currentValue ?? nextValue ?? null;
  });

  return {
    ...nextDriver,
    documents: mergedDocuments
  };
};

const mergePreservedDriverData = (currentState, nextState) => {
  const currentDrivers = Array.isArray(currentState?.drivers) ? currentState.drivers : [];
  const nextDrivers = Array.isArray(nextState?.drivers) ? nextState.drivers : [];

  const currentDriversById = new Map(currentDrivers.map(driver => [String(driver?.id || '').trim(), driver]));
  const currentDriversByStableId = new Map(currentDrivers.map(driver => [buildStableDriverId(driver), driver]));

  return {
    ...nextState,
    drivers: nextDrivers.map(nextDriver => {
      const currentById = currentDriversById.get(String(nextDriver?.id || '').trim());
      const currentByStableId = currentDriversByStableId.get(buildStableDriverId(nextDriver));
      const currentDriver = currentById || currentByStableId || null;
      return currentDriver ? mergeDriverDocuments(currentDriver, nextDriver) : nextDriver;
    })
  };
};

const normalizeDrivers = drivers => {
  const seenIds = new Set();

  return (Array.isArray(drivers) ? drivers : []).map((driver, index) => {
    const normalizedDriver = normalizeDriverTracking(driver);
    const preferredId = buildStableDriverId(normalizedDriver);
    const currentId = String(normalizedDriver?.id || '').trim();
    const nextId = !currentId || seenIds.has(currentId) || currentId.startsWith('driver-') ? preferredId : currentId;
    const uniqueId = seenIds.has(nextId) ? `${nextId}-${index + 1}` : nextId;
    seenIds.add(uniqueId);
    return {
      ...normalizedDriver,
      id: uniqueId
    };
  });
};

const normalizeState = value => ({
  version: 2,
  drivers: normalizeDrivers(value?.drivers),
  attendants: Array.isArray(value?.attendants) ? value.attendants : [],
  vehicles: Array.isArray(value?.vehicles) ? value.vehicles : [],
  groupings: Array.isArray(value?.groupings) ? value.groupings : []
});

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    const initialState = buildInitialAdminData();
    await writeFile(STORAGE_FILE, JSON.stringify(initialState, null, 2), 'utf8');
  }
};

export const readNemtAdminState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  const parsed = parseJsonSafe(fileContents);
  const normalized = normalizeState(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  }
  return normalized;
};

export const writeNemtAdminState = async nextState => {
  await ensureStorageFile();
  const currentFileContents = await readFile(STORAGE_FILE, 'utf8');
  const currentParsed = parseJsonSafe(currentFileContents);
  const currentNormalized = normalizeState(currentParsed);
  const mergedState = mergePreservedDriverData(currentNormalized, nextState);
  const normalized = normalizeState(mergedState);
  await writeJsonFileWithSnapshots({
    filePath: STORAGE_FILE,
    nextValue: normalized,
    backupName: 'nemt-admin'
  });
  return normalized;
};

export const readNemtAdminPayload = async () => {
  const state = await readNemtAdminState();
  return {
    ...state,
    dispatchDrivers: mapAdminDataToDispatchDrivers(state)
  };
};
