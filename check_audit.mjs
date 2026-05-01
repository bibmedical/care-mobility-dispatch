import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const r = await client.query(`
  SELECT data->>'action' AS action, data->>'summary' AS summary, data->>'source' AS source, occurred_at
  FROM dispatch_audit_log
  ORDER BY occurred_at DESC
  LIMIT 30
`);

console.log('Ultimas 30 acciones en audit log:');
r.rows.forEach(row => console.log(`  [${row.occurred_at}] ${row.action} | ${row.summary}`));

await client.end();
