import { buildInitialAdminData, buildStableDriverId, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { query } from '@/server/db';

const VEHICLE_IMAGE_FALLBACK_URL = 'https://loremflickr.com/640/360/fleet,vehicle?lock=9001';

const buildVehicleImageUrl = (vehicle, index = 0) => {
  const label = String(vehicle?.label || '').toLowerCase();
  const type = String(vehicle?.type || '').toLowerCase();

  if (label.includes('ford') && label.includes('transit')) return `https://loremflickr.com/640/360/ford,transit?lock=${1100 + index}`;
  if (label.includes('toyota') && label.includes('sienna')) return `https://loremflickr.com/640/360/toyota,sienna?lock=${1200 + index}`;
  if (label.includes('dodge') && (label.includes('caravan') || label.includes('gran'))) return `https://loremflickr.com/640/360/dodge,caravan?lock=${1300 + index}`;
  if (label.includes('toyota') && label.includes('corolla')) return `https://loremflickr.com/640/360/toyota,corolla?lock=${1400 + index}`;
  if (type.includes('ambulance')) return `https://loremflickr.com/640/360/ambulance,vehicle?lock=${1500 + index}`;
  if (type.includes('van')) return `https://loremflickr.com/640/360/van,vehicle?lock=${1600 + index}`;
  if (type.includes('sedan')) return `https://loremflickr.com/640/360/sedan,car?lock=${1700 + index}`;

  return `${VEHICLE_IMAGE_FALLBACK_URL}&i=${index}`;
};

const normalizeVehiclesWithImages = vehicles => (Array.isArray(vehicles) ? vehicles : []).map((vehicle, index) => {
  const imageUrl = String(vehicle?.imageUrl || vehicle?.image || '').trim() || buildVehicleImageUrl(vehicle, index);
  return {
    ...vehicle,
    imageUrl
  };
});

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

const mergePreservedDriverData = (currentState, nextState, options = {}) => {
  const allowFullClear = options?.allowFullClear === true;
  const currentDrivers = Array.isArray(currentState?.drivers) ? currentState.drivers : [];
  const nextDriversCandidate = Array.isArray(nextState?.drivers) ? nextState.drivers : currentDrivers;
  const nextVehiclesCandidate = Array.isArray(nextState?.vehicles) ? nextState.vehicles : Array.isArray(currentState?.vehicles) ? currentState.vehicles : [];
  const nextAttendantsCandidate = Array.isArray(nextState?.attendants) ? nextState.attendants : Array.isArray(currentState?.attendants) ? currentState.attendants : [];
  const nextGroupingsCandidate = Array.isArray(nextState?.groupings) ? nextState.groupings : Array.isArray(currentState?.groupings) ? currentState.groupings : [];

  const nextDrivers = !allowFullClear && currentDrivers.length > 0 && nextDriversCandidate.length === 0 ? currentDrivers : nextDriversCandidate;
  const currentVehicles = Array.isArray(currentState?.vehicles) ? currentState.vehicles : [];
  const nextVehicles = !allowFullClear && currentVehicles.length > 0 && nextVehiclesCandidate.length === 0 ? currentVehicles : nextVehiclesCandidate;

  const currentDriversById = new Map(currentDrivers.map(driver => [String(driver?.id || '').trim(), driver]));
  const currentDriversByStableId = new Map(currentDrivers.map(driver => [buildStableDriverId(driver), driver]));

  return {
    ...nextState,
    attendants: nextAttendantsCandidate,
    vehicles: nextVehicles,
    groupings: nextGroupingsCandidate,
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

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_state (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      version INTEGER NOT NULL DEFAULT 2,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const initial = buildInitialAdminData();
  await query(
    `INSERT INTO admin_state (id, version, data) VALUES ('singleton', 2, $1) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(initial)]
  );
};

export const readNemtAdminState = async () => {
  await ensureTable();
  const result = await query(`SELECT data FROM admin_state WHERE id = 'singleton'`);
  const raw = result.rows[0]?.data ?? {};
  const normalized = normalizeState(raw);
  const hasVehicles = Array.isArray(normalized.vehicles) && normalized.vehicles.length > 0;
  const restoredVehicles = hasVehicles ? normalizeVehiclesWithImages(normalized.vehicles) : normalizeVehiclesWithImages(buildInitialAdminData().vehicles);
  const needsPersist = !hasVehicles || restoredVehicles.some((vehicle, index) => String(normalized.vehicles?.[index]?.imageUrl || '').trim() !== String(vehicle?.imageUrl || '').trim());

  if (needsPersist) {
    const nextState = {
      ...normalized,
      vehicles: restoredVehicles
    };
    await query(
      `UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
      [JSON.stringify(nextState)]
    );
    return nextState;
  }

  return normalized;
};

export const writeNemtAdminState = async (nextState, options = {}) => {
  await ensureTable();
  const currentState = await readNemtAdminState();
  const mergedState = mergePreservedDriverData(currentState, nextState, options);
  const normalized = normalizeState(mergedState);
  await query(
    `UPDATE admin_state SET data = $1, updated_at = NOW() WHERE id = 'singleton'`,
    [JSON.stringify(normalized)]
  );
  return normalized;
};

export const readNemtAdminPayload = async () => {
  const state = await readNemtAdminState();
  return {
    ...state,
    dispatchDrivers: mapAdminDataToDispatchDrivers(state)
  };
};
