import { mkdir, readFile, writeFile } from 'fs/promises';
import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('nemt-dispatch.json');

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
  return normalizePersistentDispatchState(JSON.parse(fileContents));
};

export const writeNemtDispatchState = async nextState => {
  await ensureStorageFile();
  const normalized = normalizePersistentDispatchState(nextState);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
};
