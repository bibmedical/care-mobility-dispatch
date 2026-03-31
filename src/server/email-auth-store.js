import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('email-auth-codes.json');
const CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;

const ensureStorageFile = async () => {
  try {
    await mkdir(STORAGE_DIR, { recursive: true });
    try {
      await readFile(STORAGE_FILE, 'utf8');
    } catch {
      await writeFile(STORAGE_FILE, JSON.stringify({ codes: {} }, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error ensuring email auth storage:', error);
  }
};

const readAuthCodesState = async () => {
  try {
    await ensureStorageFile();
    const content = await readFile(STORAGE_FILE, 'utf8');
    return JSON.parse(content) || { codes: {} };
  } catch (error) {
    console.error('Error reading email auth codes:', error);
    return { codes: {} };
  }
};

const writeAuthCodesState = async state => {
  try {
    await ensureStorageFile();
    await writeFile(STORAGE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing email auth codes:', error);
  }
};

const generateCode = () => Math.random().toString().slice(2, 8).padStart(6, '0');

const isCodeExpired = createdAt => Date.now() - createdAt > CODE_EXPIRY_MS;

const cleanupExpiredCodes = state => {
  const now = Date.now();
  const codes = { ...state.codes };
  
  for (const email in codes) {
    if (isCodeExpired(codes[email].createdAt)) {
      delete codes[email];
    }
  }
  
  return { codes };
};

/**
 * Generate and store a code for email verification
 */
export const generateEmailAuthCode = async email => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Invalid email address');
  }

  let state = await readAuthCodesState();
  state = cleanupExpiredCodes(state);

  const code = generateCode();
  state.codes[normalizedEmail] = {
    code,
    createdAt: Date.now(),
    attempts: 0
  };

  await writeAuthCodesState(state);
  
  return { code, email: normalizedEmail, expiresIn: CODE_EXPIRY_MS };
};

/**
 * Verify the code submitted by user
 */
export const verifyEmailAuthCode = async (email, submittedCode) => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedCode = String(submittedCode ?? '').trim();

  if (!normalizedEmail || !normalizedCode) {
    throw new Error('Email and code are required');
  }

  let state = await readAuthCodesState();
  state = cleanupExpiredCodes(state);

  const authRecord = state.codes[normalizedEmail];

  if (!authRecord) {
    throw new Error('No verification code found. Request a new code.');
  }

  if (isCodeExpired(authRecord.createdAt)) {
    delete state.codes[normalizedEmail];
    await writeAuthCodesState(state);
    throw new Error('Verification code expired. Request a new code.');
  }

  if (authRecord.attempts >= MAX_ATTEMPTS) {
    delete state.codes[normalizedEmail];
    await writeAuthCodesState(state);
    throw new Error('Too many failed attempts. Request a new code.');
  }

  if (authRecord.code !== normalizedCode) {
    authRecord.attempts += 1;
    await writeAuthCodesState(state);
    throw new Error('Invalid code. Please try again.');
  }

  // Code is valid, clean it up
  delete state.codes[normalizedEmail];
  await writeAuthCodesState(state);

  return { success: true, email: normalizedEmail };
};

/**
 * Send code to user email (would integrate with email service)
 * For now, returns code in response (in production, use SendGrid/Twilio Email/etc)
 */
export const sendEmailAuthCode = async email => {
  const { code, expiresIn } = await generateEmailAuthCode(email);
  
  // TODO: Integrate with email service (SendGrid, Twilio SendGrid, Amazon SES, etc)
  // For now, log to console in development
  console.log(`
╔═══════════════════════════════════════════════════════╗
║         EMAIL VERIFICATION CODE (Development)         ║
╠═══════════════════════════════════════════════════════╣
║ Email: ${email.padEnd(48)}║
║ Code:  ${code.padEnd(48)}║
║ Valid for: ${Math.floor(expiresIn / 60000)} minutes${' '.repeat(32)}║
╚═══════════════════════════════════════════════════════╝
  `);

  return {
    success: true,
    email,
    expiresIn,
    // In production, remove this, use actual email service
    developerCode: code
  };
};
