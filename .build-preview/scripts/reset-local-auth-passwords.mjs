#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;
const ROOT = process.cwd();
const DEFAULT_PASSWORD = 'Admin123!';

const parseEnvFile = async filePath => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const env = {};
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const rawKey = trimmed.slice(0, idx).trim();
      const key = rawKey.replace(/^export\s+/, '').trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });
    return env;
  } catch {
    return {};
  }
};

const parseArgs = argv => {
  const passwordArg = argv.find(item => item.startsWith('--password='));
  const userArg = argv.find(item => item.startsWith('--user='));

  return {
    password: String(passwordArg ? passwordArg.split('=')[1] : DEFAULT_PASSWORD).trim() || DEFAULT_PASSWORD,
    targetUser: String(userArg ? userArg.split('=')[1] : '').trim().toLowerCase()
  };
};

const normalizeAuthValue = value => String(value ?? '').trim().toLowerCase();

const getDatabaseUrl = async () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const localEnv = await parseEnvFile(path.join(ROOT, '.env.local'));
  return String(localEnv.DATABASE_URL || '').trim();
};

const looksRemote = connectionString => {
  const normalized = String(connectionString || '').toLowerCase();
  return normalized.includes('render.com') || normalized.includes('railway.app') || normalized.includes('supabase.co');
};

const main = async () => {
  const { password, targetUser } = parseArgs(process.argv);
  const connectionString = await getDatabaseUrl();

  if (!connectionString) {
    console.error('DATABASE_URL is missing in .env.local.');
    console.error('Set DATABASE_URL first, then run: npm run auth:local:reset');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: looksRemote(connectionString) ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_users_state (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        version INTEGER NOT NULL DEFAULT 6,
        protected_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        users JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const stateResult = await pool.query(`SELECT users FROM system_users_state WHERE id = 'singleton'`);
    const users = Array.isArray(stateResult.rows[0]?.users) ? stateResult.rows[0].users : [];

    if (users.length === 0) {
      console.error('No users found in system_users_state.');
      console.error('Start the app once to seed users, then run this script again.');
      process.exit(1);
    }

    let updatedCount = 0;
    const nextUsers = users.map(user => {
      const username = normalizeAuthValue(user?.username);
      const email = normalizeAuthValue(user?.email);
      const shouldUpdate = targetUser
        ? username === targetUser || email === targetUser
        : true;

      if (!shouldUpdate) return user;
      updatedCount += 1;
      return {
        ...user,
        password
      };
    });

    if (updatedCount === 0) {
      console.error(`No matching user found for --user=${targetUser}`);
      process.exit(1);
    }

    await pool.query(
      `
        INSERT INTO system_users_state (id, version, protected_user_ids, users, updated_at)
        VALUES ('singleton', 6, '[]'::jsonb, $1::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET users = EXCLUDED.users, updated_at = NOW()
      `,
      [JSON.stringify(nextUsers)]
    );

    await pool.query(`DELETE FROM login_failures`);

    console.log(`Updated ${updatedCount} user password(s).`);
    console.log(`Temporary local password set to: ${password}`);
    console.log('Login failures cleared.');
  } finally {
    await pool.end();
  }
};

main().catch(error => {
  console.error('Failed to reset local auth passwords:', error.message);
  process.exit(1);
});
