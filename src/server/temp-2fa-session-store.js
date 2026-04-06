import { query, queryOne } from '@/server/db';

const TEMP_2FA_SESSION_TTL_MS = 5 * 60 * 1000;

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS temp_two_fa_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL DEFAULT 0
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_temp_two_fa_sessions_expires_at ON temp_two_fa_sessions(expires_at)`);
};

const normalizeSessionRow = row => row ? {
  token: String(row.token || '').trim(),
  userId: String(row.user_id || '').trim(),
  email: String(row.email || '').trim(),
  username: String(row.username || '').trim(),
  createdAt: Number(row.created_at || 0),
  expiresAt: Number(row.expires_at || 0)
} : null;

export const createTemp2FASession = async ({ token, userId, email = '', username = '' }) => {
  const normalizedToken = String(token || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (!normalizedToken || !normalizedUserId) {
    throw new Error('Token and user ID are required for temp 2FA session creation.');
  }

  await ensureTable();
  const createdAt = Date.now();
  const expiresAt = createdAt + TEMP_2FA_SESSION_TTL_MS;

  await query(`DELETE FROM temp_two_fa_sessions WHERE expires_at < $1`, [createdAt]);
  await query(
    `INSERT INTO temp_two_fa_sessions (token, user_id, email, username, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       email = EXCLUDED.email,
       username = EXCLUDED.username,
       created_at = EXCLUDED.created_at,
       expires_at = EXCLUDED.expires_at`,
    [normalizedToken, normalizedUserId, String(email || '').trim(), String(username || '').trim(), createdAt, expiresAt]
  );

  return {
    token: normalizedToken,
    userId: normalizedUserId,
    email: String(email || '').trim(),
    username: String(username || '').trim(),
    createdAt,
    expiresAt
  };
};

export const readTemp2FASession = async token => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  await ensureTable();
  await query(`DELETE FROM temp_two_fa_sessions WHERE expires_at < $1`, [Date.now()]);
  const row = await queryOne(`SELECT * FROM temp_two_fa_sessions WHERE token = $1`, [normalizedToken]);
  return normalizeSessionRow(row);
};

export const deleteTemp2FASession = async token => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return false;

  await ensureTable();
  const result = await query(`DELETE FROM temp_two_fa_sessions WHERE token = $1`, [normalizedToken]);
  return Number(result.rowCount || 0) > 0;
};