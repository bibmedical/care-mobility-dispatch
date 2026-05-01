import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Obtener todos los tripIds de las rutas
const routes = await client.query(`SELECT id, data->>'driverId' AS driver_id, data->'tripIds' AS trip_ids FROM dispatch_route_plans WHERE service_date = '2026-04-30'`);
const routeTripIds = new Set();
const tripToDriver = new Map();
for (const r of routes.rows) {
  const ids = Array.isArray(r.trip_ids) ? r.trip_ids : JSON.parse(r.trip_ids || '[]');
  for (const tid of ids) {
    routeTripIds.add(String(tid).trim());
    tripToDriver.set(String(tid).trim(), r.driver_id);
  }
}
console.log(`Trip IDs en rutas: ${routeTripIds.size}`);

// Trips sin driverId
const unassigned = await client.query(`
  SELECT id FROM dispatch_trips
  WHERE service_date = '2026-04-30'
    AND (data->>'driverId' IS NULL OR data->>'driverId' = '')
    AND data->>'status' IS DISTINCT FROM 'Cancelled'
`);
console.log(`Trips sin driverId: ${unassigned.rows.length}`);

let inRoute = 0;
let notInRoute = 0;
for (const t of unassigned.rows) {
  const tid = String(t.id).trim();
  if (routeTripIds.has(tid)) {
    console.log(`  EN RUTA pero sin driverId: ${tid} -> ${tripToDriver.get(tid)}`);
    inRoute++;
  } else {
    notInRoute++;
  }
}

console.log(`\nTrips sin driverId que SÍ están en una ruta: ${inRoute}`);
console.log(`Trips sin driverId que NO están en ninguna ruta: ${notInRoute}`);

await client.end();
