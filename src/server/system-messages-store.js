import { readFile } from 'fs/promises';
import { query } from '@/server/db';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const MEDIA_RETENTION_DAYS = 60;

let tableReady = false;

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production';

const getSystemMessagesStorageFile = () => getStorageFilePath('system-messages.json');

const ensureTable = async () => {
  if (tableReady) return;
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for system messages in production');
  }
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
  tableReady = true;
};

const readLocalSystemMessages = async () => {
  try {
    const raw = await readFile(getSystemMessagesStorageFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
};

const writeLocalSystemMessages = async messages => {
  await writeJsonFileWithSnapshots({
    filePath: getSystemMessagesStorageFile(),
    nextValue: messages,
    backupName: 'system-messages-local'
  });
  return messages;
};

export const readSystemMessages = async () => {
  let messages;
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM system_messages ORDER BY created_at DESC LIMIT 500`);
    messages = result.rows.map(row => ({
      ...row.data,
      id: row.id,
      driverId: row.driver_id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      body: row.body,
      priority: row.priority,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    messages = await readLocalSystemMessages();
  }
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

export const readActiveSystemMessagesByDriverIds = async (driverIds = [], limit = 200) => {
  const normalizedDriverIds = Array.from(new Set((Array.isArray(driverIds) ? driverIds : []).map(driverId => String(driverId || '').trim()).filter(Boolean)));
  if (normalizedDriverIds.length === 0) return [];

  try {
    await ensureTable();
    const result = await query(
      `SELECT * FROM system_messages
       WHERE status = 'active' AND driver_id = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT $2`,
      [normalizedDriverIds, Math.max(1, Number(limit) || 200)]
    );
    return result.rows.map(row => ({
      ...row.data,
      id: row.id,
      driverId: row.driver_id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      body: row.body,
      priority: row.priority,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const localMessages = await readLocalSystemMessages();
    return localMessages
      .filter(message => String(message?.status || '').trim().toLowerCase() === 'active' && normalizedDriverIds.includes(String(message?.driverId || '').trim()))
      .slice(0, Math.max(1, Number(limit) || 200));
  }
};

export const writeSystemMessages = async messages => {
  try {
    await ensureTable();
    for (const msg of messages) {
      await upsertSystemMessage(msg);
    }
    return messages;
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    await writeLocalSystemMessages(messages);
  }
  return messages;
};

export const upsertSystemMessage = async newMsg => {
  try {
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
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const messages = await readLocalSystemMessages();
    const nextMessages = messages.filter(message => String(message?.id || '').trim() !== String(newMsg?.id || '').trim());
    nextMessages.unshift(newMsg);
    await writeLocalSystemMessages(nextMessages);
  }
  return newMsg;
};

export const resolveSystemMessageById = async id => {
  try {
    await ensureTable();
    const resolvedAt = new Date().toISOString();
    await query(
      `UPDATE system_messages SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
      [id]
    );
    const result = await query(`SELECT * FROM system_messages WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row.data,
      id: row.id,
      driverId: row.driver_id,
      type: row.type,
      subject: row.subject,
      body: row.body,
      priority: row.priority,
      status: 'resolved',
      resolvedAt,
      createdAt: row.created_at
    };
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const messages = await readLocalSystemMessages();
    const resolvedAt = new Date().toISOString();
    let updated = null;
    const nextMessages = messages.map(message => {
      if (String(message?.id || '').trim() !== String(id || '').trim()) return message;
      updated = { ...message, status: 'resolved', resolvedAt };
      return updated;
    });
    await writeLocalSystemMessages(nextMessages);
    return updated;
  }
};

export const clearSystemMessageMediaById = async id => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM system_messages WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;

    const current = {
      ...row.data,
      id: row.id,
      driverId: row.driver_id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      body: row.body,
      priority: row.priority,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at
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
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const messages = await readLocalSystemMessages();
    let updated = null;
    const nextMessages = messages.map(message => {
      if (String(message?.id || '').trim() !== String(id || '').trim()) return message;
      updated = {
        ...message,
        mediaUrl: null,
        mediaType: null,
        mediaDeletedAt: new Date().toISOString(),
        mediaRetentionDays: MEDIA_RETENTION_DAYS
      };
      return updated;
    });
    await writeLocalSystemMessages(nextMessages);
    return updated;
  }
};

export const resolveMessagesByDriverId = async driverId => {
  try {
    await ensureTable();
    await query(
      `UPDATE system_messages SET status = 'resolved', resolved_at = NOW() WHERE driver_id = $1 AND status = 'active'`,
      [String(driverId || '').trim()]
    );
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const normalizedDriverId = String(driverId || '').trim();
    const messages = await readLocalSystemMessages();
    const nextMessages = messages.map(message => String(message?.driverId || '').trim() === normalizedDriverId && String(message?.status || '').trim() === 'active'
      ? { ...message, status: 'resolved', resolvedAt: new Date().toISOString() }
      : message);
    await writeLocalSystemMessages(nextMessages);
  }
};

export const reactivateMessagesByDriverId = async driverId => {
  try {
    await ensureTable();
    await query(
      `UPDATE system_messages SET status = 'active', resolved_at = NULL WHERE driver_id = $1 AND status = 'resolved'`,
      [String(driverId || '').trim()]
    );
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    const normalizedDriverId = String(driverId || '').trim();
    const messages = await readLocalSystemMessages();
    const nextMessages = messages.map(message => String(message?.driverId || '').trim() === normalizedDriverId && String(message?.status || '').trim() === 'resolved'
      ? { ...message, status: 'active', resolvedAt: null }
      : message);
    await writeLocalSystemMessages(nextMessages);
  }
};

export const getActiveMessageForDriver = async (driverId, type) => {
  try {
    await ensureTable();
    const result = await query(
      `SELECT * FROM system_messages WHERE driver_id = $1 AND type = $2 AND status = 'active' LIMIT 1`,
      [driverId, type]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row.data,
      id: row.id,
      driverId: row.driver_id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      body: row.body,
      priority: row.priority,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at
    };
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    return (await readLocalSystemMessages()).find(message => String(message?.driverId || '').trim() === String(driverId || '').trim() && String(message?.type || '').trim() === String(type || '').trim() && String(message?.status || '').trim() === 'active') || null;
  }
};
