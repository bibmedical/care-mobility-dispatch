import pg from 'pg';

const { Pool } = pg;

let pool = null;

const getSslConfig = connectionString => {
  const normalized = String(connectionString || '').trim();
  if (!normalized) return false;

  const explicitMode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (['disable', 'allow', 'prefer'].includes(explicitMode)) {
    return false;
  }

  if (['require', 'verify-ca', 'verify-full'].includes(explicitMode)) {
    return { rejectUnauthorized: false };
  }

  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }

  return normalized.includes('.render.com/') || normalized.includes('.render.com:')
    ? { rejectUnauthorized: false }
    : false;
};

export const getDb = () => {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('[DB] DATABASE_URL is not set. Add it to your Render environment variables.');
  }

  pool = new Pool({
    connectionString,
    ssl: getSslConfig(connectionString),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  console.log('[DB] PostgreSQL pool initialized.');
  return pool;
};

export const query = async (text, params) => {
  const db = getDb();
  const result = await db.query(text, params);
  return result;
};

export const queryOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] ?? null;
};

export const queryRows = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

export const withTransaction = async callback => {
  const db = getDb();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
};

export const acquireAdvisoryLock = async (client, lockKey) => {
  if (!client) {
    throw new Error('A database client is required to acquire an advisory lock.');
  }

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(lockKey || 'singleton-lock')]);
};
