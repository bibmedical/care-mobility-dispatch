import { query, queryOne } from '@/server/db';
import { runMigrations } from '@/server/db-schema';

let localAssistantMemoryState = null;

const normalizeFact = value => ({
  id: String(value?.id ?? `fact-${Date.now()}`),
  subject: String(value?.subject ?? '').trim(),
  value: String(value?.value ?? '').trim(),
  kind: String(value?.kind ?? 'general'),
  updatedAt: Number(value?.updatedAt ?? Date.now())
});

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
  conversations: Object.fromEntries(Object.entries(value?.conversations || {}).map(([key, conversation]) => [String(key), normalizeConversation(conversation)])),
  facts: Array.isArray(value?.facts) ? value.facts.map(normalizeFact).filter(f => f.subject && f.value) : []
});

const isMissingDatabaseUrlError = error => String(error?.message || '').includes('DATABASE_URL is not set');

const readAssistantMemoryStateFromLocalFallback = () => {
  if (!localAssistantMemoryState) {
    localAssistantMemoryState = normalizeState();
  }
  return normalizeState(localAssistantMemoryState);
};

const writeAssistantMemoryStateToLocalFallback = nextState => {
  localAssistantMemoryState = normalizeState(nextState);
  return normalizeState(localAssistantMemoryState);
};

export const readAssistantMemoryState = async () => {
  try {
    await runMigrations();
    const row = await queryOne(`SELECT conversations, facts FROM assistant_memory WHERE id = 'singleton'`);
    return normalizeState({
      conversations: row?.conversations ?? {},
      facts: row?.facts ?? []
    });
  } catch (error) {
    if (!isMissingDatabaseUrlError(error)) throw error;
    return readAssistantMemoryStateFromLocalFallback();
  }
};

export const writeAssistantMemoryState = async nextState => {
  const normalized = normalizeState(nextState);
  try {
    await runMigrations();
    await query(
      `UPDATE assistant_memory SET conversations = $1, facts = $2, updated_at = NOW() WHERE id = 'singleton'`,
      [normalized.conversations, normalized.facts]
    );
    return normalized;
  } catch (error) {
    if (!isMissingDatabaseUrlError(error)) throw error;
    return writeAssistantMemoryStateToLocalFallback(normalized);
  }
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

export const readAssistantFacts = async () => {
  const state = await readAssistantMemoryState();
  return Array.isArray(state.facts) ? state.facts : [];
};

export const mergeAssistantFact = async ({ subject, value, kind = 'general' }) => {
  const state = await readAssistantMemoryState();
  const existingFacts = Array.isArray(state.facts) ? state.facts : [];
  const normalizedSubject = String(subject || '').trim().toLowerCase();
  const existingIndex = existingFacts.findIndex(f => String(f.subject || '').toLowerCase() === normalizedSubject);
  const nextFact = normalizeFact({ id: existingFacts[existingIndex]?.id || `fact-${Date.now()}`, subject: String(subject).trim(), value: String(value).trim(), kind, updatedAt: Date.now() });
  const nextFacts = existingIndex >= 0
    ? existingFacts.map((f, i) => i === existingIndex ? nextFact : f)
    : [...existingFacts, nextFact];
  await writeAssistantMemoryState({ ...state, facts: nextFacts.slice(-500) });
  return nextFact;
};