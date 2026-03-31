import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
};

const normalizeRequestedPath = rawPath => String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();

const isAllowedRelativePath = relPath => {
  const lowered = relPath.toLowerCase();
  return lowered.startsWith('licence/') || lowered.startsWith('storage/') || lowered.startsWith('public/');
};

export async function GET(request) {
  const requestedPath = normalizeRequestedPath(request.nextUrl.searchParams.get('path'));

  if (!requestedPath) {
    return NextResponse.json({ error: 'Missing path query parameter' }, { status: 400 });
  }

  if (!isAllowedRelativePath(requestedPath)) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  const workspaceRoot = process.cwd();
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
