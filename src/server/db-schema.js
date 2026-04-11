import { query, queryOne } from '@/server/db';

// Single shared promise — all stores share this so migrations run exactly once per process.
let _migrationsPromise = null;

export const runMigrations = () => {
  if (_migrationsPromise) return _migrationsPromise;
  _migrationsPromise = _runMigrationsOnce().catch(err => {
    _migrationsPromise = null; // allow retry on next request if first attempt failed
    throw err;
  });
  return _migrationsPromise;
};

const _runMigrationsOnce = async () => {
  console.log('[DB] Running schema migrations...');

  // ── ALL DDL in 1 round trip ──────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS dispatch_state (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      version      INTEGER NOT NULL DEFAULT 1,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_trips (
      id             TEXT PRIMARY KEY,
      service_date   TEXT NOT NULL DEFAULT '',
      broker_trip_id TEXT NOT NULL DEFAULT '',
      data           JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dispatch_trips_service_date ON dispatch_trips(service_date);
    CREATE INDEX IF NOT EXISTS idx_dispatch_trips_broker_trip_id ON dispatch_trips(broker_trip_id);
    CREATE TABLE IF NOT EXISTS dispatch_route_plans (
      id           TEXT PRIMARY KEY,
      service_date TEXT NOT NULL DEFAULT '',
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dispatch_route_plans_service_date ON dispatch_route_plans(service_date);
    CREATE TABLE IF NOT EXISTS dispatch_threads (
      driver_id    TEXT PRIMARY KEY,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_daily_drivers (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_audit_log (
      id          TEXT PRIMARY KEY,
      data        JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dispatch_audit_log_occurred_at ON dispatch_audit_log(occurred_at DESC);
    CREATE TABLE IF NOT EXISTS dispatch_ui_prefs (
      id         TEXT PRIMARY KEY DEFAULT 'singleton',
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_state (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      version      INTEGER NOT NULL DEFAULT 2,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_drivers (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_vehicles (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_attendants (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_groupings (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dispatch_daily_archives (
      archive_date   TEXT PRIMARY KEY,
      data           JSONB NOT NULL DEFAULT '{}'::jsonb,
      trip_count     INTEGER NOT NULL DEFAULT 0,
      route_count    INTEGER NOT NULL DEFAULT 0,
      thread_count   INTEGER NOT NULL DEFAULT 0,
      message_count  INTEGER NOT NULL DEFAULT 0,
      audit_count    INTEGER NOT NULL DEFAULT 0,
      archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dispatch_daily_archives_archived_at ON dispatch_daily_archives(archived_at DESC);
    CREATE TABLE IF NOT EXISTS system_users_state (
      id                  TEXT PRIMARY KEY DEFAULT 'singleton',
      version             INTEGER NOT NULL DEFAULT 6,
      protected_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
      users               JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS system_messages (
      id           TEXT PRIMARY KEY,
      driver_id    TEXT,
      type         TEXT,
      status       TEXT NOT NULL DEFAULT 'active',
      subject      TEXT,
      body         TEXT,
      priority     TEXT,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_system_messages_driver_id ON system_messages(driver_id);
    CREATE INDEX IF NOT EXISTS idx_system_messages_status ON system_messages(status);
    CREATE TABLE IF NOT EXISTS activity_logs (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      user_name    TEXT,
      user_role    TEXT,
      user_email   TEXT,
      ip_address   TEXT,
      event_type   TEXT NOT NULL,
      event_label  TEXT,
      target       TEXT,
      metadata     JSONB,
      timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      date         TEXT,
      time         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
    CREATE TABLE IF NOT EXISTS blacklist_entries (
      id           TEXT PRIMARY KEY,
      name         TEXT,
      phone        TEXT,
      category     TEXT NOT NULL DEFAULT 'Do Not Schedule',
      status       TEXT NOT NULL DEFAULT 'Active',
      hold_until   TEXT,
      notes        TEXT,
      source       TEXT NOT NULL DEFAULT 'Dispatcher',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS login_failures (
      id           SERIAL PRIMARY KEY,
      identifier   TEXT NOT NULL,
      ip_address   TEXT,
      reason       TEXT,
      timestamp    BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_failures_identifier ON login_failures(identifier);
    CREATE INDEX IF NOT EXISTS idx_login_failures_timestamp ON login_failures(timestamp DESC);
    CREATE TABLE IF NOT EXISTS driver_mobile_sessions (
      driver_id      TEXT PRIMARY KEY,
      driver_name    TEXT,
      device_id      TEXT NOT NULL,
      session_token  TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_driver_mobile_sessions_last_seen_at ON driver_mobile_sessions(last_seen_at DESC);
    CREATE TABLE IF NOT EXISTS two_fa_secrets (
      user_id      TEXT PRIMARY KEY,
      secret       TEXT NOT NULL,
      enabled      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS email_auth_codes (
      email        TEXT PRIMARY KEY,
      code         TEXT NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      expires_at   BIGINT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      email        TEXT PRIMARY KEY,
      code         TEXT NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      expires_at   BIGINT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS email_templates (
      id           TEXT PRIMARY KEY,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS integrations_state (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      version      INTEGER NOT NULL DEFAULT 1,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_ui_preferences (
      user_id      TEXT PRIMARY KEY,
      preferences  JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS assistant_memory (
      id            TEXT PRIMARY KEY DEFAULT 'singleton',
      conversations JSONB NOT NULL DEFAULT '{}'::jsonb,
      facts         JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS assistant_knowledge (
      id         TEXT PRIMARY KEY DEFAULT 'singleton',
      documents  JSONB NOT NULL DEFAULT '[]'::jsonb,
      chunks     JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS genius_fuel_receipts (
      id                 TEXT PRIMARY KEY,
      driver_id          TEXT NOT NULL,
      service_date       TEXT NOT NULL,
      amount             NUMERIC(12, 2) NOT NULL DEFAULT 0,
      gallons            NUMERIC(12, 3) NOT NULL DEFAULT 0,
      receipt_reference  TEXT NOT NULL DEFAULT '',
      receipt_image_url  TEXT NOT NULL DEFAULT '',
      notes              TEXT NOT NULL DEFAULT '',
      submitted_by_user  TEXT NOT NULL DEFAULT '',
      submitted_by_role  TEXT NOT NULL DEFAULT '',
      source             TEXT NOT NULL DEFAULT 'admin',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_genius_fuel_receipts_driver_date ON genius_fuel_receipts(driver_id, service_date);
    CREATE INDEX IF NOT EXISTS idx_genius_fuel_receipts_created_at ON genius_fuel_receipts(created_at DESC);
    CREATE TABLE IF NOT EXISTS genius_payout_runs (
      id                 TEXT PRIMARY KEY,
      service_date       TEXT NOT NULL,
      driver_id          TEXT NOT NULL,
      gross_amount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
      trip_count         INTEGER NOT NULL DEFAULT 0,
      wheelchair_count   INTEGER NOT NULL DEFAULT 0,
      ambulatory_count   INTEGER NOT NULL DEFAULT 0,
      stretcher_count    INTEGER NOT NULL DEFAULT 0,
      fuel_receipt_count INTEGER NOT NULL DEFAULT 0,
      fuel_total         NUMERIC(12, 2) NOT NULL DEFAULT 0,
      reimburse_allowed  BOOLEAN NOT NULL DEFAULT FALSE,
      payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user    TEXT NOT NULL DEFAULT '',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_genius_payout_runs_date_driver ON genius_payout_runs(service_date, driver_id);
    CREATE INDEX IF NOT EXISTS idx_genius_payout_runs_created_at ON genius_payout_runs(created_at DESC)
  `);

  // ── Additive column migrations (safe to run repeatedly) ──────────────────────
  await query(`
    ALTER TABLE genius_fuel_receipts ADD COLUMN IF NOT EXISTS vehicle_mileage NUMERIC(10, 1)
  `);

  // ── Seed singleton rows in 1 round trip ──────────────────────────────────────
  await query(`
    INSERT INTO dispatch_state (id, version, data) VALUES ('singleton', 1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
    INSERT INTO dispatch_ui_prefs (id, data) VALUES ('singleton', '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
    INSERT INTO admin_state (id, version, data) VALUES ('singleton', 2, '{"drivers":[],"attendants":[],"vehicles":[],"groupings":[]}'::jsonb) ON CONFLICT (id) DO NOTHING;
    INSERT INTO system_users_state (id, version, protected_user_ids, users) VALUES ('singleton', 6, '[]'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO NOTHING;
    INSERT INTO integrations_state (id, version, data) VALUES ('singleton', 1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
    INSERT INTO assistant_memory (id, conversations, facts) VALUES ('singleton', '{}'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO NOTHING;
    INSERT INTO assistant_knowledge (id, documents, chunks) VALUES ('singleton', '[]'::jsonb, '[]'::jsonb) ON CONFLICT (id) DO NOTHING
  `);

  // ── Migrate blob → normalized tables (runs once, checks row count first) ─────
  await migrateDispatchBlobToNormalized();
  await migrateAdminBlobToNormalized();

  console.log('[DB] All migrations complete.');
};

const migrateDispatchBlobToNormalized = async () => {
  const countRow = await queryOne(`SELECT COUNT(*)::int AS count FROM dispatch_trips`);
  if (Number(countRow?.count) > 0) return;

  const blobRow = await queryOne(`SELECT data FROM dispatch_state WHERE id = 'singleton'`);
  if (!blobRow?.data) return;

  const trips = Array.isArray(blobRow.data.trips) ? blobRow.data.trips : [];
  const routePlans = Array.isArray(blobRow.data.routePlans) ? blobRow.data.routePlans : [];
  const dispatchThreads = Array.isArray(blobRow.data.dispatchThreads) ? blobRow.data.dispatchThreads : [];
  const dailyDrivers = Array.isArray(blobRow.data.dailyDrivers) ? blobRow.data.dailyDrivers : [];
  const auditLog = Array.isArray(blobRow.data.auditLog) ? blobRow.data.auditLog : [];
  const uiPreferences = blobRow.data.uiPreferences || {};

  if (trips.length > 0) {
    await query(
      `INSERT INTO dispatch_trips (id, service_date, broker_trip_id, data)
       SELECT
         t.data->>'id',
         COALESCE(t.data->>'serviceDate', t.data->>'rawServiceDate', ''),
         COALESCE(t.data->>'brokerTripId', ''),
         t.data
       FROM json_array_elements($1::json) AS t(data)
       WHERE t.data->>'id' IS NOT NULL AND t.data->>'id' != ''
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(trips)]
    );
  }
  if (routePlans.length > 0) {
    await query(
      `INSERT INTO dispatch_route_plans (id, service_date, data)
       SELECT
         t.data->>'id',
         COALESCE(t.data->>'serviceDate', t.data->>'routeDate', t.data->>'date', ''),
         t.data
       FROM json_array_elements($1::json) AS t(data)
       WHERE t.data->>'id' IS NOT NULL AND t.data->>'id' != ''
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(routePlans)]
    );
  }
  for (const thread of dispatchThreads) {
    if (!thread?.driverId) continue;
    await query(`INSERT INTO dispatch_threads (driver_id, data) VALUES ($1, $2) ON CONFLICT (driver_id) DO NOTHING`, [thread.driverId, thread]);
  }
  for (const dd of dailyDrivers) {
    if (!dd?.id) continue;
    await query(`INSERT INTO dispatch_daily_drivers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [dd.id, dd]);
  }
  for (const entry of auditLog.slice(-500)) {
    if (!entry?.id) continue;
    await query(`INSERT INTO dispatch_audit_log (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [entry.id, entry]);
  }
  await query(`INSERT INTO dispatch_ui_prefs (id, data) VALUES ('singleton', $1) ON CONFLICT (id) DO UPDATE SET data=$1`, [uiPreferences]);

  console.log(`[DB] Migrated ${trips.length} trips, ${routePlans.length} routes, ${dispatchThreads.length} threads from dispatch blob.`);
};

const migrateAdminBlobToNormalized = async () => {
  const countRow = await queryOne(`SELECT COUNT(*)::int AS count FROM admin_drivers`);
  if (Number(countRow?.count) > 0) return;

  const blobRow = await queryOne(`SELECT data FROM admin_state WHERE id = 'singleton'`);
  if (!blobRow?.data) return;

  const drivers = Array.isArray(blobRow.data.drivers) ? blobRow.data.drivers : [];
  const attendants = Array.isArray(blobRow.data.attendants) ? blobRow.data.attendants : [];
  const vehicles = Array.isArray(blobRow.data.vehicles) ? blobRow.data.vehicles : [];
  const groupings = Array.isArray(blobRow.data.groupings) ? blobRow.data.groupings : [];

  for (const driver of drivers) {
    if (!driver?.id) continue;
    await query(`INSERT INTO admin_drivers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [driver.id, driver]);
  }
  for (const vehicle of vehicles) {
    const id = vehicle?.id || vehicle?.vin || vehicle?.plate;
    if (!id) continue;
    await query(`INSERT INTO admin_vehicles (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, { ...vehicle, id }]);
  }
  for (const attendant of attendants) {
    const id = attendant?.id || attendant?.name;
    if (!id) continue;
    await query(`INSERT INTO admin_attendants (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, { ...attendant, id }]);
  }
  for (const grouping of groupings) {
    const id = grouping?.id || grouping?.name;
    if (!id) continue;
    await query(`INSERT INTO admin_groupings (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [id, { ...grouping, id }]);
  }

  console.log(`[DB] Migrated ${drivers.length} drivers, ${vehicles.length} vehicles from admin blob.`);
};
