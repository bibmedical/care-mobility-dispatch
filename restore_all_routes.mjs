import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// 1. Leer todas las asignaciones del audit log de hoy (antes del reinstate de las 16:58)
const auditResult = await client.query(`
  SELECT data->>'action' AS action, data->'metadata' AS metadata, occurred_at
  FROM dispatch_audit_log
  WHERE data->>'action' IN ('assign-trips-primary', 'assign-trips-secondary')
    AND occurred_at < '2026-04-30 21:00:00'
  ORDER BY occurred_at ASC
`);

// 2. Construir el estado final de asignaciones por chofer
// Cada asignacion reemplaza la anterior para ese chofer
const driverAssignments = new Map();

for (const row of auditResult.rows) {
  const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
  const driverId = String(meta?.driverId || '').trim();
  const tripIds = Array.isArray(meta?.tripIds) ? meta.tripIds.map(id => String(id).trim()).filter(Boolean) : [];
  if (!driverId || tripIds.length === 0) continue;
  // Cada asignacion acumula trips (el dispatcher acumula asignaciones)
  const existing = driverAssignments.get(driverId) || new Set();
  tripIds.forEach(id => existing.add(id));
  driverAssignments.set(driverId, existing);
}

// 3. Obtener los trips existentes en SQL para April 30 (para validar que existen)
const tripsResult = await client.query(`SELECT id FROM dispatch_trips WHERE service_date = '2026-04-30'`);
const validTripIds = new Set(tripsResult.rows.map(r => r.id));
console.log(`Trips validos en SQL para April 30: ${validTripIds.size}`);

// 4. Obtener nombres de choferes desde los trips
const driverNamesResult = await client.query(`
  SELECT DISTINCT data->>'driverId' AS driver_id, data->>'driverName' AS driver_name
  FROM dispatch_trips
  WHERE service_date = '2026-04-30' AND data->>'driverId' IS NOT NULL
`);
const driverNames = new Map();
driverNamesResult.rows.forEach(r => {
  if (r.driver_id && r.driver_name) driverNames.set(r.driver_id, r.driver_name);
});

// Tambien buscar nombres en el audit log
const auditDriverNames = await client.query(`
  SELECT DISTINCT data->'metadata'->>'driverId' AS driver_id, data->'metadata'->>'driverName' AS driver_name
  FROM dispatch_audit_log
  WHERE data->>'action' = 'assign-trips-primary'
    AND data->'metadata'->>'driverName' IS NOT NULL
`);
auditDriverNames.rows.forEach(r => {
  if (r.driver_id && r.driver_name && !driverNames.has(r.driver_id)) {
    driverNames.set(r.driver_id, r.driver_name);
  }
});

console.log(`\nChoferes con asignaciones en audit log: ${driverAssignments.size}`);

// 5. Restaurar rutas y driverIds en trips
let routesCreated = 0;
let tripsUpdated = 0;

for (const [driverId, tripIdSet] of driverAssignments) {
  // Filtrar solo trips que existen en SQL
  const validAssigned = Array.from(tripIdSet).filter(id => validTripIds.has(id));
  if (validAssigned.length === 0) {
    console.log(`  SKIP ${driverId}: ningún trip válido en SQL`);
    continue;
  }

  const driverName = driverNames.get(driverId) || driverId;
  const routeId = `route-2026-04-30-${driverId}`;
  const routePlan = {
    id: routeId,
    name: `Route - ${driverName}`,
    driverId,
    tripIds: validAssigned,
    serviceDate: '2026-04-30',
    routeDate: '2026-04-30',
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await client.query(`
    INSERT INTO dispatch_route_plans (id, service_date, data, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET data = $3, updated_at = NOW()
  `, [routeId, '2026-04-30', routePlan]);

  // Actualizar driverId en los trips
  for (const tripId of validAssigned) {
    await client.query(`
      UPDATE dispatch_trips
      SET data = jsonb_set(jsonb_set(data, '{driverId}', $2::jsonb), '{driverName}', $3::jsonb),
          updated_at = NOW()
      WHERE id = $1 AND (data->>'status' != 'Cancelled' OR data->>'status' IS NULL)
    `, [tripId, JSON.stringify(driverId), JSON.stringify(driverName)]);
    tripsUpdated++;
  }

  console.log(`  ✓ ${driverName}: ${validAssigned.length} trips`);
  routesCreated++;
}

console.log(`\nRutas restauradas: ${routesCreated}`);
console.log(`Trips actualizados con driverId: ${tripsUpdated}`);

await client.end();
