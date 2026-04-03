import { normalizeUserPreferences } from '@/helpers/user-preferences';
import { query } from '@/server/db';

const ensureTable = async () => {
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
  await ensureTable();
  const result = await query(`SELECT preferences FROM user_ui_preferences WHERE user_id = $1`, [normalizedUserId]);
  return normalizeUserPreferences(result.rows[0]?.preferences || null);
};

export const writeUserPreferences = async (userId, preferences) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw new Error('userId is required.');
  await ensureTable();
  const normalizedPreferences = normalizeUserPreferences(preferences);
  await query(
    `INSERT INTO user_ui_preferences (user_id, preferences, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
    [normalizedUserId, JSON.stringify(normalizedPreferences)]
  );
  return normalizedPreferences;
};