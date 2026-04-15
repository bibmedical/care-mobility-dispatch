import { readFile } from 'fs/promises';
import { buildInitialAdminData, buildStableDriverId, mapAdminDataToDispatchDrivers, normalizeDriverTracking, normalizeGroupingRecord } from '@/helpers/nemt-admin-model';
import { query, queryOne, withTransaction } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production' && !hasDatabaseUrl();

let ensureAdminSchemaPromise = null;
let localMigrationPromise = null;

const ensureAdminSchema = async () => {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for NEMT admin storage in production');
  }
  if (ensureAdminSchemaPromise) return ensureAdminSchemaPromise;
  ensureAdminSchemaPromise = runMigrations().catch(error => {
    ensureAdminSchemaPromise = null;
    throw error;
  });
  return ensureAdminSchemaPromise;
};

const isMeaningfulDocumentValue = value => {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') {
    return Boolean(String(value.dataUrl || value.url || value.path || value.name || '').trim());
  }
  return false;
};

const mergeDriverDocuments = (currentDriver, nextDriver) => {
  const currentDocuments = currentDriver?.documents && typeof currentDriver.documents === 'object' ? currentDriver.documents : {};
  const nextDocuments = nextDriver?.documents && typeof nextDriver.documents === 'object' ? nextDriver.documents : {};
  const allDocumentKeys = new Set([...Object.keys(currentDocuments), ...Object.keys(nextDocuments)]);

  if (allDocumentKeys.size === 0) {
    return nextDriver;
  }

  const mergedDocuments = {};
  allDocumentKeys.forEach(key => {
    const nextValue = nextDocuments[key];
    const currentValue = currentDocuments[key];
    mergedDocuments[key] = isMeaningfulDocumentValue(nextValue) ? nextValue : currentValue ?? nextValue ?? null;
  });

  return {
    ...nextDriver,
    documents: mergedDocuments
  };
};

const mergePreservedDriverData = (currentState, nextState) => {
  const currentDrivers = Array.isArray(currentState?.drivers) ? currentState.drivers : [];
  const nextDrivers = Array.isArray(nextState?.drivers) ? nextState.drivers : [];

  const currentDriversById = new Map(currentDrivers.map(driver => [String(driver?.id || '').trim(), driver]));
  const currentDriversByStableId = new Map(currentDrivers.map(driver => [buildStableDriverId(driver), driver]));

  return {
    ...nextState,
    drivers: nextDrivers.map(nextDriver => {
      const currentById = currentDriversById.get(String(nextDriver?.id || '').trim());
      const currentByStableId = currentDriversByStableId.get(buildStableDriverId(nextDriver));
      const currentDriver = currentById || currentByStableId || null;
      return currentDriver ? mergeDriverDocuments(currentDriver, nextDriver) : nextDriver;
    })
  };
};

const normalizeDrivers = drivers => {
  const seenIds = new Set();

  return (Array.isArray(drivers) ? drivers : []).map((driver, index) => {
    const normalizedDriver = normalizeDriverTracking(driver);
    const preferredId = buildStableDriverId(normalizedDriver);
    const currentId = String(normalizedDriver?.id || '').trim();
    const nextId = !currentId || seenIds.has(currentId) || currentId.startsWith('driver-') ? preferredId : currentId;
    const uniqueId = seenIds.has(nextId) ? `${nextId}-${index + 1}` : nextId;
    seenIds.add(uniqueId);
    return {
      ...normalizedDriver,
      id: uniqueId
    };
  });
};

const normalizeGroupings = (groupings, state) => (Array.isArray(groupings) ? groupings : []).map(grouping => normalizeGroupingRecord(grouping, state));

const normalizeState = value => {
  const drivers = normalizeDrivers(value?.drivers);
  const attendants = Array.isArray(value?.attendants) ? value.attendants : [];
  const vehicles = Array.isArray(value?.vehicles) ? value.vehicles : [];
  const groupings = normalizeGroupings(value?.groupings, { drivers, vehicles });

  return {
    version: 3,
    drivers,
    attendants,
    vehicles,
    groupings
  };
};

const getNemtAdminStorageFile = () => getStorageFilePath('nemt-admin.json');

const readLocalNemtAdminState = async () => {
  try {
    const raw = await readFile(getNemtAdminStorageFile(), 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(buildInitialAdminData());
  }
};

const writeLocalNemtAdminState = async state => {
  const normalized = normalizeState(state);
  await writeJsonFileWithSnapshots({
    filePath: getNemtAdminStorageFile(),
    nextValue: normalized,
    backupName: 'nemt-admin-local'
  });
  return normalized;
};

const maybeMigrateLocalNemtAdminStateToSql = async () => {
  if (!hasDatabaseUrl()) return;
  if (localMigrationPromise) return localMigrationPromise;

  localMigrationPromise = (async () => {
    const localState = await readLocalNemtAdminState();
    const normalizedLocalState = normalizeState(localState);
    const hasLocalEntities = normalizedLocalState.drivers.length > 0 || normalizedLocalState.vehicles.length > 0 || normalizedLocalState.attendants.length > 0 || normalizedLocalState.groupings.length > 0;
    if (!hasLocalEntities) return;

    const [driversRes, vehiclesRes, attendantsRes, groupingsRes] = await Promise.all([
      query(`SELECT data FROM admin_drivers`),
      query(`SELECT data FROM admin_vehicles`),
      query(`SELECT data FROM admin_attendants`),
      query(`SELECT data FROM admin_groupings`)
    ]);

    const currentState = normalizeState({
      drivers: driversRes.rows.map(row => row.data),
      vehicles: vehiclesRes.rows.map(row => row.data),
      attendants: attendantsRes.rows.map(row => row.data),
      groupings: groupingsRes.rows.map(row => row.data)
    });

    const currentIsEmpty = currentState.drivers.length === 0 && currentState.vehicles.length === 0 && currentState.attendants.length === 0 && currentState.groupings.length === 0;
    const mergeById = (currentItems, localItems) => {
      if (currentIsEmpty) return localItems;
      const merged = new Map(currentItems.map(item => [String(item?.id || '').trim(), item]));
      localItems.forEach(item => {
        const itemId = String(item?.id || '').trim();
        if (!itemId || merged.has(itemId)) return;
        merged.set(itemId, item);
      });
      return Array.from(merged.values());
    };

    const nextState = normalizeState({
      drivers: mergeById(currentState.drivers, normalizedLocalState.drivers),
      vehicles: mergeById(currentState.vehicles, normalizedLocalState.vehicles),
      attendants: mergeById(currentState.attendants, normalizedLocalState.attendants),
      groupings: mergeById(currentState.groupings, normalizedLocalState.groupings)
    });

    await withTransaction(async client => {
      await upsertEntities(client, 'admin_drivers', nextState.drivers);
      await upsertEntities(client, 'admin_vehicles', nextState.vehicles);
      await upsertEntities(client, 'admin_attendants', nextState.attendants);
      await upsertEntities(client, 'admin_groupings', nextState.groupings);
    });
  })().catch(error => {
    localMigrationPromise = null;
    throw error;
  });

  return localMigrationPromise;
};

// ─── READ ─────────────────────────────────────────────────────────────────────

export const readNemtAdminState = async () => {
  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for NEMT admin storage in production');
    }
    return await readLocalNemtAdminState();
  }

  try {
    await ensureAdminSchema();
    await maybeMigrateLocalNemtAdminStateToSql();
    const [driversRes, vehiclesRes, attendantsRes, groupingsRes] = await Promise.all([
      query(`SELECT data FROM admin_drivers ORDER BY updated_at DESC LIMIT 500`),
      query(`SELECT data FROM admin_vehicles ORDER BY updated_at DESC LIMIT 200`),
      query(`SELECT data FROM admin_attendants ORDER BY updated_at DESC LIMIT 200`),
      query(`SELECT data FROM admin_groupings ORDER BY updated_at DESC LIMIT 50`)
    ]);
    return normalizeState({
      drivers: driversRes.rows.map(r => r.data),
      vehicles: vehiclesRes.rows.map(r => r.data),
      attendants: attendantsRes.rows.map(r => r.data),
      groupings: groupingsRes.rows.map(r => r.data)
    });
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    return await readLocalNemtAdminState();
  }
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

const upsertEntities = async (client, table, entities) => {
  const rows = entities.filter(e => e?.id);
  if (rows.length === 0) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  // Bulk upsert — 1 query regardless of entity count
  await client.query(
    `INSERT INTO ${table} (id, data, updated_at)
     SELECT (t.data->>'id'), t.data, NOW()
     FROM json_array_elements($1::json) AS t(data)
     WHERE (t.data->>'id') IS NOT NULL AND (t.data->>'id') != ''
     ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
    [JSON.stringify(rows)]
  );
  const ids = rows.map(e => e.id);
  await client.query(`DELETE FROM ${table} WHERE id != ALL($1::text[])`, [ids]);
};

export const writeNemtAdminState = async nextState => {
  const currentState = await readNemtAdminState();
  const mergedState = mergePreservedDriverData(currentState, nextState);
  const normalized = normalizeState(mergedState);

  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for NEMT admin storage in production');
    }
    await writeLocalNemtAdminState(normalized);
    return normalized;
  }

  try {
    await ensureAdminSchema();
    await maybeMigrateLocalNemtAdminStateToSql();
    await withTransaction(async client => {
      await upsertEntities(client, 'admin_drivers', normalized.drivers);
      await upsertEntities(client, 'admin_vehicles', normalized.vehicles);
      await upsertEntities(client, 'admin_attendants', normalized.attendants);
      await upsertEntities(client, 'admin_groupings', normalized.groupings);
    });
  } catch (error) {
    if (!shouldUseLocalFallback()) throw error;
    await writeLocalNemtAdminState(normalized);
  }

  return normalized;
};

// ─── READ PAYLOAD (dispatch view) ─────────────────────────────────────────────

export const readNemtAdminPayload = async () => {
  const state = await readNemtAdminState();
  return {
    ...state,
    dispatchDrivers: mapAdminDataToDispatchDrivers(state)
  };
};

export const readNemtAdminDriversPayload = async () => {
  const state = await readNemtAdminState();
  return {
    dispatchDrivers: mapAdminDataToDispatchDrivers(state)
  };
};

// ─── GPS UPDATE (O(1) — single row update) ────────────────────────────────────

export const updateDriverLocation = async ({
  driverId,
  latitude,
  longitude,
  heading,
  speed,
  accuracy,
  city,
  checkpoint,
  trackingLastSeen
}) => {
  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for NEMT admin storage in production');
    }
    const currentState = await readLocalNemtAdminState();
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedDriverId) return null;

    const nextState = normalizeState({
      ...currentState,
      drivers: (Array.isArray(currentState?.drivers) ? currentState.drivers : []).map(driver => String(driver?.id || '').trim() !== normalizedDriverId ? driver : {
        ...driver,
        tracking: normalizeDriverTracking({
          ...driver,
          tracking: {
            ...(driver?.tracking || {}),
            latitude,
            longitude,
            heading: heading ?? null,
            speed: speed ?? null,
            accuracy: accuracy ?? null,
            city: city || '',
            checkpoint: checkpoint || '',
            lastSeen: trackingLastSeen
          }
        }).tracking
      })
    });

    await writeLocalNemtAdminState(nextState);
    return nextState.drivers.find(driver => String(driver?.id || '').trim() === normalizedDriverId) || null;
  }

  await ensureAdminSchema();
  const tracking = {
    latitude,
    longitude,
    heading: heading ?? null,
    speed: speed ?? null,
    accuracy: accuracy ?? null,
    city: city || '',
    checkpoint: checkpoint || '',
    lastSeen: trackingLastSeen
  };
  const result = await query(
    `UPDATE admin_drivers
     SET data = jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(data, '{tracking}', $1::jsonb, true),
                              '{position}', jsonb_build_array(to_jsonb($2::float8), to_jsonb($3::float8)), true
                            ),
                            '{checkpoint}', to_jsonb($4::text), true
                          ),
                          '{trackingLastSeen}', to_jsonb($5::text), true
                        ),
                        '{trackingSource}', to_jsonb('android'::text), true
                      ),
                      '{heading}', to_jsonb($6::float8), true
                    ),
                    '{speed}', to_jsonb($7::float8), true
                  ),
                  '{accuracy}', to_jsonb($8::float8), true
                ),
         updated_at = NOW()
     WHERE id = $9`,
    [
      JSON.stringify(tracking),
      Number(latitude),
      Number(longitude),
      String(checkpoint || ''),
      String(trackingLastSeen || ''),
      Number.isFinite(Number(heading)) ? Number(heading) : null,
      Number.isFinite(Number(speed)) ? Number(speed) : null,
      Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
      String(driverId || '').trim()
    ]
  );
  return (result.rowCount ?? 0) > 0;
};

export const resolveDriverPresenceContext = async driverId => {
  await ensureAdminSchema();
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return null;

  const row = await queryOne(
    `
      SELECT
        id,
        data->>'authUserId' AS auth_user_id,
        data->>'displayName' AS display_name,
        data->>'firstName' AS first_name,
        data->>'lastName' AS last_name,
        data->>'username' AS username,
        data->>'email' AS email,
        data->>'role' AS role
      FROM admin_drivers
      WHERE id = $1
      LIMIT 1
    `,
    [normalizedDriverId]
  );

  if (!row) return null;

  const fullName = [String(row.first_name || '').trim(), String(row.last_name || '').trim()].filter(Boolean).join(' ').trim();
  const userName = String(row.display_name || '').trim() || fullName || String(row.username || '').trim() || normalizedDriverId;

  return {
    driverId: normalizedDriverId,
    userId: String(row.auth_user_id || '').trim() || normalizedDriverId,
    userName,
    userRole: String(row.role || '').trim() || 'Driver(Driver)',
    userEmail: String(row.email || '').trim() || ''
  };
};
