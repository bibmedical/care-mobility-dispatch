import { query } from '@/server/db';

export const runMigrations = async () => {
  console.log('[DB] Running schema migrations...');

  // ─── DISPATCH (trips + state) ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS dispatch_state (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      version      INTEGER NOT NULL DEFAULT 1,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO dispatch_state (id, version, data)
    VALUES ('singleton', 1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  await query(`
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
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_dispatch_daily_archives_archived_at ON dispatch_daily_archives(archived_at DESC)`);

  // ─── ADMIN (drivers, vehicles, attendants, groupings) ────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS admin_state (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      version      INTEGER NOT NULL DEFAULT 2,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO admin_state (id, version, data)
    VALUES ('singleton', 2, '{"drivers":[],"attendants":[],"vehicles":[],"groupings":[]}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  // ─── SYSTEM USERS ────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS system_users_state (
      id                  TEXT PRIMARY KEY DEFAULT 'singleton',
      version             INTEGER NOT NULL DEFAULT 6,
      protected_user_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
      users               JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO system_users_state (id, version, protected_user_ids, users)
    VALUES ('singleton', 6, '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  // ─── SYSTEM MESSAGES ─────────────────────────────────────────────────────────
  await query(`
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
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_system_messages_driver_id ON system_messages(driver_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_system_messages_status ON system_messages(status)`);

  // ─── ACTIVITY LOGS ───────────────────────────────────────────────────────────
  await query(`
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
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC)`);

  // ─── BLACKLIST ───────────────────────────────────────────────────────────────
  await query(`
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
    )
  `);

  // ─── LOGIN FAILURES ──────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS login_failures (
      id           SERIAL PRIMARY KEY,
      identifier   TEXT NOT NULL,
      ip_address   TEXT,
      reason       TEXT,
      timestamp    BIGINT NOT NULL
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_login_failures_identifier ON login_failures(identifier)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_failures_timestamp ON login_failures(timestamp DESC)`);

  // ─── 2FA SECRETS ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS two_fa_secrets (
      user_id      TEXT PRIMARY KEY,
      secret       TEXT NOT NULL,
      enabled      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ─── EMAIL AUTH CODES ────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS email_auth_codes (
      email        TEXT PRIMARY KEY,
      code         TEXT NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      expires_at   BIGINT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id           TEXT PRIMARY KEY,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ─── INTEGRATIONS ────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS integrations_state (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      version      INTEGER NOT NULL DEFAULT 1,
      data         JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO integrations_state (id, version, data)
    VALUES ('singleton', 1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  // ─── USER UI PREFERENCES ────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS user_ui_preferences (
      user_id      TEXT PRIMARY KEY,
      preferences  JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ─── ASSISTANT MEMORY ────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS assistant_memory (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      conversations JSONB NOT NULL DEFAULT '{}'::jsonb,
      facts        JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO assistant_memory (id, conversations, facts)
    VALUES ('singleton', '{}'::jsonb, '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  // ─── ASSISTANT KNOWLEDGE ─────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS assistant_knowledge (
      id           TEXT PRIMARY KEY DEFAULT 'singleton',
      documents    JSONB NOT NULL DEFAULT '[]'::jsonb,
      chunks       JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    INSERT INTO assistant_knowledge (id, documents, chunks)
    VALUES ('singleton', '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);

  console.log('[DB] All migrations complete.');
};
