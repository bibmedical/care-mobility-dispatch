import { query, queryOne } from '@/server/db';
import { runMigrations } from '@/server/db-schema';

const DEFAULT_WEB_AUTH_SESSION_HOURS = 12;

const normalizeIp = value => {
  const raw = String(value ?? '').split(',')[0].trim();
  if (!raw) return '';
  if (raw === '::1' || raw === '127.0.0.1' || raw === '::ffff:127.0.0.1') return 'localhost';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const getSessionLifetimeHours = () => {
  const parsed = Number.parseInt(process.env.WEB_AUTH_SESSION_MAX_HOURS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEB_AUTH_SESSION_HOURS;
};

const ensureTable = async () => {
  await runMigrations();
};

const cleanupExpiredSessions = async () => {
  await query(
    `DELETE FROM web_auth_sessions
      WHERE expires_at <= NOW()
         OR (revoked_at IS NOT NULL AND revoked_at <= NOW() - INTERVAL '7 days')`
  );
};

export const hasActiveWebSession = async (userId, {
  excludeSessionId = '',
  requestIp = ''
} = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return false;

  await ensureTable();
  await cleanupExpiredSessions();

  const normalizedExcludeSessionId = String(excludeSessionId || '').trim();
  const row = normalizedExcludeSessionId
    ? await queryOne(
      `SELECT session_id, ip_address
         FROM web_auth_sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
          AND session_id <> $2
        ORDER BY last_seen_at DESC
        LIMIT 1`,
      [normalizedUserId, normalizedExcludeSessionId]
    )
    : await queryOne(
      `SELECT session_id, ip_address
         FROM web_auth_sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        ORDER BY last_seen_at DESC
        LIMIT 1`,
      [normalizedUserId]
    );

  if (!row) return false;

  const normalizedRequestIp = normalizeIp(requestIp);
  const normalizedRowIp = normalizeIp(row.ip_address);
  if (normalizedRequestIp && normalizedRowIp && normalizedRequestIp === normalizedRowIp) {
    return false;
  }

  return true;
};

export const createWebAuthSession = async ({
  sessionId,
  userId,
  username = '',
  email = '',
  role = '',
  ipAddress = '',
  userAgent = ''
}) => {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedSessionId || !normalizedUserId) return null;

  await ensureTable();
  await cleanupExpiredSessions();

  const lifetimeHours = getSessionLifetimeHours();
  await query(
    `INSERT INTO web_auth_sessions (
        session_id,
        user_id,
        user_name,
        user_email,
        user_role,
        ip_address,
        user_agent,
        created_at,
        last_seen_at,
        expires_at,
        revoked_at,
        revoked_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW() + ($8::text || ' hours')::interval, NULL, NULL)
      ON CONFLICT (session_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        user_name = EXCLUDED.user_name,
        user_email = EXCLUDED.user_email,
        user_role = EXCLUDED.user_role,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        last_seen_at = NOW(),
        expires_at = NOW() + ($8::text || ' hours')::interval,
        revoked_at = NULL,
        revoked_reason = NULL`,
    [normalizedSessionId, normalizedUserId, username, email, role, normalizeIp(ipAddress), String(userAgent || '').slice(0, 512), String(lifetimeHours)]
  );

  return normalizedSessionId;
};

export const revokeWebAuthSession = async ({
  sessionId,
  userId,
  reason = 'Signed out'
}) => {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedSessionId && !normalizedUserId) return 0;

  await ensureTable();

  const clauses = ['revoked_at IS NULL'];
  const params = [String(reason || 'Signed out')];

  if (normalizedSessionId) {
    params.push(normalizedSessionId);
    clauses.push(`session_id = $${params.length}`);
  }

  if (normalizedUserId) {
    params.push(normalizedUserId);
    clauses.push(`user_id = $${params.length}`);
  }

  const result = await query(
    `UPDATE web_auth_sessions
        SET revoked_at = NOW(),
            revoked_reason = $1
      WHERE ${clauses.join(' AND ')}`,
    params
  );

  return result.rowCount || 0;
};

export const revokeOtherWebAuthSessions = async (userId, {
  excludeSessionId = '',
  reason = 'Session takeover'
} = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return 0;

  await ensureTable();

  const normalizedExcludeSessionId = String(excludeSessionId || '').trim();
  const params = [String(reason || 'Session takeover'), normalizedUserId];
  const exclusionClause = normalizedExcludeSessionId
    ? ` AND session_id <> $3`
    : '';

  if (normalizedExcludeSessionId) {
    params.push(normalizedExcludeSessionId);
  }

  const result = await query(
    `UPDATE web_auth_sessions
        SET revoked_at = NOW(),
            revoked_reason = $1
      WHERE user_id = $2
        AND revoked_at IS NULL
        AND expires_at > NOW()${exclusionClause}`,
    params
  );

  return result.rowCount || 0;
};