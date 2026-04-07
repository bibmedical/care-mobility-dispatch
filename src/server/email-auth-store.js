import { query, queryOne } from '@/server/db';
import { sendEmail } from '@/server/email-service';

const CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;

const generateCode = () => Math.random().toString().slice(2, 8).padStart(6, '0');

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS email_auth_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE email_auth_codes ADD COLUMN IF NOT EXISTS expires_at BIGINT NOT NULL DEFAULT 0`);
  tableReady = true;
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
  const expiresAt = Date.now() + CODE_EXPIRY_MS;
  await query(`DELETE FROM email_auth_codes WHERE expires_at < $1`, [Date.now()]);

  const code = generateCode();
  await query(
    `INSERT INTO email_auth_codes (email, code, attempts, expires_at) VALUES ($1,$2,0,$3)
     ON CONFLICT (email) DO UPDATE SET code=$2, attempts=0, expires_at=$3`,
    [normalizedEmail, code, expiresAt]
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
  await query(`DELETE FROM email_auth_codes WHERE expires_at < $1`, [Date.now()]);
  const authRecord = await queryOne(`SELECT * FROM email_auth_codes WHERE email = $1`, [normalizedEmail]);

  if (!authRecord) {
    throw new Error('No verification code found. Request a new code.');
  }

  if (Number(authRecord.expires_at || 0) < Date.now()) {
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

  const subject = 'Florida Mobility Group login verification code';
  const minutes = Math.floor(expiresIn / 60000);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 12px; color: #0f172a;">Your login code</h2>
      <p>Use this verification code to sign in to Florida Mobility Group:</p>
      <div style="display: inline-block; margin: 16px 0; padding: 14px 20px; font-size: 28px; font-weight: 700; letter-spacing: 6px; background: #f3f4f6; border-radius: 10px; color: #111827;">
        ${code}
      </div>
      <p>This code expires in ${minutes} minutes.</p>
      <p style="color: #6b7280; font-size: 14px;">If you did not request this code, you can ignore this email.</p>
    </div>
  `;
  const text = `Your Florida Mobility Group login code is ${code}. It expires in ${minutes} minutes.`;

  const emailResult = await sendEmail({
    to: email,
    subject,
    html,
    text
  });

  if (!emailResult.success) {
    await query(`DELETE FROM email_auth_codes WHERE email = $1`, [String(email ?? '').trim().toLowerCase()]);

    if (emailResult.reason === 'SMTP_NOT_CONFIGURED') {
      throw new Error('Email service is not configured. Add SMTP settings in Render to send verification codes.');
    }

    throw new Error(`Unable to send verification code email: ${emailResult.reason || 'Unknown email error'}`);
  }

  return {
    success: true,
    email,
    expiresIn,
    developerCode: code
  };
};
