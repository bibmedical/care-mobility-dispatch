import { query } from '@/server/db';

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS sms_delivery_logs (
      id BIGSERIAL PRIMARY KEY,
      trip_id TEXT,
      driver_id TEXT,
      audience TEXT,
      event_type TEXT,
      provider TEXT,
      recipient_phone TEXT,
      recipient_name TEXT,
      message_body TEXT,
      message_id TEXT,
      provider_status TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_trip_id ON sms_delivery_logs(trip_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_driver_id ON sms_delivery_logs(driver_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_created_at ON sms_delivery_logs(created_at DESC)`);
  tableReady = true;
};

export const logSmsDelivery = async entry => {
  await ensureTable();
  const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  const result = await query(
    `INSERT INTO sms_delivery_logs (
      trip_id,
      driver_id,
      audience,
      event_type,
      provider,
      recipient_phone,
      recipient_name,
      message_body,
      message_id,
      provider_status,
      status,
      error,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, created_at`,
    [
      entry?.tripId || null,
      entry?.driverId || null,
      entry?.audience || null,
      entry?.eventType || null,
      entry?.provider || null,
      entry?.recipientPhone || null,
      entry?.recipientName || null,
      entry?.messageBody || null,
      entry?.messageId || null,
      entry?.providerStatus || null,
      entry?.status || 'queued',
      entry?.error || null,
      JSON.stringify(metadata)
    ]
  );
  return {
    id: result.rows[0]?.id,
    createdAt: result.rows[0]?.created_at,
    ...entry,
    metadata
  };
};

export const readSmsDeliveryLogs = async ({ tripId = '', driverId = '', limit = 200 } = {}) => {
  await ensureTable();
  const clauses = [];
  const params = [];
  if (String(tripId || '').trim()) {
    params.push(String(tripId).trim());
    clauses.push(`trip_id = $${params.length}`);
  }
  if (String(driverId || '').trim()) {
    params.push(String(driverId).trim());
    clauses.push(`driver_id = $${params.length}`);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 200, 1000)));
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM sms_delivery_logs ${whereClause} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map(row => ({
    id: row.id,
    tripId: row.trip_id,
    driverId: row.driver_id,
    audience: row.audience,
    eventType: row.event_type,
    provider: row.provider,
    recipientPhone: row.recipient_phone,
    recipientName: row.recipient_name,
    messageBody: row.message_body,
    messageId: row.message_id,
    providerStatus: row.provider_status,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    ...row.metadata
  }));
};