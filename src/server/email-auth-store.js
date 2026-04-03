import { query, queryOne } from '@/server/db';

const CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;

const generateCode = () => Math.random().toString().slice(2, 8).padStart(6, '0');

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS email_auth_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0
    )
  `);
};

/**
 * Generate and store a code for email verification
 */
export const generateEmailAuthCode = async email => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Invalid email address');
  }

  await ensureTable();
  // Clean up expired codes
  await query(`DELETE FROM email_auth_codes WHERE created_at < $1`, [Date.now() - CODE_EXPIRY_MS]);

  const code = generateCode();
  await query(
    `INSERT INTO email_auth_codes (email, code, attempts, created_at) VALUES ($1,$2,0,$3)
     ON CONFLICT (email) DO UPDATE SET code=$2, attempts=0, created_at=$3`,
    [normalizedEmail, code, Date.now()]
  );

  
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

  await ensureTable();
  await query(`DELETE FROM email_auth_codes WHERE created_at < $1`, [Date.now() - CODE_EXPIRY_MS]);
  const authRecord = await queryOne(`SELECT * FROM email_auth_codes WHERE email = $1`, [normalizedEmail]);

  if (!authRecord) {
    throw new Error('No verification code found. Request a new code.');
  }

  if (Date.now() - authRecord.created_at > CODE_EXPIRY_MS) {
    await query(`DELETE FROM email_auth_codes WHERE email = $1`, [normalizedEmail]);
    throw new Error('Verification code expired. Request a new code.');
  }

  if (authRecord.attempts >= MAX_ATTEMPTS) {
    await query(`DELETE FROM email_auth_codes WHERE email = $1`, [normalizedEmail]);
    throw new Error('Too many failed attempts. Request a new code.');
  }

  if (authRecord.code !== normalizedCode) {
    await query(`UPDATE email_auth_codes SET attempts = attempts + 1 WHERE email = $1`, [normalizedEmail]);
    throw new Error('Invalid code. Please try again.');
  }

  // Code is valid, clean it up
  await query(`DELETE FROM email_auth_codes WHERE email = $1`, [normalizedEmail]);

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
