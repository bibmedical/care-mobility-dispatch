import pg from 'pg';
import { randomUUID } from 'crypto';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// 1. Traer todos los trips de hoy que tienen driverId asignado
const tripsResult = await client.query(`
  SELECT id, data
  FROM dispatch_trips
  WHERE service_date = '2026-04-30'
    AND data->>'driverId' IS NOT NULL
    AND data->>'driverId' != ''
    AND data->>'status' != 'Cancelled'
  ORDER BY (data->>'pickupSortValue')::float ASC NULLS LAST
`);

console.log(`Trips asignados encontrados: ${tripsResult.rows.length}`);

// 2. Agrupar por driverId
const byDriver = new Map();
for (const row of tripsResult.rows) {
  const trip = row.data;
  const driverId = String(trip.driverId || '').trim();
  if (!driverId) continue;
  if (!byDriver.has(driverId)) {
    byDriver.set(driverId, {
      driverId,
      driverName: String(trip.driverName || driverId).trim(),
      tripIds: [],
      serviceDate: '2026-04-30'
    });
  }
  byDriver.get(driverId).tripIds.push(row.id);
}

console.log(`\nChoferes con trips: ${byDriver.size}`);
for (const [driverId, group] of byDriver) {
  console.log(`  ${group.driverName} (${driverId}): ${group.tripIds.length} trips`);
}

// 3. Insertar route plans
let created = 0;
for (const [driverId, group] of byDriver) {
  const routeId = `route-${group.serviceDate}-${driverId}`;
  const routePlan = {
    id: routeId,
    name: `Route - ${group.driverName}`,
    driverId: group.driverId,
    tripIds: group.tripIds,
    serviceDate: group.serviceDate,
    routeDate: group.serviceDate,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await client.query(`
    INSERT INTO dispatch_route_plans (id, service_date, data, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET data = $3, updated_at = NOW()
  `, [routeId, group.serviceDate, routePlan]);

  console.log(`  ✓ Ruta creada: ${group.driverName} — ${group.tripIds.length} trips`);
  created++;
}

console.log(`\nTotal rutas restauradas: ${created}`);
await client.end();
