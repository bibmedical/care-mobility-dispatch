const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const day = '2026-05-01';

  const archive = await client.query(
    "select archive_date, trip_count, route_count, archived_at, updated_at, data from dispatch_daily_archives where archive_date=$1 limit 1",
    [day]
  );

  if (!archive.rows.length) {
    console.log('NO_DAILY_ARCHIVE');
    await client.end();
    return;
  }

  const row = archive.rows[0];
  const data = row.data || {};
  const trips = Array.isArray(data.trips) ? data.trips : [];
  const routes = Array.isArray(data.routePlans) ? data.routePlans : [];
  const withDriver = trips.filter(t => String(t?.driverId || '').trim()).length;
  const confirmed = trips.filter(t => ['Confirmed','In Progress','Completed','Assigned'].includes(String(t?.status || '').trim())).length;

  console.log('DAILY_ARCHIVE_META', JSON.stringify({
    archive_date: row.archive_date,
    trip_count: row.trip_count,
    route_count: row.route_count,
    archived_at: row.archived_at,
    updated_at: row.updated_at,
    trips_len: trips.length,
    routes_len: routes.length,
    withDriver,
    confirmed
  }));

  if (withDriver === 0) {
    console.log('ARCHIVE_HAS_NO_ASSIGNMENTS');
    await client.end();
    return;
  }

  const currentTrips = await client.query("select id, data from dispatch_trips where service_date=$1", [day]);
  const curMap = new Map(currentTrips.rows.map(r => [String(r.id || '').trim(), r.data || {}]));

  let updated = 0;
  for (const t of trips) {
    const id = String(t?.id || '').trim();
    if (!id) continue;
    const cur = curMap.get(id);
    if (!cur) continue;
    const curDriver = String(cur?.driverId || '').trim();
    const srcDriver = String(t?.driverId || '').trim();
    const curRoute = String(cur?.routeId || '').trim();
    const srcRoute = String(t?.routeId || '').trim();
    if ((curDriver || !srcDriver) && (curRoute || !srcRoute)) continue;

    const next = {
      ...cur,
      driverId: srcDriver || cur.driverId || '',
      secondaryDriverId: String(t?.secondaryDriverId || '').trim() || cur.secondaryDriverId || '',
      routeId: srcRoute || cur.routeId || '',
      status: String(t?.status || '').trim() || cur.status,
      updatedAt: Date.now()
    };

    await client.query("update dispatch_trips set data=$1::jsonb, updated_at=now() where id=$2", [JSON.stringify(next), id]);
    updated += 1;
  }

  console.log('RECOVERED_FROM_DAILY_ARCHIVE', updated);

  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
