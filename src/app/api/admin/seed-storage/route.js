import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { getStorageRoot, getStorageFilePath } from '@/server/storage-paths';

const ALLOWED_STORAGE_FILES = new Set([
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
]);

const readJsonBody = async request => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function POST(request) {
  const token = request.headers.get('x-seed-token');
  const expected = process.env.SEED_TOKEN;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJsonBody(request);
  const files = body?.files && typeof body.files === 'object' ? body.files : null;

  if (!files) {
    return NextResponse.json({ error: 'Body must include an object "files"' }, { status: 400 });
  }

  const invalidNames = Object.keys(files).filter(name => !ALLOWED_STORAGE_FILES.has(String(name || '').trim()));
  if (invalidNames.length > 0) {
    return NextResponse.json({
      error: 'One or more file names are not allowed',
      invalidNames,
      allowedNames: Array.from(ALLOWED_STORAGE_FILES)
    }, { status: 400 });
  }

  try {
    await mkdir(getStorageRoot(), { recursive: true });

    const written = [];
    for (const [name, value] of Object.entries(files)) {
      const filePath = getStorageFilePath(name);
      await writeFile(filePath, JSON.stringify(value ?? {}, null, 2), 'utf8');
      written.push(name);
    }

    return NextResponse.json({
      ok: true,
      writtenCount: written.length,
      written
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
