import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Leer todas las rutas de April 30
const routes = await client.query(`SELECT id, data FROM dispatch_route_plans WHERE service_date = '2026-04-30'`);
console.log(`Rutas encontradas: ${routes.rows.length}`);

let totalUpdated = 0;
let totalSkipped = 0;

for (const routeRow of routes.rows) {
  const route = routeRow.data;
  const driverId = route.driverId;
  const driverName = route.name?.replace('Route - ', '') || driverId;
  const tripIds = Array.isArray(route.tripIds) ? route.tripIds : [];

  if (!driverId || tripIds.length === 0) {
    console.log(`SKIP ruta sin driverId o trips: ${routeRow.id}`);
    continue;
  }

  let updated = 0;
  for (const tripId of tripIds) {
    const result = await client.query(`
      UPDATE dispatch_trips
      SET data = jsonb_set(jsonb_set(data, '{driverId}', $2::jsonb), '{driverName}', $3::jsonb),
          updated_at = NOW()
      WHERE id = $1
        AND service_date = '2026-04-30'
        AND data->>'status' IS DISTINCT FROM 'Cancelled'
    `, [tripId, JSON.stringify(driverId), JSON.stringify(driverName)]);
    if (result.rowCount > 0) updated++;
    else totalSkipped++;
  }

  console.log(`  ${driverName}: ${updated}/${tripIds.length} trips actualizados`);
  totalUpdated += updated;
}

console.log(`\nTotal trips con driverId actualizado: ${totalUpdated}`);
console.log(`Trips no encontrados (ya borrados/cancelados): ${totalSkipped}`);

// Verificar cuantos quedan sin asignar
const remaining = await client.query(`
  SELECT COUNT(*) FROM dispatch_trips
  WHERE service_date = '2026-04-30'
    AND (data->>'driverId' IS NULL OR data->>'driverId' = '')
    AND data->>'status' IS DISTINCT FROM 'Cancelled'
`);
console.log(`\nTrips sin driverId restantes: ${remaining.rows[0].count}`);

await client.end();
