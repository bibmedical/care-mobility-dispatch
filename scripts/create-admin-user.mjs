#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;
const ROOT = process.cwd();
const DEFAULT_ROLE = 'DBSS Admin(Full...)';

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
  const readArg = name => {
    const match = argv.find(item => item.startsWith(`--${name}=`));
    return String(match ? match.split('=').slice(1).join('=') : '').trim();
  };

  return {
    username: readArg('user'),
    password: readArg('password'),
    firstName: readArg('first') || 'Temp',
    lastName: readArg('last') || 'Admin',
    email: readArg('email'),
    phone: readArg('phone') || '000-000-0000'
  };
};

const normalizeAuthValue = value => String(value ?? '').trim().toLowerCase();

const getDatabaseUrl = async () => {
  if (process.env.DATABASE_URL) return String(process.env.DATABASE_URL).trim();
  const localEnv = await parseEnvFile(path.join(ROOT, '.env.local'));
  return String(localEnv.DATABASE_URL || '').trim();
};

const looksRemote = connectionString => {
  const normalized = String(connectionString || '').toLowerCase();
  return normalized.includes('render.com') || normalized.includes('railway.app') || normalized.includes('supabase.co') || normalized.includes('oregon-postgres.render.com');
};

const buildUserId = username => `user-${normalizeAuthValue(username).replace(/[^a-z0-9]+/g, '-') || Date.now()}`;

const main = async () => {
  const { username, password, firstName, lastName, email, phone } = parseArgs(process.argv);

  if (!username || !password) {
    console.error('Usage: node scripts/create-admin-user.mjs --user=<username> --password=<password> [--first=Temp] [--last=Admin] [--email=user@example.com] [--phone=000-000-0000]');
    process.exit(1);
  }

  const connectionString = await getDatabaseUrl();
  if (!connectionString) {
    console.error('DATABASE_URL is missing. Set it in .env.local or in the command environment.');
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

    const stateResult = await pool.query(`SELECT version, protected_user_ids, users FROM system_users_state WHERE id = 'singleton'`);
    const row = stateResult.rows[0] || {};
    const users = Array.isArray(row.users) ? row.users : [];
    const protectedUserIds = Array.isArray(row.protected_user_ids) ? row.protected_user_ids : [];
    const normalizedUsername = normalizeAuthValue(username);
    const normalizedEmail = normalizeAuthValue(email);

    let updated = false;
    const nextUsers = users.map(user => {
      const sameUsername = normalizeAuthValue(user?.username) === normalizedUsername;
      const sameEmail = normalizedEmail && normalizeAuthValue(user?.email) === normalizedEmail;
      if (!sameUsername && !sameEmail) return user;
      updated = true;
      return {
        ...user,
        firstName: String(firstName || user?.firstName || 'Temp'),
        lastName: String(lastName || user?.lastName || 'Admin'),
        username,
        email: email || user?.email || '',
        phone: phone || user?.phone || '000-000-0000',
        role: DEFAULT_ROLE,
        password,
        webAccess: true,
        androidAccess: true,
        inactivityTimeoutMinutes: Number(user?.inactivityTimeoutMinutes) > 0 ? Number(user.inactivityTimeoutMinutes) : 15,
        webLoginCode: String(user?.webLoginCode || '').replace(/\D/g, '').slice(0, 6)
      };
    });

    if (!updated) {
      nextUsers.unshift({
        id: buildUserId(username),
        firstName,
        middleInitial: '',
        lastName,
        isCompany: false,
        companyName: '',
        taxId: '',
        email: email || '',
        phone,
        role: DEFAULT_ROLE,
        username,
        password,
        webLoginCode: '',
        webAccess: true,
        androidAccess: true,
        inactivityTimeoutMinutes: 15,
        lastEventTime: '',
        eventType: ''
      });
    }

    await pool.query(
      `
        INSERT INTO system_users_state (id, version, protected_user_ids, users, updated_at)
        VALUES ('singleton', $1, $2::jsonb, $3::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET version = EXCLUDED.version, protected_user_ids = EXCLUDED.protected_user_ids, users = EXCLUDED.users, updated_at = NOW()
      `,
      [Number(row.version || 6), JSON.stringify(protectedUserIds), JSON.stringify(nextUsers)]
    );

    await pool.query(`DELETE FROM login_failures WHERE identifier = $1 OR identifier = $2`, [normalizedUsername, normalizedEmail || normalizedUsername]);

    console.log(updated ? `Updated admin user ${username}.` : `Created admin user ${username}.`);
    console.log('Login failures cleared for that identifier.');
    console.log('If prompted for a web code on first login, create a new 6-digit code in the UI.');
  } finally {
    await pool.end();
  }
};

main().catch(error => {
  console.error('Failed to create or update admin user:', error.message);
  process.exit(1);
});