import { query } from '@/server/db';

const MEDIA_RETENTION_DAYS = 60;

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS system_messages (
      id TEXT PRIMARY KEY,
      driver_id TEXT,
      type TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      subject TEXT,
      body TEXT,
      priority TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_system_messages_driver_id ON system_messages(driver_id)`);
};

export const readSystemMessages = async () => {
  await ensureTable();
  const result = await query(`SELECT * FROM system_messages ORDER BY created_at DESC`);
  const messages = result.rows.map(row => ({
    id: row.id,
    driverId: row.driver_id,
    type: row.type,
    status: row.status,
    subject: row.subject,
    body: row.body,
    priority: row.priority,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    ...row.data
  }));
  const expiredMediaMessages = messages.filter(message => {
    if (!String(message?.mediaUrl || '').trim()) return false;
    const createdAt = new Date(message?.createdAt || 0).getTime();
    if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
    return Date.now() - createdAt >= MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  });

  if (expiredMediaMessages.length > 0) {
    await Promise.allSettled(expiredMediaMessages.map(message => clearSystemMessageMediaById(message.id)));
    return messages.map(message => expiredMediaMessages.some(expired => expired.id === message.id) ? {
      ...message,
      mediaUrl: null,
      mediaType: null,
      mediaDeletedAt: new Date().toISOString(),
      mediaRetentionDays: MEDIA_RETENTION_DAYS
    } : message);
  }

  return messages;
};

export const writeSystemMessages = async messages => {
  await ensureTable();
  await query(`DELETE FROM system_messages`);
  for (const msg of messages) {
    await upsertSystemMessage(msg);
  }
  return messages;
};

export const upsertSystemMessage = async newMsg => {
  await ensureTable();
  await query(
    `INSERT INTO system_messages (id, driver_id, type, status, subject, body, priority, data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       driver_id = EXCLUDED.driver_id,
       type = EXCLUDED.type,
       status = EXCLUDED.status,
       subject = EXCLUDED.subject,
       body = EXCLUDED.body,
       priority = EXCLUDED.priority,
       data = EXCLUDED.data`,
    [
      newMsg.id,
      newMsg.driverId || null,
      newMsg.type || null,
      newMsg.status || 'active',
      newMsg.subject || null,
      newMsg.body || null,
      newMsg.priority || null,
      JSON.stringify(newMsg),
      newMsg.createdAt ? new Date(newMsg.createdAt) : new Date()
    ]
  );
  return newMsg;
};

export const resolveSystemMessageById = async id => {
  await ensureTable();
  const resolvedAt = new Date().toISOString();
  await query(
    `UPDATE system_messages SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
    [id]
  );
  const result = await query(`SELECT * FROM system_messages WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...row.data, id: row.id, status: 'resolved', resolvedAt };
};

export const clearSystemMessageMediaById = async id => {
  await ensureTable();
  const result = await query(`SELECT * FROM system_messages WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) return null;

  const current = {
    id: row.id,
    driverId: row.driver_id,
    type: row.type,
    status: row.status,
    subject: row.subject,
    body: row.body,
    priority: row.priority,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    ...row.data
  };

  const next = {
    ...current,
    mediaUrl: null,
    mediaType: null,
    mediaDeletedAt: new Date().toISOString(),
    mediaRetentionDays: MEDIA_RETENTION_DAYS
  };

  await upsertSystemMessage(next);
  return next;
};

export const getActiveMessageForDriver = async (driverId, type) => {
  await ensureTable();
  const result = await query(
    `SELECT * FROM system_messages WHERE driver_id = $1 AND type = $2 AND status = 'active' LIMIT 1`,
    [driverId, type]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row.data, id: row.id, driverId: row.driver_id, type: row.type, status: row.status };
};
