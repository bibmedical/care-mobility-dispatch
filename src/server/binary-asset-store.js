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

const migrateLegacyBrandingAsset = async pageKey => {
  const legacyDirectory = getBrandingLegacyDirectory();
  if (!legacyDirectory) return null;

  const files = await readdir(legacyDirectory).catch(() => []);
  const matchedFile = files.find(entry => entry.startsWith(`${pageKey}-`) || entry.startsWith(`${pageKey}.`));
  if (!matchedFile) return null;

  const absolutePath = path.join(legacyDirectory, matchedFile);
  const buffer = await readFile(absolutePath).catch(() => null);
  if (!buffer) return null;

  await upsertBrandingAsset({
    pageKey,
    fileName: matchedFile,
    mimeType: getMimeTypeByFileName(matchedFile),
    buffer,
    size: buffer.length
  });

  return await readBrandingAssetByPageKey(pageKey, { allowLegacyMigration: false });
};

export const readBrandingAssetByPageKey = async (pageKey, options = {}) => {
  await runMigrations();
  const normalizedPageKey = String(pageKey || '').trim();
  if (!normalizedPageKey) return null;

  const row = await queryOne(
    `SELECT page_key, file_name, mime_type, file_size, file_bytes, updated_at
     FROM branding_assets
     WHERE page_key = $1
     LIMIT 1`,
    [normalizedPageKey]
  );
  const asset = mapBrandingRow(row);
  if (asset) return asset;
  if (options.allowLegacyMigration === false) return null;
  return await migrateLegacyBrandingAsset(normalizedPageKey);
};

export const readBrandingAssetByFileName = async fileName => {
  await runMigrations();
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

  const matchedPageKey = BRANDING_PAGE_KEYS.find(pageKey => {
    const loweredFileName = normalizedFileName.toLowerCase();
    const loweredPageKey = pageKey.toLowerCase();
    return loweredFileName.startsWith(`${loweredPageKey}-`) || loweredFileName.startsWith(`${loweredPageKey}.`);
  });

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

  return await readAssistantKnowledgeFileByRelativePath(normalizedRelativePath, { allowLegacyMigration: false });
};

const migrateLegacyKnowledgeFile = async relativePath => {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) return null;

  const stateRow = await queryOne(`SELECT documents FROM assistant_knowledge WHERE id = 'singleton'`);
  const document = (Array.isArray(stateRow?.documents) ? stateRow.documents : []).find(item => normalizeRelativePath(item?.relativePath) === normalizedRelativePath);
  if (!document) return null;

  const absolutePath = resolveKnowledgeLegacyAbsolutePath(normalizedRelativePath);
  if (!absolutePath) return null;

  const buffer = await readFile(absolutePath).catch(() => null);
  if (!buffer) return null;

  await upsertAssistantKnowledgeFile({
    documentId: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    relativePath: normalizedRelativePath,
    buffer,
    size: Number(document.size) || buffer.length
  });

  return await readAssistantKnowledgeFileByRelativePath(normalizedRelativePath, { allowLegacyMigration: false });
};

export const readAssistantKnowledgeFileByRelativePath = async (relativePath, options = {}) => {
  await runMigrations();
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) return null;

  const row = await queryOne(
    `SELECT document_id, file_name, mime_type, file_size, relative_path, file_bytes, updated_at
     FROM assistant_knowledge_files
     WHERE relative_path = $1
     LIMIT 1`,
    [normalizedRelativePath]
  );
  const asset = mapKnowledgeFileRow(row);
  if (asset) return asset;
  if (options.allowLegacyMigration === false) return null;
  return await migrateLegacyKnowledgeFile(normalizedRelativePath);
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