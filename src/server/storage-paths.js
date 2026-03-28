import path from 'path';

const fallbackStorageRoot = path.join(process.cwd(), 'storage');

export const getStorageRoot = () => {
  const configuredRoot = process.env.STORAGE_ROOT?.trim();
  return configuredRoot ? path.resolve(configuredRoot) : fallbackStorageRoot;
};

export const getStorageFilePath = fileName => path.join(getStorageRoot(), fileName);