import { query } from '@/server/db';

const MAX_FAILURES_KEPT = 1000;
const FAILURE_LOG_RETENTION_DAYS = 30;
let ensureTablePromise = null;

const ensureTable = async () => {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS login_failures (
      id SERIAL PRIMARY KEY,
      identifier TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      client_type TEXT NOT NULL DEFAULT 'web',
      ip TEXT NOT NULL DEFAULT 'unknown',
      timestamp BIGINT NOT NULL DEFAULT 0,
      date TEXT NOT NULL DEFAULT ''
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_failures_identifier ON login_failures (identifier)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_failures_timestamp ON login_failures (timestamp)`);
  })().catch(error => {
    ensureTablePromise = null;
    throw error;
  });

  return ensureTablePromise;
};

/**
 * Log a failed login attempt
 */
export const logLoginFailure = async ({ identifier, reason, clientType = 'web', ip = 'unknown' }) => {
  try {
    await ensureTable();
    await query(
      `INSERT INTO login_failures (identifier, reason, client_type, ip, timestamp, date)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [String(identifier ?? '').toLowerCase(), String(reason ?? ''), clientType, ip, Date.now(), new Date().toISOString()]
    );
    // Trim: keep only last MAX_FAILURES_KEPT
    await query(
      `DELETE FROM login_failures WHERE id NOT IN (
        SELECT id FROM login_failures ORDER BY timestamp DESC LIMIT ${MAX_FAILURES_KEPT}
      )`
    );
    // Purge old entries
    const cutoff = Date.now() - FAILURE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    await query(`DELETE FROM login_failures WHERE timestamp < $1`, [cutoff]);
  } catch (error) {
    console.error('Error logging login failure:', error);
  }
};

/**
 * Get recent failures for a specific identifier
 */
export const getRecentFailures = async (identifier, withinMinutes = 30) => {
  try {
    await ensureTable();
    const lookbackMs = withinMinutes * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    const result = await query(
      `SELECT * FROM login_failures WHERE identifier = $1 AND timestamp > $2 ORDER BY timestamp DESC`,
      [String(identifier ?? '').toLowerCase(), cutoff]
    );
    return result.rows.map(r => ({ ...r, clientType: r.client_type }));
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
    await ensureTable();
    const result = await query(
      `SELECT * FROM login_failures ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map(r => ({ ...r, clientType: r.client_type }));
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

/**
 * Clear all failure records for a specific identifier (unlock a locked account)
 */
export const clearLoginFailures = async identifier => {
  try {
    await ensureTable();
    const normalizedIdentifier = String(identifier ?? '').trim().toLowerCase();
    if (!normalizedIdentifier) return 0;
    const result = await query(
      `DELETE FROM login_failures WHERE identifier = $1`,
      [normalizedIdentifier]
    );
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Error clearing login failures:', error);
    return 0;
  }
};
