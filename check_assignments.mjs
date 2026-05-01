import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Ver todas las asignaciones del audit log de hoy
const r = await client.query(`
  SELECT data->>'action' AS action, data->>'summary' AS summary, data->'metadata' AS metadata, occurred_at
  FROM dispatch_audit_log
  WHERE data->>'action' IN ('assign-trips-primary', 'assign-trips-secondary', 'create-route', 'reinstate-trips', 'cancel-trips')
  ORDER BY occurred_at ASC
`);

console.log('Historial de asignaciones y rutas hoy:');
r.rows.forEach(row => {
  console.log(`\n[${row.occurred_at}] ${row.action}`);
  console.log(`  ${row.summary}`);
  if (row.metadata) {
    const m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    if (m.driverId) console.log(`  Driver: ${m.driverId}`);
    if (m.tripIds) console.log(`  TripIds (${m.tripIds.length}):`, m.tripIds.slice(0,5), m.tripIds.length > 5 ? '...' : '');
  }
});

await client.end();
