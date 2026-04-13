import { readFile } from 'fs/promises';
import { normalizeUserPreferences } from '@/helpers/user-preferences';
import { query } from '@/server/db';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());

const getUserPreferencesStorageFile = () => getStorageFilePath('user-preferences.json');

const readLocalPreferencesState = async () => {
  try {
    const raw = await readFile(getUserPreferencesStorageFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeLocalPreferencesState = async state => {
  await writeJsonFileWithSnapshots({
    filePath: getUserPreferencesStorageFile(),
    nextValue: state,
    backupName: 'user-preferences-local'
  });
  return state;
};

const ensureTable = async () => {
  if (!hasDatabaseUrl()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS user_ui_preferences (
      user_id TEXT PRIMARY KEY,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

export const readUserPreferences = async userId => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return normalizeUserPreferences(null);

  if (!hasDatabaseUrl()) {
    const localState = await readLocalPreferencesState();
    return normalizeUserPreferences(localState?.[normalizedUserId] || null);
  }

  await ensureTable();
  const result = await query(`SELECT preferences FROM user_ui_preferences WHERE user_id = $1`, [normalizedUserId]);
  return normalizeUserPreferences(result.rows[0]?.preferences || null);
};

export const writeUserPreferences = async (userId, preferences) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw new Error('userId is required.');
  const normalizedPreferences = normalizeUserPreferences(preferences);

  if (!hasDatabaseUrl()) {
    const localState = await readLocalPreferencesState();
    localState[normalizedUserId] = normalizedPreferences;
    await writeLocalPreferencesState(localState);
    return normalizedPreferences;
  }

  await ensureTable();
  await query(
    `INSERT INTO user_ui_preferences (user_id, preferences, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
    [normalizedUserId, JSON.stringify(normalizedPreferences)]
  );
  return normalizedPreferences;
};