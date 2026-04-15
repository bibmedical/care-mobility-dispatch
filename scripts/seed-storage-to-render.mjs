import fs from 'fs/promises';
import path from 'path';

const args = process.argv.slice(2);
const options = {
  baseUrl: 'https://care-mobility-dispatch-web-v2.onrender.com',
  token: '',
  storageDir: 'storage'
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--token') options.token = args[i + 1] || '';
  if (arg === '--base-url') options.baseUrl = args[i + 1] || options.baseUrl;
  if (arg === '--storage-dir') options.storageDir = args[i + 1] || options.storageDir;
}

if (!options.token) {
  console.error('Missing --token');
  process.exit(1);
}

const allowed = [
  'activity-logs.json',
  'assistant-memory.json',
  'blacklist.json',
  'email-auth-codes.json',
  'integrations.json',
  'login-failures.json',
  'nemt-admin.json',
  'nemt-dispatch.json',
  'system-messages.json',
  'system-users.json'
];

const url = `${options.baseUrl.replace(/\/$/, '')}/api/admin/seed-storage`;

const parseJsonSafe = raw => {
  const normalized = String(raw ?? '').replace(/^\uFEFF/, '').trim();
  return normalized ? JSON.parse(normalized) : {};
};

const postWithRetry = async body => {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-seed-token': options.token
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }

      if (!response.ok) {
        throw new Error(JSON.stringify({ status: response.status, ...payload }));
      }

      return payload;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError;
};

const uploaded = [];
for (const name of allowed) {
  const fullPath = path.join(options.storageDir, name);
  let parsed;
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    parsed = parseJsonSafe(raw);
  } catch (err) {
    console.warn(`Skipping ${fullPath}: ${err.message}`);
    continue;
  }

  const payload = await postWithRetry({ files: { [name]: parsed } });
  uploaded.push({ name, writtenCount: payload.writtenCount || 0 });
  console.log(`Uploaded ${name}`);
}

console.log(JSON.stringify({ ok: true, uploadedCount: uploaded.length, uploaded }, null, 2));
