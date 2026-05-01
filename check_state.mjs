import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Cuantas rutas hay
const routes = await client.query(`SELECT id, jsonb_array_length(data->'tripIds') as trip_count FROM dispatch_route_plans WHERE service_date = '2026-04-30' ORDER BY id`);
console.log('RUTAS EN SQL:', routes.rows.length);
routes.rows.forEach(r => console.log(' ', r.id, ':', r.trip_count, 'trips'));

// Trips sin driverId
const unassigned = await client.query(`SELECT id, data->>'tripId' as trip_id FROM dispatch_trips WHERE service_date = '2026-04-30' AND (data->>'driverId' IS NULL OR data->>'driverId' = '') AND data->>'status' != 'Cancelled'`);
console.log('\nTrips sin driverId (no cancelados):', unassigned.rows.length);
unassigned.rows.forEach(r => console.log('  ', r.id));

// Total trips activos
const total = await client.query(`SELECT COUNT(*) FROM dispatch_trips WHERE service_date = '2026-04-30' AND data->>'status' != 'Cancelled'`);
console.log('\nTotal trips activos:', total.rows[0].count);

await client.end();
