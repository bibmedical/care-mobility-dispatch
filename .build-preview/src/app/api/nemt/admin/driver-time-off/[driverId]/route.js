import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { getFullName } from '@/helpers/nemt-admin-model';
import { isAdminRole } from '@/helpers/system-users';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { readSystemMessages, resolveSystemMessageById, upsertSystemMessage } from '@/server/system-messages-store';

const buildUnauthorizedResponse = () => NextResponse.json({
  error: 'Authentication required'
}, {
  status: 401
});

const buildForbiddenResponse = () => NextResponse.json({
  error: 'Only administrators can modify time off requests'
}, {
  status: 403
});

const internalError = error => NextResponse.json({ error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

const getActiveAppointment = driver => {
  const appointment = driver?.timeOffAppointment;
  if (!appointment || typeof appointment !== 'object') return null;
  if (String(appointment.status || 'active').trim().toLowerCase() !== 'active') return null;
  if (!String(appointment.appointmentDate || '').trim()) return null;
  return appointment;
};

const buildResolutionMessage = ({ action, driver, appointment, resolvedByUser }) => {
  const driverId = String(driver?.id || '').trim();
  const driverName = getFullName(driver) || String(driver?.displayName || '').trim() || 'Driver';
  const appointmentType = String(appointment?.appointmentType || 'Appointment').trim();
  const appointmentDate = String(appointment?.appointmentDate || '').trim();
  const actionLabel = action === 'deny' ? 'denied' : 'cancelled';
  const actionVerb = action === 'deny' ? 'denied' : 'removed';

  return {
    id: `driver-timeoff-${actionLabel}-${driverId}-${Date.now()}`,
    type: action === 'deny' ? 'driver-time-off-denied' : 'driver-time-off-cancelled',
    priority: 'high',
    audience: 'Driver',
    subject: `Dispatch ${actionVerb} your Time Off request`,
    body: `${driverName}, dispatch ${actionVerb} your ${appointmentType} time off request for ${appointmentDate}. Dispatcher: ${resolvedByUser || 'Dispatch'}.`,
    driverId,
    driverName,
    status: 'active',
    createdAt: new Date().toISOString(),
    source: 'dispatch-timeoff-review',
    deliveryMethod: 'system',
    appointmentDate,
    appointmentType,
    resolvedByUser: resolvedByUser || null
  };
};

export async function PATCH(request, context) {
  try {
    const session = await getServerSession(options);
    if (!session?.user?.id) return buildUnauthorizedResponse();
    if (!isAdminRole(session?.user?.role)) return buildForbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim().toLowerCase();
    const driverId = String(context?.params?.driverId || '').trim();

    if (!driverId) {
      return NextResponse.json({ ok: false, error: 'driverId is required.' }, { status: 400 });
    }
    if (action !== 'deny' && action !== 'cancel') {
      return NextResponse.json({ ok: false, error: 'action must be deny or cancel.' }, { status: 400 });
    }

    const adminState = await readNemtAdminState();
    const currentDrivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
    const targetDriver = currentDrivers.find(driver => String(driver?.id || '').trim() === driverId) || null;
    if (!targetDriver) {
      return NextResponse.json({ ok: false, error: 'Driver not found.' }, { status: 404 });
    }

    const activeAppointment = getActiveAppointment(targetDriver);
    if (!activeAppointment) {
      return NextResponse.json({ ok: true, appointment: null, driverId, action, alreadyResolved: true });
    }

    const nextDrivers = currentDrivers.map(driver => String(driver?.id || '').trim() === driverId ? {
      ...driver,
      timeOffAppointment: null
    } : driver);

    const nextState = await writeNemtAdminState({
      ...adminState,
      drivers: nextDrivers
    });

    const activeMessages = await readSystemMessages();
    const matchingMessages = activeMessages.filter(message => {
      return String(message?.status || '').trim().toLowerCase() === 'active'
        && String(message?.type || '').trim() === 'driver-time-off-appointment'
        && String(message?.driverId || '').trim() === driverId
        && String(message?.appointmentDate || '').trim() === String(activeAppointment?.appointmentDate || '').trim();
    });
    await Promise.all(matchingMessages.map(message => resolveSystemMessageById(message.id)));

    await upsertSystemMessage(buildResolutionMessage({
      action,
      driver: targetDriver,
      appointment: activeAppointment,
      resolvedByUser: String(session?.user?.name || session?.user?.id || '').trim()
    }));

    const updatedDriver = (Array.isArray(nextState?.drivers) ? nextState.drivers : []).find(driver => String(driver?.id || '').trim() === driverId) || null;

    return NextResponse.json({
      ok: true,
      driverId,
      action,
      appointment: null,
      driver: updatedDriver,
      resolvedMessageIds: matchingMessages.map(message => message.id)
    });
  } catch (error) {
    return internalError(error);
  }
}