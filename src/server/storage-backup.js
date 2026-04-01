import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { getStorageRoot } from '@/server/storage-paths';

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_RETENTION_COUNT = 1008;

const pad = value => String(value).padStart(2, '0');

const formatSnapshotBucket = timestamp => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

const getSnapshotFileName = timestamp => `${formatSnapshotBucket(timestamp)}.json`;

const ensureBackupDirectory = async backupName => {
  const backupDirectory = path.join(getStorageRoot(), 'backups', backupName);
  await mkdir(backupDirectory, { recursive: true });
  return backupDirectory;
};

const cleanupExpiredSnapshots = async (backupDirectory, retentionCount) => {
  const fileNames = await readdir(backupDirectory);
  const snapshotFiles = fileNames.filter(fileName => /^\d{8}-\d{4}\.json$/i.test(fileName)).sort();
  const staleFiles = snapshotFiles.slice(0, Math.max(0, snapshotFiles.length - retentionCount));
  await Promise.all(staleFiles.map(fileName => rm(path.join(backupDirectory, fileName), { force: true })));
};

const readPreviousContents = async filePath => {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
};

export const writeJsonFileWithSnapshots = async ({
  filePath,
  nextValue,
  backupName,
  retentionCount = DEFAULT_RETENTION_COUNT
}) => {
  const serializedValue = typeof nextValue === 'string' ? nextValue : JSON.stringify(nextValue, null, 2);
  const previousContents = await readPreviousContents(filePath);
  const backupDirectory = await ensureBackupDirectory(backupName);
  const bucketFilePath = path.join(backupDirectory, getSnapshotFileName(Date.now()));
  const latestFilePath = path.join(backupDirectory, 'latest.json');

  try {
    await readFile(bucketFilePath, 'utf8');
  } catch {
    await writeFile(bucketFilePath, previousContents || serializedValue, 'utf8');
  }

  await writeFile(filePath, serializedValue, 'utf8');
  await writeFile(latestFilePath, serializedValue, 'utf8');
  await cleanupExpiredSnapshots(backupDirectory, retentionCount);
};