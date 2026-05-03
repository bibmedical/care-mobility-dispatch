import { NextResponse } from 'next/server';
import { readNemtAdminState } from '@/server/nemt-admin-store';

const internalError = error => NextResponse.json({ error: 'Internal server error', details: String(error?.message || error) }, { status: 500 });

export async function GET() {
  try {
    const state = await readNemtAdminState();
    const drivers = Array.isArray(state?.drivers) ? state.drivers : [];
    const locations = drivers
      .filter(d => d?.profileStatus?.toLowerCase() === 'active')
      .map(d => ({
        id: String(d.id || ''),
        displayName: String(d.displayName || `${d.firstName || ''} ${d.lastName || ''}`).trim(),
        position: Array.isArray(d.position) && d.position.length >= 2 ? [Number(d.position[0]), Number(d.position[1])] : null,
        live: String(d.live || 'Offline'),
        checkpoint: String(d.checkpoint || ''),
        trackingLastSeen: String(d.trackingLastSeen || ''),
        vehicleId: String(d.vehicleId || ''),
      }));
    return NextResponse.json({ ok: true, drivers: locations });
  } catch (error) {
    return internalError(error);
  }
}
