import { NextResponse } from 'next/server';
import { getTripServiceMinutes } from '@/helpers/nemt-billing';
import { readNemtDispatchState } from '@/server/nemt-dispatch-store';

const ACTIVE_TRIP_STATUSES = new Set(['assigned', 'in progress']);

const internalError = error => NextResponse.json({
  error: 'Internal server error',
  details: String(error?.message || error)
}, {
  status: 500
});

export async function GET() {
  try {
    const state = await readNemtDispatchState();
    const metrics = {};

    for (const trip of Array.isArray(state?.trips) ? state.trips : []) {
      const driverId = String(trip?.driverId || '').trim();
      if (!driverId) continue;

      const currentMetrics = metrics[driverId] || {
        serviceMinutes: 0,
        totalTrips: 0,
        activeTrips: 0
      };

      currentMetrics.serviceMinutes += getTripServiceMinutes(trip);
      currentMetrics.totalTrips += 1;

      if (ACTIVE_TRIP_STATUSES.has(String(trip?.status || '').trim().toLowerCase())) {
        currentMetrics.activeTrips += 1;
      }

      metrics[driverId] = currentMetrics;
    }

    return NextResponse.json({ metrics });
  } catch (error) {
    return internalError(error);
  }
}