import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('integrations.json');

const DEFAULT_STATE = {
  version: 1,
  uber: {
    organizationName: '',
    accountEmail: '',
    accountType: 'Uber Health',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scopes: 'rides.read rides.request',
    notes: '',
    connectionStatus: 'Not configured',
    tokenStatus: 'No token',
    lastValidatedAt: '',
    lastCallbackAt: '',
    lastCallbackCode: ''
  }
};

const normalizeUberState = value => ({
  organizationName: String(value?.organizationName ?? ''),
  accountEmail: String(value?.accountEmail ?? ''),
  accountType: String(value?.accountType ?? 'Uber Health'),
  clientId: String(value?.clientId ?? ''),
  clientSecret: String(value?.clientSecret ?? ''),
  redirectUri: String(value?.redirectUri ?? ''),
  scopes: String(value?.scopes ?? 'rides.read rides.request'),
  notes: String(value?.notes ?? ''),
  connectionStatus: String(value?.connectionStatus ?? 'Not configured'),
  tokenStatus: String(value?.tokenStatus ?? 'No token'),
  lastValidatedAt: String(value?.lastValidatedAt ?? ''),
  lastCallbackAt: String(value?.lastCallbackAt ?? ''),
  lastCallbackCode: String(value?.lastCallbackCode ?? '')
});

const normalizeState = value => ({
  version: 1,
  uber: normalizeUberState(value?.uber)
});

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
  }
};

export const readIntegrationsState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  return normalizeState(JSON.parse(fileContents));
};

export const writeIntegrationsState = async nextState => {
  await ensureStorageFile();
  const normalized = normalizeState(nextState);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
};