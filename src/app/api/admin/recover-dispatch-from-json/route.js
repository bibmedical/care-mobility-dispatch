import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { getServerSession } from 'next-auth';
import { options } from '@/app/api/auth/[...nextauth]/options';
import { isAdminRole } from '@/helpers/system-users';
import { normalizePersistentDispatchState } from '@/helpers/nemt-dispatch-state';
import { query, queryOne } from '@/server/db';
import { getStorageFilePath } from '@/server/storage-paths';

const parseJsonSafe = raw => JSON.parse(String(raw ?? '').replace(/^\uFEFF/, ''));

const legacyJsonDisabledResponse = () =>
  NextResponse.json(
    {
      ok: false,
      error: 'legacy-json-disabled',
      message: 'Legacy NEMT JSON recovery is disabled. Use SQL-backed admin and dispatch state only.'
    },
    { status: 410 }
  );

// GET  — compare disk JSON vs SQL (no changes made)
// POST — restore SQL from disk JSON (admin only, requires confirm=true in body)

export async function GET() {
  return legacyJsonDisabledResponse();
  const session = await getServerSession(options);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const result = { dispatch: {}, admin: {} };

  // --- dispatch_state ---
  try {
    const sqlRow = await queryOne(`SELECT data, updated_at FROM dispatch_state WHERE id = 'singleton'`);
    const sqlData = sqlRow?.data ?? {};
    result.dispatch.sql = {
      tripCount: Array.isArray(sqlData.trips) ? sqlData.trips.length : 0,
      routeCount: Array.isArray(sqlData.routePlans) ? sqlData.routePlans.length : 0,
      updatedAt: sqlRow?.updated_at ?? null,
    };
  } catch (err) {
    result.dispatch.sqlError = err.message;
  }

  try {
    const raw = await readFile(getStorageFilePath('nemt-dispatch.json'), 'utf8');
    const parsed = parseJsonSafe(raw);
    result.dispatch.json = {
      tripCount: Array.isArray(parsed.trips) ? parsed.trips.length : 0,
      routeCount: Array.isArray(parsed.routePlans) ? parsed.routePlans.length : 0,
    };
  } catch {
    result.dispatch.json = null;
    result.dispatch.jsonNote = 'File not found on disk';
  }

  // --- admin_state ---
  try {
    const sqlRow = await queryOne(`SELECT data, updated_at FROM admin_state WHERE id = 'singleton'`);
    const sqlData = sqlRow?.data ?? {};
    result.admin.sql = {
      driverCount: Array.isArray(sqlData.drivers) ? sqlData.drivers.length : 0,
      vehicleCount: Array.isArray(sqlData.vehicles) ? sqlData.vehicles.length : 0,
      updatedAt: sqlRow?.updated_at ?? null,
    };
  } catch (err) {
    result.admin.sqlError = err.message;
  }

  try {
    const raw = await readFile(getStorageFilePath('nemt-admin.json'), 'utf8');
    const parsed = parseJsonSafe(raw);
    result.admin.json = {
      driverCount: Array.isArray(parsed.drivers) ? parsed.drivers.length : 0,
      vehicleCount: Array.isArray(parsed.vehicles) ? parsed.vehicles.length : 0,
    };
  } catch {
    result.admin.json = null;
    result.admin.jsonNote = 'File not found on disk';
  }

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request) {
  return legacyJsonDisabledResponse();
  const session = await getServerSession(options);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { confirm, target } = body; // target: 'dispatch' | 'admin' | 'both'
  if (!confirm) {
    return NextResponse.json({ error: 'Send { confirm: true, target: "dispatch"|"admin"|"both" } to proceed' }, { status: 400 });
  }
  if (!['dispatch', 'admin', 'both'].includes(target)) {
    return NextResponse.json({ error: 'target must be "dispatch", "admin", or "both"' }, { status: 400 });
  }

  const restored = [];
  const errors = [];

  if (target === 'dispatch' || target === 'both') {
    try {
      const raw = await readFile(getStorageFilePath('nemt-dispatch.json'), 'utf8');
      const parsed = parseJsonSafe(raw);
      const normalized = normalizePersistentDispatchState(parsed);
      await query(
        `UPDATE dispatch_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
        [normalized]
      );
      restored.push(`dispatch_state restored (${Array.isArray(normalized.trips) ? normalized.trips.length : 0} trips)`);
    } catch (err) {
      errors.push(`dispatch: ${err.message}`);
    }
  }

  if (target === 'admin' || target === 'both') {
    try {
      const raw = await readFile(getStorageFilePath('nemt-admin.json'), 'utf8');
      const parsed = parseJsonSafe(raw);
      const normalized = {
        drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
        vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
        attendants: Array.isArray(parsed.attendants) ? parsed.attendants : [],
        groupings: Array.isArray(parsed.groupings) ? parsed.groupings : [],
        settings: parsed.settings ?? {},
      };
      await query(
        `UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
        [normalized]
      );
      restored.push(`admin_state restored (${Array.isArray(normalized.drivers) ? normalized.drivers.length : 0} drivers, ${Array.isArray(normalized.vehicles) ? normalized.vehicles.length : 0} vehicles)`);
    } catch (err) {
      errors.push(`admin: ${err.message}`);
    }
  }

  return NextResponse.json({ ok: errors.length === 0, restored, errors });
}
