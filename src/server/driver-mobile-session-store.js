import { randomBytes } from 'crypto';
import { query, queryOne } from '@/server/db';

const DRIVER_MOBILE_SESSION_TTL_MS = 1000 * 60 * 45;

// In-memory fallback sessions for when DB is unavailable (local dev without DATABASE_URL)
const _memSessions = new Map();

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS driver_mobile_sessions (
      driver_id TEXT PRIMARY KEY,
      driver_name TEXT,
      device_id TEXT NOT NULL,
      session_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_driver_mobile_sessions_last_seen_at ON driver_mobile_sessions(last_seen_at DESC)`);
  tableReady = true;
};

const buildDriverSessionError = (message, status = 401, code = 'driver-session-invalid') => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const mapSessionRow = row => row ? {
  driverId: row.driver_id,
  driverName: row.driver_name || '',
  deviceId: row.device_id,
  sessionToken: row.session_token,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at
} : null;

const isSessionExpired = row => {
  const lastSeenAt = new Date(row?.last_seen_at || 0).getTime();
  if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return true;
  return Date.now() - lastSeenAt > DRIVER_MOBILE_SESSION_TTL_MS;
};

const readSessionRow = async driverId => {
  await ensureTable();
  return await queryOne(`SELECT * FROM driver_mobile_sessions WHERE driver_id = $1`, [String(driverId || '').trim()]);
};

const deleteSessionRow = async driverId => {
  await ensureTable();
  await query(`DELETE FROM driver_mobile_sessions WHERE driver_id = $1`, [String(driverId || '').trim()]);
};

export const claimDriverMobileSession = async ({ driverId, driverName = '', deviceId }) => {
  const normalizedDriverId = String(driverId || '').trim();
  const normalizedDeviceId = String(deviceId || '').trim();

  if (!normalizedDriverId || !normalizedDeviceId) {
    throw buildDriverSessionError('Driver ID and device ID are required.', 400, 'driver-session-bad-request');
  }

  try {
    const existing = await readSessionRow(normalizedDriverId);
    if (existing && isSessionExpired(existing)) {
      await deleteSessionRow(normalizedDriverId);
    }

    const activeSession = existing && !isSessionExpired(existing) ? existing : null;
    if (activeSession && String(activeSession.device_id || '').trim() !== normalizedDeviceId) {
      throw buildDriverSessionError('This driver account is already active on another device.', 409, 'driver-session-conflict');
    }

    const sessionToken = randomBytes(32).toString('hex');
    const result = await query(
      `INSERT INTO driver_mobile_sessions (
        driver_id,
        driver_name,
        device_id,
        session_token,
        created_at,
        last_seen_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (driver_id) DO UPDATE SET
        driver_name = EXCLUDED.driver_name,
        device_id = EXCLUDED.device_id,
        session_token = EXCLUDED.session_token,
        last_seen_at = NOW()
      RETURNING *`,
      [normalizedDriverId, String(driverName || '').trim(), normalizedDeviceId, sessionToken]
    );

    return mapSessionRow(result.rows[0]);
  } catch (error) {
    if (error?.code === 'driver-session-conflict' || error?.code === 'driver-session-bad-request') throw error;

    // DB unavailable — use in-memory fallback
    const existing = _memSessions.get(normalizedDriverId);
    const isExpired = !existing || isSessionExpired(existing);
    if (!isExpired && String(existing.device_id || '').trim() !== normalizedDeviceId) {
      throw buildDriverSessionError('This driver account is already active on another device.', 409, 'driver-session-conflict');
    }

    const sessionToken = randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const session = {
      driver_id: normalizedDriverId,
      driver_name: String(driverName || '').trim(),
      device_id: normalizedDeviceId,
      session_token: sessionToken,
      created_at: now,
      last_seen_at: now
    };
    _memSessions.set(normalizedDriverId, session);
    return mapSessionRow(session);
  }
};

export const validateDriverMobileSession = async ({ driverId, deviceId, sessionToken, touch = true }) => {
  const normalizedDriverId = String(driverId || '').trim();
  const normalizedDeviceId = String(deviceId || '').trim();
  const normalizedSessionToken = String(sessionToken || '').trim();

  if (!normalizedDriverId || !normalizedDeviceId || !normalizedSessionToken) {
    throw buildDriverSessionError('Driver session credentials are missing. Sign in again.', 401, 'driver-session-missing');
  }

  try {
    const existing = await readSessionRow(normalizedDriverId);
    if (!existing) {
      throw buildDriverSessionError('Your driver session expired. Sign in again.', 401, 'driver-session-expired');
    }

    if (isSessionExpired(existing)) {
      await deleteSessionRow(normalizedDriverId);
      throw buildDriverSessionError('Your driver session expired. Sign in again.', 401, 'driver-session-expired');
    }

    if (String(existing.device_id || '').trim() !== normalizedDeviceId) {
      throw buildDriverSessionError('This driver account is active on another device.', 409, 'driver-session-conflict');
    }

    if (String(existing.session_token || '').trim() !== normalizedSessionToken) {
      throw buildDriverSessionError('This driver session is no longer valid. Sign in again.', 401, 'driver-session-invalid');
    }

    if (touch) {
      await query(`UPDATE driver_mobile_sessions SET last_seen_at = NOW() WHERE driver_id = $1`, [normalizedDriverId]);
    }

    return {
      ...mapSessionRow(existing),
      lastSeenAt: new Date().toISOString()
    };
  } catch (error) {
    if (error?.code?.startsWith('driver-session-')) throw error;

    // DB unavailable — check in-memory fallback
    const existing = _memSessions.get(normalizedDriverId);
    if (!existing || isSessionExpired(existing)) {
      throw buildDriverSessionError('Your driver session expired. Sign in again.', 401, 'driver-session-expired');
    }

    if (String(existing.device_id || '').trim() !== normalizedDeviceId) {
      throw buildDriverSessionError('This driver account is active on another device.', 409, 'driver-session-conflict');
    }

    if (String(existing.session_token || '').trim() !== normalizedSessionToken) {
      throw buildDriverSessionError('This driver session is no longer valid. Sign in again.', 401, 'driver-session-invalid');
    }

    if (touch) {
      _memSessions.set(normalizedDriverId, { ...existing, last_seen_at: new Date().toISOString() });
    }

    return {
      ...mapSessionRow(existing),
      lastSeenAt: new Date().toISOString()
    };
  }
};

export const releaseDriverMobileSession = async ({ driverId, deviceId = '', sessionToken = '' }) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return false;

  const params = [normalizedDriverId];
  const clauses = ['driver_id = $1'];
  if (String(deviceId || '').trim()) {
    params.push(String(deviceId).trim());
    clauses.push(`device_id = $${params.length}`);
  }
  if (String(sessionToken || '').trim()) {
    params.push(String(sessionToken).trim());
    clauses.push(`session_token = $${params.length}`);
  }

  try {
    const result = await query(`DELETE FROM driver_mobile_sessions WHERE ${clauses.join(' AND ')}`, params);
    return Number(result.rowCount || 0) > 0;
  } catch {
    // DB unavailable — remove from in-memory fallback
    const had = _memSessions.has(normalizedDriverId);
    _memSessions.delete(normalizedDriverId);
    return had;
  }
};

export { buildDriverSessionError };