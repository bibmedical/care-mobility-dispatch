import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { BRANDING_PAGE_OPTIONS, DEFAULT_BRANDING_PAGES } from '@/helpers/branding';
import { getStorageRoot } from '@/server/storage-paths';

const BRANDING_STORAGE_DIR = path.join(getStorageRoot(), 'branding');
const ALLOWED_PAGE_KEYS = new Set(BRANDING_PAGE_OPTIONS.map(option => option.key));
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

const getContentTypeByFileName = fileName => {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
};

const buildImageResponse = (buffer, fileName) => {
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': getContentTypeByFileName(fileName),
      'Cache-Control': 'public, max-age=3600'
    }
  });
};

const readDefaultBrandingImage = async pageKey => {
  const defaultPath = String(DEFAULT_BRANDING_PAGES?.[pageKey] || '').trim();
  if (!defaultPath.startsWith('/')) return null;
  const publicRelativePath = defaultPath.replace(/^\/+/, '');
  if (!publicRelativePath) return null;

  try {
    const absolutePath = path.join(process.cwd(), 'public', publicRelativePath);
    const fileBuffer = await readFile(absolutePath);
    return {
      fileBuffer,
      fileName: publicRelativePath
    };
  } catch {
    return null;
  }
};

export async function GET(request) {
  const pageKey = String(request.nextUrl.searchParams.get('pageKey') || '').trim();

  if (!pageKey) {
    return NextResponse.json({ error: 'Page key is required.' }, { status: 400 });
  }

  if (!ALLOWED_PAGE_KEYS.has(pageKey)) {
    return NextResponse.json({ error: 'Invalid branding page key.' }, { status: 400 });
  }

  try {
    const files = await readdir(BRANDING_STORAGE_DIR);
    const matchedFile = files.find(entry => entry.startsWith(`${pageKey}-`) || entry.startsWith(`${pageKey}.`));

    if (!matchedFile) {
      const defaultImage = await readDefaultBrandingImage(pageKey);
      if (defaultImage) {
        return buildImageResponse(defaultImage.fileBuffer, defaultImage.fileName);
      }
      return NextResponse.json({ error: 'Branding image not found.' }, { status: 404 });
    }

    const absolutePath = path.join(BRANDING_STORAGE_DIR, matchedFile);
    const fileBuffer = await readFile(absolutePath);
    return buildImageResponse(fileBuffer, matchedFile);
  } catch {
    const defaultImage = await readDefaultBrandingImage(pageKey);
    if (defaultImage) {
      return buildImageResponse(defaultImage.fileBuffer, defaultImage.fileName);
    }
    return NextResponse.json({ error: 'Branding image not found.' }, { status: 404 });
  }
}