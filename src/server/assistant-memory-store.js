import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('assistant-memory.json');

const DEFAULT_STATE = {
  version: 1,
  conversations: {}
};

const normalizeMessage = value => ({
  id: String(value?.id ?? `msg-${Date.now()}`),
  role: String(value?.role ?? 'assistant'),
  text: String(value?.text ?? '').trim(),
  createdAt: Number(value?.createdAt ?? Date.now())
});

const normalizeConversation = value => ({
  updatedAt: Number(value?.updatedAt ?? Date.now()),
  path: String(value?.path ?? ''),
  messages: Array.isArray(value?.messages) ? value.messages.map(normalizeMessage).filter(message => message.text) : []
});

const normalizeState = value => ({
  version: 1,
  conversations: Object.fromEntries(Object.entries(value?.conversations || {}).map(([key, conversation]) => [String(key), normalizeConversation(conversation)]))
});

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
  }
};

export const readAssistantMemoryState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  return normalizeState(JSON.parse(fileContents));
};

export const writeAssistantMemoryState = async nextState => {
  await ensureStorageFile();
  const normalized = normalizeState(nextState);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
};

export const readAssistantConversation = async clientId => {
  const state = await readAssistantMemoryState();
  return state.conversations[String(clientId ?? '').trim()] || normalizeConversation();
};

export const writeAssistantConversation = async (clientId, conversation) => {
  const normalizedClientId = String(clientId ?? '').trim();
  if (!normalizedClientId) {
    throw new Error('clientId is required.');
  }
  const state = await readAssistantMemoryState();
  const nextConversation = normalizeConversation(conversation);
  return writeAssistantMemoryState({
    ...state,
    conversations: {
      ...state.conversations,
      [normalizedClientId]: nextConversation
    }
  });
};