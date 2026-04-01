import path from 'path';
import fs from 'fs';

const fallbackStorageRoot = path.join(process.cwd(), 'storage');

let cachedRoot = null;

const canUseStorageRoot = rootPath => {
  try {
    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
};

export const getStorageRoot = () => {
  if (cachedRoot) return cachedRoot;

  const configuredRoot = process.env.STORAGE_ROOT?.trim();
  const preferredRoot = configuredRoot ? path.resolve(configuredRoot) : fallbackStorageRoot;
  const usingConfiguredRoot = configuredRoot && canUseStorageRoot(preferredRoot);
  const root = usingConfiguredRoot ? preferredRoot : fallbackStorageRoot;

  if (!canUseStorageRoot(root)) {
    throw new Error(`Unable to initialize storage directory: ${root}`);
  }

  // Information log (only once per process)
  if (!cachedRoot) {
    const isProduction = process.env.NODE_ENV === 'production';
    const usingPersistent = Boolean(usingConfiguredRoot);
    console.log(`[Storage] Initialized: ${root}`);
    console.log(`[Storage] Persistent disk: ${usingPersistent ? 'YES (Render)' : 'NO (Ephemeral)'}`);
    if (!usingPersistent && isProduction) {
      console.warn(`[Storage] WARNING: Using ephemeral storage in production! Data will be lost on redeploy.`);
    }
  }
  
  cachedRoot = root;
  return root;
};

export const getStorageFilePath = fileName => path.join(getStorageRoot(), fileName);