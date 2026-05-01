// Script temporal para limpiar duplicados de May 1 en SQL de Render
// Uso: $env:DATABASE_URL="postgresql://..."; node clean_may1_duplicates.mjs
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Pon DATABASE_URL como variable de entorno antes de correr este script.');
  console.error('Ejemplo: $env:DATABASE_URL="postgresql://..."; node clean_may1_duplicates.mjs');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

await client.connect();

// Buscar May 1 por service_date column Y por el campo JSON
const may1Result = await client.query(
  `SELECT service_date, data->>'serviceDate' AS json_date, data->>'status' AS status, data->>'rider' AS rider, data->>'pickup' AS pickup, id
   FROM dispatch_trips
   WHERE service_date = '2026-05-01' OR (data->>'serviceDate') = '2026-05-01'
   ORDER BY updated_at DESC LIMIT 50`
);
console.log(`\nTrips con serviceDate May 1 en SQL: ${may1Result.rows.length}`);
may1Result.rows.forEach(r => console.log(`  [${r.service_date}/${r.json_date}] ${r.status} | ${r.rider} | ${r.pickup}`));

// Ver breakdown de April 30 por status
const apr30Result = await client.query(
  `SELECT data->>'status' AS status, COUNT(*) AS total
   FROM dispatch_trips WHERE service_date = '2026-04-30'
   GROUP BY status ORDER BY total DESC`
);
console.log(`\nApril 30 breakdown por status:`);
apr30Result.rows.forEach(r => console.log(`  ${r.status}: ${r.total}`));

await client.end();
