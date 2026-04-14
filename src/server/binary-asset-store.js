import { readFile, readdir, rm } from 'fs/promises';
import path from 'path';
import { BRANDING_PAGE_OPTIONS } from '@/helpers/branding';
import { query, queryOne } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { getStorageRoot } from '@/server/storage-paths';

const BRANDING_PAGE_KEYS = BRANDING_PAGE_OPTIONS.map(option => String(option?.key || '').trim()).filter(Boolean);

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv'
};

const normalizeRelativePath = rawPath => String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
const getMimeTypeByFileName = fileName => MIME_BY_EXT[path.extname(String(fileName || '').trim()).toLowerCase()] || 'application/octet-stream';
let legacyMigrationPromise = null;

const tryGetStorageRoot = () => {
  try {
    return getStorageRoot();
  } catch {
    return null;
  }
};

const mapBrandingRow = row => row ? {
  pageKey: String(row.page_key || '').trim(),
  fileName: String(row.file_name || '').trim(),
  mimeType: String(row.mime_type || '').trim() || getMimeTypeByFileName(row.file_name),
  size: Number(row.file_size || 0),
  buffer: row.file_bytes,
  updatedAt: row.updated_at
} : null;

const mapKnowledgeFileRow = row => row ? {
  documentId: String(row.document_id || '').trim(),
  fileName: String(row.file_name || '').trim(),
  mimeType: String(row.mime_type || '').trim() || getMimeTypeByFileName(row.file_name),
  size: Number(row.file_size || 0),
  relativePath: normalizeRelativePath(row.relative_path),
  buffer: row.file_bytes,
  updatedAt: row.updated_at
} : null;

const getBrandingLegacyDirectory = () => {
  const storageRoot = tryGetStorageRoot();
  return storageRoot ? path.join(storageRoot, 'branding') : '';
};

const resolveKnowledgeLegacyAbsolutePath = relativePath => {
  const storageRoot = tryGetStorageRoot();
  if (!storageRoot) return '';
  const normalizedRelativePath = normalizeRelativePath(relativePath).replace(/^storage\//i, '');
  return normalizedRelativePath ? path.join(storageRoot, normalizedRelativePath) : '';
};

export const getKnowledgeRelativePath = fileName => path.join('storage', 'assistant-knowledge', 'files', fileName).replace(/\\/g, '/');

const extractBrandingPageKey = fileName => {
  const normalizedFileName = String(fileName || '').trim().toLowerCase();
  return BRANDING_PAGE_KEYS.find(pageKey => normalizedFileName.startsWith(`${pageKey.toLowerCase()}-`) || normalizedFileName.startsWith(`${pageKey.toLowerCase()}.`)) || '';
};

export const migrateLegacyBinaryAssetsToDatabase = async () => {
  await runMigrations();

  const storageRoot = tryGetStorageRoot();
  if (!storageRoot) {
    return { migratedBrandingAssets: 0, migratedKnowledgeFiles: 0, skipped: true };
  }

  let migratedBrandingAssets = 0;
  let migratedKnowledgeFiles = 0;

  const brandingDirectory = getBrandingLegacyDirectory();
  const brandingFiles = await readdir(brandingDirectory).catch(() => []);
  for (const fileName of brandingFiles) {
    const pageKey = extractBrandingPageKey(fileName);
    if (!pageKey) continue;

    const existingAsset = await queryOne(`SELECT page_key FROM branding_assets WHERE page_key = $1 LIMIT 1`, [pageKey]);
    if (existingAsset) continue;

    const absolutePath = path.join(brandingDirectory, fileName);
    const buffer = await readFile(absolutePath).catch(() => null);
    if (!buffer) continue;

    await upsertBrandingAsset({
      pageKey,
      fileName,
      mimeType: getMimeTypeByFileName(fileName),
      buffer,
      size: buffer.length
    });
    migratedBrandingAssets += 1;
  }

  const stateRow = await queryOne(`SELECT documents FROM assistant_knowledge WHERE id = 'singleton'`);
  const documents = Array.isArray(stateRow?.documents) ? stateRow.documents : [];
  for (const document of documents) {
    const documentId = String(document?.id || '').trim();
    const relativePath = normalizeRelativePath(document?.relativePath);
    if (!documentId || !relativePath) continue;

    const existingAsset = await queryOne(`SELECT document_id FROM assistant_knowledge_files WHERE document_id = $1 LIMIT 1`, [documentId]);
    if (existingAsset) continue;

    const absolutePath = resolveKnowledgeLegacyAbsolutePath(relativePath);
    if (!absolutePath) continue;

    const buffer = await readFile(absolutePath).catch(() => null);
    if (!buffer) continue;

    await upsertAssistantKnowledgeFile({
      documentId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      relativePath,
      buffer,
      size: Number(document.size) || buffer.length
    });
    migratedKnowledgeFiles += 1;
  }

  return { migratedBrandingAssets, migratedKnowledgeFiles, skipped: false };
};

const ensureLegacyBinaryAssetsMigrated = async () => {
  if (legacyMigrationPromise) return legacyMigrationPromise;
  legacyMigrationPromise = migrateLegacyBinaryAssetsToDatabase().catch(error => {
    legacyMigrationPromise = null;
    throw error;
  });
  return legacyMigrationPromise;
};

export const upsertBrandingAsset = async ({ pageKey, fileName, mimeType, buffer, size }) => {
  await runMigrations();
  const normalizedPageKey = String(pageKey || '').trim();
  if (!normalizedPageKey) throw new Error('pageKey is required.');
  if (!Buffer.isBuffer(buffer)) throw new Error('buffer is required.');

  await query(
    `INSERT INTO branding_assets (page_key, file_name, mime_type, file_size, file_bytes, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (page_key) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       mime_type = EXCLUDED.mime_type,
       file_size = EXCLUDED.file_size,
       file_bytes = EXCLUDED.file_bytes,
       updated_at = NOW()`,
    [
      normalizedPageKey,
      String(fileName || '').trim(),
      String(mimeType || '').trim() || getMimeTypeByFileName(fileName),
      Math.max(0, Number(size) || buffer.length || 0),
      buffer
    ]
  );

  return await readBrandingAssetByPageKey(normalizedPageKey);
};

export const readBrandingAssetByPageKey = async pageKey => {
  await runMigrations();
  await ensureLegacyBinaryAssetsMigrated();
  const normalizedPageKey = String(pageKey || '').trim();
  if (!normalizedPageKey) return null;

  const row = await queryOne(
    `SELECT page_key, file_name, mime_type, file_size, file_bytes, updated_at
     FROM branding_assets
     WHERE page_key = $1
     LIMIT 1`,
    [normalizedPageKey]
  );
  return mapBrandingRow(row);
};

export const readBrandingAssetByFileName = async fileName => {
  await runMigrations();
  await ensureLegacyBinaryAssetsMigrated();
  const normalizedFileName = String(fileName || '').trim();
  if (!normalizedFileName) return null;

  const row = await queryOne(
    `SELECT page_key, file_name, mime_type, file_size, file_bytes, updated_at
     FROM branding_assets
     WHERE file_name = $1
     LIMIT 1`,
    [normalizedFileName]
  );
  const asset = mapBrandingRow(row);
  if (asset) return asset;

  const matchedPageKey = extractBrandingPageKey(normalizedFileName);

  return matchedPageKey ? await readBrandingAssetByPageKey(matchedPageKey) : null;
};

export const upsertAssistantKnowledgeFile = async ({ documentId, fileName, mimeType, relativePath, buffer, size }) => {
  await runMigrations();
  const normalizedDocumentId = String(documentId || '').trim();
  if (!normalizedDocumentId) throw new Error('documentId is required.');
  if (!Buffer.isBuffer(buffer)) throw new Error('buffer is required.');

  const normalizedFileName = String(fileName || '').trim() || `${normalizedDocumentId}${path.extname(String(fileName || '').trim()).toLowerCase() || '.txt'}`;
  const normalizedRelativePath = normalizeRelativePath(relativePath) || getKnowledgeRelativePath(normalizedFileName);

  await query(
    `INSERT INTO assistant_knowledge_files (document_id, file_name, mime_type, file_size, relative_path, file_bytes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (document_id) DO UPDATE SET
       file_name = EXCLUDED.file_name,
       mime_type = EXCLUDED.mime_type,
       file_size = EXCLUDED.file_size,
       relative_path = EXCLUDED.relative_path,
       file_bytes = EXCLUDED.file_bytes,
       updated_at = NOW()`,
    [
      normalizedDocumentId,
      normalizedFileName,
      String(mimeType || '').trim() || getMimeTypeByFileName(normalizedFileName),
      Math.max(0, Number(size) || buffer.length || 0),
      normalizedRelativePath,
      buffer
    ]
  );

  return await readAssistantKnowledgeFileByRelativePath(normalizedRelativePath);
};

export const readAssistantKnowledgeFileByRelativePath = async relativePath => {
  await runMigrations();
  await ensureLegacyBinaryAssetsMigrated();
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) return null;

  const row = await queryOne(
    `SELECT document_id, file_name, mime_type, file_size, relative_path, file_bytes, updated_at
     FROM assistant_knowledge_files
     WHERE relative_path = $1
     LIMIT 1`,
    [normalizedRelativePath]
  );
  return mapKnowledgeFileRow(row);
};

export const deleteAssistantKnowledgeFileBlob = async ({ documentId, relativePath }) => {
  await runMigrations();
  const normalizedDocumentId = String(documentId || '').trim();
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  if (normalizedDocumentId) {
    await query(`DELETE FROM assistant_knowledge_files WHERE document_id = $1`, [normalizedDocumentId]);
  } else if (normalizedRelativePath) {
    await query(`DELETE FROM assistant_knowledge_files WHERE relative_path = $1`, [normalizedRelativePath]);
  }

  const legacyAbsolutePath = resolveKnowledgeLegacyAbsolutePath(normalizedRelativePath);
  if (legacyAbsolutePath) {
    await rm(legacyAbsolutePath, { force: true }).catch(() => {});
  }
};

export const readStorageAssetByRelativePath = async relativePath => {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath.startsWith('storage/')) return null;

  if (normalizedRelativePath.toLowerCase().startsWith('storage/assistant-knowledge/')) {
    return await readAssistantKnowledgeFileByRelativePath(normalizedRelativePath);
  }

  if (normalizedRelativePath.toLowerCase().startsWith('storage/branding/')) {
    return await readBrandingAssetByFileName(path.basename(normalizedRelativePath));
  }

  return null;
};