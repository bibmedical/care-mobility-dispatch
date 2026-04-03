import pg from 'pg';

const { Pool } = pg;

let pool = null;

export const getDb = () => {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('[DB] DATABASE_URL is not set. Add it to your Render environment variables.');
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
