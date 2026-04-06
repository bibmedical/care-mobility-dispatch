import { query } from '@/server/db';

const STALE_OPEN_SESSION_MS = 18 * 60 * 60 * 1000;
let ensureTablePromise = null;

const ensureTable = async () => {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_role TEXT,
      user_email TEXT,
      ip_address TEXT,
      event_type TEXT NOT NULL,
      event_label TEXT,
      target TEXT,
      metadata JSONB,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      date TEXT,
      time TEXT
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC)`);
  })().catch(error => {
    ensureTablePromise = null;
    throw error;
  });

  return ensureTablePromise;
};

const buildBaseLogEntry = ({ userId, userName, userRole, userEmail, ipAddress = '', eventType, eventLabel = '', metadata = null, target = '' }) => {
  const timestamp = new Date().toISOString();
  return {
    id: `${userId}-${timestamp}`,
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
    time: new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
};

const insertLogEntry = async (entry) => {
  await ensureTable();
  await query(
    `INSERT INTO activity_logs (id, user_id, user_name, user_role, user_email, ip_address, event_type, event_label, target, metadata, timestamp, date, time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO NOTHING`,
    [entry.id, entry.userId, entry.userName, entry.userRole, entry.userEmail, entry.ipAddress, entry.eventType, entry.eventLabel, entry.target, entry.metadata ? JSON.stringify(entry.metadata) : null, entry.timestamp, entry.date, entry.time]
  );
  return entry;
};

export const logLoginEvent = async (userId, userName, userRole, userEmail, ipAddress = '') => {
  try {
    await ensureTable();
    const cutoff = new Date(Date.now() - STALE_OPEN_SESSION_MS).toISOString();
    const existing = await query(
      `SELECT * FROM activity_logs WHERE user_id = $1 AND event_type = 'LOGIN' AND timestamp > $2 ORDER BY timestamp DESC LIMIT 1`,
      [userId, cutoff]
    );
    if (existing.rows[0]) return existing.rows[0];
    const entry = buildBaseLogEntry({ userId, userName, userRole, userEmail, ipAddress, eventType: 'LOGIN', eventLabel: 'Signed in' });
    return await insertLogEntry(entry);
  } catch (error) {
    console.error('Error logging login event:', error);
    throw error;
  }
};

export const logLogoutEvent = async (userId) => {
  try {
    await ensureTable();
    const lastLogin = await query(
      `SELECT * FROM activity_logs WHERE user_id = $1 AND event_type = 'LOGIN' ORDER BY timestamp DESC LIMIT 1`,
      [userId]
    );
    const ref = lastLogin.rows[0] || {};
    const entry = buildBaseLogEntry({ userId, userName: ref.user_name || 'Unknown', userRole: ref.user_role || 'Unknown', userEmail: ref.user_email || 'Unknown', ipAddress: ref.ip_address || '', eventType: 'LOGOUT', eventLabel: 'Signed out' });
    return await insertLogEntry(entry);
  } catch (error) {
    console.error('Error logging logout event:', error);
  }
};

export const getAllActivityLogs = async () => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM activity_logs ORDER BY timestamp DESC`);
    return result.rows.map(r => ({ ...r, userId: r.user_id, userName: r.user_name, userRole: r.user_role, userEmail: r.user_email, ipAddress: r.ip_address, eventType: r.event_type, eventLabel: r.event_label }));
  } catch (error) {
    console.error('Error getting all activity logs:', error);
    return [];
  }
};

export const logUserActionEvent = async ({ userId, userName, userRole, userEmail, ipAddress = '', eventLabel, target = '', metadata = null }) => {
  try {
    if (!userId) return null;
    const entry = buildBaseLogEntry({ userId, userName: userName || 'Unknown', userRole: userRole || 'Unknown', userEmail: userEmail || 'Unknown', ipAddress, eventType: 'ACTION', eventLabel: String(eventLabel || 'Action performed'), target: String(target || ''), metadata: metadata && typeof metadata === 'object' ? metadata : null });
    return await insertLogEntry(entry);
  } catch (error) {
    console.error('Error logging user action event:', error);
    return null;
  }
};

export const getActivityLogsByUserId = async (userId) => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY timestamp DESC`, [userId]);
    return result.rows;
  } catch (error) {
    console.error('Error getting activity logs for user:', error);
    return [];
  }
};

export const getActivityLogsByRole = async (role) => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM activity_logs WHERE user_role = $1 ORDER BY timestamp DESC`, [role]);
    return result.rows;
  } catch (error) {
    return [];
  }
};

export const getActivityLogsByDate = async (date) => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM activity_logs WHERE date = $1 ORDER BY timestamp DESC`, [date]);
    return result.rows;
  } catch (error) {
    return [];
  }
};

export const getActivityLogsSummary = async () => {
  try {
    await ensureTable();
    const today = new Date().toISOString().split('T')[0];
    const [total, todayCount, roles, online] = await Promise.all([
      query(`SELECT COUNT(*) FROM activity_logs`),
      query(`SELECT COUNT(*) FROM activity_logs WHERE date = $1`, [today]),
      query(`SELECT user_role, COUNT(*) FROM activity_logs GROUP BY user_role`),
      query(`SELECT DISTINCT ON (user_id) user_id, user_name, user_role, user_email, event_type, timestamp FROM activity_logs ORDER BY user_id, timestamp DESC`)
    ]);
    const roleCount = {};
    roles.rows.forEach(r => { roleCount[r.user_role] = Number(r.count); });
    const onlineUsers = online.rows.filter(r => r.event_type === 'LOGIN').map(r => ({ userId: r.user_id, userName: r.user_name, userRole: r.user_role, userEmail: r.user_email, lastEvent: 'LOGIN', lastTimestamp: r.timestamp, isOnline: true }));
    return { totalEvents: Number(total.rows[0].count), todayEvents: Number(todayCount.rows[0].count), uniqueUsers: online.rows.length, roleCount, onlineUsers };
  } catch (error) {
    console.error('Error getting activity logs summary:', error);
    return { totalEvents: 0, todayEvents: 0, uniqueUsers: 0, roleCount: {}, onlineUsers: [] };
  }
};

export const clearOldActivityLogs = async (daysOld = 90) => {
  try {
    await ensureTable();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    await query(`DELETE FROM activity_logs WHERE timestamp < $1`, [cutoff.toISOString()]);
  } catch (error) {
    console.error('Error clearing old activity logs:', error);
  }
};
