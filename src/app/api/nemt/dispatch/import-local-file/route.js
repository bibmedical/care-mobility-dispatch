import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { parseTripImportBuffer } from '@/helpers/nemt-trip-import';

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

const normalizeCandidatePath = rawValue => path.normalize(String(rawValue || '').trim());

const getAllowedRoots = () => {
  const homeDir = os.homedir();
  return [
    process.cwd(),
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Documents')
  ].map(entry => path.normalize(entry));
};

const isPathAllowed = absolutePath => {
  const normalizedAbsolutePath = path.normalize(absolutePath).toLowerCase();
  return getAllowedRoots().some(rootPath => normalizedAbsolutePath.startsWith(rootPath.toLowerCase()));
};

export async function POST(request) {
  try {
    const body = await request.json();
    const candidatePath = normalizeCandidatePath(body?.path);

    if (!candidatePath) {
      return NextResponse.json({ error: 'Missing local file path.' }, { status: 400 });
    }

    if (!path.isAbsolute(candidatePath)) {
      return NextResponse.json({ error: 'Use a full local path.' }, { status: 400 });
    }

    const extension = path.extname(candidatePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: 'Only .csv, .xlsx, and .xls files are allowed.' }, { status: 400 });
    }

    if (!isPathAllowed(candidatePath)) {
      return NextResponse.json({ error: 'That path is outside the allowed local folders.' }, { status: 403 });
    }

    const fileBuffer = await readFile(candidatePath);
    const parsedImport = parseTripImportBuffer(fileBuffer);
    return NextResponse.json(parsedImport);
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Could not read the local file.' }, { status: 500 });
  }
}