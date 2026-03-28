import { mkdir, readFile, writeFile } from 'fs/promises';
import { buildInitialAdminData, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('nemt-admin.json');

const normalizeState = value => ({
  version: 2,
  drivers: Array.isArray(value?.drivers) ? value.drivers.map(normalizeDriverTracking) : [],
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
  const parsed = JSON.parse(fileContents);
  return normalizeState(parsed);
};

export const writeNemtAdminState = async nextState => {
  await ensureStorageFile();
  const normalized = normalizeState(nextState);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
};

export const readNemtAdminPayload = async () => {
  const state = await readNemtAdminState();
  return {
    ...state,
    dispatchDrivers: mapAdminDataToDispatchDrivers(state)
  };
};
