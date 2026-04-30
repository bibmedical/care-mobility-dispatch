import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { createDispatchRestorePoint, readDispatchHistoryArchive, readDispatchHistoryArchiveIndex, readDispatchHistoryDriverIndex, readDispatchRestorePoints, runDispatchHistoryBackfill } from '@/server/dispatch-history-store';
import { readNemtDispatchState, restoreDispatchDayFromRestorePoint } from '@/server/nemt-dispatch-store';
import { getLocalDateKey, getTripTimelineDateKey } from '@/helpers/nemt-dispatch-state';

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

    const todayKey = getLocalDateKey(new Date());
    const selectedDateKey = requestedDateKey || selectedDriver?.days?.[0]?.dateKey || todayKey || availableDates[0]?.dateKey;
    let archive = selectedDateKey ? await readDispatchHistoryArchive(selectedDateKey) : null;

    // If no archive found, build a live snapshot from dispatch state (for today or any date not yet archived)
    if (!archive) {
      try {
        const liveState = await readNemtDispatchState({ includePastDates: true });
        const allTrips = Array.isArray(liveState?.trips) ? liveState.trips : [];
        const allRoutePlans = Array.isArray(liveState?.routePlans) ? liveState.routePlans : [];
        const allThreads = Array.isArray(liveState?.dispatchThreads) ? liveState.dispatchThreads : [];
        const allDailyDrivers = Array.isArray(liveState?.dailyDrivers) ? liveState.dailyDrivers : [];
        const allAuditLog = Array.isArray(liveState?.auditLog) ? liveState.auditLog : [];
        const dateToFilter = selectedDateKey || todayKey;
        const dayTrips = allTrips.filter(trip => {
          const tripDateKey = getTripTimelineDateKey(trip, allRoutePlans, allTrips);
          return tripDateKey === dateToFilter;
        });
        const dayRoutes = allRoutePlans.filter(route => {
          const svcDate = String(route?.serviceDate || route?.service_date || route?.date || '').trim().slice(0, 10);
          return svcDate === dateToFilter;
        });
        const tripDriverIds = new Set(dayTrips.flatMap(trip => [String(trip?.driverId || '').trim(), String(trip?.secondaryDriverId || '').trim()].filter(Boolean)));
        const routeDriverIds = new Set(dayRoutes.flatMap(route => [String(route?.driverId || '').trim(), String(route?.secondaryDriverId || '').trim()].filter(Boolean)));
        const dayDriverIds = new Set([...tripDriverIds, ...routeDriverIds]);
        const dayThreads = allThreads.filter(thread => dayDriverIds.has(String(thread?.driverId || '').trim()));
        const dayAuditLog = allAuditLog.filter(entry => {
          const entryDate = getLocalDateKey(Number(entry?.occurredAt || entry?.timestamp || 0) || new Date(String(entry?.occurredAt || entry?.timestamp || '')));
          return entryDate === dateToFilter;
        });
        if (dayTrips.length > 0 || dayRoutes.length > 0) {
          archive = {
            dateKey: dateToFilter,
            trips: dayTrips,
            routePlans: dayRoutes,
            dispatchThreads: dayThreads,
            dailyDrivers: allDailyDrivers,
            auditLog: dayAuditLog,
            uiPreferences: liveState?.uiPreferences || {},
            archivedAt: null,
            isLive: true,
            summary: {
              tripCount: dayTrips.length,
              routeCount: dayRoutes.length,
              threadCount: dayThreads.length,
              messageCount: dayThreads.reduce((sum, t) => sum + (Array.isArray(t?.messages) ? t.messages.length : 0), 0),
              auditCount: dayAuditLog.length
            }
          };
        }
      } catch (liveError) {
        console.error('[dispatch-history] Live fallback failed:', liveError);
      }
    }

    // Add today as first available date (live) if not already in archived list
    const todayInList = availableDates.some(d => d.dateKey === todayKey);
    const availableDatesWithToday = todayInList ? availableDates : [
      { dateKey: todayKey, label: 'Today (live)', tripCount: archive?.isLive ? archive.trips.length : 0, routeCount: archive?.isLive ? archive.routePlans.length : 0, messageCount: 0, auditCount: 0, isLive: true },
      ...availableDates
    ];

    if (availableDrivers.length === 0 && archive) {
      availableDrivers = buildArchiveDriverFallback(archive);
      selectedDriver = requestedDriverId ? availableDrivers.find(driver => driver.driverId === requestedDriverId) || null : null;
    }

    const restorePoints = selectedDateKey ? await readDispatchRestorePoints(selectedDateKey, 72) : [];

    return NextResponse.json({
      ok: true,
      selectedDateKey,
      selectedDriverId: requestedDriverId,
      availableDates: availableDatesWithToday,
      availableDrivers,
      archive,
      restorePoints
    });
  } catch (error) {
    console.error('[dispatch-history] GET failed:', error);
    return NextResponse.json({
      error: error?.message || 'Unable to load dispatcher history'
    }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(options);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ error: 'Only administrators can backfill dispatch history' }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  const action = String(payload?.action || 'backfill').trim().toLowerCase();

  if (action === 'create-restore-point') {
    const serviceDateKey = normalizeDateKey(payload?.serviceDateKey);
    if (!serviceDateKey) {
      return NextResponse.json({ error: 'serviceDateKey is required' }, { status: 400 });
    }

    const currentState = await readNemtDispatchState({ includePastDates: true });
    const createdPoint = await createDispatchRestorePoint({
      serviceDateKey,
      state: currentState,
      reason: 'manual',
      force: true
    });

    if (!createdPoint) {
      return NextResponse.json({ error: 'No trips/routes found for that day to snapshot' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      action,
      restorePoint: createdPoint,
      restorePoints: await readDispatchRestorePoints(serviceDateKey, 72)
    });
  }

  if (action === 'restore-from-point') {
    const restorePointId = Number(payload?.restorePointId);
    if (!Number.isFinite(restorePointId) || restorePointId <= 0) {
      return NextResponse.json({ error: 'restorePointId is required' }, { status: 400 });
    }

    const result = await restoreDispatchDayFromRestorePoint({
      restorePointId,
      actorName: session?.user?.name || session?.user?.username || session?.user?.email || ''
    });

    return NextResponse.json({
      ok: true,
      action,
      ...result,
      restorePoints: await readDispatchRestorePoints(result.serviceDateKey, 72)
    });
  }

  const result = await runDispatchHistoryBackfill();

  return NextResponse.json({
    ok: true,
    action: 'backfill',
    ...result
  });
}