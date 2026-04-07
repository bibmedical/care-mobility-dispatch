import { buildStableDriverId, mapAdminDataToDispatchDrivers, normalizeDriverTracking } from '@/helpers/nemt-admin-model';
import { acquireAdvisoryLock, query, queryOne, withTransaction } from '@/server/db';

const ROW_ID = 'singleton';

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

const upsertAdminState = async normalizedState => {
  await query(
    `
      INSERT INTO admin_state (id, version, data, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id)
      DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data, updated_at = NOW()
    `,
    [ROW_ID, Number(normalizedState?.version || 2), normalizedState]
  );
};

export const readNemtAdminState = async () => {
  const row = await queryOne(`SELECT data FROM admin_state WHERE id = $1`, [ROW_ID]);
  return normalizeState(row?.data ?? {});
};

export const writeNemtAdminState = async nextState => {
  const currentState = await readNemtAdminState();
  const mergedState = mergePreservedDriverData(currentState, nextState);
  const normalized = normalizeState(mergedState);
  await upsertAdminState(normalized);
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
    await client.query(
      `
        INSERT INTO admin_state (id, version, data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id)
        DO UPDATE SET version = EXCLUDED.version, data = EXCLUDED.data, updated_at = NOW()
      `,
      [ROW_ID, Number(normalized?.version || 2), normalized]
    );
    return true;
  });
};
