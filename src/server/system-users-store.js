import { readFile } from 'fs/promises';
import { buildStableDriverId, createBlankDriver, getFullName } from '@/helpers/nemt-admin-model';
import { DEFAULT_PROTECTED_SYSTEM_USER_IDS, USER_SEED, authorizeSystemUser, buildPasswordForUser, enrichSystemUser, getUserSyncStatus, isAdminRole, isDriverRole, isProtectedSystemUser, normalizeAuthValue } from '@/helpers/system-users';
import { readNemtAdminState, writeNemtAdminState } from '@/server/nemt-admin-store';
import { query } from '@/server/db';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

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

const applyRoleAccessPolicy = user => {
  const role = String(user?.role || '');
  if (isDriverRole(role)) {
    return {
      ...user,
      webAccess: false,
      androidAccess: true
    };
  }

  if (isAdminRole(role)) {
    return {
      ...user,
      webAccess: true,
      androidAccess: true
    };
  }

  return user;
};

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

    return applyRoleAccessPolicy(normalizedUser);
  }) : [];

  return {
    version: 6,
    protectedUserIds: normalizeProtectedIds(value?.protectedUserIds, users),
    users
  };
};

const SYSTEM_USERS_STORAGE_FILE = getStorageFilePath('system-users.json');

const readLocalUsersState = async () => {
  try {
    const raw = await readFile(SYSTEM_USERS_STORAGE_FILE, 'utf8');
    return normalizeUsersState(JSON.parse(raw));
  } catch {
    const seedUsers = USER_SEED.map(normalizeUserRecord);
    const seedProtected = normalizeProtectedIds(DEFAULT_PROTECTED_SYSTEM_USER_IDS, seedUsers);
    return normalizeUsersState({
      version: 6,
      protectedUserIds: seedProtected,
      users: seedUsers
    });
  }
};

const writeLocalUsersState = async state => {
  const normalized = normalizeUsersState(state);
  await writeJsonFileWithSnapshots({
    filePath: SYSTEM_USERS_STORAGE_FILE,
    nextValue: normalized,
    backupName: 'system-users-local'
  });
  return normalized;
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

const dedupeLinkedDrivers = drivers => {
  const seenKeys = new Set();
  return (Array.isArray(drivers) ? drivers : []).filter(driver => {
    const authUserId = String(driver?.authUserId || '').trim();
    const usernameKey = normalizeAuthValue(driver?.username);
    const emailKey = normalizeAuthValue(driver?.email);
    const key = authUserId ? `auth:${authUserId}` : usernameKey ? `user:${usernameKey}` : emailKey ? `email:${emailKey}` : `id:${String(driver?.id || '').trim()}`;
    if (!key) return true;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
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

  nextDrivers = dedupeLinkedDrivers(nextDrivers);

  await writeNemtAdminState({
    ...adminState,
    drivers: nextDrivers
  });
};

let ensureTablePromise = null;

const ensureTable = async () => {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS system_users_state (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      version INTEGER NOT NULL DEFAULT 6,
      protected_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      users JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const seedUsers = USER_SEED.map(normalizeUserRecord);
  const seedProtected = normalizeProtectedIds(DEFAULT_PROTECTED_SYSTEM_USER_IDS, seedUsers);
  await query(
    `INSERT INTO system_users_state (id, version, protected_user_ids, users) VALUES ('singleton', 6, $1, $2) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(seedProtected), JSON.stringify(seedUsers)]
  );
  })().catch(error => {
    ensureTablePromise = null;
    throw error;
  });

  return ensureTablePromise;
};

export const readSystemUsersState = async () => {
  let effectiveState;

  try {
    await ensureTable();
    const result = await query(`SELECT version, protected_user_ids, users FROM system_users_state WHERE id = 'singleton'`);
    const row = result.rows[0];
    effectiveState = normalizeUsersState({
      version: row?.version,
      protectedUserIds: row?.protected_user_ids,
      users: row?.users
    });
  } catch {
    effectiveState = await readLocalUsersState();
  }

  if (effectiveState.users.length === 0) {
    const seedUsers = USER_SEED.map(normalizeUserRecord);
    const seedProtected = normalizeProtectedIds(DEFAULT_PROTECTED_SYSTEM_USER_IDS, seedUsers);

    try {
      await query(
        `UPDATE system_users_state SET version = $1, protected_user_ids = $2, users = $3, updated_at = NOW() WHERE id = 'singleton'`,
        [6, JSON.stringify(seedProtected), JSON.stringify(seedUsers)]
      );
    } catch {
      await writeLocalUsersState({
        version: 6,
        protectedUserIds: seedProtected,
        users: seedUsers
      });
    }

    return normalizeUsersState({
      version: 6,
      protectedUserIds: seedProtected,
      users: seedUsers
    });
  }

  const hasAdminWithWebAccess = effectiveState.users.some(user => isAdminRole(user.role) && user.webAccess);
  if (!hasAdminWithWebAccess) {
    const seedAdmins = USER_SEED.map(normalizeUserRecord).filter(user => isAdminRole(user.role));
    const existingUsersById = new Map(effectiveState.users.map(user => [user.id, user]));

    const recoveredUsers = effectiveState.users.map(user => isAdminRole(user.role) ? {
      ...user,
      webAccess: true,
      password: String(user.password || buildPasswordForUser(user))
    } : user);

    seedAdmins.forEach(seedAdmin => {
      if (!existingUsersById.has(seedAdmin.id)) {
        recoveredUsers.unshift({
          ...seedAdmin,
          webAccess: true,
          password: String(seedAdmin.password || buildPasswordForUser(seedAdmin))
        });
      }
    });

    const recoveredProtected = normalizeProtectedIds(effectiveState.protectedUserIds, recoveredUsers);

    try {
      await query(
        `UPDATE system_users_state SET version = $1, protected_user_ids = $2, users = $3, updated_at = NOW() WHERE id = 'singleton'`,
        [6, JSON.stringify(recoveredProtected), JSON.stringify(recoveredUsers)]
      );
    } catch {
      await writeLocalUsersState({
        version: 6,
        protectedUserIds: recoveredProtected,
        users: recoveredUsers
      });
    }

    return normalizeUsersState({
      version: 6,
      protectedUserIds: recoveredProtected,
      users: recoveredUsers
    });
  }

  // Self-heal: if Users exist but Drivers mirror is empty/desynced, rebuild linked drivers from Users.
  const adminState = await readNemtAdminState();
  const driverRoleUsers = effectiveState.users.map(user => enrichSystemUser(user, effectiveState.protectedUserIds)).filter(user => isDriverRole(user.role));
  const linkedDriverCount = (Array.isArray(adminState?.drivers) ? adminState.drivers : []).filter(driver => {
    const authUserId = String(driver?.authUserId || '').trim();
    const username = normalizeAuthValue(driver?.username);
    const email = normalizeAuthValue(driver?.email);
    return driverRoleUsers.some(user => user.id === authUserId || normalizeAuthValue(user.username) === username || normalizeAuthValue(user.email) === email);
  }).length;

  if (driverRoleUsers.length > 0 && linkedDriverCount < driverRoleUsers.length) {
    await syncUsersToAdminState(effectiveState.users.map(user => enrichSystemUser(user, effectiveState.protectedUserIds)), []);
  }

  return effectiveState;
};

export const readSystemUsersPayload = async () => {
  const state = await readSystemUsersState();
  return buildUsersPayload(state);
};

const findPersistedSystemUserByEmailInPayload = async (payload, email) => {
  const normalizedEmail = normalizeAuthValue(email);
  if (!normalizedEmail) return null;

  const users = Array.isArray(payload?.users) ? payload.users : [];
  const directMatch = users.find(user => normalizeAuthValue(user.email) === normalizedEmail);
  if (directMatch) return directMatch;

  const adminState = await readNemtAdminState();
  const linkedDriver = (Array.isArray(adminState?.drivers) ? adminState.drivers : []).find(driver => {
    const driverEmail = normalizeAuthValue(driver?.email);
    const portalEmail = normalizeAuthValue(driver?.portalEmail);
    return driverEmail === normalizedEmail || portalEmail === normalizedEmail;
  });

  if (!linkedDriver) return null;

  const linkedUserId = String(linkedDriver?.authUserId || '').trim();
  const linkedUsername = normalizeAuthValue(linkedDriver?.username || linkedDriver?.portalUsername);
  const linkedUserEmail = normalizeAuthValue(linkedDriver?.email || linkedDriver?.portalEmail);

  return users.find(user => {
    const userId = String(user?.id || '').trim();
    const username = normalizeAuthValue(user?.username);
    const userEmail = normalizeAuthValue(user?.email);
    if (linkedUserId && userId === linkedUserId) return true;
    if (linkedUsername && username === linkedUsername) return true;
    return Boolean(linkedUserEmail) && userEmail === linkedUserEmail;
  }) || null;
};

export const findPersistedSystemUserByEmail = async email => {
  const payload = await readSystemUsersPayload();
  return findPersistedSystemUserByEmailInPayload(payload, email);
};

export const findPersistedSystemUserByIdentifier = async identifier => {
  const normalizedIdentifier = normalizeAuthValue(identifier);
  if (!normalizedIdentifier) return null;

  const payload = await readSystemUsersPayload();
  const users = Array.isArray(payload?.users) ? payload.users : [];
  return users.find(user => {
    const username = normalizeAuthValue(user?.username);
    const email = normalizeAuthValue(user?.email);
    return username === normalizedIdentifier || email === normalizedIdentifier;
  }) || null;
};

export const writeSystemUsersState = async nextState => {
  const currentState = await readSystemUsersState();
  const normalized = normalizeUsersState(nextState);
  ensureAtLeastOneAdminRemains(normalized.users);

  try {
    await ensureTable();
    await query(
      `UPDATE system_users_state SET version = $1, protected_user_ids = $2, users = $3, updated_at = NOW() WHERE id = 'singleton'`,
      [normalized.version, JSON.stringify(normalized.protectedUserIds), JSON.stringify(normalized.users)]
    );
  } catch {
    await writeLocalUsersState(normalized);
  }

  await syncUsersToAdminState(normalized.users.map(user => enrichSystemUser(user, normalized.protectedUserIds)), currentState.users.map(user => enrichSystemUser(user, currentState.protectedUserIds)));
  return buildUsersPayload(normalized);
};

export const updatePersistedSystemUserPasswordByEmail = async (email, password) => {
  const normalizedEmail = normalizeAuthValue(email);
  const nextPassword = String(password ?? '').trim();

  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  if (!nextPassword) {
    throw new Error('Password is required');
  }

  const currentState = await readSystemUsersState();
  const payload = await buildUsersPayload(currentState);
  const matchedUser = await findPersistedSystemUserByEmailInPayload(payload, normalizedEmail);

  if (!matchedUser) {
    throw new Error('User with this email not found');
  }

  const nextUsers = currentState.users.map(user => user.id === matchedUser.id ? {
    ...user,
    password: nextPassword
  } : user);

  await writeSystemUsersState({
    version: currentState.version,
    protectedUserIds: currentState.protectedUserIds,
    users: nextUsers
  });

  return matchedUser.id;
};

export const authorizePersistedSystemUser = async credentials => {
  const state = await readSystemUsersPayload();
  return authorizeSystemUser({
    users: state.users,
    ...credentials
  });
};



