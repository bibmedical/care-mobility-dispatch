#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const ROOT = process.cwd();
const BACKUP_ROOT = path.join(ROOT, 'backup');
const DISPATCH_ROW_ID = 'singleton';
const ADMIN_ROW_ID = 'singleton';

const parseArgs = argv => {
  const args = new Set(argv.slice(2));
  const fromArg = argv.find(item => item.startsWith('--from='));
  const fromDate = fromArg ? String(fromArg.split('=')[1] || '').trim() : '20260403';
  return {
    apply: args.has('--apply'),
    fromDate
  };
};

const parseEnvFile = async filePath => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const env = {};
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const rawKey = trimmed.slice(0, idx).trim();
      const key = rawKey.replace(/^export\s+/, '').trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });
    return env;
  } catch {
    return {};
  }
};

const getDatabaseUrl = async () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const localEnv = await parseEnvFile(path.join(ROOT, '.env.local'));
  return localEnv.DATABASE_URL || '';
};

const parseJsonSafe = raw => JSON.parse(String(raw ?? '').replace(/^\uFEFF/, ''));

const toNumber = value => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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
  const map = new Map();

  (Array.isArray(currentItems) ? currentItems : []).forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    map.set(key, { item, updatedAt: updatedAtFn(item), backupTs: 0 });
  });

  (Array.isArray(backupItems) ? backupItems : []).forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    const nextUpdatedAt = updatedAtFn(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { item, updatedAt: nextUpdatedAt, backupTs });
      return;
    }
    if (nextUpdatedAt > existing.updatedAt || (nextUpdatedAt === existing.updatedAt && backupTs >= existing.backupTs)) {
      map.set(key, { item, updatedAt: nextUpdatedAt, backupTs });
    }
  });

  return Array.from(map.values()).map(entry => entry.item);
};

const mergeRoutePlans = ({ currentPlans, backupPlans, backupTs }) => {
  const map = new Map();

  const put = (plan, ts) => {
    const id = String(plan?.id || '').trim();
    if (!id) return;
    const tripIds = Array.isArray(plan?.tripIds) ? plan.tripIds.filter(Boolean) : [];
    const existing = map.get(id);
    if (!existing) {
      map.set(id, {
        plan: { ...plan, id, tripIds: Array.from(new Set(tripIds)) },
        ts
      });
      return;
    }
    const mergedTripIds = Array.from(new Set([...(Array.isArray(existing.plan?.tripIds) ? existing.plan.tripIds : []), ...tripIds]));
    if (ts >= existing.ts) {
      map.set(id, {
        plan: { ...existing.plan, ...plan, id, tripIds: mergedTripIds },
        ts
      });
      return;
    }
    map.set(id, {
      plan: { ...existing.plan, tripIds: mergedTripIds },
      ts: existing.ts
    });
  };

  (Array.isArray(currentPlans) ? currentPlans : []).forEach(plan => put(plan, 0));
  (Array.isArray(backupPlans) ? backupPlans : []).forEach(plan => put(plan, backupTs));

  return Array.from(map.values()).map(entry => entry.plan);
};

const parseBackupTimestamp = folderName => {
  // 4bloques-YYYYMMDD-HHMMSS
  const match = /^4bloques-(\d{8})-(\d{6})$/.exec(String(folderName || '').trim());
  if (!match) return 0;
  return Number(`${match[1]}${match[2]}`);
};

const listBackupSnapshots = async fromDate => {
  const entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true });
  const fromDateNum = Number(String(fromDate || '').trim());
  const snapshots = entries
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, ts: parseBackupTimestamp(entry.name) }))
    .filter(item => item.ts > 0 && Number(String(item.ts).slice(0, 8)) >= fromDateNum)
    .sort((a, b) => a.ts - b.ts);

  return snapshots;
};

const readSnapshotFiles = async snapshot => {
  const baseDir = path.join(BACKUP_ROOT, snapshot.name, 'storage');
  const dispatchPath = path.join(baseDir, 'nemt-dispatch.json');
  const adminPath = path.join(baseDir, 'nemt-admin.json');

  let dispatch = null;
  let admin = null;

  try {
    dispatch = parseJsonSafe(await fs.readFile(dispatchPath, 'utf8'));
  } catch {}

  try {
    admin = parseJsonSafe(await fs.readFile(adminPath, 'utf8'));
  } catch {}

  return { dispatch, admin };
};

const getSingletonData = async (client, table) => {
  const result = await client.query(`SELECT data FROM ${table} WHERE id = $1`, ['singleton']);
  return result.rows[0]?.data ?? {};
};

const main = async () => {
  const { apply, fromDate } = parseArgs(process.argv);
  const dbUrl = await getDatabaseUrl();

  if (!dbUrl) {
    console.error('DATABASE_URL is missing (.env.local or environment).');
    process.exit(1);
  }

  const snapshots = await listBackupSnapshots(fromDate);
  if (snapshots.length === 0) {
    console.error(`No backup snapshots found from date prefix ${fromDate}.`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000
  });

  const client = await pool.connect();

  try {
    const dispatchSql = await getSingletonData(client, 'dispatch_state');
    const adminSql = await getSingletonData(client, 'admin_state');

    let mergedDispatchTrips = Array.isArray(dispatchSql?.trips) ? dispatchSql.trips : [];
    let mergedDispatchRoutes = Array.isArray(dispatchSql?.routePlans) ? dispatchSql.routePlans : [];
    let mergedDispatchThreads = Array.isArray(dispatchSql?.dispatchThreads) ? dispatchSql.dispatchThreads : [];
    let mergedAuditLog = Array.isArray(dispatchSql?.auditLog) ? dispatchSql.auditLog : [];
    let latestDispatchUi = dispatchSql?.uiPreferences || {};

    let mergedDrivers = Array.isArray(adminSql?.drivers) ? adminSql.drivers : [];
    let mergedVehicles = Array.isArray(adminSql?.vehicles) ? adminSql.vehicles : [];
    let mergedAttendants = Array.isArray(adminSql?.attendants) ? adminSql.attendants : [];
    let mergedGroupings = Array.isArray(adminSql?.groupings) ? adminSql.groupings : [];

    let scannedWithDispatch = 0;
    let scannedWithAdmin = 0;

    for (const snapshot of snapshots) {
      const { dispatch, admin } = await readSnapshotFiles(snapshot);

      if (dispatch) {
        scannedWithDispatch += 1;
        mergedDispatchTrips = mergeByNewest({
          currentItems: mergedDispatchTrips,
          backupItems: dispatch.trips,
          keyFn: item => normalizeTripId(item),
          updatedAtFn: item => toNumber(item?.updatedAt),
          backupTs: snapshot.ts
        });

        mergedDispatchRoutes = mergeRoutePlans({
          currentPlans: mergedDispatchRoutes,
          backupPlans: dispatch.routePlans,
          backupTs: snapshot.ts
        });

        mergedDispatchThreads = mergeByNewest({
          currentItems: mergedDispatchThreads,
          backupItems: dispatch.dispatchThreads,
          keyFn: item => String(item?.driverId || '').trim(),
          updatedAtFn: item => {
            const lastMsg = Array.isArray(item?.messages) && item.messages.length > 0 ? item.messages[item.messages.length - 1] : null;
            const ts = Date.parse(String(lastMsg?.timestamp || ''));
            return Number.isFinite(ts) ? ts : 0;
          },
          backupTs: snapshot.ts
        });

        mergedAuditLog = mergeByNewest({
          currentItems: mergedAuditLog,
          backupItems: dispatch.auditLog,
          keyFn: item => String(item?.id || '').trim(),
          updatedAtFn: item => {
            const ts = Date.parse(String(item?.timestamp || ''));
            return Number.isFinite(ts) ? ts : 0;
          },
          backupTs: snapshot.ts
        });

        if (dispatch.uiPreferences && snapshot.ts > 0) {
          latestDispatchUi = dispatch.uiPreferences;
        }
      }

      if (admin) {
        scannedWithAdmin += 1;
        mergedDrivers = mergeByNewest({
          currentItems: mergedDrivers,
          backupItems: admin.drivers,
          keyFn: normalizeDriverKey,
          updatedAtFn: item => toNumber(item?.updatedAt),
          backupTs: snapshot.ts
        });

        mergedVehicles = mergeByNewest({
          currentItems: mergedVehicles,
          backupItems: admin.vehicles,
          keyFn: normalizeVehicleKey,
          updatedAtFn: item => {
            const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
            return Number.isFinite(ts) ? ts : 0;
          },
          backupTs: snapshot.ts
        });

        mergedAttendants = mergeByNewest({
          currentItems: mergedAttendants,
          backupItems: admin.attendants,
          keyFn: item => String(item?.id || item?.name || '').trim(),
          updatedAtFn: item => {
            const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
            return Number.isFinite(ts) ? ts : 0;
          },
          backupTs: snapshot.ts
        });

        mergedGroupings = mergeByNewest({
          currentItems: mergedGroupings,
          backupItems: admin.groupings,
          keyFn: item => String(item?.id || item?.name || '').trim(),
          updatedAtFn: item => {
            const ts = Date.parse(String(item?.updatedAt || item?.createdAt || ''));
            return Number.isFinite(ts) ? ts : 0;
          },
          backupTs: snapshot.ts
        });
      }
    }

    const validTripIds = new Set(mergedDispatchTrips.map(trip => normalizeTripId(trip)).filter(Boolean));
    mergedDispatchRoutes = mergedDispatchRoutes.map(route => ({
      ...route,
      tripIds: Array.isArray(route?.tripIds) ? route.tripIds.filter(id => validTripIds.has(String(id || '').trim())) : []
    })).filter(route => route.tripIds.length > 0);

    const nextDispatch = {
      ...dispatchSql,
      version: 1,
      trips: mergedDispatchTrips,
      routePlans: mergedDispatchRoutes,
      dispatchThreads: mergedDispatchThreads,
      auditLog: mergedAuditLog,
      uiPreferences: latestDispatchUi || dispatchSql?.uiPreferences || {}
    };

    const nextAdmin = {
      ...adminSql,
      version: 2,
      drivers: mergedDrivers,
      vehicles: mergedVehicles,
      attendants: mergedAttendants,
      groupings: mergedGroupings
    };

    const summary = {
      apply,
      fromDate,
      snapshotsScanned: snapshots.length,
      snapshotsWithDispatch: scannedWithDispatch,
      snapshotsWithAdmin: scannedWithAdmin,
      dispatch: {
        sqlBeforeTrips: Array.isArray(dispatchSql?.trips) ? dispatchSql.trips.length : 0,
        sqlAfterTrips: mergedDispatchTrips.length,
        sqlBeforeRoutes: Array.isArray(dispatchSql?.routePlans) ? dispatchSql.routePlans.length : 0,
        sqlAfterRoutes: mergedDispatchRoutes.length,
        sqlBeforeThreads: Array.isArray(dispatchSql?.dispatchThreads) ? dispatchSql.dispatchThreads.length : 0,
        sqlAfterThreads: mergedDispatchThreads.length
      },
      admin: {
        sqlBeforeDrivers: Array.isArray(adminSql?.drivers) ? adminSql.drivers.length : 0,
        sqlAfterDrivers: mergedDrivers.length,
        sqlBeforeVehicles: Array.isArray(adminSql?.vehicles) ? adminSql.vehicles.length : 0,
        sqlAfterVehicles: mergedVehicles.length,
        sqlBeforeAttendants: Array.isArray(adminSql?.attendants) ? adminSql.attendants.length : 0,
        sqlAfterAttendants: mergedAttendants.length,
        sqlBeforeGroupings: Array.isArray(adminSql?.groupings) ? adminSql.groupings.length : 0,
        sqlAfterGroupings: mergedGroupings.length
      }
    };

    if (!apply) {
      console.log(JSON.stringify(summary, null, 2));
      console.log('\nDry run complete. Re-run with --apply to write into SQL.');
      return;
    }

    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['dispatch-state-update']);
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['admin-state-update']);

    await client.query(`UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = $2`, [nextDispatch, DISPATCH_ROW_ID]);
    await client.query(`UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = $2`, [nextAdmin, ADMIN_ROW_ID]);

    await client.query('COMMIT');

    console.log(JSON.stringify(summary, null, 2));
    console.log('\nMerge applied to SQL successfully.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('Merge failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();
