import { buildStableDriverId, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { query, queryOne, withTransaction } from '@/server/db';

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

const normalizeState = value => ({
  version: 2,
  drivers: normalizeDrivers(value?.drivers),
  attendants: Array.isArray(value?.attendants) ? value.attendants : [],
  vehicles: Array.isArray(value?.vehicles) ? value.vehicles : [],
  groupings: Array.isArray(value?.groupings) ? value.groupings : []
});

// ─── READ ─────────────────────────────────────────────────────────────────────

export const readNemtAdminState = async () => {
  const [driversRes, vehiclesRes, attendantsRes, groupingsRes] = await Promise.all([
    query(`SELECT data FROM admin_drivers ORDER BY updated_at DESC`),
    query(`SELECT data FROM admin_vehicles ORDER BY updated_at DESC`),
    query(`SELECT data FROM admin_attendants ORDER BY updated_at DESC`),
    query(`SELECT data FROM admin_groupings ORDER BY updated_at DESC`)
  ]);
  return normalizeState({
    drivers: driversRes.rows.map(r => r.data),
    vehicles: vehiclesRes.rows.map(r => r.data),
    attendants: attendantsRes.rows.map(r => r.data),
    groupings: groupingsRes.rows.map(r => r.data)
  });
};

// ─── WRITE ────────────────────────────────────────────────────────────────────

const upsertEntities = async (client, table, entities) => {
  const rows = entities.filter(e => e?.id);
  if (rows.length === 0) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  for (const entity of rows) {
    await client.query(
      `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()`,
      [entity.id, entity]
    );
  }
  const ids = rows.map(e => e.id);
  await client.query(`DELETE FROM ${table} WHERE id != ALL($1::text[])`, [ids]);
};

export const writeNemtAdminState = async nextState => {
  const currentState = await readNemtAdminState();
  const mergedState = mergePreservedDriverData(currentState, nextState);
  const normalized = normalizeState(mergedState);

  await withTransaction(async client => {
    await upsertEntities(client, 'admin_drivers', normalized.drivers);
    await upsertEntities(client, 'admin_vehicles', normalized.vehicles);
    await upsertEntities(client, 'admin_attendants', normalized.attendants);
    await upsertEntities(client, 'admin_groupings', normalized.groupings);
  });

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
     SET data = jsonb_set(data, '{tracking}', $1::jsonb, true),
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(tracking), String(driverId || '').trim()]
  );
  return (result.rowCount ?? 0) > 0;
};
