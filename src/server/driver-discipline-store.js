import { query } from '@/server/db';

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS driver_discipline_events (
      event_id TEXT PRIMARY KEY,
      driver_id TEXT NOT NULL,
      trip_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'logged',
      summary TEXT,
      body TEXT,
      source_message_id TEXT,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_driver_discipline_events_driver_id ON driver_discipline_events(driver_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_driver_discipline_events_trip_id ON driver_discipline_events(trip_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_driver_discipline_events_occurred_at ON driver_discipline_events(occurred_at DESC)`);
  tableReady = true;
};

export const upsertDriverDisciplineEvent = async event => {
  await ensureTable();
  const data = event?.data && typeof event.data === 'object' ? event.data : {};
  await query(
    `INSERT INTO driver_discipline_events (
      event_id,
      driver_id,
      trip_id,
      event_type,
      severity,
      status,
      summary,
      body,
      source_message_id,
      data,
      occurred_at,
      resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (event_id) DO UPDATE SET
      driver_id = EXCLUDED.driver_id,
      trip_id = EXCLUDED.trip_id,
      event_type = EXCLUDED.event_type,
      severity = EXCLUDED.severity,
      status = EXCLUDED.status,
      summary = EXCLUDED.summary,
      body = EXCLUDED.body,
      source_message_id = EXCLUDED.source_message_id,
      data = EXCLUDED.data,
      occurred_at = EXCLUDED.occurred_at,
      resolved_at = EXCLUDED.resolved_at`,
    [
      event?.id,
      event?.driverId,
      event?.tripId || null,
      event?.eventType,
      event?.severity || 'normal',
      event?.status || 'logged',
      event?.summary || null,
      event?.body || null,
      event?.sourceMessageId || null,
      JSON.stringify(data),
      event?.occurredAt ? new Date(event.occurredAt) : new Date(),
      event?.resolvedAt ? new Date(event.resolvedAt) : null
    ]
  );
  return {
    ...event,
    data
  };
};

export const resolveDriverDisciplineEventById = async eventId => {
  await ensureTable();
  await query(
    `UPDATE driver_discipline_events SET status = 'resolved', resolved_at = NOW() WHERE event_id = $1`,
    [eventId]
  );
};

export const readDriverDisciplineEvents = async ({ driverId = '', activeOnly = false, limit = 500 } = {}) => {
  await ensureTable();
  const clauses = [];
  const params = [];
  if (String(driverId || '').trim()) {
    params.push(String(driverId).trim());
    clauses.push(`driver_id = $${params.length}`);
  }
  if (activeOnly) {
    clauses.push(`status = 'active'`);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 500, 5000)));
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM driver_discipline_events ${whereClause} ORDER BY occurred_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map(row => ({
    id: row.event_id,
    driverId: row.driver_id,
    tripId: row.trip_id,
    eventType: row.event_type,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    body: row.body,
    sourceMessageId: row.source_message_id,
    createdAt: row.occurred_at,
    occurredAt: row.occurred_at,
    resolvedAt: row.resolved_at,
    ...(row.data || {})
  }));
};