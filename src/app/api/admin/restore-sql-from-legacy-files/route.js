import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { query, queryOne, withTransaction, acquireAdvisoryLock } from '@/server/db';
import { getStorageFilePath } from '@/server/storage-paths';

const DISPATCH_ROW_ID = 'singleton';
const ADMIN_ROW_ID = 'singleton';

const parseJsonSafe = raw => JSON.parse(String(raw ?? '').replace(/^\uFEFF/, ''));

const readLegacyDispatch = async () => {
  const filePath = getStorageFilePath('nemt-dispatch.json');
  const raw = await readFile(filePath, 'utf8');
  const parsed = parseJsonSafe(raw);
  return {
    filePath,
    data: normalizePersistentDispatchState(parsed)
  };
};

const readLegacyAdmin = async () => {
  const filePath = getStorageFilePath('nemt-admin.json');
  const raw = await readFile(filePath, 'utf8');
  const parsed = parseJsonSafe(raw);
  return {
    filePath,
    data: {
      version: 2,
      drivers: Array.isArray(parsed?.drivers) ? parsed.drivers : [],
      vehicles: Array.isArray(parsed?.vehicles) ? parsed.vehicles : [],
      attendants: Array.isArray(parsed?.attendants) ? parsed.attendants : [],
      groupings: Array.isArray(parsed?.groupings) ? parsed.groupings : []
    }
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

const buildPreview = async () => {
  const dispatchRow = await queryOne(`SELECT data FROM dispatch_state WHERE id = $1`, [DISPATCH_ROW_ID]);
  const adminRow = await queryOne(`SELECT data FROM admin_state WHERE id = $1`, [ADMIN_ROW_ID]);

  const dispatchSql = dispatchRow?.data ?? {};
  const adminSql = adminRow?.data ?? {};

  const legacyDispatch = await readLegacyDispatch();
  const legacyAdmin = await readLegacyAdmin();

  return {
    dispatch: {
      sqlBeforeTrips: Array.isArray(dispatchSql?.trips) ? dispatchSql.trips.length : 0,
      legacyTrips: Array.isArray(legacyDispatch.data?.trips) ? legacyDispatch.data.trips.length : 0,
      sqlBeforeRoutes: Array.isArray(dispatchSql?.routePlans) ? dispatchSql.routePlans.length : 0,
      legacyRoutes: Array.isArray(legacyDispatch.data?.routePlans) ? legacyDispatch.data.routePlans.length : 0,
      sqlBeforeThreads: Array.isArray(dispatchSql?.dispatchThreads) ? dispatchSql.dispatchThreads.length : 0,
      legacyThreads: Array.isArray(legacyDispatch.data?.dispatchThreads) ? legacyDispatch.data.dispatchThreads.length : 0,
      sourcePath: legacyDispatch.filePath
    },
    admin: {
      sqlBeforeDrivers: Array.isArray(adminSql?.drivers) ? adminSql.drivers.length : 0,
      legacyDrivers: Array.isArray(legacyAdmin.data?.drivers) ? legacyAdmin.data.drivers.length : 0,
      sqlBeforeVehicles: Array.isArray(adminSql?.vehicles) ? adminSql.vehicles.length : 0,
      legacyVehicles: Array.isArray(legacyAdmin.data?.vehicles) ? legacyAdmin.data.vehicles.length : 0,
      sourcePath: legacyAdmin.filePath
    },
    nextDispatchData: legacyDispatch.data,
    nextAdminData: legacyAdmin.data
  };
};

const applyLegacyToSql = async ({ session }) => {
  const preview = await buildPreview();

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
      `legacy-restore-${Date.now()}`,
      String(session?.user?.name || session?.user?.email || session?.user?.id || 'admin'),
      String(session?.user?.role || 'admin'),
      'legacy-sql-restore',
      `Restored SQL from legacy files. Trips ${preview.dispatch.sqlBeforeTrips} -> ${preview.dispatch.legacyTrips}`
    ]
  ).catch(() => {});

  return preview;
};

export async function GET(request) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const apply = url.searchParams.get('apply') === '1';
    const confirm = url.searchParams.get('confirm') === 'yes';

    if (apply) {
      if (!confirm) {
        return NextResponse.json({ error: 'Add confirm=yes to apply restore via GET' }, { status: 400 });
      }
      const applied = await applyLegacyToSql({ session });
      return NextResponse.json({ ok: true, mode: 'applied', dispatch: applied.dispatch, admin: applied.admin });
    }

    const preview = await buildPreview();
    return NextResponse.json({ ok: true, mode: 'preview', dispatch: preview.dispatch, admin: preview.admin });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'legacy-restore-preview-failed', message: String(error?.message || 'unknown-error') }, { status: 500 });
  }
}

export async function POST(request) {
  try {
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

    if (!body?.confirm) {
      return NextResponse.json({ error: 'Send { confirm: true } to apply restore' }, { status: 400 });
    }

    const applied = await applyLegacyToSql({ session });
    return NextResponse.json({ ok: true, mode: 'applied', dispatch: applied.dispatch, admin: applied.admin });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'legacy-restore-apply-failed', message: String(error?.message || 'unknown-error') }, { status: 500 });
  }
}
