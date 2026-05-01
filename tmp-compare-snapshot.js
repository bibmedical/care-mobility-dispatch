const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const day = '2026-04-30';

  const rp = await client.query("select id, data from dispatch_restore_points where service_date=$1 order by created_at desc limit 1", [day]);
  const point = rp.rows[0];
  if (!point) { console.log('NO_RESTORE_POINT'); await client.end(); return; }

  const snapTrips = Array.isArray(point.data?.trips) ? point.data.trips : [];
  const curRows = await client.query("select id, data from dispatch_trips where service_date=$1", [day]);
  const curTrips = curRows.rows.map(r => r.data || {});

  const countByStatus = arr => {
    const m = new Map();
    for (const t of arr) {
      const s = String(t?.status || '').trim() || '(empty)';
      m.set(s, (m.get(s) || 0) + 1);
    }
    return Array.from(m.entries()).map(([status,c])=>({status,c})).sort((a,b)=>a.status.localeCompare(b.status));
  };

  const metric = arr => ({
    total: arr.length,
    withDriver: arr.filter(t => String(t?.driverId || '').trim()).length,
    confirmedStatus: arr.filter(t => ['Confirmed','In Progress','Completed','Assigned'].includes(String(t?.status || '').trim())).length,
    confirmationFlag: arr.filter(t => t?.confirmation && (String(t.confirmation?.status || '').trim() || t.confirmation?.sentAt || t.confirmation?.confirmedAt)).length,
    calledFlag: arr.filter(t => t?.confirmation && (t.confirmation?.sentAt || t.confirmation?.confirmedAt)).length
  });

  console.log('RESTORE_POINT_ID', point.id);
  console.log('SNAPSHOT_METRIC', JSON.stringify(metric(snapTrips)));
  console.log('CURRENT_METRIC', JSON.stringify(metric(curTrips)));
  console.log('SNAPSHOT_STATUS', JSON.stringify(countByStatus(snapTrips)));
  console.log('CURRENT_STATUS', JSON.stringify(countByStatus(curTrips)));

  await client.end();
})().catch(error => { console.error(error); process.exit(1); });
