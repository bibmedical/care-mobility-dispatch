import { NextResponse } from 'next/server';
import path from 'path';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { BRANDING_PAGE_OPTIONS } from '@/helpers/branding';
import { isAdminRole } from '@/helpers/system-users';
import { upsertBrandingAsset } from '@/server/binary-asset-store';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });
const forbidden = () => NextResponse.json({ error: 'Admin access required' }, { status: 403 });
const ALLOWED_PAGE_KEYS = new Set(BRANDING_PAGE_OPTIONS.map(option => option.key));

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

    if (!ALLOWED_PAGE_KEYS.has(pageKey)) {
      return NextResponse.json({ error: 'Invalid branding page key.' }, { status: 400 });
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
    const safeBaseName = sanitizeFileName(path.basename(fileName, extension)) || 'branding-image';
    const storedFileName = `${pageKey}-${safeBaseName}${extension}`;

    await upsertBrandingAsset({
      pageKey,
      fileName: storedFileName,
      mimeType,
      buffer,
      size: buffer.length
    });

    return NextResponse.json({
      ok: true,
      path: `/api/branding/image?pageKey=${encodeURIComponent(pageKey)}`,
      fileName: storedFileName
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to upload branding image.' }, { status: 400 });
  }
}
