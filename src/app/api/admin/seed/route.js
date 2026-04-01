import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { getStorageRoot, getStorageFilePath } from '@/server/storage-paths';

export async function POST(request) {
  const token = request.headers.get('x-seed-token');
  const expected = process.env.SEED_TOKEN;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const storageDir = getStorageRoot();
    const filePath = getStorageFilePath('nemt-admin.json');

    await mkdir(storageDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(body, null, 2), 'utf8');

    return NextResponse.json({ ok: true, path: filePath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
