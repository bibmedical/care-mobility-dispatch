import { readFile } from 'fs/promises';
import { buildStableDriverId, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { acquireAdvisoryLock, query, queryOne, withTransaction } from '@/server/db';
import { getStorageFilePath } from '@/server/storage-paths';

const ROW_ID = 'singleton';
const LEGACY_JSON_FILE = getStorageFilePath('nemt-admin.json');

const parseJsonSafe = raw => {
  const normalized = String(raw ?? '').replace(/^\uFEFF/, '');
  return JSON.parse(normalized);
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

const normalizeState = value => ({
  version: 2,
  drivers: normalizeDrivers(value?.drivers),
  attendants: Array.isArray(value?.attendants) ? value.attendants : [],
  vehicles: Array.isArray(value?.vehicles) ? value.vehicles : [],
  groupings: Array.isArray(value?.groupings) ? value.groupings : []
});

// One-time migration: if SQL is empty, seed from legacy JSON file (for existing deployments)
let _seeded = false;
const ensureSeeded = async () => {
  if (_seeded) return;
  _seeded = true;
  try {
    const row = await queryOne(`SELECT data FROM admin_state WHERE id = $1`, [ROW_ID]);
    const data = row?.data ?? {};
    const hasData = Array.isArray(data?.drivers) && data.drivers.length > 0;
    if (hasData) return;
    const raw = await readFile(LEGACY_JSON_FILE, 'utf8');
    const parsed = parseJsonSafe(raw);
    const normalized = normalizeState(parsed);
    if (Array.isArray(normalized?.drivers) && normalized.drivers.length > 0) {
      await query(`UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = $2`, [normalized, ROW_ID]);
      console.log('[admin-store] Migrated admin_state from legacy JSON file.');
    }
  } catch {
    // JSON file doesn't exist or is invalid — start fresh from SQL
  }
};

export const readNemtAdminState = async () => {
  await ensureSeeded();
  const row = await queryOne(`SELECT data FROM admin_state WHERE id = $1`, [ROW_ID]);
  return normalizeState(row?.data ?? {});
};

export const writeNemtAdminState = async nextState => {
  await ensureSeeded();
  const currentState = await readNemtAdminState();
  const mergedState = mergePreservedDriverData(currentState, nextState);
  const normalized = normalizeState(mergedState);
  await query(`UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = $2`, [normalized, ROW_ID]);
  return normalized;
};

export const readNemtAdminPayload = async () => {
  const state = await readNemtAdminState();
  return {
    ...state,
    dispatchDrivers: mapAdminDataToDispatchDrivers(state)
  };
};

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
  return withTransaction(async client => {
    await acquireAdvisoryLock(client, 'admin-state-update');
    const result = await client.query(`SELECT data FROM admin_state WHERE id = $1`, [ROW_ID]);
    const currentState = normalizeState(result.rows[0]?.data ?? {});
    const drivers = Array.isArray(currentState?.drivers) ? currentState.drivers : [];
    const driverIndex = drivers.findIndex(driver => String(driver?.id || '').trim() === String(driverId || '').trim());
    if (driverIndex === -1) return false;
    const updatedDrivers = [...drivers];
    updatedDrivers[driverIndex] = {
      ...drivers[driverIndex],
      tracking: {
        ...(drivers[driverIndex]?.tracking || {}),
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        accuracy: accuracy ?? null,
        city: city || '',
        checkpoint: checkpoint || '',
        lastSeen: trackingLastSeen
      }
    };
    const normalized = normalizeState({ ...currentState, drivers: updatedDrivers });
    await client.query(`UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = $2`, [normalized, ROW_ID]);
    return true;
  });
};
