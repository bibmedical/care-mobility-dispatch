import { getFullName } from '@/helpers/nemt-admin-model';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { upsertSystemMessage } from '@/server/system-messages-store';
import { buildMobileCorsPreflightResponse, jsonWithMobileCors, withMobileCors } from '@/server/mobile-api-cors';

const findDriver = (drivers, driverId) => (Array.isArray(drivers) ? drivers : []).find(driver => {
  return String(driver?.id || '').trim() === String(driverId || '').trim();
});

const normalizeDateKey = value => {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const mm = String(slash[1]).padStart(2, '0');
    const dd = String(slash[2]).padStart(2, '0');
    const yyyy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
};

const isDateAtLeastTwoDaysAhead = value => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return false;
  const [year, month, day] = normalized.split('-').map(Number);
  const requestedDate = new Date(year, month - 1, day);
  requestedDate.setHours(0, 0, 0, 0);
  const minimumDate = new Date();
  minimumDate.setHours(0, 0, 0, 0);
  minimumDate.setDate(minimumDate.getDate() + 2);
  return requestedDate.getTime() >= minimumDate.getTime();
};

const getActiveAppointment = driver => {
  const appointment = driver?.timeOffAppointment;
  if (!appointment || typeof appointment !== 'object') return null;
  if (String(appointment.status || 'active').trim().toLowerCase() !== 'active') return null;
  if (!String(appointment.appointmentDate || '').trim()) return null;
  return appointment;
};

const mapAppointmentMessage = ({ appointment, driver }) => {
  const driverId = String(driver?.id || '').trim();
  const driverName = getFullName(driver) || String(driver?.displayName || '').trim() || 'Driver';
  const appointmentType = String(appointment?.appointmentType || 'Appointment').trim();
  const appointmentDate = String(appointment?.appointmentDate || '').trim();
  const note = String(appointment?.note || '').trim();

  return {
    id: `driver-timeoff-${driverId}-${appointmentDate}`,
    type: 'driver-time-off-appointment',
    priority: 'high',
    audience: 'Dispatch Leadership',
    subject: `${driverName} has a ${appointmentType} appointment`,
    body: `${driverName} submitted Time Off for ${appointmentDate}. Note: ${note || 'No additional note.'} Do not assign this driver to route on that date.`,
    driverId,
    driverName,
    status: 'active',
    createdAt: new Date().toISOString(),
    source: 'mobile-driver-timeoff',
    deliveryMethod: 'system',
    mediaUrl: String(appointment?.excuseImageUrl || '').trim() || null,
    mediaType: String(appointment?.excuseImageUrl || '').startsWith('data:image/') ? 'image/jpeg' : null,
    appointmentDate,
    appointmentType,
    appointmentNote: note
  };
};

const mapReturnMessage = ({ appointment, driver }) => {
  const driverId = String(driver?.id || '').trim();
  const driverName = getFullName(driver) || String(driver?.displayName || '').trim() || 'Driver';
  const appointmentType = String(appointment?.appointmentType || 'Appointment').trim();
  const appointmentDate = String(appointment?.appointmentDate || '').trim();

  return {
    id: `driver-timeoff-return-${driverId}-${Date.now()}`,
    type: 'driver-time-off-return',
    priority: 'high',
    audience: 'Dispatch Leadership',
    subject: `${driverName} is back from time off`,
    body: `${driverName} marked the ${appointmentType} day off for ${appointmentDate} as finished and is available again for route assignment.`,
    driverId,
    driverName,
    status: 'active',
    createdAt: new Date().toISOString(),
    source: 'mobile-driver-timeoff',
    deliveryMethod: 'system',
    appointmentDate,
    appointmentType
  };
};

export async function GET(request) {
  const driverId = String(request.nextUrl.searchParams.get('driverId') || '').trim();
  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  return jsonWithMobileCors(request, {
    ok: true,
    appointment: getActiveAppointment(driver)
  });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const driverId = String(payload?.driverId || '').trim();
  const appointmentType = String(payload?.appointmentType || '').trim();
  const appointmentDate = normalizeDateKey(payload?.appointmentDate);
  const note = String(payload?.note || '').trim();
  const excuseImageUrl = String(payload?.excuseImageUrl || '').trim();

  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }
  if (!appointmentType) {
    return jsonWithMobileCors(request, { ok: false, error: 'appointmentType is required.' }, { status: 400 });
  }
  if (!appointmentDate) {
    return jsonWithMobileCors(request, { ok: false, error: 'appointmentDate must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (!isDateAtLeastTwoDaysAhead(appointmentDate)) {
    return jsonWithMobileCors(request, { ok: false, error: 'Time off must be requested at least 2 days ahead.' }, { status: 400 });
  }
  if (!note) {
    return jsonWithMobileCors(request, { ok: false, error: 'note is required.' }, { status: 400 });
  }
  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const appointment = {
    id: `timeoff-${Date.now()}`,
    appointmentType,
    appointmentDate,
    note,
    excuseImageUrl,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  const nextDrivers = adminState.drivers.map(item => {
    if (String(item?.id || '').trim() !== driverId) return item;
    return {
      ...item,
      timeOffAppointment: appointment
    };
  });

  const nextAdminState = await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  const updatedDriver = findDriver(nextAdminState.drivers, driverId);
  await upsertSystemMessage(mapAppointmentMessage({
    appointment,
    driver: updatedDriver || driver
  }));

  return jsonWithMobileCors(request, {
    ok: true,
    appointment
  });
}

export async function DELETE(request) {
  const driverId = String(request.nextUrl.searchParams.get('driverId') || '').trim();
  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) return withMobileCors(authResult.response, request);

  const adminState = await readNemtAdminState();
  const driver = findDriver(adminState.drivers, driverId);
  if (!driver) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver not found.' }, { status: 404 });
  }

  const activeAppointment = getActiveAppointment(driver);
  if (!activeAppointment) {
    return jsonWithMobileCors(request, { ok: true, appointment: null });
  }

  const completedAppointment = {
    ...activeAppointment,
    status: 'completed',
    completedAt: new Date().toISOString()
  };

  const nextDrivers = adminState.drivers.map(item => {
    if (String(item?.id || '').trim() !== driverId) return item;
    return {
      ...item,
      timeOffAppointment: completedAppointment
    };
  });

  const nextAdminState = await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });

  const updatedDriver = findDriver(nextAdminState.drivers, driverId);
  await upsertSystemMessage(mapReturnMessage({
    appointment: completedAppointment,
    driver: updatedDriver || driver
  }));

  return jsonWithMobileCors(request, {
    ok: true,
    appointment: null,
    completedAppointment
  });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}
