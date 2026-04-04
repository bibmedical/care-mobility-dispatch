import { NextResponse } from 'next/server';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';

const getDocumentUrl = value => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.dataUrl || value.url || value.path || '').trim();
};

const buildDocumentsPayload = driver => {
  const documents = driver?.documents && typeof driver.documents === 'object' ? driver.documents : {};

  return {
    profilePhotoUrl: getDocumentUrl(documents.profilePhoto),
    documents: {
      profilePhoto: documents.profilePhoto ?? null,
      licenseFront: documents.licenseFront ?? null,
      licenseBack: documents.licenseBack ?? null,
      insuranceCertificate: documents.insuranceCertificate ?? null,
      w9Document: documents.w9Document ?? null,
      trainingCertificate: documents.trainingCertificate ?? null
    }
  };
};

const findDriver = (drivers, driverId) => (Array.isArray(drivers) ? drivers : []).find(driver => String(driver?.id || '').trim() === String(driverId || '').trim());

export async function GET(request) {
  const driverId = request.nextUrl.searchParams.get('driverId') || '';
  if (!driverId) {
    return NextResponse.json({ ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return authResult.response;

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...buildDocumentsPayload(driver) });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const driverId = String(payload?.driverId || '').trim();
  const documentKey = String(payload?.documentKey || '').trim();
  const fileDataUrl = String(payload?.fileDataUrl || '').trim();
  const fileName = String(payload?.fileName || '').trim();

  if (!driverId || !documentKey || !fileDataUrl) {
    return NextResponse.json({ ok: false, error: 'driverId, documentKey, and fileDataUrl are required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return authResult.response;

  const allowedKeys = new Set(['profilePhoto', 'licenseFront', 'licenseBack', 'insuranceCertificate', 'w9Document', 'trainingCertificate']);
  if (!allowedKeys.has(documentKey)) {
    return NextResponse.json({ ok: false, error: 'Unsupported document key.' }, { status: 400 });
  }

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const nextDrivers = adminState.drivers.map(item => {
    if (String(item?.id || '').trim() !== driverId) return item;
    const currentDocuments = item?.documents && typeof item.documents === 'object' ? item.documents : {};
    return {
      ...item,
      documents: {
        ...currentDocuments,
        [documentKey]: {
          name: fileName || `${documentKey}.jpg`,
          dataUrl: fileDataUrl,
          updatedAt: new Date().toISOString()
        }
      }
    };
  });

  const nextAdminState = await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  const updatedDriver = findDriver(nextAdminState.drivers, driverId);
  return NextResponse.json({ ok: true, ...buildDocumentsPayload(updatedDriver) });
}