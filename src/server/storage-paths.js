import path from 'path';
import fs from 'fs';

const fallbackStorageRoot = path.join(process.cwd(), 'storage');
const renderDiskRoot = '/var/data/care-mobility';
const renderDiskStorageRoot = path.join(renderDiskRoot, 'storage');

let cachedRoot = null;

const isBuildProcess = () => {
  const lifecycleEvent = String(process.env.npm_lifecycle_event || '').toLowerCase();
  if (lifecycleEvent === 'build') return true;

  return process.argv.some(argument => {
    const value = String(argument || '').toLowerCase();
    return value === 'build' || value.includes('next build');
  });
};

const canUseStorageRoot = rootPath => {
  if (!rootPath) return false;
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
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  const isProduction = process.env.NODE_ENV === 'production';
  const buildProcess = isBuildProcess();
  const configuredRootPath = configuredRoot ? path.resolve(configuredRoot) : null;
  const persistentRoots = [
    configuredRootPath,
    isRender ? renderDiskStorageRoot : null,
    isRender ? renderDiskRoot : null,
  ].filter(Boolean);
  const fallbackRoots = isProduction && !buildProcess ? [] : [fallbackStorageRoot];
  const preferredRoots = [...persistentRoots, ...fallbackRoots];

  const root = preferredRoots.find(canUseStorageRoot);

  if (!root || !canUseStorageRoot(root)) {
    if (isProduction && !buildProcess) {
      throw new Error('Persistent storage is required in production. Configure STORAGE_ROOT or attach the Render disk.');
    }
    throw new Error(`Unable to initialize storage directory: ${root}`);
  }

  // Information log (only once per process)
  if (!cachedRoot) {
    const usingPersistent = root.startsWith(renderDiskRoot) || Boolean(configuredRootPath && root === configuredRootPath);
    const storageSource = configuredRoot && root === configuredRootPath
      ? 'STORAGE_ROOT'
      : root === renderDiskStorageRoot
        ? 'Render disk default (/var/data/care-mobility/storage)'
        : root === renderDiskRoot
          ? 'Render disk default (/var/data/care-mobility)'
          : 'local fallback';
    console.log(`[Storage] Initialized: ${root}`);
    console.log(`[Storage] Source: ${storageSource}`);
    console.log(`[Storage] Persistent disk: ${usingPersistent ? 'YES (Render)' : 'NO (Ephemeral)'}`);
    if (!usingPersistent && isProduction && buildProcess) {
      console.warn(`[Storage] Build-time fallback detected. Runtime may still use the persistent disk when the service starts.`);
    } else if (!usingPersistent && isProduction) {
      console.warn(`[Storage] WARNING: Using ephemeral storage in production! Data will be lost on redeploy.`);
    }
  }
  
  cachedRoot = root;
  return root;
};

export const getStorageFilePath = fileName => path.join(getStorageRoot(), fileName);