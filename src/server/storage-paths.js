import path from 'path';
import fs from 'fs';

const fallbackStorageRoot = path.join(process.cwd(), 'storage');

let cachedRoot = null;

export const getStorageRoot = () => {
  if (cachedRoot) return cachedRoot;
  
  const configuredRoot = process.env.STORAGE_ROOT?.trim();
  const root = configuredRoot ? path.resolve(configuredRoot) : fallbackStorageRoot;
  
  // Ensure directory exists
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    console.log(`[Storage] Created storage directory at: ${root}`);
  }
  
  // Information log (only once per process)
  if (!cachedRoot) {
    const isProduction = process.env.NODE_ENV === 'production';
    const usingPersistent = !!configuredRoot;
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