import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Forzar driverId en todos los trips que están en rutas, sin condicion de status
const routes = await client.query(`SELECT data->>'driverId' AS driver_id, data->>'name' AS route_name, data->'tripIds' AS trip_ids FROM dispatch_route_plans WHERE service_date = '2026-04-30'`);

let updated = 0;
for (const r of routes.rows) {
  const driverId = r.driver_id;
  const driverName = (r.route_name || '').replace('Route - ', '') || driverId;
  const tripIds = Array.isArray(r.trip_ids) ? r.trip_ids : JSON.parse(r.trip_ids || '[]');
  for (const tripId of tripIds) {
    const res = await client.query(`
      UPDATE dispatch_trips
      SET data = data || jsonb_build_object('driverId', $2::text, 'driverName', $3::text),
          updated_at = NOW()
      WHERE id = $1 AND service_date = '2026-04-30'
    `, [tripId, driverId, driverName]);
    if (res.rowCount > 0) updated++;
  }
}
console.log(`Trips actualizados: ${updated}`);

// Verificar
const remaining = await client.query(`
  SELECT COUNT(*) FROM dispatch_trips
  WHERE service_date = '2026-04-30'
    AND (data->>'driverId' IS NULL OR data->>'driverId' = '')
    AND data->>'status' IS DISTINCT FROM 'Cancelled'
`);
console.log(`Trips sin driverId restantes: ${remaining.rows[0].count}`);

await client.end();
