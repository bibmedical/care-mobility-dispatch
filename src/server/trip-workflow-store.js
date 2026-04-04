import { query } from '@/server/db';

const ensureTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS trip_workflow_events (
      event_id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      driver_id TEXT,
      action TEXT NOT NULL,
      timestamp_ms BIGINT NOT NULL,
      time_label TEXT,
      rider_signature_name TEXT,
      compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
      location_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_trip_workflow_events_trip_id ON trip_workflow_events(trip_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_trip_workflow_events_driver_id ON trip_workflow_events(driver_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_trip_workflow_events_timestamp_ms ON trip_workflow_events(timestamp_ms DESC)`);
  await query(`
    CREATE TABLE IF NOT EXISTS trip_arrival_events (
      event_id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      driver_id TEXT,
      rider TEXT,
      pickup_address TEXT,
      actual_pickup TEXT,
      arrival_timestamp_ms BIGINT NOT NULL,
      notification_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_trip_arrival_events_trip_id ON trip_arrival_events(trip_id)`);
};

export const appendTripWorkflowEvent = async event => {
  await ensureTables();
  const compliance = event?.compliance && typeof event.compliance === 'object' ? event.compliance : {};
  const locationSnapshot = event?.locationSnapshot && typeof event.locationSnapshot === 'object' ? event.locationSnapshot : {};
  const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  await query(
    `INSERT INTO trip_workflow_events (
      event_id,
      trip_id,
      driver_id,
      action,
      timestamp_ms,
      time_label,
      rider_signature_name,
      compliance,
      location_snapshot,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (event_id) DO NOTHING`,
    [
      event?.id,
      event?.tripId,
      event?.driverId || null,
      event?.action,
      Number(event?.timestamp) || Date.now(),
      event?.timeLabel || null,
      event?.riderSignatureName || null,
      JSON.stringify(compliance),
      JSON.stringify(locationSnapshot),
      JSON.stringify(metadata)
    ]
  );
  return {
    ...event,
    compliance,
    locationSnapshot,
    metadata
  };
};

export const logTripArrivalEvent = async event => {
  await ensureTables();
  const notificationSummary = event?.notificationSummary && typeof event.notificationSummary === 'object' ? event.notificationSummary : {};
  await query(
    `INSERT INTO trip_arrival_events (
      event_id,
      trip_id,
      driver_id,
      rider,
      pickup_address,
      actual_pickup,
      arrival_timestamp_ms,
      notification_summary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (event_id) DO NOTHING`,
    [
      event?.id,
      event?.tripId,
      event?.driverId || null,
      event?.rider || null,
      event?.pickupAddress || null,
      event?.actualPickup || null,
      Number(event?.arrivalTimestamp) || Date.now(),
      JSON.stringify(notificationSummary)
    ]
  );
  return {
    ...event,
    notificationSummary
  };
};

export const readTripWorkflowEventsByTripIds = async tripIds => {
  await ensureTables();
  const normalizedTripIds = Array.from(new Set((Array.isArray(tripIds) ? tripIds : []).map(value => String(value || '').trim()).filter(Boolean)));
  if (normalizedTripIds.length === 0) return new Map();
  const result = await query(
    `SELECT * FROM trip_workflow_events WHERE trip_id = ANY($1::text[]) ORDER BY timestamp_ms ASC, created_at ASC`,
    [normalizedTripIds]
  );
  const grouped = new Map();
  result.rows.forEach(row => {
    const current = grouped.get(row.trip_id) || [];
    current.push({
      id: row.event_id,
      tripId: row.trip_id,
      driverId: row.driver_id,
      action: row.action,
      timestamp: Number(row.timestamp_ms) || 0,
      timeLabel: row.time_label || '',
      riderSignatureName: row.rider_signature_name || '',
      compliance: row.compliance || {},
      locationSnapshot: row.location_snapshot || {},
      metadata: row.metadata || {},
      createdAt: row.created_at
    });
    grouped.set(row.trip_id, current);
  });
  return grouped;
};