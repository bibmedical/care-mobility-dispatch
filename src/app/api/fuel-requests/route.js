import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options as authOptions } from '@/app/api/auth/[...nextauth]/options';
import { readFuelRequests } from '@/server/genius-store';
import { readNemtAdminState } from '@/server/nemt-admin-store';

const normalizeLookup = value => String(value || '').trim().toLowerCase();

const resolveDriverName = driver => {
  const first = String(driver?.firstName || '').trim();
  const last = String(driver?.lastName || '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return String(driver?.displayName || driver?.name || driver?.username || '').trim() || 'Unknown driver';
};

const buildDriverMetaByLookup = adminState => {
  const drivers = Array.isArray(adminState?.drivers) ? adminState.drivers : [];
  const vehicles = Array.isArray(adminState?.vehicles) ? adminState.vehicles : [];

  const vehiclesById = new Map(vehicles.map(vehicle => [String(vehicle?.id || '').trim(), vehicle]));
  const byLookup = new Map();

  drivers.forEach(driver => {
    const vehicle = vehiclesById.get(String(driver?.vehicleId || '').trim()) || null;
    const driverMeta = {
      driverId: String(driver?.id || '').trim(),
      driverName: resolveDriverName(driver),
      vehicleId: String(vehicle?.id || driver?.vehicleId || '').trim() || null,
      vehicleLabel: String(vehicle?.label || driver?.vehicleLabel || '').trim() || null,
      vehicleType: String(vehicle?.type || '').trim() || null
    };

    [
      driver?.id,
      driver?.authUserId,
      driver?.code,
      driver?.portalUsername,
      driver?.username,
      driver?.email,
      driver?.portalEmail,
      driver?.displayName,
      `${driver?.firstName || ''} ${driver?.lastName || ''}`
    ].forEach(value => {
      const key = normalizeLookup(value);
      if (key) byLookup.set(key, driverMeta);
    });
  });

  return byLookup;
};

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 });
    }

    const status = String(req.nextUrl.searchParams.get('status') || '').trim();
    const [rows, adminState] = await Promise.all([
      readFuelRequests({ status, limit: 500 }),
      readNemtAdminState()
    ]);

    const byLookup = buildDriverMetaByLookup(adminState);
    const enrichedRows = (Array.isArray(rows) ? rows : []).map(row => {
      const meta = byLookup.get(normalizeLookup(row?.driverId))
        || byLookup.get(normalizeLookup(row?.driverName))
        || null;
      return {
        ...row,
        driverName: meta?.driverName || row?.driverName || row?.driverId || 'Unknown driver',
        vehicleId: meta?.vehicleId || null,
        vehicleLabel: meta?.vehicleLabel || null,
        vehicleType: meta?.vehicleType || null
      };
    });

    return NextResponse.json({ ok: true, rows: enrichedRows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unable to load fuel requests.' }, { status: 500 });
  }
}
