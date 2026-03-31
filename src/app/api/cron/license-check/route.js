import { NextResponse } from 'next/server';
import { readNemtAdminState } from '@/server/nemt-admin-store';
import {
  getActiveMessageForDriver,
  readSystemMessages,
  upsertSystemMessage,
  writeSystemMessages
} from '@/server/system-messages-store';
import { buildLicenseExpiryEmail, sendEmail } from '@/server/email-service';

// Days ahead to start warning before expiry
const WARNING_DAYS = parseInt(process.env.LICENSE_WARNING_DAYS || '30', 10);
// Resend email interval (3 days in ms)
const EMAIL_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

const getDaysUntilExpiry = isoDate => {
  if (!isoDate) return null;
  const expiry = new Date(isoDate);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  const diffMs = expiry.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const isEmailDue = lastSentAt => {
  if (!lastSentAt) return true;
  return Date.now() - new Date(lastSentAt).getTime() >= EMAIL_INTERVAL_MS;
};

export async function GET(request) {
  // Allow Render cron (via CRON_SECRET header) or logged-in admin sessions
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = request.headers.get('x-cron-secret');
  const isCronCall = cronSecret && headerSecret === cronSecret;

  if (!isCronCall) {
    // Require admin session for manual trigger
    const { getServerSession } = await import('next-auth');
    const { options } = await import('@/app/api/auth/[...nextauth]/options');
    const session = await getServerSession(options);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
  }

  const state = await readNemtAdminState();
  const drivers = state.drivers || [];

  const results = { checked: 0, created: 0, emailed: 0, resolved: 0, errors: [] };

  // Load all messages once to bulk-update
  const allMessages = await readSystemMessages();

  for (const driver of drivers) {
    const { id: driverId, licenseExpirationDate, email } = driver;
    const driverName = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || driver.displayName || driverId;

    results.checked++;

    const daysUntilExpiry = getDaysUntilExpiry(licenseExpirationDate);

    // No expiry date at all → skip silently
    if (daysUntilExpiry === null) continue;

    const isExpiring = daysUntilExpiry <= WARNING_DAYS;
    const msgType = 'license_expiry';

    // Find existing active message for this driver in the loaded array
    const existingIdx = allMessages.findIndex(
      m => m.driverId === driverId && m.type === msgType && m.status === 'active'
    );
    const existingMsg = existingIdx >= 0 ? allMessages[existingIdx] : null;

    if (!isExpiring) {
      // License is fine — resolve any open message
      if (existingMsg) {
        allMessages[existingIdx] = {
          ...existingMsg,
          status: 'resolved',
          resolvedAt: new Date().toISOString()
        };
        results.resolved++;
      }
      continue;
    }

    // License is expiring or expired
    const now = new Date().toISOString();

    if (!existingMsg) {
      // Create new system message
      const newMsg = {
        id: `sysmsg-lic-${driverId}-${Date.now()}`,
        type: msgType,
        priority: daysUntilExpiry <= 7 ? 'high' : 'normal',
        audience: 'Driver',
        subject: daysUntilExpiry <= 0
          ? `License EXPIRED: ${driverName}`
          : `License Expiring in ${daysUntilExpiry} days: ${driverName}`,
        body: daysUntilExpiry <= 0
          ? `Driver ${driverName}'s license expired on ${licenseExpirationDate}.`
          : `Driver ${driverName}'s license expires on ${licenseExpirationDate} (${daysUntilExpiry} days remaining).`,
        driverId,
        driverName,
        driverEmail: email || null,
        expirationDate: licenseExpirationDate,
        daysUntilExpiry,
        status: 'active',
        createdAt: now,
        lastEmailSentAt: null,
        emailSentCount: 0,
        resolvedAt: null
      };

      allMessages.unshift(newMsg);
      results.created++;

      // Send first email immediately
      if (email) {
        const emailContent = await buildLicenseExpiryEmail(driverName, licenseExpirationDate, daysUntilExpiry);
        const emailResult = await sendEmail({ to: email, ...emailContent });
        if (emailResult.success) {
          allMessages[0].lastEmailSentAt = now;
          allMessages[0].emailSentCount = 1;
          results.emailed++;
        } else {
          results.errors.push(`Email to ${driverName} (${email}): ${emailResult.reason}`);
        }
      }
    } else {
      // Update days count on existing message
      allMessages[existingIdx] = {
        ...existingMsg,
        daysUntilExpiry,
        priority: daysUntilExpiry <= 7 ? 'high' : existingMsg.priority,
        subject: daysUntilExpiry <= 0
          ? `License EXPIRED: ${driverName}`
          : `License Expiring in ${daysUntilExpiry} days: ${driverName}`
      };

      // Send follow-up email if 3 days have passed
      if (email && isEmailDue(existingMsg.lastEmailSentAt)) {
        const emailContent = await buildLicenseExpiryEmail(driverName, licenseExpirationDate, daysUntilExpiry);
        const emailResult = await sendEmail({ to: email, ...emailContent });
        if (emailResult.success) {
          allMessages[existingIdx].lastEmailSentAt = now;
          allMessages[existingIdx].emailSentCount = (existingMsg.emailSentCount || 0) + 1;
          results.emailed++;
        } else {
          results.errors.push(`Follow-up email to ${driverName} (${email}): ${emailResult.reason}`);
        }
      }
    }
  }

  // Persist all changes in one write
  await writeSystemMessages(allMessages);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    warningDays: WARNING_DAYS,
    ...results
  });
}
