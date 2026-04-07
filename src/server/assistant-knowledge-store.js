import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { query, queryOne } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const KNOWLEDGE_FILES_DIR = path.join(STORAGE_DIR, 'assistant-knowledge', 'files');

const normalizeText = value => String(value ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const normalizeLookupValue = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenizeValue = value => normalizeLookupValue(value).split(' ').filter(token => token.length >= 2);

const normalizeDocument = value => ({
  id: String(value?.id || `doc-${Date.now()}`).trim(),
  title: String(value?.title || '').trim(),
  fileName: String(value?.fileName || '').trim(),
  mimeType: String(value?.mimeType || 'text/plain').trim(),
  extension: String(value?.extension || '').trim().toLowerCase(),
  relativePath: String(value?.relativePath || '').replace(/\\/g, '/').trim(),
  charCount: Number(value?.charCount || 0),
  chunkCount: Number(value?.chunkCount || 0),
  size: Number(value?.size || 0),
  summary: String(value?.summary || '').trim(),
  uploadedAt: Number(value?.uploadedAt || Date.now()),
  updatedAt: Number(value?.updatedAt || Date.now())
});

const normalizeChunk = value => ({
  id: String(value?.id || `chunk-${Date.now()}`).trim(),
  documentId: String(value?.documentId || '').trim(),
  order: Number(value?.order || 0),
  text: normalizeText(value?.text || ''),
  searchText: normalizeLookupValue(value?.searchText || value?.text || ''),
  tokenCount: Number(value?.tokenCount || tokenizeValue(value?.text || '').length)
});

const normalizeState = value => ({
  version: 1,
  documents: Array.isArray(value?.documents) ? value.documents.map(normalizeDocument).filter(document => document.id && document.fileName) : [],
  chunks: Array.isArray(value?.chunks) ? value.chunks.map(normalizeChunk).filter(chunk => chunk.id && chunk.documentId && chunk.text) : []
});

const ensureStorage = async () => {
  await runMigrations();
  await mkdir(KNOWLEDGE_FILES_DIR, { recursive: true });
};

const getSafeExtension = (fileName, mimeType) => {
  const ext = path.extname(String(fileName || '').trim()).toLowerCase();
  if (ext) return ext;
  if (String(mimeType || '').toLowerCase().includes('pdf')) return '.pdf';
  return '.txt';
};

const buildStoredFileName = (documentId, extension) => `${documentId}${extension}`;

export const readAssistantKnowledgeState = async () => {
  await ensureStorage();
  const row = await queryOne(`SELECT documents, chunks FROM assistant_knowledge WHERE id = 'singleton'`);
  return normalizeState({
    documents: row?.documents ?? [],
    chunks: row?.chunks ?? []
  });
};

const writeAssistantKnowledgeState = async nextState => {
  await ensureStorage();
  const normalized = normalizeState(nextState);
  await query(
    `UPDATE assistant_knowledge SET documents = $1, chunks = $2, updated_at = NOW() WHERE id = 'singleton'`,
    [normalized.documents, normalized.chunks]
  );
  return normalized;
};

const extractTextFromBuffer = async ({ buffer, fileName, mimeType }) => {
  const extension = getSafeExtension(fileName, mimeType);
  if (extension === '.pdf' || String(mimeType || '').toLowerCase() === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return normalizeText(parsed?.text || '');
    } finally {
      await parser.destroy();
    }
  }
  return normalizeText(buffer.toString('utf8'));
};

const buildSummary = text => {
  const compact = normalizeText(text).replace(/\n+/g, ' ');
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact;
};

const buildChunks = (documentId, text) => {
  const paragraphs = normalizeText(text).split(/\n\n+/).map(paragraph => paragraph.trim()).filter(Boolean);
  const chunks = [];
  let buffer = '';

  const pushChunk = value => {
    const nextText = normalizeText(value);
    if (!nextText) return;
    const order = chunks.length;
    chunks.push(normalizeChunk({
      id: `${documentId}-chunk-${order + 1}`,
      documentId,
      order,
      text: nextText
    }));
  };

  paragraphs.forEach(paragraph => {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= 1400) {
      buffer = candidate;
      return;
    }
    pushChunk(buffer);
    buffer = paragraph;
  });

  pushChunk(buffer);
  return chunks;
};

const buildDocumentTitle = fileName => path.basename(String(fileName || '').trim(), path.extname(String(fileName || '').trim())) || 'Knowledge Document';

export const readAssistantKnowledgeOverview = async () => {
  const state = await readAssistantKnowledgeState();
  const documents = [...state.documents].sort((left, right) => right.updatedAt - left.updatedAt);
  return {
    documents,
    totals: {
      documents: documents.length,
      chunks: state.chunks.length,
      characters: documents.reduce((sum, document) => sum + document.charCount, 0)
    }
  };
};

export const createAssistantKnowledgeDocument = async ({ fileName, mimeType, buffer, size }) => {
  await ensureStorage();
  const text = await extractTextFromBuffer({ buffer, fileName, mimeType });
  if (!text) {
    throw new Error('The file does not contain readable text.');
  }

  const state = await readAssistantKnowledgeState();
  const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = getSafeExtension(fileName, mimeType);
  const storedFileName = buildStoredFileName(documentId, extension);
  const storedFilePath = path.join(KNOWLEDGE_FILES_DIR, storedFileName);
  const relativePath = path.join('storage', 'assistant-knowledge', 'files', storedFileName).replace(/\\/g, '/');
  const chunks = buildChunks(documentId, text);
  const document = normalizeDocument({
    id: documentId,
    title: buildDocumentTitle(fileName),
    fileName,
    mimeType,
    extension,
    relativePath,
    charCount: text.length,
    chunkCount: chunks.length,
    size,
    summary: buildSummary(text),
    uploadedAt: Date.now(),
    updatedAt: Date.now()
  });

  await writeFile(storedFilePath, buffer);
  await writeAssistantKnowledgeState({
    ...state,
    documents: [...state.documents, document],
    chunks: [...state.chunks.filter(chunk => chunk.documentId !== documentId), ...chunks]
  });

  return document;
};

export const deleteAssistantKnowledgeDocument = async documentId => {
  const normalizedDocumentId = String(documentId || '').trim();
  if (!normalizedDocumentId) {
    throw new Error('documentId is required.');
  }

  const state = await readAssistantKnowledgeState();
  const document = state.documents.find(item => item.id === normalizedDocumentId);
  if (!document) {
    throw new Error('Knowledge document not found.');
  }

  if (document.relativePath) {
    const absolutePath = path.join(process.cwd(), document.relativePath);
    await rm(absolutePath, { force: true });
  }

  await writeAssistantKnowledgeState({
    ...state,
    documents: state.documents.filter(item => item.id !== normalizedDocumentId),
    chunks: state.chunks.filter(chunk => chunk.documentId !== normalizedDocumentId)
  });

  return document;
};

export const searchAssistantKnowledge = async (query, options = {}) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];

  const limit = Math.max(1, Number(options.limit || 4));
  const state = await readAssistantKnowledgeState();
  const documentsById = new Map(state.documents.map(document => [document.id, document]));
  const queryTokens = tokenizeValue(normalizedQuery);
  const queryLookup = normalizeLookupValue(normalizedQuery);

  const results = state.chunks.map(chunk => {
    const document = documentsById.get(chunk.documentId);
    if (!document) return null;

    let score = 0;
    if (queryLookup && chunk.searchText.includes(queryLookup)) {
      score += 12;
    }

    queryTokens.forEach(token => {
      if (chunk.searchText.includes(token)) score += 2;
      if (normalizeLookupValue(document.title).includes(token)) score += 3;
      if (normalizeLookupValue(document.fileName).includes(token)) score += 1;
    });

    if (score <= 0) return null;

    return {
      documentId: document.id,
      documentTitle: document.title,
      fileName: document.fileName,
      relativePath: document.relativePath,
      summary: document.summary,
      chunkId: chunk.id,
      score,
      text: chunk.text.length > 700 ? `${chunk.text.slice(0, 697)}...` : chunk.text
    };
  }).filter(Boolean);

  return results.sort((left, right) => right.score - left.score || left.documentTitle.localeCompare(right.documentTitle)).slice(0, limit);
};
