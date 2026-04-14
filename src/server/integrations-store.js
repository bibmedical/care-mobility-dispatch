import { readFile } from 'fs/promises';
import { query, queryOne } from '@/server/db';
import { DEFAULT_BRANDING_SETTINGS, normalizeBrandingSettings } from '@/helpers/branding';
import { DEFAULT_ASSISTANT_AVATAR } from '@/helpers/nemt-dispatch-state';
import { writeJsonFileWithSnapshots } from '@/server/storage-backup';
import { getStorageFilePath } from '@/server/storage-paths';

const DEFAULT_STATE = {
  version: 1,
  uber: {
    organizationName: '',
    accountEmail: '',
    accountType: 'Uber Health',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scopes: 'rides.read rides.request',
    notes: '',
    connectionStatus: 'Not configured',
    tokenStatus: 'No token',
    lastValidatedAt: '',
    lastCallbackAt: '',
    lastCallbackCode: ''
  },
  ai: {
    provider: 'openai',
    enabled: false,
    assistantVisible: true,
    apiKey: '',
    model: 'gpt-5.4-nano',
    avatarName: DEFAULT_ASSISTANT_AVATAR.name,
    avatarImage: DEFAULT_ASSISTANT_AVATAR.image,
    avatarUpdatedAt: '',
    memoryNotes: '',
    memorySections: {
      patients: '',
      drivers: '',
      rules: '',
      phones: ''
    },
    notes: '',
    connectionStatus: 'Not configured',
    lastValidatedAt: ''
  },
  branding: {
    ...DEFAULT_BRANDING_SETTINGS
  },
  sms: {
    activeProvider: 'disabled',
    defaultCountryCode: '1',
    confirmationTemplate: 'Hello {{rider}}, this is Florida Mobility Group about trip {{tripId}}. Reply 1 {{code}} to confirm, 2 {{code}} to cancel, or 3 {{code}} if you need a call.',
    arrivalNotifications: {
      patientEnabled: true,
      officeEnabled: true,
      patientTemplate: 'Hello {{rider}}, this is Florida Mobility Group. Your driver {{driver}} has arrived for pickup at {{pickupAddress}}. If you need help, call the office.',
      officeTemplate: 'Arrival notice: driver {{driver}} has arrived for {{rider}} at {{pickupAddress}} for trip {{tripId}}.',
      officeRecipients: []
    },
    groupTemplates: {
      AL: '',
      BL: '',
      CL: '',
      A: '',
      W: '',
      STR: ''
    },
    webhookBaseUrl: '',
    notes: '',
    lastValidatedAt: '',
    lastInboundAt: '',
    optOutList: [],
    twilio: {
      accountSid: '',
      authToken: '',
      messagingServiceSid: '',
      fromNumber: '',
      connectionStatus: 'Not configured'
    },
    telnyx: {
      apiKey: '',
      messagingProfileId: '',
      fromNumber: '',
      connectionStatus: 'Not configured'
    },
    ringcentral: {
      clientId: '',
      clientSecret: '',
      serverUrl: 'https://platform.ringcentral.com',
      accessToken: '',
      extension: '1',
      fromNumber: '',
      connectionStatus: 'Not configured'
    },
    mock: {
      enabled: true,
      connectionStatus: 'Ready for local testing'
    }
  }
};

const hasDatabaseUrl = () => Boolean(String(process.env.DATABASE_URL || '').trim());
const shouldUseLocalFallback = () => process.env.NODE_ENV !== 'production';

const getIntegrationsStorageFile = () => getStorageFilePath('integrations-state.json');

const normalizeUberState = value => ({
  organizationName: String(value?.organizationName ?? ''),
  accountEmail: String(value?.accountEmail ?? ''),
  accountType: String(value?.accountType ?? 'Uber Health'),
  clientId: String(value?.clientId ?? ''),
  clientSecret: String(value?.clientSecret ?? ''),
  redirectUri: String(value?.redirectUri ?? ''),
  scopes: String(value?.scopes ?? 'rides.read rides.request'),
  notes: String(value?.notes ?? ''),
  connectionStatus: String(value?.connectionStatus ?? 'Not configured'),
  tokenStatus: String(value?.tokenStatus ?? 'No token'),
  lastValidatedAt: String(value?.lastValidatedAt ?? ''),
  lastCallbackAt: String(value?.lastCallbackAt ?? ''),
  lastCallbackCode: String(value?.lastCallbackCode ?? '')
});

const normalizeTwilioSmsState = value => ({
  accountSid: String(value?.accountSid ?? ''),
  authToken: String(value?.authToken ?? ''),
  messagingServiceSid: String(value?.messagingServiceSid ?? ''),
  fromNumber: String(value?.fromNumber ?? ''),
  connectionStatus: String(value?.connectionStatus ?? 'Not configured')
});

const normalizeTelnyxSmsState = value => ({
  apiKey: String(value?.apiKey ?? ''),
  messagingProfileId: String(value?.messagingProfileId ?? ''),
  fromNumber: String(value?.fromNumber ?? ''),
  connectionStatus: String(value?.connectionStatus ?? 'Not configured')
});

const normalizeRingCentralSmsState = value => ({
  clientId: String(value?.clientId ?? ''),
  clientSecret: String(value?.clientSecret ?? ''),
  serverUrl: String(value?.serverUrl ?? 'https://platform.ringcentral.com'),
  accessToken: String(value?.accessToken ?? ''),
  extension: String(value?.extension ?? '1'),
  fromNumber: String(value?.fromNumber ?? ''),
  connectionStatus: String(value?.connectionStatus ?? 'Not configured')
});

const normalizeMockSmsState = value => ({
  enabled: value?.enabled !== false,
  connectionStatus: String(value?.connectionStatus ?? 'Ready for local testing')
});

const normalizeAiState = value => ({
  provider: String(value?.provider ?? 'openai'),
  enabled: value?.enabled === true,
  assistantVisible: value?.assistantVisible !== false,
  apiKey: String(value?.apiKey ?? ''),
  model: String(value?.model ?? 'gpt-5.4-nano'),
  avatarName: String(value?.avatarName ?? DEFAULT_ASSISTANT_AVATAR.name),
  avatarImage: String(value?.avatarImage ?? DEFAULT_ASSISTANT_AVATAR.image),
  avatarUpdatedAt: String(value?.avatarUpdatedAt ?? ''),
  memoryNotes: String(value?.memoryNotes ?? ''),
  memorySections: {
    patients: String(value?.memorySections?.patients ?? ''),
    drivers: String(value?.memorySections?.drivers ?? ''),
    rules: String(value?.memorySections?.rules ?? ''),
    phones: String(value?.memorySections?.phones ?? '')
  },
  notes: String(value?.notes ?? ''),
  connectionStatus: String(value?.connectionStatus ?? 'Not configured'),
  lastValidatedAt: String(value?.lastValidatedAt ?? '')
});

const normalizeBrandingState = value => normalizeBrandingSettings(value);

const normalizeSmsOptOutEntry = value => ({
  id: String(value?.id ?? `${String(value?.phone ?? '').replace(/\D/g, '') || String(value?.name ?? '').trim().toLowerCase().replace(/\s+/g, '-')}`),
  name: String(value?.name ?? ''),
  phone: String(value?.phone ?? ''),
  reason: String(value?.reason ?? ''),
  createdAt: String(value?.createdAt ?? '')
});

const normalizeSmsOfficeRecipientEntry = value => ({
  id: String(value?.id ?? `${String(value?.phone ?? '').replace(/\D/g, '') || String(value?.name ?? '').trim().toLowerCase().replace(/\s+/g, '-')}`),
  name: String(value?.name ?? ''),
  phone: String(value?.phone ?? ''),
  notes: String(value?.notes ?? ''),
  enabled: value?.enabled !== false,
  createdAt: String(value?.createdAt ?? '')
});

const normalizeArrivalNotificationsState = value => ({
  patientEnabled: value?.patientEnabled !== false,
  officeEnabled: value?.officeEnabled !== false,
  patientTemplate: String(value?.patientTemplate ?? DEFAULT_STATE.sms.arrivalNotifications.patientTemplate),
  officeTemplate: String(value?.officeTemplate ?? DEFAULT_STATE.sms.arrivalNotifications.officeTemplate),
  officeRecipients: Array.isArray(value?.officeRecipients) ? value.officeRecipients.map(normalizeSmsOfficeRecipientEntry).filter(entry => entry.name || entry.phone) : []
});

const normalizeSmsState = value => ({
  activeProvider: String(value?.activeProvider ?? 'disabled'),
  defaultCountryCode: String(value?.defaultCountryCode ?? '1'),
  confirmationTemplate: String(value?.confirmationTemplate ?? DEFAULT_STATE.sms.confirmationTemplate),
  arrivalNotifications: normalizeArrivalNotificationsState(value?.arrivalNotifications),
  groupTemplates: {
    AL: String(value?.groupTemplates?.AL ?? ''),
    BL: String(value?.groupTemplates?.BL ?? ''),
    CL: String(value?.groupTemplates?.CL ?? ''),
    A: String(value?.groupTemplates?.A ?? ''),
    W: String(value?.groupTemplates?.W ?? ''),
    STR: String(value?.groupTemplates?.STR ?? '')
  },
  webhookBaseUrl: String(value?.webhookBaseUrl ?? ''),
  notes: String(value?.notes ?? ''),
  lastValidatedAt: String(value?.lastValidatedAt ?? ''),
  lastInboundAt: String(value?.lastInboundAt ?? ''),
  optOutList: Array.isArray(value?.optOutList) ? value.optOutList.map(normalizeSmsOptOutEntry).filter(entry => entry.name || entry.phone) : [],
  twilio: normalizeTwilioSmsState(value?.twilio),
  telnyx: normalizeTelnyxSmsState(value?.telnyx),
  ringcentral: normalizeRingCentralSmsState(value?.ringcentral),
  mock: normalizeMockSmsState(value?.mock)
});

const normalizeState = value => ({
  version: 1,
  uber: normalizeUberState(value?.uber),
  ai: normalizeAiState(value?.ai),
  branding: normalizeBrandingState(value?.branding),
  sms: normalizeSmsState(value?.sms)
});

const readLocalIntegrationsState = async () => {
  try {
    const raw = await readFile(getIntegrationsStorageFile(), 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(DEFAULT_STATE);
  }
};

const writeLocalIntegrationsState = async state => {
  await writeJsonFileWithSnapshots({
    filePath: getIntegrationsStorageFile(),
    nextValue: state,
    backupName: 'integrations-state-local'
  });
  return state;
};

let ensureTablePromise = null;

const ensureTable = async () => {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for integrations storage in production');
  }
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS integrations_state (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      data JSONB NOT NULL DEFAULT '{}'
    )
  `);
  await query(
    `INSERT INTO integrations_state (id, data) VALUES ('singleton',$1) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_STATE)]
  );
  })().catch(error => {
    ensureTablePromise = null;
    throw error;
  });

  return ensureTablePromise;
};

export const readIntegrationsState = async () => {
  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for integrations storage in production');
    }
    return readLocalIntegrationsState();
  }

  await ensureTable();
  const row = await queryOne(`SELECT data FROM integrations_state WHERE id = 'singleton'`);
  return normalizeState(row?.data || DEFAULT_STATE);
};

export const writeIntegrationsState = async (nextState, options = {}) => {
  const currentState = await readIntegrationsState();
  const normalized = normalizeState(nextState);
  const allowPatientDataShrink = options?.allowPatientDataShrink === true;

  const currentOptOutList = Array.isArray(currentState?.sms?.optOutList) ? currentState.sms.optOutList : [];
  const incomingOptOutList = Array.isArray(normalized?.sms?.optOutList) ? normalized.sms.optOutList : [];
  const mergedOptOutMap = new Map();

  currentOptOutList.forEach(entry => {
    const key = String(entry?.id || `${String(entry?.phone || '').trim().replace(/\D/g, '')}-${String(entry?.name || '').trim().toLowerCase()}`);
    mergedOptOutMap.set(key, entry);
  });

  incomingOptOutList.forEach(entry => {
    const key = String(entry?.id || `${String(entry?.phone || '').trim().replace(/\D/g, '')}-${String(entry?.name || '').trim().toLowerCase()}`);
    mergedOptOutMap.set(key, {
      ...mergedOptOutMap.get(key),
      ...entry
    });
  });

  const currentPatientsMemory = String(currentState?.ai?.memorySections?.patients || '').trim();
  const nextPatientsMemory = String(normalized?.ai?.memorySections?.patients || '').trim();
  const protectedOptOutList = allowPatientDataShrink ? incomingOptOutList : Array.from(mergedOptOutMap.values()).filter(entry => entry.name || entry.phone);
  const protectedPatientsMemory = allowPatientDataShrink ? nextPatientsMemory : nextPatientsMemory || currentPatientsMemory;

  const protectedState = {
    ...normalized,
    ai: {
      ...normalized.ai,
      memorySections: {
        ...normalized.ai.memorySections,
        patients: protectedPatientsMemory
      }
    },
    sms: {
      ...normalized.sms,
      optOutList: protectedOptOutList
    }
  };

  if (!hasDatabaseUrl()) {
    if (!shouldUseLocalFallback()) {
      throw new Error('DATABASE_URL is required for integrations storage in production');
    }
    await writeLocalIntegrationsState(protectedState);
    return protectedState;
  }

  await ensureTable();

  await query(
    `UPDATE integrations_state SET data=$1 WHERE id='singleton'`,
    [JSON.stringify(protectedState)]
  );
  return protectedState;
};