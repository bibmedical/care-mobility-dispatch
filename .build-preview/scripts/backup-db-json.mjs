#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import pg from 'pg';

const { Client } = pg;

const args = process.argv.slice(2);

const getArgValue = name => {
  const prefix = `--${name}=`;
  const hit = args.find(item => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
};

const outputDir = getArgValue('output') || '';
const databaseUrl = getArgValue('databaseUrl') || process.env.DATABASE_URL || '';

if (!outputDir) {
  console.error('[backup-db-json] Missing --output=<path>');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('[backup-db-json] Missing database URL. Pass --databaseUrl or set DATABASE_URL.');
  process.exit(1);
}

const writeJson = async (filePath, value) => {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const client = new Client({ connectionString: databaseUrl });

try {
  await fs.mkdir(outputDir, { recursive: true });
  await client.connect();

  const tableRows = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC
  `);

  const tables = tableRows.rows.map(row => String(row.table_name || '').trim()).filter(Boolean);

  const tableCounts = [];
  for (const tableName of tables) {
    const safeTableName = tableName.replace(/"/g, '""');
    const result = await client.query(`SELECT * FROM "${safeTableName}"`);
    await writeJson(path.join(outputDir, `${tableName}.json`), result.rows);
    tableCounts.push({ table: tableName, rows: result.rowCount || 0 });
    console.log(`[backup-db-json] ${tableName}: ${result.rowCount || 0} rows`);
  }

  await writeJson(path.join(outputDir, 'tables.json'), tableCounts);
  await writeJson(path.join(outputDir, 'manifest.json'), {
    createdAt: new Date().toISOString(),
    databaseUrlMasked: databaseUrl.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:***@'),
    tableCount: tables.length,
    tables: tableCounts
  });

  console.log(`[backup-db-json] Export complete: ${outputDir}`);
} catch (error) {
  console.error('[backup-db-json] Failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  try {
    await client.end();
  } catch {
    // ignore
  }
}