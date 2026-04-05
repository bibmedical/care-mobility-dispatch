import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const BRANDING_STORAGE_DIR = path.join(process.cwd(), 'storage', 'branding');

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });
const forbidden = () => NextResponse.json({ error: 'Admin access required' }, { status: 403 });

const sanitizeFileName = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9.-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

export async function POST(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) return unauthorized();
  if (!isAdminRole(session?.user?.role)) return forbidden();

  try {
    const formData = await request.formData();
    const pageKey = String(formData.get('pageKey') || '').trim();
    const file = formData.get('file');

    if (!pageKey) {
      return NextResponse.json({ error: 'Page key is required.' }, { status: 400 });
    }

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Select an image first.' }, { status: 400 });
    }

    const fileName = String(file.name || 'branding-image').trim();
    const extension = path.extname(fileName).toLowerCase();
    const mimeType = String(file.type || '').trim().toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: 'Only PNG, JPG, WEBP, GIF, or SVG images are allowed.' }, { status: 400 });
    }

    if (Number(file.size || 0) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'The image is too large. Use a file under 5MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const safeBaseName = sanitizeFileName(path.basename(fileName, extension)) || 'branding-image';
    const storedFileName = `${pageKey}-${timestamp}-${safeBaseName}${extension}`;

    await mkdir(BRANDING_STORAGE_DIR, { recursive: true });
    await writeFile(path.join(BRANDING_STORAGE_DIR, storedFileName), buffer);

    return NextResponse.json({
      ok: true,
      path: `/api/files/local?path=${encodeURIComponent(`storage/branding/${storedFileName}`)}`,
      fileName: storedFileName
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to upload branding image.' }, { status: 400 });
  }
}