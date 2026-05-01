const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const day = '2026-04-30';
  const statusRows = await client.query(
    "select service_date, status, count(*)::int as c from dispatch_trips where service_date = $1 group by service_date, status order by status",
    [day]
  );
  const assignedRow = await client.query(
    "select count(*)::int as c from dispatch_trips where service_date = $1 and coalesce(driver_id,'') <> ''",
    [day]
  );
  const restoreRows = await client.query(
    "select id, reason, created_at, coalesce(jsonb_array_length(data->'trips'),0) as trip_count, coalesce(jsonb_array_length(data->'routePlans'),0) as route_count from dispatch_restore_points where service_date = $1 order by created_at desc limit 20",
    [day]
  );

  console.log('STATUS_COUNTS', JSON.stringify(statusRows.rows));
  console.log('ASSIGNED_COUNT', JSON.stringify(assignedRow.rows[0] || {}));
  console.log('RESTORE_POINTS', JSON.stringify(restoreRows.rows));

  await client.end();
})().catch(async error => {
  console.error(error);
  process.exit(1);
});
