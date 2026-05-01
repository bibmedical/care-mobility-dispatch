const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const day = '2026-05-01';
  const statusRows = await client.query(
    "select service_date, coalesce(data->>'status','') as status, count(*)::int as c from dispatch_trips where service_date = $1 group by service_date, coalesce(data->>'status','') order by status",
    [day]
  );
  const assignedRow = await client.query(
    "select count(*)::int as c from dispatch_trips where service_date = $1 and coalesce(data->>'driverId','') <> ''",
    [day]
  );
  const restoreRows = await client.query(
    "select id, reason, created_at, coalesce(jsonb_array_length(data->'trips'),0) as trip_count, coalesce(jsonb_array_length(data->'routePlans'),0) as route_count from dispatch_restore_points where service_date = $1 order by created_at desc limit 40",
    [day]
  );

  console.log('STATUS_COUNTS', JSON.stringify(statusRows.rows));
  console.log('ASSIGNED_COUNT', JSON.stringify(assignedRow.rows[0] || {}));
  console.log('RESTORE_POINTS', JSON.stringify(restoreRows.rows));

  const latestGood = restoreRows.rows.find(r => Number(r.trip_count) > 0 || Number(r.route_count) > 0);
  if (!latestGood) {
    console.log('NO_GOOD_RESTORE_POINT');
    await client.end();
    return;
  }

  const snapshotRow = await client.query("select data from dispatch_restore_points where id = $1 limit 1", [latestGood.id]);
  const snapshot = snapshotRow.rows[0]?.data || {};
  const snapshotTrips = Array.isArray(snapshot.trips) ? snapshot.trips : [];

  const currentTripsRow = await client.query("select id, data from dispatch_trips where service_date = $1", [day]);
  const currentMap = new Map(currentTripsRow.rows.map(r => [String(r.id || '').trim(), r.data || {}]));

  const protectedStatuses = new Set(['Confirmed', 'In Progress', 'Completed', 'Assigned']);
  let updates = 0;

  for (const trip of snapshotTrips) {
    const tripId = String(trip?.id || '').trim();
    if (!tripId) continue;
    const snapStatus = String(trip?.status || '').trim();
    const snapDriverId = String(trip?.driverId || '').trim();
    const snapSecondaryDriverId = String(trip?.secondaryDriverId || '').trim();
    const snapRouteId = String(trip?.routeId || '').trim();
    const shouldRecover = protectedStatuses.has(snapStatus) || !!snapDriverId || !!snapRouteId || !!snapSecondaryDriverId;
    if (!shouldRecover) continue;

    const current = currentMap.get(tripId);
    if (!current) continue;

    const curDriverId = String(current?.driverId || '').trim();
    const curSecondaryDriverId = String(current?.secondaryDriverId || '').trim();
    const curRouteId = String(current?.routeId || '').trim();
    const curStatus = String(current?.status || '').trim();

    const needsRecover = (!curDriverId && !!snapDriverId)
      || (!curSecondaryDriverId && !!snapSecondaryDriverId)
      || (!curRouteId && !!snapRouteId)
      || (curStatus === 'Unassigned' && protectedStatuses.has(snapStatus));

    if (!needsRecover) continue;

    const nextData = {
      ...current,
      driverId: snapDriverId || current.driverId || '',
      secondaryDriverId: snapSecondaryDriverId || current.secondaryDriverId || '',
      routeId: snapRouteId || current.routeId || '',
      status: protectedStatuses.has(snapStatus) ? snapStatus : current.status,
      updatedAt: Date.now()
    };

    await client.query("update dispatch_trips set data = $1::jsonb, updated_at = now() where id = $2", [JSON.stringify(nextData), tripId]);
    updates += 1;
  }

  console.log('RECOVERY_USED_RESTORE_POINT', latestGood.id);
  console.log('RECOVERED_TRIPS', updates);

  const afterAssignedRow = await client.query(
    "select count(*)::int as c from dispatch_trips where service_date = $1 and coalesce(data->>'driverId','') <> ''",
    [day]
  );
  console.log('ASSIGNED_COUNT_AFTER', JSON.stringify(afterAssignedRow.rows[0] || {}));

  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
