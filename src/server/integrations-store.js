import { mkdir, readFile, writeFile } from 'fs/promises';
import { getStorageFilePath, getStorageRoot } from '@/server/storage-paths';

const STORAGE_DIR = getStorageRoot();
const STORAGE_FILE = getStorageFilePath('integrations.json');

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
  sms: {
    activeProvider: 'disabled',
    defaultCountryCode: '1',
    confirmationTemplate: 'Hello {{rider}}, this is Care Mobility about trip {{tripId}}. Reply 1 {{code}} to confirm, 2 {{code}} to cancel, or 3 {{code}} if you need a call.',
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

const normalizeSmsOptOutEntry = value => ({
  id: String(value?.id ?? `${String(value?.phone ?? '').replace(/\D/g, '') || String(value?.name ?? '').trim().toLowerCase().replace(/\s+/g, '-')}`),
  name: String(value?.name ?? ''),
  phone: String(value?.phone ?? ''),
  reason: String(value?.reason ?? ''),
  createdAt: String(value?.createdAt ?? '')
});

const normalizeSmsState = value => ({
  activeProvider: String(value?.activeProvider ?? 'disabled'),
  defaultCountryCode: String(value?.defaultCountryCode ?? '1'),
  confirmationTemplate: String(value?.confirmationTemplate ?? DEFAULT_STATE.sms.confirmationTemplate),
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
  sms: normalizeSmsState(value?.sms)
});

const ensureStorageFile = async () => {
  await mkdir(STORAGE_DIR, { recursive: true });
  try {
    await readFile(STORAGE_FILE, 'utf8');
  } catch {
    await writeFile(STORAGE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
  }
};

export const readIntegrationsState = async () => {
  await ensureStorageFile();
  const fileContents = await readFile(STORAGE_FILE, 'utf8');
  return normalizeState(JSON.parse(fileContents));
};

export const writeIntegrationsState = async nextState => {
  await ensureStorageFile();
  const normalized = normalizeState(nextState);
  await writeFile(STORAGE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
};