import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('system-messages.json');

const ensureFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify({ messages: [] }, null, 2), 'utf8');
  }
};

export const readSystemMessages = async () => {
  await ensureFile();
  const content = await readFile(STORAGE_FILE, 'utf8');
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.messages) ? parsed.messages : [];
};

export const writeSystemMessages = async messages => {
  await ensureFile();
  await writeFile(STORAGE_FILE, JSON.stringify({ messages }, null, 2), 'utf8');
  return messages;
};

export const upsertSystemMessage = async newMsg => {
  const messages = await readSystemMessages();
  const idx = messages.findIndex(m => m.id === newMsg.id);
  if (idx >= 0) {
    messages[idx] = { ...messages[idx], ...newMsg };
  } else {
    messages.unshift(newMsg);
  }
  await writeSystemMessages(messages);
  return newMsg;
};

export const resolveSystemMessageById = async id => {
  const messages = await readSystemMessages();
  const idx = messages.findIndex(m => m.id === id);
  if (idx < 0) return null;
  messages[idx] = { ...messages[idx], status: 'resolved', resolvedAt: new Date().toISOString() };
  await writeSystemMessages(messages);
  return messages[idx];
};

export const getActiveMessageForDriver = async (driverId, type) => {
  const messages = await readSystemMessages();
  return messages.find(m => m.driverId === driverId && m.type === type && m.status === 'active') || null;
};
