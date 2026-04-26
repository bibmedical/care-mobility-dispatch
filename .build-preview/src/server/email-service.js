import nodemailer from 'nodemailer';
import { readEmailTemplates } from '@/server/email-templates-store';

const createTransporter = () => {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();

  if (!transporter) {
    console.warn('[email-service] SMTP not configured — email NOT sent to:', to);
    console.log(`[email-service] Subject: ${subject}`);
    return { success: false, reason: 'SMTP_NOT_CONFIGURED' };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log(`[email-service] Sent to ${to} — messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[email-service] Failed to send email to', to, ':', error.message);
    return { success: false, reason: error.message };
  }
};

export const buildLicenseExpiryEmail = async (driverName, expirationDate, daysUntilExpiry) => {
  const templates = await readEmailTemplates();
  const tpl = templates.licenseExpiry;

  const expired = daysUntilExpiry <= 0;
  const urgencyColor = expired ? '#c0392b' : daysUntilExpiry <= 7 ? '#e67e22' : '#2980b9';
  const urgencyText = expired
    ? 'Your license has expired. You may not operate until it is renewed.'
    : daysUntilExpiry <= 7
    ? 'URGENT: Less than 7 days remaining. Renew immediately.'
    : 'Please renew as soon as possible to avoid service interruption.';
  const statusLine = expired
    ? `Your driver license <strong>expired on ${expirationDate}</strong>.`
    : `Your driver license <strong>expires on ${expirationDate}</strong> (${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} remaining).`;
  const statusLinePlain = expired
    ? `Your driver license expired on ${expirationDate}.`
    : `Your driver license expires on ${expirationDate} (${daysUntilExpiry} days remaining).`;

  const replaceVars = str =>
    str
      .replace(/\{\{driverName\}\}/g, driverName)
      .replace(/\{\{expirationDate\}\}/g, expirationDate)
      .replace(/\{\{daysUntilExpiry\}\}/g, String(daysUntilExpiry))
      .replace(/\{\{statusLine\}\}/g, statusLine)
      .replace(/\{\{urgencyColor\}\}/g, urgencyColor)
      .replace(/\{\{urgencyText\}\}/g, urgencyText);

  const replaceVarsPlain = str =>
    str
      .replace(/\{\{driverName\}\}/g, driverName)
      .replace(/\{\{expirationDate\}\}/g, expirationDate)
      .replace(/\{\{daysUntilExpiry\}\}/g, String(daysUntilExpiry))
      .replace(/\{\{statusLine\}\}/g, statusLinePlain)
      .replace(/\{\{urgencyColor\}\}/g, urgencyColor)
      .replace(/\{\{urgencyText\}\}/g, urgencyText);

  const subjectTpl = expired ? (tpl.subjectExpired || tpl.subject) : tpl.subject;

  return {
    subject: replaceVars(subjectTpl),
    html: replaceVars(tpl.htmlBody),
    text: replaceVarsPlain(tpl.textBody)
  };
};
