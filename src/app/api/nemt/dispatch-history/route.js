import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { readDispatchHistoryArchive, readDispatchHistoryArchiveIndex, readDispatchHistoryDriverIndex, runDispatchHistoryBackfill } from '@/server/dispatch-history-store';

const normalizeDateKey = value => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const normalizeDriverId = value => String(value || '').trim();

const buildArchiveDriverFallback = archive => {
  const optionMap = new Map();

  (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).forEach(thread => {
    const driverId = normalizeDriverId(thread?.driverId);
    if (!driverId) return;
    const previousEntry = optionMap.get(driverId) || {
      driverId,
      label: String(thread?.driverName || driverId).trim() || driverId,
      archivedDayCount: 0,
      tripCount: 0,
      routeCount: 0,
      messageCount: 0,
      days: []
    };
    optionMap.set(driverId, {
      ...previousEntry,
      messageCount: previousEntry.messageCount + (Array.isArray(thread?.messages) ? thread.messages.length : 0)
    });
  });

  (Array.isArray(archive?.trips) ? archive.trips : []).forEach(trip => {
    [trip?.driverId, trip?.secondaryDriverId].forEach(driverIdValue => {
      const driverId = normalizeDriverId(driverIdValue);
      if (!driverId) return;
      const previousEntry = optionMap.get(driverId) || {
        driverId,
        label: String(trip?.driverName || driverId).trim() || driverId,
        archivedDayCount: 0,
        tripCount: 0,
        routeCount: 0,
        messageCount: 0,
        days: []
      };
      optionMap.set(driverId, {
        ...previousEntry,
        label: previousEntry.label || String(trip?.driverName || driverId).trim() || driverId,
        tripCount: previousEntry.tripCount + 1
      });
    });
  });

  (Array.isArray(archive?.routePlans) ? archive.routePlans : []).forEach(routePlan => {
    [routePlan?.driverId, routePlan?.secondaryDriverId].forEach(driverIdValue => {
      const driverId = normalizeDriverId(driverIdValue);
      if (!driverId) return;
      const previousEntry = optionMap.get(driverId) || {
        driverId,
        label: String(routePlan?.driverName || driverId).trim() || driverId,
        archivedDayCount: 0,
        tripCount: 0,
        routeCount: 0,
        messageCount: 0,
        days: []
      };
      optionMap.set(driverId, {
        ...previousEntry,
        label: previousEntry.label || String(routePlan?.driverName || driverId).trim() || driverId,
        routeCount: previousEntry.routeCount + 1
      });
    });
  });

  return Array.from(optionMap.values()).map(entry => ({
    ...entry,
    archivedDayCount: archive?.dateKey ? 1 : 0,
    days: archive?.dateKey ? [{
      dateKey: archive.dateKey,
      label: entry.label,
      tripCount: entry.tripCount,
      routeCount: entry.routeCount,
      messageCount: entry.messageCount,
      archivedAt: archive?.archivedAt || null,
      updatedAt: archive?.updatedAt || null
    }] : []
  })).sort((left, right) => String(left.label || left.driverId).localeCompare(String(right.label || right.driverId)));
};

export async function GET(request) {
  try {
    const session = await getServerSession(options);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({ error: 'Only administrators can access dispatch history' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedDateKey = normalizeDateKey(searchParams.get('date'));
    const requestedDriverId = normalizeDriverId(searchParams.get('driverId'));
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 120, 1), 365);
    const availableDates = await readDispatchHistoryArchiveIndex(limit);

    let availableDrivers = [];
    let selectedDriver = null;

    try {
      availableDrivers = await readDispatchHistoryDriverIndex(limit);
      selectedDriver = requestedDriverId ? availableDrivers.find(driver => driver.driverId === requestedDriverId) || null : null;
    } catch (driverIndexError) {
      console.error('[dispatch-history] Driver index fallback triggered:', driverIndexError);
    }

    const selectedDateKey = requestedDateKey || selectedDriver?.days?.[0]?.dateKey || availableDates[0]?.dateKey || '';
    const archive = selectedDateKey ? await readDispatchHistoryArchive(selectedDateKey) : null;

    if (availableDrivers.length === 0 && archive) {
      availableDrivers = buildArchiveDriverFallback(archive);
      selectedDriver = requestedDriverId ? availableDrivers.find(driver => driver.driverId === requestedDriverId) || null : null;
    }

    return NextResponse.json({
      ok: true,
      selectedDateKey,
      selectedDriverId: requestedDriverId,
      availableDates,
      availableDrivers,
      archive
    });
  } catch (error) {
    console.error('[dispatch-history] GET failed:', error);
    return NextResponse.json({
      error: error?.message || 'Unable to load dispatcher history'
    }, { status: 500 });
  }
}

export async function POST() {
  const session = await getServerSession(options);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Only administrators can backfill dispatch history' }, { status: 403 });
  }

  const result = await runDispatchHistoryBackfill();

  return NextResponse.json({
    ok: true,
    ...result
  });
}