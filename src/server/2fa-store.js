import { query } from '@/server/db';
import { generateSecret, generateURI, verify } from 'otplib';

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS two_fa_secrets (
      user_id TEXT PRIMARY KEY,
      secret TEXT NOT NULL DEFAULT '',
      enabled_at TEXT NOT NULL DEFAULT '',
      verified BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  tableReady = true;
};

/**
 * Generate a new 2FA secret for a user
 * Returns: { secret, otpauth_url } for QR code generation
 */
export const generate2FASecret = async (userId, userName, issuer = 'Assistant App') => {
  try {
    const secret = generateSecret();
    const otpauth_url = generateURI({
      strategy: 'totp',
      issuer,
      label: userName,
      secret,
      digits: 6,
      period: 30,
      algorithm: 'sha1'
    });

    // Don't save yet - user must verify first
    return {
      secret,
      otpauth_url,
      userId
    };
  } catch (error) {
    console.error('Error generating 2FA secret:', error);
    throw error;
  }
};

/**
 * Verify a TOTP code and enable 2FA for user
 */
export const verify2FASecretAndEnable = async (userId, secret, token) => {
  try {
    const isValid = await verify({
      strategy: 'totp',
      token,
      secret,
      digits: 6,
      period: 30,
      algorithm: 'sha1',
      epochTolerance: 1
    });
    if (!isValid) {
      return { success: false, error: 'Invalid verification code' };
    }

    await ensureTable();
    await query(
      `INSERT INTO two_fa_secrets (user_id, secret, enabled_at, verified)
       VALUES ($1,$2,$3,TRUE)
       ON CONFLICT (user_id) DO UPDATE SET secret=$2, enabled_at=$3, verified=TRUE`,
      [String(userId), secret, new Date().toISOString()]
    );

    return { success: true };
  } catch (error) {
    console.error('Error verifying 2FA secret:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Verify a TOTP code against stored secret
 */
export const verify2FAToken = async (userId, token) => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM two_fa_secrets WHERE user_id = $1`, [String(userId)]);
    const userSecret = result.rows[0];

    if (!userSecret) {
      return { valid: false, error: 'No 2FA secret found' };
    }

    const isValid = await verify({
      strategy: 'totp',
      token,
      secret: userSecret.secret,
      digits: 6,
      period: 30,
      algorithm: 'sha1',
      epochTolerance: 1
    });
    return { valid: isValid };
  } catch (error) {
    console.error('Error verifying 2FA token:', error);
    return { valid: false, error: error.message };
  }
};

/**
 * Check if user has 2FA enabled
 */
export const is2FAEnabled = async userId => {
  try {
    await ensureTable();
    const result = await query(`SELECT verified FROM two_fa_secrets WHERE user_id = $1`, [String(userId)]);
    return !!result.rows[0]?.verified;
  } catch (error) {
    console.error('Error checking 2FA status:', error);
    return false;
  }
};

/**
 * Disable 2FA for user
 */
export const disable2FA = async userId => {
  try {
    await ensureTable();
    await query(`DELETE FROM two_fa_secrets WHERE user_id = $1`, [String(userId)]);
    return { success: true };
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get 2FA status for a user
 */
export const get2FAStatus = async userId => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM two_fa_secrets WHERE user_id = $1`, [String(userId)]);
    const userSecret = result.rows[0];
    return {
      enabled: !!userSecret?.verified,
      enabledAt: userSecret?.enabled_at || null
    };
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    return { enabled: false };
  }
};
