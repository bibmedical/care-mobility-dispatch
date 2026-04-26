const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const dbLine = envText.split(/\r?\n/).find(line => line.startsWith('DATABASE_URL='));

if (!dbLine) {
  throw new Error('DATABASE_URL not found in .env.local');
}

process.env.DATABASE_URL = dbLine.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');

const queries = [
  ['total', "SELECT COUNT(*)::int AS count FROM admin_drivers"],
  ['driver_role', "SELECT COUNT(*)::int AS count FROM admin_drivers WHERE lower(coalesce(data->>'role','')) LIKE '%driver%'"],
  ['non_driver_role', "SELECT COUNT(*)::int AS count FROM admin_drivers WHERE NOT (lower(coalesce(data->>'role','')) LIKE '%driver%')"],
  ['weekly_or_perm_roster', "SELECT COUNT(*)::int AS count FROM admin_drivers WHERE lower(coalesce(data->'routeRoster'->>'mode','')) IN ('weekly','permanent')"],
  ['off_or_blank_roster', "SELECT COUNT(*)::int AS count FROM admin_drivers WHERE lower(coalesce(data->'routeRoster'->>'mode','')) NOT IN ('weekly','permanent')"],
  ['sample_non_driver', "SELECT coalesce(data->>'id','') AS id, coalesce(data->>'firstName','') AS first_name, coalesce(data->>'lastName','') AS last_name, coalesce(data->>'username','') AS username, coalesce(data->>'role','') AS role, coalesce(data->'routeRoster'->>'mode','') AS roster_mode FROM admin_drivers WHERE NOT (lower(coalesce(data->>'role','')) LIKE '%driver%') ORDER BY updated_at DESC LIMIT 8"],
  ['sample_blank_role', "SELECT coalesce(data->>'id','') AS id, coalesce(data->>'firstName','') AS first_name, coalesce(data->>'lastName','') AS last_name, coalesce(data->>'username','') AS username, coalesce(data->>'role','') AS role, coalesce(data->'routeRoster'->>'mode','') AS roster_mode FROM admin_drivers WHERE coalesce(data->>'role','') = '' ORDER BY updated_at DESC LIMIT 8"]
];

(async () => {
  let client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
  } catch (error) {
    if (!String(error?.message || '').includes('does not support SSL')) {
      throw error;
    }

    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    });
    await client.connect();
  }

  for (const [label, sql] of queries) {
    const result = await client.query(sql);
    console.log(`## ${label}`);
    console.log(JSON.stringify(result.rows, null, 2));
  }

  await client.end();
})().catch(error => {
  console.error(error);
  process.exit(1);
});