import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { query, queryOne, withTransaction, acquireAdvisoryLock } from '@/server/db';
import { getStorageRoot, getStorageFilePath } from '@/server/storage-paths';

const DISPATCH_ROW_ID = 'singleton';
const ADMIN_ROW_ID = 'singleton';

const parseJsonSafe = raw => JSON.parse(String(raw ?? '').replace(/^\uFEFF/, ''));

const toNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseSnapshotTimestamp = fileName => {
  const match = /^(\d{8})-(\d{4})\.json$/i.exec(String(fileName || '').trim());
  if (!match) return 0;
  return Number(`${match[1]}${match[2]}`);
};

const normalizeTripId = trip => String(trip?.id || trip?.rideId || trip?.brokerTripId || '').trim();

const normalizeDriverKey = driver => {
  const id = String(driver?.id || '').trim();
  if (id) return `id:${id}`;
  const username = String(driver?.username || '').trim().toLowerCase();
  if (username) return `u:${username}`;
  const email = String(driver?.email || '').trim().toLowerCase();
  if (email) return `e:${email}`;
  const name = [String(driver?.firstName || '').trim().toLowerCase(), String(driver?.lastNameOrOrg || '').trim().toLowerCase()].filter(Boolean).join('|');
  return name ? `n:${name}` : '';
};

const normalizeVehicleKey = vehicle => {
  const id = String(vehicle?.id || '').trim();
  if (id) return `id:${id}`;
  const plate = String(vehicle?.plate || '').trim().toLowerCase();
  if (plate) return `p:${plate}`;
  const unit = String(vehicle?.unitNumber || '').trim().toLowerCase();
  if (unit) return `u:${unit}`;
  const vin = String(vehicle?.vin || '').trim().toLowerCase();
  return vin ? `v:${vin}` : '';
};

const mergeByNewest = ({ currentItems, backupItems, keyFn, updatedAtFn, backupTs }) => {
  const byKey = new Map();

  (Array.isArray(currentItems) ? currentItems : []).forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    byKey.set(key, { item, updatedAt: updatedAtFn(item), backupTs: 0 });
  });

  (Array.isArray(backupItems) ? backupItems : []).forEach(item => {
    const key = keyFn(item);
    if (!key) return;

    const nextUpdatedAt = updatedAtFn(item);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { item, updatedAt: nextUpdatedAt, backupTs });
      return;
    }

    if (nextUpdatedAt > existing.updatedAt || (nextUpdatedAt === existing.updatedAt && backupTs >= existing.backupTs)) {
      byKey.set(key, { item, updatedAt: nextUpdatedAt, backupTs });
    }
  });

  return Array.from(byKey.values()).map(entry => entry.item);
};

const mergeRoutePlans = ({ currentPlans, backupPlans, backupTs }) => {
  const byId = new Map();

  const put = (plan, ts) => {
    const id = String(plan?.id || '').trim();
    if (!id) return;

    const tripIds = Array.isArray(plan?.tripIds) ? plan.tripIds.filter(Boolean) : [];
    const existing = byId.get(id);

    if (!existing) {
      byId.set(id, {
        plan: { ...plan, id, tripIds: Array.from(new Set(tripIds)) },
        ts
      });
      return;
    }

    const mergedTripIds = Array.from(new Set([...(Array.isArray(existing.plan?.tripIds) ? existing.plan.tripIds : []), ...tripIds]));

    if (ts >= existing.ts) {
      byId.set(id, {
        plan: { ...existing.plan, ...plan, id, tripIds: mergedTripIds },
        ts
      });
      return;
    }

    byId.set(id, {
      plan: { ...existing.plan, tripIds: mergedTripIds },
      ts: existing.ts
    });
  };

  (Array.isArray(currentPlans) ? currentPlans : []).forEach(plan => put(plan, 0));
  (Array.isArray(backupPlans) ? backupPlans : []).forEach(plan => put(plan, backupTs));

  return Array.from(byId.values()).map(entry => entry.plan);
};

const buildMergePreview = async ({ fromDate = 20260403 }) => {
  const storageRoot = getStorageRoot();
  const dispatchBackupDir = path.join(storageRoot, 'backups', 'nemt-dispatch');

  const dispatchRow = await queryOne(`SELECT data FROM dispatch_state WHERE id = $1`, [DISPATCH_ROW_ID]);
  const adminRow = await queryOne(`SELECT data FROM admin_state WHERE id = $1`, [ADMIN_ROW_ID]);

  const dispatchSql = dispatchRow?.data ?? {};
  const adminSql = adminRow?.data ?? {};

  let mergedTrips = Array.isArray(dispatchSql?.trips) ? dispatchSql.trips : [];
  let mergedRoutePlans = Array.isArray(dispatchSql?.routePlans) ? dispatchSql.routePlans : [];
  let mergedThreads = Array.isArray(dispatchSql?.dispatchThreads) ? dispatchSql.dispatchThreads : [];
  let mergedAuditLog = Array.isArray(dispatchSql?.auditLog) ? dispatchSql.auditLog : [];
  let latestUiPreferences = dispatchSql?.uiPreferences || {};

  let mergedDrivers = Array.isArray(adminSql?.drivers) ? adminSql.drivers : [];
  let mergedVehicles = Array.isArray(adminSql?.vehicles) ? adminSql.vehicles : [];
  let mergedAttendants = Array.isArray(adminSql?.attendants) ? adminSql.attendants : [];
  let mergedGroupings = Array.isArray(adminSql?.groupings) ? adminSql.groupings : [];

  let snapshotsScanned = 0;
  let snapshotsUsed = 0;

  try {
    const fileNames = await readdir(dispatchBackupDir);
    const snapshotFiles = fileNames
      .filter(fileName => /^(\d{8})-(\d{4})\.json$/i.test(fileName))
      .map(fileName => ({ fileName, ts: parseSnapshotTimestamp(fileName) }))
      .filter(item => item.ts > 0 && Number(String(item.ts).slice(0, 8)) >= Number(fromDate))
      .sort((left, right) => left.ts - right.ts);

    snapshotsScanned = snapshotFiles.length;

    for (const snapshot of snapshotFiles) {
      const snapshotPath = path.join(dispatchBackupDir, snapshot.fileName);
      let snapshotDispatch = null;
      try {
        snapshotDispatch = parseJsonSafe(await readFile(snapshotPath, 'utf8'));
      } catch {
        continue;
      }

      snapshotsUsed += 1;

      mergedTrips = mergeByNewest({
        currentItems: mergedTrips,
        backupItems: snapshotDispatch?.trips,
        keyFn: item => normalizeTripId(item),
        updatedAtFn: item => toNumber(item?.updatedAt),
        backupTs: snapshot.ts
      });

      mergedRoutePlans = mergeRoutePlans({
        currentPlans: mergedRoutePlans,
        backupPlans: snapshotDispatch?.routePlans,
        backupTs: snapshot.ts
      });

      mergedThreads = mergeByNewest({
        currentItems: mergedThreads,
        backupItems: snapshotDispatch?.dispatchThreads,
        keyFn: item => String(item?.driverId || '').trim(),
        updatedAtFn: item => {
          const messages = Array.isArray(item?.messages) ? item.messages : [];
          const lastMessage = messages[messages.length - 1];
          const ts = Date.parse(String(lastMessage?.timestamp || ''));
          return Number.isFinite(ts) ? ts : 0;
        },
        backupTs: snapshot.ts
      });

      mergedAuditLog = mergeByNewest({
        currentItems: mergedAuditLog,
        backupItems: snapshotDispatch?.auditLog,
        keyFn: item => String(item?.id || '').trim(),
        updatedAtFn: item => {
          const ts = Date.parse(String(item?.timestamp || ''));
          return Number.isFinite(ts) ? ts : 0;
        },
        backupTs: snapshot.ts
      });

      if (snapshotDispatch?.uiPreferences && snapshot.ts > 0) {
        latestUiPreferences = snapshotDispatch.uiPreferences;
      }

      // Some snapshots may also carry admin arrays. Use them when present.
      mergedDrivers = mergeByNewest({
        currentItems: mergedDrivers,
        backupItems: snapshotDispatch?.drivers,
        keyFn: normalizeDriverKey,
        updatedAtFn: item => toNumber(item?.updatedAt),
        backupTs: snapshot.ts
      });

      mergedVehicles = mergeByNewest({
        currentItems: mergedVehicles,
        backupItems: snapshotDispatch?.vehicles,
        keyFn: normalizeVehicleKey,
        updatedAtFn: item => {
          const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
          return Number.isFinite(ts) ? ts : 0;
        },
        backupTs: snapshot.ts
      });

      mergedAttendants = mergeByNewest({
        currentItems: mergedAttendants,
        backupItems: snapshotDispatch?.attendants,
        keyFn: item => String(item?.id || item?.name || '').trim(),
        updatedAtFn: item => {
          const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
          return Number.isFinite(ts) ? ts : 0;
        },
        backupTs: snapshot.ts
      });

      mergedGroupings = mergeByNewest({
        currentItems: mergedGroupings,
        backupItems: snapshotDispatch?.groupings,
        keyFn: item => String(item?.id || item?.name || '').trim(),
        updatedAtFn: item => {
          const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
          return Number.isFinite(ts) ? ts : 0;
        },
        backupTs: snapshot.ts
      });
    }
  } catch {
    snapshotsScanned = 0;
    snapshotsUsed = 0;
  }

  // Fallback admin merge from legacy admin JSON on persistent disk if needed.
  try {
    const adminRaw = await readFile(getStorageFilePath('nemt-admin.json'), 'utf8');
    const adminJson = parseJsonSafe(adminRaw);
    mergedDrivers = mergeByNewest({
      currentItems: mergedDrivers,
      backupItems: adminJson?.drivers,
      keyFn: normalizeDriverKey,
      updatedAtFn: item => toNumber(item?.updatedAt),
      backupTs: Number(`${fromDate}0000`)
    });
    mergedVehicles = mergeByNewest({
      currentItems: mergedVehicles,
      backupItems: adminJson?.vehicles,
      keyFn: normalizeVehicleKey,
      updatedAtFn: item => {
        const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
        return Number.isFinite(ts) ? ts : 0;
      },
      backupTs: Number(`${fromDate}0000`)
    });
    mergedAttendants = mergeByNewest({
      currentItems: mergedAttendants,
      backupItems: adminJson?.attendants,
      keyFn: item => String(item?.id || item?.name || '').trim(),
      updatedAtFn: item => {
        const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
        return Number.isFinite(ts) ? ts : 0;
      },
      backupTs: Number(`${fromDate}0000`)
    });
    mergedGroupings = mergeByNewest({
      currentItems: mergedGroupings,
      backupItems: adminJson?.groupings,
      keyFn: item => String(item?.id || item?.name || '').trim(),
      updatedAtFn: item => {
        const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
        return Number.isFinite(ts) ? ts : 0;
      },
      backupTs: Number(`${fromDate}0000`)
    });
  } catch {}

  const validTripIds = new Set(mergedTrips.map(item => normalizeTripId(item)).filter(Boolean));
  const filteredRoutePlans = mergedRoutePlans.map(routePlan => ({
    ...routePlan,
    tripIds: Array.isArray(routePlan?.tripIds) ? routePlan.tripIds.filter(id => validTripIds.has(String(id || '').trim())) : []
  })).filter(routePlan => routePlan.tripIds.length > 0);

  const nextDispatchData = normalizePersistentDispatchState({
    ...dispatchSql,
    trips: mergedTrips,
    routePlans: filteredRoutePlans,
    dispatchThreads: mergedThreads,
    auditLog: mergedAuditLog,
    uiPreferences: latestUiPreferences || dispatchSql?.uiPreferences || {}
  });

  const nextAdminData = {
    version: 2,
    drivers: Array.isArray(mergedDrivers) ? mergedDrivers : [],
    vehicles: Array.isArray(mergedVehicles) ? mergedVehicles : [],
    attendants: Array.isArray(mergedAttendants) ? mergedAttendants : [],
    groupings: Array.isArray(mergedGroupings) ? mergedGroupings : []
  };

  const summary = {
    fromDate,
    snapshotsScanned,
    snapshotsUsed,
    dispatch: {
      beforeTrips: Array.isArray(dispatchSql?.trips) ? dispatchSql.trips.length : 0,
      afterTrips: nextDispatchData.trips.length,
      beforeRoutes: Array.isArray(dispatchSql?.routePlans) ? dispatchSql.routePlans.length : 0,
      afterRoutes: nextDispatchData.routePlans.length,
      beforeThreads: Array.isArray(dispatchSql?.dispatchThreads) ? dispatchSql.dispatchThreads.length : 0,
      afterThreads: Array.isArray(nextDispatchData?.dispatchThreads) ? nextDispatchData.dispatchThreads.length : 0,
      beforeAudit: Array.isArray(dispatchSql?.auditLog) ? dispatchSql.auditLog.length : 0,
      afterAudit: Array.isArray(nextDispatchData?.auditLog) ? nextDispatchData.auditLog.length : 0
    },
    admin: {
      beforeDrivers: Array.isArray(adminSql?.drivers) ? adminSql.drivers.length : 0,
      afterDrivers: nextAdminData.drivers.length,
      beforeVehicles: Array.isArray(adminSql?.vehicles) ? adminSql.vehicles.length : 0,
      afterVehicles: nextAdminData.vehicles.length,
      beforeAttendants: Array.isArray(adminSql?.attendants) ? adminSql.attendants.length : 0,
      afterAttendants: nextAdminData.attendants.length,
      beforeGroupings: Array.isArray(adminSql?.groupings) ? adminSql.groupings.length : 0,
      afterGroupings: nextAdminData.groupings.length
    }
  };

  return {
    summary,
    nextDispatchData,
    nextAdminData
  };
};

const requireAdmin = async () => {
  const session = await getServerSession(options);
  const role = String(session?.user?.role || '');
  if (!session?.user?.id || !isAdminRole(role)) {
    return null;
  }
  return session;
};

export async function GET(request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const fromDateParam = String(url.searchParams.get('fromDate') || '20260403').trim();
  const fromDate = Number(fromDateParam);

  if (!Number.isFinite(fromDate) || fromDateParam.length !== 8) {
    return NextResponse.json({ error: 'fromDate must be YYYYMMDD' }, { status: 400 });
  }

  const preview = await buildMergePreview({ fromDate });
  return NextResponse.json({ ok: true, mode: 'preview', ...preview.summary });
}

export async function POST(request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const confirm = Boolean(body?.confirm);
  const fromDateRaw = String(body?.fromDate || '20260403').trim();
  const fromDate = Number(fromDateRaw);

  if (!confirm) {
    return NextResponse.json({ error: 'Send { confirm: true } to apply merge' }, { status: 400 });
  }

  if (!Number.isFinite(fromDate) || fromDateRaw.length !== 8) {
    return NextResponse.json({ error: 'fromDate must be YYYYMMDD' }, { status: 400 });
  }

  const preview = await buildMergePreview({ fromDate });

  await withTransaction(async client => {
    await acquireAdvisoryLock(client, 'dispatch-state-update');
    await acquireAdvisoryLock(client, 'admin-state-update');

    await client.query(`UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = $2`, [preview.nextDispatchData, DISPATCH_ROW_ID]);
    await client.query(`UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = $2`, [preview.nextAdminData, ADMIN_ROW_ID]);
  });

  await query(
    `INSERT INTO activity_logs (id, username, role, action, timestamp, details)
     VALUES ($1, $2, $3, $4, NOW(), $5)`,
    [
      `merge-${Date.now()}`,
      String(session?.user?.name || session?.user?.email || session?.user?.id || 'admin'),
      String(session?.user?.role || 'admin'),
      'backup-sql-merge',
      `Merged backups to SQL from ${fromDateRaw}. Trips ${preview.summary.dispatch.beforeTrips} -> ${preview.summary.dispatch.afterTrips}`
    ]
  ).catch(() => {});

  return NextResponse.json({ ok: true, mode: 'applied', ...preview.summary });
}
