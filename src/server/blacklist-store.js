import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('blacklist.json');

const DEFAULT_STATE = {
  version: 1,
  entries: []
};

const normalizeBlacklistEntry = value => ({
  id: String(value?.id ?? `bl-${Date.now()}`),
  name: String(value?.name ?? '').trim(),
  phone: String(value?.phone ?? '').trim(),
  category: String(value?.category ?? 'Do Not Schedule'),
  status: String(value?.status ?? 'Active'),
  holdUntil: String(value?.holdUntil ?? ''),
  notes: String(value?.notes ?? '').trim(),
  source: String(value?.source ?? 'Dispatcher'),
  createdAt: String(value?.createdAt ?? new Date().toISOString()),
  updatedAt: String(value?.updatedAt ?? new Date().toISOString())
});

const normalizeBlacklistState = value => ({
  version: 1,
  entries: Array.isArray(value?.entries) ? value.entries.map(normalizeBlacklistEntry).filter(entry => entry.name || entry.phone) : []
});

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
  }
};

export const readBlacklistState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  return normalizeBlacklistState(JSON.parse(fileContents));
};

export const writeBlacklistState = async nextState => {
  await ensureStorageFile();
  const normalized = normalizeBlacklistState(nextState);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
};