const { Client } = require('pg');

const NY_DATE = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const rows = await client.query("select id, created_at, snapshot from dispatch_state_history order by created_at desc limit 400");
  const targetDay = '2026-04-30';
  const scored = [];

  for (const row of rows.rows) {
    const snapshot = row.snapshot || {};
    const trips = Array.isArray(snapshot.trips) ? snapshot.trips : [];
    const dayTrips = trips.filter(t => String(t?.serviceDate || t?.rawServiceDate || '').trim() === targetDay);
    if (dayTrips.length === 0) continue;

    const withDriver = dayTrips.filter(t => String(t?.driverId || '').trim()).length;
    const confirmedStatus = dayTrips.filter(t => ['Confirmed','In Progress','Completed','Assigned'].includes(String(t?.status || '').trim())).length;
    const calls = dayTrips.filter(t => t?.confirmation && (t.confirmation?.sentAt || t.confirmation?.confirmedAt || String(t.confirmation?.status || '').trim())).length;

    scored.push({
      id: Number(row.id),
      created_at: row.created_at,
      dayTrips: dayTrips.length,
      withDriver,
      confirmedStatus,
      calls
    });
  }

  scored.sort((a,b) => {
    if (b.withDriver !== a.withDriver) return b.withDriver - a.withDriver;
    if (b.confirmedStatus !== a.confirmedStatus) return b.confirmedStatus - a.confirmedStatus;
    if (b.calls !== a.calls) return b.calls - a.calls;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  console.log('FOUND_SNAPSHOTS', scored.length);
  console.log('TOP10', JSON.stringify(scored.slice(0,10)));

  await client.end();
})().catch(error => { console.error(error); process.exit(1); });
