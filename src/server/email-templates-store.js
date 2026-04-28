import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { query } from '@/server/db';

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production' && !hasDatabaseUrl();

const getLocalFilePath = () => join(process.cwd(), 'storage', 'email-templates.json');

const readLocalTemplates = async () => {
  try {
    const raw = await readFile(getLocalFilePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeLocalTemplates = async templates => {
  const filePath = getLocalFilePath();
  await mkdir(join(process.cwd(), 'storage'), { recursive: true });
  await writeFile(filePath, JSON.stringify(templates, null, 2), 'utf8');
  return templates;
};

const DEFAULT_TEMPLATES = {
  licenseExpiry: {
    id: 'licenseExpiry',
    name: 'License Expiry Alert',
    subject: '[Mobility Route] License Expiring in {{daysUntilExpiry}} days — {{driverName}}',
    subjectExpired: '[Mobility Route] EXPIRED: Driver License — {{driverName}}',
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4f6f8">
  <div style="background:#1e3a5f;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Mobility Route — Driver License Alert</h2>
  </div>
  <div style="background:#ffffff;padding:24px;border:1px solid #dde3ea;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px;color:#222">Dear <strong>{{driverName}}</strong>,</p>
    <p style="font-size:15px;color:#222">{{statusLine}}</p>
    <p style="font-size:14px;color:{{urgencyColor}};font-weight:bold">{{urgencyText}}</p>
    <p style="font-size:14px;color:#444">Please contact your dispatcher or update your license information in the system immediately.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:11px;color:#999">This is an automated reminder from Mobility Route Dispatch. You will receive this reminder every 3 days until your license record is updated.</p>
  </div>
</div>`,
    textBody: `Dear {{driverName}},

{{statusLine}}
{{urgencyText}}

Please contact your dispatcher or update your license information immediately.

— Mobility Route Dispatch (automated reminder, sent every 3 days)`
  }
};

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    )
  `);
  // Seed defaults if table is empty
  for (const [id, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
    await query(
      `INSERT INTO email_templates (id, data) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(tpl)]
    );
  }
  tableReady = true;
};

export const readEmailTemplates = async () => {
  if (shouldUseLocalFallback()) {
    const stored = await readLocalTemplates();
    return { ...DEFAULT_TEMPLATES, ...stored };
  }
  await ensureTable();
  const result = await query(`SELECT id, data FROM email_templates`);
  const stored = {};
  for (const row of result.rows) {
    stored[row.id] = row.data;
  }
  // Merge with defaults so new template keys always exist
  return { ...DEFAULT_TEMPLATES, ...stored };
};

export const writeEmailTemplates = async templates => {
  if (shouldUseLocalFallback()) {
    return writeLocalTemplates(templates);
  }
  await ensureTable();
  for (const [id, tpl] of Object.entries(templates)) {
    await query(
      `INSERT INTO email_templates (id, data) VALUES ($1,$2)
       ON CONFLICT (id) DO UPDATE SET data=$2`,
      [id, JSON.stringify(tpl)]
    );
  }
  return templates;
};

export const getDefaultTemplates = () => DEFAULT_TEMPLATES;
