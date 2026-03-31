import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';
import { generateSecret, generateURI, verify } from 'otplib';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('2fa-secrets.json');

const ensureStorageFile = async () => {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    try {
      await readFile(STORAGE_FILE, 'utf8');
    } catch {
      await writeFile(STORAGE_FILE, JSON.stringify({ secrets: {} }, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error ensuring 2FA secrets storage:', error);
  }
};

const read2FAState = async () => {
  try {
    await ensureStorageFile();
    const content = await readFile(STORAGE_FILE, 'utf8');
    return JSON.parse(content) || { secrets: {} };
  } catch (error) {
    console.error('Error reading 2FA secrets:', error);
    return { secrets: {} };
  }
};

const write2FAState = async state => {
  try {
    await ensureStorageFile();
    await writeFile(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing 2FA secrets:', error);
  }
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

    // Save secret for user
    const state = await read2FAState();
    state.secrets[userId] = {
      secret,
      enabledAt: new Date().toISOString(),
      verified: true
    };
    await write2FAState(state);

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
    const state = await read2FAState();
    const userSecret = state.secrets[userId];

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
    const state = await read2FAState();
    return !!state.secrets[userId]?.verified;
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
    const state = await read2FAState();
    delete state.secrets[userId];
    await write2FAState(state);
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
    const state = await read2FAState();
    const userSecret = state.secrets[userId];
    return {
      enabled: !!userSecret?.verified,
      enabledAt: userSecret?.enabledAt || null
    };
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    return { enabled: false };
  }
};
