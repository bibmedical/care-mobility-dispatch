import { query, queryOne, queryRows } from '@/server/db';

const STALE_OPEN_SESSION_MS = 18 * 60 * 60 * 1000;
const ACTIVE_WEB_HEARTBEAT_WINDOW_MS = parseInt(process.env.ACTIVE_WEB_HEARTBEAT_WINDOW_MS || '180000', 10);
const ACTIVE_WEB_LOGIN_GRACE_MS = parseInt(process.env.ACTIVE_WEB_LOGIN_GRACE_MS || '120000', 10);
const isOperationalActivityLoggingEnabled = () => String(process.env.ENABLE_ACTIVITY_ACTION_LOGS || '').trim().toLowerCase() === 'true';

const toIsoTimestamp = value => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const toDateKey = timestamp => new Date(timestamp).toISOString().split('T')[0];

const toTimeKey = timestamp => new Date(timestamp).toLocaleTimeString('en-US', {
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

const mapRowToLog = row => {
  const timestamp = toIsoTimestamp(row?.timestamp);
  return {
    id: String(row?.id || ''),
    userId: String(row?.user_id || ''),
    userName: String(row?.user_name || ''),
    userRole: String(row?.user_role || ''),
    userEmail: String(row?.user_email || ''),
    ipAddress: String(row?.ip_address || ''),
    eventType: String(row?.event_type || ''),
    eventLabel: String(row?.event_label || ''),
    target: String(row?.target || ''),
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : null,
    timestamp,
    date: row?.date || toDateKey(timestamp),
    time: row?.time || toTimeKey(timestamp)
  };
};

const fetchAllLogsDesc = async () => {
  const rows = await queryRows(`
    SELECT id, user_id, user_name, user_role, user_email, ip_address, event_type, event_label, target, metadata, timestamp, date, time
    FROM activity_logs
    ORDER BY timestamp DESC
    LIMIT 5000
  `);
  return rows.map(mapRowToLog);
};

const getLatestPresenceHeartbeat = async (userId, sinceTimestamp = null) => {
  if (!userId) return null;

  const params = [String(userId)];
  const timestampFilter = sinceTimestamp ? 'AND timestamp >= $2::timestamptz' : '';
  if (sinceTimestamp) {
    params.push(toIsoTimestamp(sinceTimestamp));
  }

  const row = await queryOne(
    `
      SELECT id, user_id, user_name, user_role, user_email, ip_address, event_type, event_label, target, metadata, timestamp, date, time
      FROM activity_logs
      WHERE user_id = $1
        AND event_type = 'ACTION'
        AND event_label = 'Presence heartbeat'
        ${timestampFilter}
      ORDER BY timestamp DESC
      LIMIT 1
    `,
    params
  );

  return row ? mapRowToLog(row) : null;
};

const getLatestOpenLoginForUser = async userId => {
  if (!userId) return null;

  const row = await queryOne(
    `
      SELECT login.id, login.user_id, login.user_name, login.user_role, login.user_email, login.ip_address, login.event_type, login.event_label, login.target, login.metadata, login.timestamp, login.date, login.time
      FROM activity_logs AS login
      WHERE login.user_id = $1
        AND login.event_type = 'LOGIN'
        AND NOT EXISTS (
          SELECT 1
          FROM activity_logs AS logout
          WHERE logout.user_id = login.user_id
            AND logout.event_type = 'LOGOUT'
            AND logout.timestamp > login.timestamp
        )
      ORDER BY login.timestamp DESC
      LIMIT 1
    `,
    [String(userId)]
  );

  return row ? mapRowToLog(row) : null;
};

const insertLog = async logEntry => {
  await query(
    `
      INSERT INTO activity_logs (
        id,
        user_id,
        user_name,
        user_role,
        user_email,
        ip_address,
        event_type,
        event_label,
        target,
        metadata,
        timestamp,
        date,
        time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz, $12, $13)
    `,
    [
      logEntry.id,
      logEntry.userId,
      logEntry.userName,
      logEntry.userRole,
      logEntry.userEmail,
      logEntry.ipAddress,
      logEntry.eventType,
      logEntry.eventLabel,
      logEntry.target,
      logEntry.metadata ? JSON.stringify(logEntry.metadata) : null,
      logEntry.timestamp,
      logEntry.date,
      logEntry.time
    ]
  );
};

const buildBaseLogEntry = ({
  userId,
  userName,
  userRole,
  userEmail,
  ipAddress = '',
  eventType,
  eventLabel = '',
  metadata = null,
  target = ''
}) => {
  const timestamp = new Date().toISOString();
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `${userId}-${timestamp}-${uniqueSuffix}`,
    userId,
    userName,
    userRole,
    userEmail,
    ipAddress,
    eventType,
    eventLabel,
    target,
    metadata,
    timestamp,
    date: new Date(timestamp).toISOString().split('T')[0],
    time: new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  };
};

const getSessionLogsAscending = logs => [...(Array.isArray(logs) ? logs : [])]
  .filter(log => log?.userId && (log.eventType === 'LOGIN' || log.eventType === 'LOGOUT'))
  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

const getOpenSessionsByUserId = logs => {
  const openSessions = new Map();
  getSessionLogsAscending(logs).forEach(log => {
    if (log.eventType === 'LOGIN') {
      openSessions.set(log.userId, log);
      return;
    }
    openSessions.delete(log.userId);
  });
  return openSessions;
};

export const hasRecentOpenWebSession = async (userId, options = {}) => {
  try {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return false;

    const requestIp = String(options?.requestIp || '').trim();
    if (process.env.NODE_ENV !== 'production' && (!requestIp || requestIp === 'localhost')) {
      return false;
    }

    const openSession = await getLatestOpenLoginForUser(normalizedUserId);
    if (!openSession?.timestamp) return false;

    const nowMs = Date.now();
    const openSessionTimestampMs = new Date(openSession.timestamp).getTime();
    const openSessionAgeMs = nowMs - openSessionTimestampMs;
    if (!Number.isFinite(openSessionAgeMs) || openSessionAgeMs < 0 || openSessionAgeMs >= STALE_OPEN_SESSION_MS) {
      return false;
    }

    const latestHeartbeat = await getLatestPresenceHeartbeat(normalizedUserId, openSession.timestamp);
    if (latestHeartbeat?.timestamp) {
      const heartbeatTimestampMs = new Date(latestHeartbeat.timestamp).getTime();
      const heartbeatAgeMs = nowMs - heartbeatTimestampMs;
      const heartbeatBelongsToOpenSession = Number.isFinite(heartbeatTimestampMs)
        && heartbeatTimestampMs >= openSessionTimestampMs;
      if (heartbeatBelongsToOpenSession
        && Number.isFinite(heartbeatAgeMs)
        && heartbeatAgeMs >= 0
        && heartbeatAgeMs <= ACTIVE_WEB_HEARTBEAT_WINDOW_MS) {
        return true;
      }
    }

    // Keep a short grace window right after login while the first heartbeat arrives.
    return openSessionAgeMs <= ACTIVE_WEB_LOGIN_GRACE_MS;
  } catch (error) {
    console.error('Error checking recent open web session:', error);
    return false;
  }
};

/**
 * Log a login event
 */
export const logLoginEvent = async (userId, userName, userRole, userEmail, ipAddress = '') => {
  try {
    const openSession = await getLatestOpenLoginForUser(userId);
    if (openSession?.timestamp) {
      const openSessionAgeMs = Date.now() - new Date(openSession.timestamp).getTime();
      const sameIp = String(openSession.ipAddress || '').trim() === String(ipAddress || '').trim();
      if (Number.isFinite(openSessionAgeMs) && openSessionAgeMs >= 0 && openSessionAgeMs < 60_000 && sameIp) {
        return openSession;
      }
    }

    const logEntry = buildBaseLogEntry({
      userId,
      userName,
      userRole,
      userEmail,
      ipAddress,
      eventType: 'LOGIN',
      eventLabel: 'Signed in'
    });

    await insertLog(logEntry);
    
    return logEntry;
  } catch (error) {
    console.error('Error logging login event:', error);
    throw error;
  }
};

/**
 * Log a logout event
 */
export const logLogoutEvent = async (userId) => {
  try {
    const logs = await fetchAllLogsDesc();
    // Find the corresponding login entry to get user details
    const lastLoginEntry = logs
      .filter(log => log.userId === userId && log.eventType === 'LOGIN')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    const logEntry = buildBaseLogEntry({
      userId,
      userName: lastLoginEntry?.userName || 'Unknown',
      userRole: lastLoginEntry?.userRole || 'Unknown',
      userEmail: lastLoginEntry?.userEmail || 'Unknown',
      ipAddress: lastLoginEntry?.ipAddress || '',
      eventType: 'LOGOUT',
      eventLabel: 'Signed out'
    });

    await insertLog(logEntry);
    
    return logEntry;
  } catch (error) {
    console.error('Error logging logout event:', error);
  }
};

export const releaseOpenWebSession = async (userId, options = {}) => {
  try {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return null;

    const openSession = await getLatestOpenLoginForUser(normalizedUserId);
    if (!openSession?.timestamp) return null;

    const logEntry = buildBaseLogEntry({
      userId: normalizedUserId,
      userName: openSession.userName || 'Unknown',
      userRole: openSession.userRole || 'Unknown',
      userEmail: openSession.userEmail || 'Unknown',
      ipAddress: String(options?.ipAddress || openSession.ipAddress || '').trim(),
      eventType: 'LOGOUT',
      eventLabel: 'Signed out',
      target: 'session-takeover',
      metadata: {
        kind: 'session-takeover',
        reason: String(options?.reason || 'Session takeover').trim() || 'Session takeover',
        replacedLoginId: openSession.id,
        replacedLoginTimestamp: openSession.timestamp
      }
    });

    await insertLog(logEntry);
    return logEntry;
  } catch (error) {
    console.error('Error releasing open web session:', error);
    return null;
  }
};

/**
 * Get all activity logs
 */
export const getAllActivityLogs = async () => {
  try {
    return await fetchAllLogsDesc();
  } catch (error) {
    console.error('Error getting all activity logs:', error);
    return [];
  }
};

/**
 * Log a generic user action event (SMS, assistant, dispatch operations, etc)
 */
export const logUserActionEvent = async ({
  userId,
  userName,
  userRole,
  userEmail,
  ipAddress = '',
  eventLabel,
  target = '',
  metadata = null
}) => {
  try {
    if (!isOperationalActivityLoggingEnabled()) return null;
    if (!userId) return null;
    const logEntry = buildBaseLogEntry({
      userId,
      userName: userName || 'Unknown',
      userRole: userRole || 'Unknown',
      userEmail: userEmail || 'Unknown',
      ipAddress,
      eventType: 'ACTION',
      eventLabel: String(eventLabel || 'Action performed'),
      target: String(target || ''),
      metadata: metadata && typeof metadata === 'object' ? metadata : null
    });
    await insertLog(logEntry);
    return logEntry;
  } catch (error) {
    console.error('Error logging user action event:', error);
    return null;
  }
};

/**
 * Log lightweight presence heartbeat event (throttled).
 */
export const logPresenceHeartbeat = async ({
  userId,
  userName,
  userRole,
  userEmail,
  ipAddress = '',
  metadata = null,
  minIntervalMs = 60 * 1000
}) => {
  try {
    if (!isOperationalActivityLoggingEnabled()) return null;
    if (!userId) return null;

    const latestHeartbeat = await getLatestPresenceHeartbeat(userId);
    if (latestHeartbeat?.timestamp) {
      const ageMs = Date.now() - new Date(latestHeartbeat.timestamp).getTime();
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < Math.max(5_000, Number(minIntervalMs) || 60_000)) {
        return {
          ...latestHeartbeat,
          skipped: true
        };
      }
    }

    const logEntry = buildBaseLogEntry({
      userId,
      userName: userName || 'Unknown',
      userRole: userRole || 'Unknown',
      userEmail: userEmail || 'Unknown',
      ipAddress,
      eventType: 'ACTION',
      eventLabel: 'Presence heartbeat',
      target: 'session-presence',
      metadata: {
        kind: 'presence-heartbeat',
        ...(metadata && typeof metadata === 'object' ? metadata : {})
      }
    });

    await insertLog(logEntry);
    return logEntry;
  } catch (error) {
    console.error('Error logging presence heartbeat:', error);
    return null;
  }
};

/**
 * Get logs by user ID
 */
export const getActivityLogsByUserId = async (userId) => {
  try {
    const logs = await fetchAllLogsDesc();
    return logs
      .filter(log => log.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting activity logs for user:', error);
    return [];
  }
};

/**
 * Get logs by role (admin, driver, attendant, etc.)
 */
export const getActivityLogsByRole = async (role) => {
  try {
    const logs = await fetchAllLogsDesc();
    return logs
      .filter(log => log.userRole === role)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting activity logs by role:', error);
    return [];
  }
};

/**
 * Get logs by date
 */
export const getActivityLogsByDate = async (date) => {
  try {
    const logs = await fetchAllLogsDesc();
    return logs
      .filter(log => log.date === date)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error('Error getting activity logs by date:', error);
    return [];
  }
};

/**
 * Get summary stats
 */
export const getActivityLogsSummary = async () => {
  try {
    const logs = await fetchAllLogsDesc();
    
    // Count events today
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(log => log.date === today);
    
    // Unique users
    const uniqueUsers = new Set(logs.map(log => log.userId)).size;
    
    // Count by role
    const roleCount = {};
    logs.forEach(log => {
      if (!roleCount[log.userRole]) {
        roleCount[log.userRole] = 0;
      }
      roleCount[log.userRole]++;
    });
    
    // Count online (last event was login)
    const onlineUsers = Array.from(getOpenSessionsByUserId(logs).values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(log => ({
        userId: log.userId,
        userName: log.userName,
        userRole: log.userRole,
        userEmail: log.userEmail,
        lastEvent: 'LOGIN',
        lastTimestamp: log.timestamp,
        isOnline: true,
        activeLoginId: log.id,
        activeLoginTimestamp: log.timestamp
      }));
    
    return {
      totalEvents: logs.length,
      todayEvents: todayLogs.length,
      uniqueUsers,
      roleCount,
      onlineUsers
    };
  } catch (error) {
    console.error('Error getting activity logs summary:', error);
    return {
      totalEvents: 0,
      todayEvents: 0,
      uniqueUsers: 0,
      roleCount: {},
      onlineUsers: []
    };
  }
};

/**
 * Clear old logs (older than N days)
 */
export const clearOldActivityLogs = async (daysOld = 90) => {
  try {
    const safeDays = Math.max(1, Number(daysOld) || 90);
    await query(`DELETE FROM activity_logs WHERE timestamp < NOW() - ($1::text || ' days')::interval`, [String(safeDays)]);
    const [{ count }] = await queryRows(`SELECT COUNT(*)::int AS count FROM activity_logs`);
    return Number(count) || 0;
  } catch (error) {
    console.error('Error clearing old activity logs:', error);
  }
};

export const clearAllActivityLogs = async () => {
  try {
    await query('DELETE FROM activity_logs');
    const [{ count }] = await queryRows('SELECT COUNT(*)::int AS count FROM activity_logs');
    return Number(count) || 0;
  } catch (error) {
    console.error('Error clearing all activity logs:', error);
    throw error;
  }
};
