import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const r = await client.query(`
  SELECT id, service_date,
    data->>'name' AS name,
    data->>'driverId' AS driver_id,
    jsonb_array_length(data->'tripIds') AS trip_count,
    updated_at
  FROM dispatch_route_plans
  WHERE service_date = '2026-04-30'
  ORDER BY updated_at DESC
`);

console.log('Rutas April 30 en SQL:', r.rows.length);
r.rows.forEach(row => console.log(`  ${row.name} | driver: ${row.driver_id} | trips: ${row.trip_count} | updated: ${row.updated_at}`));

await client.end();
