#!/usr/bin/env node

import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  console.error('Set it in PowerShell and run again:');
  console.error('$env:DATABASE_URL = "postgresql://USER:PASS@HOST:5432/DB"');
  console.error('node test-db-connection.mjs');
  process.exit(1);
}

console.log('🔍 Testing PostgreSQL connection...');
console.log('📍 Connection string (first 50 chars):', connectionString.substring(0, 50) + '...');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Required for Render
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

(async () => {
  try {
    // Test 1: Basic connection
    console.log('\n✅ Step 1: Attempting connection...');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL!');

    // Test 2: Check tables exist
    console.log('\n✅ Step 2: Checking tables...');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  No tables found - migrations may not have run');
    } else {
      console.log(`✅ Found ${result.rows.length} tables:`);
      result.rows.forEach(row => console.log('   -', row.table_name));
    }

    // Test 3: Check dispatch_state table specifically
    console.log('\n✅ Step 3: Checking dispatch_state table...');
    try {
      const dispatchResult = await client.query('SELECT * FROM dispatch_state LIMIT 1');
      console.log('✅ dispatch_state exists with', dispatchResult.rows.length, 'rows');
    } catch (e) {
      console.log('⚠️  dispatch_state table not found:', e.message);
    }

    // Test 4: Write and read inside a rollback-only transaction
    console.log('\n✅ Step 4: Writing test data in rollback transaction...');
    const testId = '__connection_test__';
    const testData = { test: 'value', timestamp: new Date().toISOString() };
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO admin_state (id, version, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data, updated_at = NOW()',
      [testId, 2, JSON.stringify(testData)]
    );
    console.log('✅ Test data written');

    // Test 5: Read it back
    console.log('\n✅ Step 5: Reading test data back...');
    const readResult = await client.query('SELECT id, version, data FROM admin_state WHERE id = $1', [testId]);
    if (readResult.rows.length > 0) {
      console.log('✅ Test data persisted correctly:');
      console.log('  ', JSON.stringify(readResult.rows[0], null, 2));
    }

    // Test 6: Roll back so the validation does not mutate the database
    await client.query('ROLLBACK');
    console.log('✅ Rollback complete');

    client.release();
    console.log('\n✅ ALL TESTS PASSED - SQL IS WORKING!');
    process.exit(0);

  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch {}
    console.error('\n❌ ERROR:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
