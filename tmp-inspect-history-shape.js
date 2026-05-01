const { Client } = require('pg');

const normDate = v => {
  const s = String(v || '').trim();
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
};

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const rows = await client.query("select id, created_at, snapshot from dispatch_state_history order by created_at desc limit 20");

  const out = rows.rows.map(row => {
    const s = row.snapshot || {};
    const trips = Array.isArray(s.trips) ? s.trips : [];
    const routes = Array.isArray(s.routePlans) ? s.routePlans : [];
    const withSvc = trips.filter(t => normDate(t?.serviceDate || t?.rawServiceDate || t?.date || t?.dateOfService)).length;
    const routeWithSvc = routes.filter(r => normDate(r?.serviceDate || r?.routeDate || r?.date)).length;
    return { id: Number(row.id), created_at: row.created_at, tripCount: trips.length, routeCount: routes.length, tripWithDate: withSvc, routeWithDate: routeWithSvc };
  });

  console.log(JSON.stringify(out));
  await client.end();
})().catch(error => { console.error(error); process.exit(1); });
