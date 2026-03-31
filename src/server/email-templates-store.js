import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('email-templates.json');

const DEFAULT_TEMPLATES = {
  licenseExpiry: {
    id: 'licenseExpiry',
    name: 'License Expiry Alert',
    subject: '[Care Mobility] License Expiring in {{daysUntilExpiry}} days — {{driverName}}',
    subjectExpired: '[Care Mobility] EXPIRED: Driver License — {{driverName}}',
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8f8f8">
  <div style="background:#1a1a2e;padding:16px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Care Mobility — Driver License Alert</h2>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px">Dear <strong>{{driverName}}</strong>,</p>
    <p style="font-size:15px">{{statusLine}}</p>
    <p style="font-size:14px;color:{{urgencyColor}};font-weight:bold">{{urgencyText}}</p>
    <p style="font-size:14px">Please contact your dispatcher or update your license information in the system immediately.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:11px;color:#999">This is an automated reminder from Care Mobility Dispatch. You will receive this reminder every 3 days until your license record is updated.</p>
  </div>
</div>`,
    textBody: `Dear {{driverName}},

{{statusLine}}
{{urgencyText}}

Please contact your dispatcher or update your license information immediately.

— Care Mobility Dispatch (automated reminder, sent every 3 days)`
  }
};

const ensureFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify({ templates: DEFAULT_TEMPLATES }, null, 2), 'utf8');
  }
};

export const readEmailTemplates = async () => {
  await ensureFile();
  const content = await readFile(STORAGE_FILE, 'utf8');
  const parsed = JSON.parse(content);
  // Merge with defaults so new template keys always exist
  return { ...DEFAULT_TEMPLATES, ...(parsed.templates || {}) };
};

export const writeEmailTemplates = async templates => {
  await ensureFile();
  await writeFile(STORAGE_FILE, JSON.stringify({ templates }, null, 2), 'utf8');
  return templates;
};

export const getDefaultTemplates = () => DEFAULT_TEMPLATES;
