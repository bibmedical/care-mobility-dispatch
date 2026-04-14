import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readStorageAssetByRelativePath } from '@/server/binary-asset-store';

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
};

const normalizeRequestedPath = rawPath => String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();

const isAllowedStorageRelativePath = relPath => {
  const lowered = relPath.toLowerCase();
  return lowered.startsWith('storage/assistant-knowledge/') || lowered.startsWith('storage/branding/');
};

const isAllowedRelativePath = relPath => {
  const lowered = relPath.toLowerCase();
  return lowered.startsWith('licence/') || lowered.startsWith('public/') || isAllowedStorageRelativePath(lowered);
};

export async function GET(request) {
  const session = await getServerSession(options);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const requestedPath = normalizeRequestedPath(request.nextUrl.searchParams.get('path'));

  if (!requestedPath) {
    return NextResponse.json({ error: 'Missing path query parameter' }, { status: 400 });
  }

  if (!isAllowedRelativePath(requestedPath)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  const workspaceRoot = process.cwd();
  const isStoragePath = requestedPath.toLowerCase().startsWith('storage/');

  if (isStoragePath) {
    const storageAsset = await readStorageAssetByRelativePath(requestedPath);
    if (!storageAsset?.buffer) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const contentType = String(storageAsset.mimeType || '').trim() || MIME_BY_EXT[path.extname(String(storageAsset.fileName || '')).toLowerCase()] || 'application/octet-stream';

    return new NextResponse(storageAsset.buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }

  const absolutePath = path.resolve(workspaceRoot, requestedPath);

  if (!absolutePath.startsWith(workspaceRoot)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const fileBuffer = await readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
