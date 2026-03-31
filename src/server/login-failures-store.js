import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('login-failures.json');
const MAX_FAILURES_KEPT = 1000; // Keep last 1000 failures
const FAILURE_LOG_RETENTION_DAYS = 30; // Delete logs older than 30 days

const ensureStorageFile = async () => {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    try {
      await readFile(STORAGE_FILE, 'utf8');
    } catch {
      await writeFile(STORAGE_FILE, JSON.stringify({ failures: [] }, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error ensuring login failures storage:', error);
  }
};

const readFailuresState = async () => {
  try {
    await ensureStorageFile();
    const content = await readFile(STORAGE_FILE, 'utf8');
    return JSON.parse(content) || { failures: [] };
  } catch (error) {
    console.error('Error reading login failures:', error);
    return { failures: [] };
  }
};

const writeFailuresState = async state => {
  try {
    await ensureStorageFile();
    await writeFile(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing login failures:', error);
  }
};

const cleanup0ldLogs = state => {
  const now = Date.now();
  const retentionMs = FAILURE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  
  // Remove old entries
  state.failures = state.failures.filter(failure => now - failure.timestamp < retentionMs);
  
  // Keep only latest entries
  if (state.failures.length > MAX_FAILURES_KEPT) {
    state.failures = state.failures.slice(-MAX_FAILURES_KEPT);
  }

  return state;
};

/**
 * Log a failed login attempt
 */
export const logLoginFailure = async ({ identifier, reason, clientType = 'web', ip = 'unknown' }) => {
  try {
    let state = await readFailuresState();
    
    state.failures.push({
      timestamp: Date.now(),
      identifier: String(identifier ?? '').toLowerCase(),
      reason,
      clientType,
      ip,
      date: new Date().toISOString()
    });

    state = cleanup0ldLogs(state);
    await writeFailuresState(state);
  } catch (error) {
    console.error('Error logging login failure:', error);
  }
};

/**
 * Get recent failures for a specific identifier
 * @param {string} identifier - username or email
 * @param {number} withinMinutes - look back this many minutes (default 30)
 */
export const getRecentFailures = async (identifier, withinMinutes = 30) => {
  try {
    const state = await readFailuresState();
    const now = Date.now();
    const lookbackMs = withinMinutes * 60 * 1000;
    const normalizedIdentifier = String(identifier ?? '').toLowerCase();

    return state.failures.filter(
      failure =>
        failure.identifier === normalizedIdentifier &&
        now - failure.timestamp < lookbackMs
    );
  } catch (error) {
    console.error('Error reading recent failures:', error);
    return [];
  }
};

/**
 * Get all failure logs (for admin viewing)
 */
export const getAllFailureLogs = async (limit = 100) => {
  try {
    const state = await readFailuresState();
    return state.failures.slice(-limit).reverse();
  } catch (error) {
    console.error('Error reading all failures:', error);
    return [];
  }
};

/**
 * Check if user/email is rate-limited (too many failures)
 */
export const isRateLimited = async (identifier, maxFailures = 5, withinMinutes = 15) => {
  const recentFailures = await getRecentFailures(identifier, withinMinutes);
  return recentFailures.length >= maxFailures;
};
