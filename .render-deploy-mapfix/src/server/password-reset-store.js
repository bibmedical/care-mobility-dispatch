import { query, queryOne } from '@/server/db';
import { sendEmail } from '@/server/email-service';

const CODE_EXPIRY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const generateCode = () => Math.random().toString().slice(2, 8).padStart(6, '0');

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE password_reset_codes ADD COLUMN IF NOT EXISTS expires_at BIGINT NOT NULL DEFAULT 0`);
};

const cleanupExpiredCodes = async () => {
  await query(`DELETE FROM password_reset_codes WHERE expires_at < $1`, [Date.now()]);
};

export const generatePasswordResetCode = async email => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Invalid email address');
  }

  await ensureTable();
  await cleanupExpiredCodes();

  const code = generateCode();
  const expiresAt = Date.now() + CODE_EXPIRY_MS;
  await query(
    `INSERT INTO password_reset_codes (email, code, attempts, expires_at) VALUES ($1,$2,0,$3)
     ON CONFLICT (email) DO UPDATE SET code = $2, attempts = 0, expires_at = $3`,
    [normalizedEmail, code, expiresAt]
  );

  return { email: normalizedEmail, code, expiresIn: CODE_EXPIRY_MS };
};

export const verifyPasswordResetCode = async (email, submittedCode) => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedCode = String(submittedCode ?? '').trim();

  if (!normalizedEmail || !normalizedCode) {
    throw new Error('Email and code are required');
  }

  await ensureTable();
  await cleanupExpiredCodes();

  const resetRecord = await queryOne(`SELECT * FROM password_reset_codes WHERE email = $1`, [normalizedEmail]);

  if (!resetRecord) {
    throw new Error('No password reset code found. Request a new code.');
  }

  if (Number(resetRecord.expires_at || 0) < Date.now()) {
    await query(`DELETE FROM password_reset_codes WHERE email = $1`, [normalizedEmail]);
    throw new Error('Password reset code expired. Request a new code.');
  }

  if (resetRecord.attempts >= MAX_ATTEMPTS) {
    await query(`DELETE FROM password_reset_codes WHERE email = $1`, [normalizedEmail]);
    throw new Error('Too many failed attempts. Request a new code.');
  }

  if (String(resetRecord.code) !== normalizedCode) {
    await query(`UPDATE password_reset_codes SET attempts = attempts + 1 WHERE email = $1`, [normalizedEmail]);
    throw new Error('Invalid code. Please try again.');
  }

  await query(`DELETE FROM password_reset_codes WHERE email = $1`, [normalizedEmail]);
  return { success: true, email: normalizedEmail };
};

export const sendPasswordResetCode = async email => {
  const { code, expiresIn, email: normalizedEmail } = await generatePasswordResetCode(email);
  const minutes = Math.floor(expiresIn / 60000);
  const subject = 'Florida Mobility Group password reset code';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 12px; color: #0f172a;">Reset your password</h2>
      <p>Use this code to create a new password for your Florida Mobility Group account:</p>
      <div style="display: inline-block; margin: 16px 0; padding: 14px 20px; font-size: 28px; font-weight: 700; letter-spacing: 6px; background: #f3f4f6; border-radius: 10px; color: #111827;">
        ${code}
      </div>
      <p>This code expires in ${minutes} minutes.</p>
      <p style="color: #6b7280; font-size: 14px;">If you did not request a password reset, you can ignore this email.</p>
    </div>
  `;
  const text = `Your Florida Mobility Group password reset code is ${code}. It expires in ${minutes} minutes.`;
  const emailResult = await sendEmail({
    to: normalizedEmail,
    subject,
    html,
    text
  });

  if (!emailResult.success) {
    await query(`DELETE FROM password_reset_codes WHERE email = $1`, [normalizedEmail]);

    if (emailResult.reason === 'SMTP_NOT_CONFIGURED') {
      throw new Error('Email service is not configured. Add SMTP settings in Render to send password reset emails.');
    }

    throw new Error(`Unable to send password reset email: ${emailResult.reason || 'Unknown email error'}`);
  }

  return {
    success: true,
    email: normalizedEmail,
    expiresIn
  };
};