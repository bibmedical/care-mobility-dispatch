import { buildMobileCorsPreflightResponse, jsonWithMobileCors } from '@/server/mobile-api-cors';
import { upsertSystemMessage } from '@/server/system-messages-store';

const normalizeField = value => String(value || '').trim();

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const fullName = normalizeField(payload?.fullName);
  const phone = normalizeField(payload?.phone);
  const email = normalizeField(payload?.email).toLowerCase();
  const city = normalizeField(payload?.city);
  const experience = normalizeField(payload?.experience);

  if (!fullName || !phone || !email || !city || !experience) {
    return jsonWithMobileCors(request, { ok: false, error: 'fullName, phone, email, city, and experience are required.' }, { status: 400 });
  }

  const createdAt = new Date().toISOString();
  const applicationId = `driver-application-${Date.now()}`;

  await upsertSystemMessage({
    id: applicationId,
    type: 'driver-application',
    priority: 'high',
    audience: 'Dispatch Leadership',
    subject: `New driver application from ${fullName}`,
    body: `${fullName} applied from the APK login screen. Phone: ${phone}. Email: ${email}. City: ${city}. Experience: ${experience}`,
    status: 'active',
    createdAt,
    source: 'mobile-driver-application',
    deliveryMethod: 'system',
    applicantName: fullName,
    applicantPhone: phone,
    applicantEmail: email,
    applicantCity: city,
    applicantExperience: experience
  });

  return jsonWithMobileCors(request, {
    ok: true,
    applicationId
  });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}