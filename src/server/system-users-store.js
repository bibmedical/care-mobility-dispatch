import { mkdir, readFile, writeFile } from 'fs/promises';
import { buildStableDriverId, createBlankDriver, getFullName } from '@/helpers/nemt-admin-model';
import { DEFAULT_PROTECTED_SYSTEM_USER_IDS, USER_SEED, authorizeSystemUser, buildPasswordForUser, enrichSystemUser, getUserSyncStatus, isAdminRole, isDriverRole, isProtectedSystemUser, normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('system-users.json');

const parseJsonSafe = raw => {
  const normalized = String(raw ?? '').replace(/^\uFEFF/, '');
  return JSON.parse(normalized);
};

const normalizeUserRecord = user => ({
  id: user?.id || `user-${Date.now()}`,
  firstName: String(user?.firstName ?? ''),
  middleInitial: String(user?.middleInitial ?? ''),
  lastName: String(user?.lastName ?? ''),
  isCompany: Boolean(user?.isCompany),
  companyName: String(user?.companyName ?? ''),
  taxId: String(user?.taxId ?? ''),
  email: String(user?.email ?? ''),
  phone: String(user?.phone ?? ''),
  role: String(user?.role ?? ''),
  username: String(user?.username ?? ''),
  password: String(user?.password || buildPasswordForUser(user)),
  webAccess: typeof user?.webAccess === 'boolean' ? user.webAccess : true,
  androidAccess: typeof user?.androidAccess === 'boolean' ? user.androidAccess : true,
  inactivityTimeoutMinutes: typeof user?.inactivityTimeoutMinutes === 'number' && user.inactivityTimeoutMinutes > 0 ? user.inactivityTimeoutMinutes : 15,
  lastEventTime: String(user?.lastEventTime ?? ''),
  eventType: String(user?.eventType ?? '')
});

const normalizeProtectedIds = (protectedUserIds, users) => {
  const userIds = new Set(users.map(user => user.id));
  const preferredIds = Array.isArray(protectedUserIds) ? protectedUserIds : DEFAULT_PROTECTED_SYSTEM_USER_IDS;
  const filteredIds = Array.from(new Set(preferredIds.filter(id => userIds.has(id))));

  if (filteredIds.length > 0) return filteredIds;

  const fallbackDefaultIds = DEFAULT_PROTECTED_SYSTEM_USER_IDS.filter(id => userIds.has(id));
  if (fallbackDefaultIds.length > 0) return fallbackDefaultIds;

  return users[0] ? [users[0].id] : [];
};

const normalizeUsersState = value => {
  const sourceVersion = Number(value?.version || 0);
  const users = Array.isArray(value?.users) ? value.users.map(user => {
    const normalizedUser = normalizeUserRecord(user);

    // Legacy version 4 auto-disabled web login for drivers. Lift that restriction.
    if (sourceVersion > 0 && sourceVersion < 5 && isDriverRole(normalizedUser.role) && normalizedUser.webAccess === false) {
      return {
        ...normalizedUser,
        webAccess: true
      };
    }

    return normalizedUser;
  }) : [];

  return {
    version: 6,
    protectedUserIds: normalizeProtectedIds(value?.protectedUserIds, users),
    users
  };
};

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify({
      version: 6,
      protectedUserIds: normalizeProtectedIds(DEFAULT_PROTECTED_SYSTEM_USER_IDS, USER_SEED),
      users: USER_SEED.map(normalizeUserRecord)
    }, null, 2), 'utf8');
  }
};

const findLinkedDriverIndex = (drivers, user) => drivers.findIndex(driver => driver.authUserId === user.id || normalizeAuthValue(driver.username) === normalizeAuthValue(user.username) || normalizeAuthValue(driver.email) === normalizeAuthValue(user.email));

const buildUsersPayload = async state => {
  const adminState = await readNemtAdminState();

  return {
    ...state,
    users: state.users.map(user => {
      const enrichedUser = enrichSystemUser(user, state.protectedUserIds);
      return {
        ...enrichedUser,
        syncStatus: getUserSyncStatus({
          user: enrichedUser,
          hasLinkedDriver: findLinkedDriverIndex(adminState.drivers, enrichedUser) >= 0
        }),
        isProtected: isProtectedSystemUser(enrichedUser, state.protectedUserIds)
      };
    })
  };
};

const ensureAtLeastOneAdminRemains = (nextUsers) => {
  const hasAdmin = nextUsers.some(user => isAdminRole(user.role));
  if (!hasAdmin) {
    throw new Error('No puedes borrar todos los administradores del sistema. Debe quedar al menos uno.');
  }
};

const syncUserIntoDriverState = (drivers, user) => {
  const driverIndex = findLinkedDriverIndex(drivers, user);

  if (!isDriverRole(user.role)) {
    if (driverIndex === -1) return drivers;
    return drivers.filter((_, index) => index !== driverIndex);
  }

  const baseDriver = driverIndex >= 0 ? drivers[driverIndex] : createBlankDriver();
  const nextDriver = {
    ...baseDriver,
    id: driverIndex >= 0 ? baseDriver.id : buildStableDriverId(user),
    authUserId: user.id,
    firstName: user.firstName,
    middleInitial: user.middleInitial,
    lastName: user.lastName,
    displayName: getFullName(user),
    username: user.username,
    email: user.email,
    phone: user.phone,
    password: user.password,
    webAccess: user.webAccess,
    androidAccess: user.androidAccess,
    isCompany: user.isCompany,
    companyName: user.companyName,
    taxId: user.taxId,
    role: user.role,
    portalUsername: user.username,
    portalEmail: user.email,
    live: 'Offline',
    trackingSource: baseDriver.trackingSource || '',
    trackingLastSeen: baseDriver.trackingLastSeen || ''
  };

  if (driverIndex === -1) {
    return [nextDriver, ...drivers];
  }

  return drivers.map((driver, index) => index === driverIndex ? nextDriver : driver);
};

const syncUsersToAdminState = async (users, previousUsers = []) => {
  const adminState = await readNemtAdminState();
  const nextUsersById = new Map(users.map(user => [user.id, user]));
  const deletedUsers = previousUsers.filter(user => !nextUsersById.has(user.id));

  let nextDrivers = [...adminState.drivers];

  deletedUsers.forEach(user => {
    const driverIndex = findLinkedDriverIndex(nextDrivers, user);
    if (driverIndex >= 0) {
      nextDrivers = nextDrivers.filter((_, index) => index !== driverIndex);
    }
  });

  users.forEach(user => {
    nextDrivers = syncUserIntoDriverState(nextDrivers, user);
  });

  await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });
};

export const readSystemUsersState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  return normalizeUsersState(parseJsonSafe(fileContents));
};

export const readSystemUsersPayload = async () => {
  const state = await readSystemUsersState();
  return buildUsersPayload(state);
};

export const writeSystemUsersState = async nextState => {
  await ensureStorageFile();
  const currentState = await readSystemUsersState();
  const normalized = normalizeUsersState(nextState);
  ensureAtLeastOneAdminRemains(normalized.users);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  await syncUsersToAdminState(normalized.users.map(user => enrichSystemUser(user, normalized.protectedUserIds)), currentState.users.map(user => enrichSystemUser(user, currentState.protectedUserIds)));
  return buildUsersPayload(normalized);
};

export const authorizePersistedSystemUser = async credentials => {
  const state = await readSystemUsersPayload();
  return authorizeSystemUser({
    users: state.users,
    ...credentials
  });
};
