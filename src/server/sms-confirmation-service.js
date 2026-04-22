import { readIntegrationsState, writeIntegrationsState } from '@/server/integrations-store';
import { readBlacklistState } from '@/server/blacklist-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import { logSmsDelivery } from '@/server/sms-delivery-log-store';

const PROVIDER_PORTALS = {
  twilio: 'https://console.twilio.com/',
  telnyx: 'https://portal.telnyx.com/',
  ringcentral: 'https://developers.ringcentral.com/',
  mock: ''
};

const ACTION_MAP = {
  '1': {
    status: 'Confirmed',
    safeRideStatus: 'Confirmed',
    replyMessage: 'Trip confirmed by SMS.'
  },
  '2': {
    status: 'Cancelled',
    safeRideStatus: 'Cancelled by SMS',
    replyMessage: 'Trip cancelled by SMS.'
  },
  '3': {
    status: 'Needs Call',
    safeRideStatus: 'Needs Call',
    replyMessage: 'Patient requested a call.'
  },
  CONFIRM: {
    status: 'Confirmed',
    safeRideStatus: 'Confirmed',
    replyMessage: 'Trip confirmed by SMS.'
  },
  CANCEL: {
    status: 'Cancelled',
    safeRideStatus: 'Cancelled by SMS',
    replyMessage: 'Trip cancelled by SMS.'
  },
  CALL: {
    status: 'Needs Call',
    safeRideStatus: 'Needs Call',
    replyMessage: 'Patient requested a call.'
  }
};

const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);
const OPT_IN_KEYWORDS = new Set(['YES', 'Y', 'START', 'UNSTOP', 'SUBSCRIBE']);

export const SMS_PROVIDER_PORTALS = PROVIDER_PORTALS;
const normalizePhoneNumber = (value, defaultCountryCode = '1') => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
};
export const normalizeSmsPhoneNumber = normalizePhoneNumber;

const normalizePersonName = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const findConsentEntryForTrip = ({ trip, consentList, defaultCountryCode = '1' }) => {
  const normalizedTripPhone = normalizePhoneNumber(trip?.patientPhoneNumber, defaultCountryCode);
  const normalizedRider = normalizePersonName(trip?.rider);

  return (Array.isArray(consentList) ? consentList : []).find(entry => {
    const entryPhone = normalizePhoneNumber(entry?.phone, defaultCountryCode);
    const entryName = normalizePersonName(entry?.name);
    if (entryPhone && normalizedTripPhone && entryPhone === normalizedTripPhone) return true;
    if (entryName && normalizedRider && entryName === normalizedRider) return true;
    return false;
  }) || null;
};

const buildConfirmationCode = () => `${Date.now().toString(36).slice(-3)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

const renderConfirmationTemplate = (template, trip, code) => {
  const tokens = {
    rider: trip?.rider || 'patient',
    tripId: trip?.id || '',
    driver: trip?.driverName || trip?.driver || 'your driver',
    pickup: trip?.pickup || '',
    dropoff: trip?.dropoff || '',
    pickupAddress: trip?.address || '',
    dropoffAddress: trip?.destination || '',
    patientPhone: trip?.patientPhoneNumber || '',
    actualPickup: trip?.actualPickup || '',
    miles: trip?.miles || '',
    code
  };

  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (_, token) => String(tokens[token] ?? ''));
};

const SMS_OUTPUT_COLUMN_OPTIONS = [
  'tripId',
  'rider',
  'phone',
  'pickupTime',
  'pickupAddress',
  'puZip',
  'dropoffAddress',
  'doZip',
  'miles',
  'leg',
  'type',
  'doNotConfirm',
  'hospitalRehab',
  'confirmation',
  'dispatchStatus',
  'reply',
  'sent',
  'responded',
  'internalNotes'
];

const normalizeSelectedColumns = selectedColumns => {
  const allowed = new Set(SMS_OUTPUT_COLUMN_OPTIONS);
  return Array.from(new Set((Array.isArray(selectedColumns) ? selectedColumns : []).filter(key => allowed.has(String(key)))));
};

const getSmsColumnValue = (trip, columnKey) => {
  const confirmation = trip?.confirmation || {};
  switch (columnKey) {
    case 'tripId':
      return trip?.id || '-';
    case 'rider':
      return trip?.rider || '-';
    case 'phone':
      return trip?.patientPhoneNumber || '-';
    case 'pickupTime':
      return trip?.pickup || trip?.scheduledPickup || '-';
    case 'pickupAddress':
      return trip?.address || '-';
    case 'puZip':
      return trip?.pickupZip || trip?.puZip || '-';
    case 'dropoffAddress':
      return trip?.destination || '-';
    case 'doZip':
      return trip?.dropoffZip || trip?.doZip || '-';
    case 'miles':
      return trip?.miles || '-';
    case 'leg':
      return trip?.legLabel || '-';
    case 'type':
      return trip?.tripType || '-';
    case 'doNotConfirm':
      return trip?.doNotConfirm ? 'Blocked' : 'Allowed';
    case 'hospitalRehab':
      return trip?.hospitalStatus?.type ? `${trip.hospitalStatus.type}${trip.hospitalStatus.endDate ? ` (${trip.hospitalStatus.endDate})` : ''}` : '-';
    case 'confirmation':
      return confirmation?.status || '-';
    case 'dispatchStatus':
      return trip?.status || '-';
    case 'reply':
      return confirmation?.lastResponseText || '-';
    case 'sent':
      return confirmation?.sentAt || '-';
    case 'responded':
      return confirmation?.respondedAt || '-';
    case 'internalNotes':
      return trip?.notes || '-';
    default:
      return '-';
  }
};

const buildSelectedColumnsLine = (trip, selectedColumns) => {
  const normalized = normalizeSelectedColumns(selectedColumns);
  if (normalized.length === 0) return '';
  const line = normalized
    .map(columnKey => `${columnKey}: ${String(getSmsColumnValue(trip, columnKey) || '-').replace(/\s+/g, ' ').trim()}`)
    .join(' | ');
  return line.length > 420 ? `${line.slice(0, 417)}...` : line;
};

const parseErrorMessage = async response => {
  const fallback = `SMS provider request failed with status ${response.status}.`;
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.message || payload?.errors?.[0]?.detail || fallback;
  } catch {
    try {
      const text = await response.text();
      return text || fallback;
    } catch {
      return fallback;
    }
  }
};

const sendThroughTwilio = async ({ settings, to, body }) => {
  const params = new URLSearchParams({
    To: `+${to}`,
    Body: body
  });
  if (settings.messagingServiceSid) {
    params.set('MessagingServiceSid', settings.messagingServiceSid);
  } else {
    params.set('From', settings.fromNumber);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${settings.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString(),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const payload = await response.json();
  return {
    messageId: payload.sid,
    providerStatus: payload.status || 'queued'
  };
};

const sendThroughTelnyx = async ({ settings, to, body }) => {
  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: settings.fromNumber,
      to: `+${to}`,
      text: body,
      messaging_profile_id: settings.messagingProfileId || undefined
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const payload = await response.json();
  return {
    messageId: payload?.data?.id || '',
    providerStatus: payload?.data?.to?.[0]?.status || 'queued'
  };
};

const sendThroughRingCentral = async ({ settings, to, body }) => {
  const baseUrl = settings.serverUrl || 'https://platform.ringcentral.com';
  const extension = settings.extension || '~';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/restapi/v1.0/account/~/extension/${extension}/sms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: {
        phoneNumber: settings.fromNumber
      },
      to: [{
        phoneNumber: `+${to}`
      }],
      text: body
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const payload = await response.json();
  return {
    messageId: payload?.id || '',
    providerStatus: payload?.messageStatus || 'queued'
  };
};

const sendThroughMock = async () => ({
  messageId: `mock-${Date.now()}`,
  providerStatus: 'queued'
});

const getProviderSettings = smsState => {
  const provider = smsState?.activeProvider || 'disabled';
  if (provider === 'disabled') throw new Error('SMS provider is disabled. Select a provider in Integrations > SMS.');
  if (provider === 'twilio') return {
    provider,
    settings: smsState.twilio,
    valid: Boolean(smsState.twilio.accountSid && smsState.twilio.authToken && (smsState.twilio.messagingServiceSid || smsState.twilio.fromNumber))
  };
  if (provider === 'telnyx') return {
    provider,
    settings: smsState.telnyx,
    valid: Boolean(smsState.telnyx.apiKey && smsState.telnyx.fromNumber)
  };
  if (provider === 'ringcentral') return {
    provider,
    settings: smsState.ringcentral,
    valid: Boolean(smsState.ringcentral.accessToken && smsState.ringcentral.fromNumber && smsState.ringcentral.serverUrl)
  };
  if (provider === 'mock') return {
    provider,
    settings: smsState.mock,
    valid: true
  };
  throw new Error(`Unsupported SMS provider: ${provider}`);
};

const sendThroughProvider = async ({ provider, settings, to, body }) => {
  if (provider === 'twilio') return sendThroughTwilio({ settings, to, body });
  if (provider === 'telnyx') return sendThroughTelnyx({ settings, to, body });
  if (provider === 'ringcentral') return sendThroughRingCentral({ settings, to, body });
  if (provider === 'mock') return sendThroughMock();
  throw new Error(`Unsupported SMS provider: ${provider}`);
};

const extractReplyAction = messageText => {
  const normalized = String(messageText || '').trim().toUpperCase();
  if (!normalized) return null;
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return tokens.map(token => ACTION_MAP[token]).find(Boolean) ?? null;
};

const extractOptOutKeyword = messageText => {
  const normalized = String(messageText || '').trim().toUpperCase();
  if (!normalized) return '';
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return tokens.find(token => OPT_OUT_KEYWORDS.has(token)) || '';
};

const extractOptInKeyword = messageText => {
  const normalized = String(messageText || '').trim().toUpperCase();
  if (!normalized) return '';
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return tokens.find(token => OPT_IN_KEYWORDS.has(token)) || '';
};

const extractReplyCode = messageText => {
  const normalized = String(messageText || '').trim().toUpperCase();
  const tokens = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  return tokens.find(token => /^[A-Z0-9]{6}$/.test(token)) || '';
};

const removeTripFromRoutes = (routePlans, tripId) => (Array.isArray(routePlans) ? routePlans : []).map(routePlan => ({
  ...routePlan,
  tripIds: Array.isArray(routePlan.tripIds) ? routePlan.tripIds.filter(id => id !== tripId) : []
})).filter(routePlan => routePlan.tripIds.length > 0);

export const sendTripArrivalNotifications = async ({ trip, driverName = '' }) => {
  const integrationsState = await readIntegrationsState();
  const smsState = integrationsState.sms;
  const arrivalNotifications = smsState?.arrivalNotifications || {};

  let providerState;
  try {
    providerState = getProviderSettings(smsState);
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: error.message || 'SMS provider is disabled.',
      results: []
    };
  }

  if (!providerState.valid) {
    return {
      ok: false,
      skipped: true,
      reason: `The active SMS provider (${providerState.provider}) is missing required credentials.`,
      results: []
    };
  }

  const normalizedTrip = {
    ...trip,
    driverName: String(driverName || trip?.driverName || trip?.driver || '').trim() || 'your driver'
  };
  const results = [];

  if (arrivalNotifications.patientEnabled !== false) {
    const normalizedPhone = normalizePhoneNumber(normalizedTrip.patientPhoneNumber, smsState.defaultCountryCode);
    if (normalizedPhone) {
      try {
        const providerResult = await sendThroughProvider({
          provider: providerState.provider,
          settings: providerState.settings,
          to: normalizedPhone,
          body: renderConfirmationTemplate(arrivalNotifications.patientTemplate, normalizedTrip, '')
        });
        await logSmsDelivery({
          tripId: normalizedTrip.id,
          driverId: normalizedTrip.driverId || null,
          audience: 'patient',
          eventType: 'arrival-patient',
          provider: providerState.provider,
          recipientPhone: normalizedPhone,
          recipientName: normalizedTrip.rider || 'patient',
          messageBody: renderConfirmationTemplate(arrivalNotifications.patientTemplate, normalizedTrip, ''),
          messageId: providerResult.messageId,
          providerStatus: providerResult.providerStatus,
          status: 'sent'
        });
        results.push({ audience: 'patient', phone: normalizedPhone, ok: true, messageId: providerResult.messageId, status: providerResult.providerStatus });
      } catch (error) {
        await logSmsDelivery({
          tripId: normalizedTrip.id,
          driverId: normalizedTrip.driverId || null,
          audience: 'patient',
          eventType: 'arrival-patient',
          provider: providerState.provider,
          recipientPhone: normalizedPhone,
          recipientName: normalizedTrip.rider || 'patient',
          messageBody: renderConfirmationTemplate(arrivalNotifications.patientTemplate, normalizedTrip, ''),
          status: 'failed',
          error: error.message || 'Unable to send patient arrival SMS.'
        });
        results.push({ audience: 'patient', phone: normalizedPhone, ok: false, error: error.message || 'Unable to send patient arrival SMS.' });
      }
    } else {
      await logSmsDelivery({
        tripId: normalizedTrip.id,
        driverId: normalizedTrip.driverId || null,
        audience: 'patient',
        eventType: 'arrival-patient',
        provider: providerState.provider,
        recipientPhone: '',
        recipientName: normalizedTrip.rider || 'patient',
        messageBody: renderConfirmationTemplate(arrivalNotifications.patientTemplate, normalizedTrip, ''),
        status: 'skipped',
        error: 'Missing patient phone number.'
      });
      results.push({ audience: 'patient', phone: '', ok: false, error: 'Missing patient phone number.' });
    }
  }

  if (arrivalNotifications.officeEnabled !== false) {
    const officeRecipients = (Array.isArray(arrivalNotifications.officeRecipients) ? arrivalNotifications.officeRecipients : []).filter(entry => entry?.enabled !== false && String(entry?.phone || '').trim());
    for (const officeRecipient of officeRecipients) {
      const normalizedOfficePhone = normalizePhoneNumber(officeRecipient.phone, smsState.defaultCountryCode);
      if (!normalizedOfficePhone) {
        results.push({ audience: 'office', recipientId: officeRecipient.id, phone: '', ok: false, error: 'Invalid office phone number.' });
        continue;
      }

      try {
        const providerResult = await sendThroughProvider({
          provider: providerState.provider,
          settings: providerState.settings,
          to: normalizedOfficePhone,
          body: renderConfirmationTemplate(arrivalNotifications.officeTemplate, normalizedTrip, '')
        });
        await logSmsDelivery({
          tripId: normalizedTrip.id,
          driverId: normalizedTrip.driverId || null,
          audience: 'office',
          eventType: 'arrival-office',
          provider: providerState.provider,
          recipientPhone: normalizedOfficePhone,
          recipientName: officeRecipient.name || 'office',
          messageBody: renderConfirmationTemplate(arrivalNotifications.officeTemplate, normalizedTrip, ''),
          messageId: providerResult.messageId,
          providerStatus: providerResult.providerStatus,
          status: 'sent',
          metadata: {
            recipientId: officeRecipient.id,
            notes: officeRecipient.notes || ''
          }
        });
        results.push({ audience: 'office', recipientId: officeRecipient.id, phone: normalizedOfficePhone, ok: true, messageId: providerResult.messageId, status: providerResult.providerStatus });
      } catch (error) {
        await logSmsDelivery({
          tripId: normalizedTrip.id,
          driverId: normalizedTrip.driverId || null,
          audience: 'office',
          eventType: 'arrival-office',
          provider: providerState.provider,
          recipientPhone: normalizedOfficePhone,
          recipientName: officeRecipient.name || 'office',
          messageBody: renderConfirmationTemplate(arrivalNotifications.officeTemplate, normalizedTrip, ''),
          status: 'failed',
          error: error.message || 'Unable to send office arrival SMS.',
          metadata: {
            recipientId: officeRecipient.id,
            notes: officeRecipient.notes || ''
          }
        });
        results.push({ audience: 'office', recipientId: officeRecipient.id, phone: normalizedOfficePhone, ok: false, error: error.message || 'Unable to send office arrival SMS.' });
      }
    }
  }

  return {
    ok: results.some(result => result.ok),
    skipped: results.length === 0,
    provider: providerState.provider,
    results
  };
};

export const sendTripConfirmationRequests = async ({ tripIds, selectedColumns = [] }) => {
  const uniqueTripIds = Array.from(new Set((Array.isArray(tripIds) ? tripIds : []).filter(Boolean)));
  if (uniqueTripIds.length === 0) throw new Error('Select at least one trip before sending confirmation SMS.');

  const integrationsState = await readIntegrationsState();
  const dispatchState = await readNemtDispatchState();
  const blacklistState = await readBlacklistState();
  const smsState = integrationsState.sms;
  const providerState = getProviderSettings(smsState);
  if (!providerState.valid) throw new Error(`The active SMS provider (${providerState.provider}) is missing required credentials.`);

  const updatedTrips = [...dispatchState.trips];
  const results = [];
  const nextConsentList = Array.isArray(smsState?.consentList) ? [...smsState.consentList] : [];
  let consentListChanged = false;

  for (const tripId of uniqueTripIds) {
    const tripIndex = updatedTrips.findIndex(trip => trip.id === tripId);
    if (tripIndex === -1) {
      results.push({ tripId, ok: false, error: 'Trip not found.' });
      continue;
    }

    const trip = updatedTrips[tripIndex];
    const blockingState = getTripBlockingState({
      trip,
      optOutList: smsState?.optOutList,
      blacklistEntries: blacklistState?.entries,
      defaultCountryCode: smsState?.defaultCountryCode
    });
    if (blockingState.isBlocked) {
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'confirmation',
        provider: providerState.provider,
        recipientPhone: trip?.patientPhoneNumber || '',
        recipientName: trip?.rider || 'patient',
        messageBody: '',
        status: 'skipped',
        error: blockingState.reason || 'Trip is on the do-not-confirm list.'
      });
      updatedTrips[tripIndex] = {
        ...trip,
        safeRideStatus: 'Do Not Confirm',
        confirmation: {
          ...trip.confirmation,
          status: 'Opted Out',
          provider: '',
          lastError: blockingState.reason || 'Skipped because this patient is on the do-not-confirm list.'
        }
      };
      results.push({ tripId, ok: false, skipped: true, error: blockingState.reason || 'Trip is on the do-not-confirm list.' });
      continue;
    }

    const normalizedPhone = normalizePhoneNumber(trip.patientPhoneNumber, smsState.defaultCountryCode);
    if (!normalizedPhone) {
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'confirmation',
        provider: providerState.provider,
        recipientPhone: '',
        recipientName: trip?.rider || 'patient',
        messageBody: '',
        status: 'failed',
        error: 'Trip is missing a valid patient phone number.'
      });
      updatedTrips[tripIndex] = {
        ...trip,
        safeRideStatus: 'Needs Call',
        confirmation: {
          ...trip.confirmation,
          status: 'Needs Call',
          provider: providerState.provider,
          lastError: 'Missing patient phone number.'
        }
      };
      results.push({ tripId, ok: false, error: 'Trip is missing a valid patient phone number.' });
      continue;
    }

    const consentEntry = findConsentEntryForTrip({
      trip,
      consentList: nextConsentList,
      defaultCountryCode: smsState.defaultCountryCode
    });

    if (!consentEntry || consentEntry.status !== 'granted') {
      if (consentEntry?.status === 'pending') {
        updatedTrips[tripIndex] = {
          ...trip,
          safeRideStatus: 'Needs Consent',
          confirmation: {
            ...trip.confirmation,
            status: 'Awaiting Consent',
            provider: providerState.provider,
            lastPhone: normalizedPhone,
            lastError: ''
          }
        };
        results.push({ tripId, ok: false, skipped: true, awaitingConsent: true, error: 'Patient SMS consent is still pending.' });
        continue;
      }

      const requestedAt = new Date().toISOString();
      const consentMessage = renderConfirmationTemplate(smsState.consentRequestTemplate, trip, '');

      try {
        const providerResult = await sendThroughProvider({
          provider: providerState.provider,
          settings: providerState.settings,
          to: normalizedPhone,
          body: consentMessage
        });

        const nextConsentEntry = {
          id: consentEntry?.id || `${normalizedPhone}-${Date.now()}`,
          name: trip?.rider || consentEntry?.name || '',
          phone: normalizedPhone,
          status: 'pending',
          source: 'sms-consent-request',
          lastKeyword: '',
          createdAt: consentEntry?.createdAt || requestedAt,
          updatedAt: requestedAt,
          consentedAt: consentEntry?.consentedAt || '',
          revokedAt: ''
        };

        const existingConsentIndex = nextConsentList.findIndex(entry => entry.id === nextConsentEntry.id || normalizePhoneNumber(entry?.phone, smsState.defaultCountryCode) === normalizedPhone);
        if (existingConsentIndex >= 0) nextConsentList[existingConsentIndex] = { ...nextConsentList[existingConsentIndex], ...nextConsentEntry };
        else nextConsentList.unshift(nextConsentEntry);
        consentListChanged = true;

        updatedTrips[tripIndex] = {
          ...trip,
          safeRideStatus: 'Needs Consent',
          confirmation: {
            ...trip.confirmation,
            status: 'Awaiting Consent',
            provider: providerState.provider,
            requestId: `consent-${Date.now()}-${tripIndex + 1}`,
            sentAt: requestedAt,
            respondedAt: '',
            lastMessageId: providerResult.messageId,
            lastResponseText: '',
            lastResponseCode: '',
            lastPhone: normalizedPhone,
            lastError: '',
            lastConsentRequestedAt: requestedAt
          }
        };

        await logSmsDelivery({
          tripId,
          driverId: trip?.driverId || null,
          audience: 'patient',
          eventType: 'consent-request',
          provider: providerState.provider,
          recipientPhone: normalizedPhone,
          recipientName: trip?.rider || 'patient',
          messageBody: consentMessage,
          messageId: providerResult.messageId,
          providerStatus: providerResult.providerStatus,
          status: 'sent'
        });

        results.push({ tripId, ok: true, consentRequested: true, provider: providerState.provider, messageId: providerResult.messageId, status: providerResult.providerStatus });
      } catch (error) {
        updatedTrips[tripIndex] = {
          ...trip,
          safeRideStatus: 'Needs Consent',
          confirmation: {
            ...trip.confirmation,
            status: 'Awaiting Consent',
            provider: providerState.provider,
            lastPhone: normalizedPhone,
            lastError: error.message || 'Unable to send SMS consent request.'
          }
        };

        await logSmsDelivery({
          tripId,
          driverId: trip?.driverId || null,
          audience: 'patient',
          eventType: 'consent-request',
          provider: providerState.provider,
          recipientPhone: normalizedPhone,
          recipientName: trip?.rider || 'patient',
          messageBody: consentMessage,
          status: 'failed',
          error: error.message || 'Unable to send SMS consent request.'
        });

        results.push({ tripId, ok: false, error: error.message || 'Unable to send SMS consent request.' });
      }
      continue;
    }

    const requestId = `sms-${Date.now()}-${tripIndex + 1}`;
    const code = buildConfirmationCode();
    const baseMessage = renderConfirmationTemplate(smsState.confirmationTemplate, trip, code);
    const selectedColumnsLine = buildSelectedColumnsLine(trip, selectedColumns);
    const message = selectedColumnsLine ? `${baseMessage}\n\nTrip: ${selectedColumnsLine}` : baseMessage;

    try {
      const providerResult = await sendThroughProvider({
        provider: providerState.provider,
        settings: providerState.settings,
        to: normalizedPhone,
        body: message
      });

      updatedTrips[tripIndex] = {
        ...trip,
        safeRideStatus: 'Confirmation SMS sent',
        confirmation: {
          ...trip.confirmation,
          status: 'Pending',
          provider: providerState.provider,
          requestId,
          code,
          sentAt: new Date().toISOString(),
          respondedAt: '',
          lastMessageId: providerResult.messageId,
          lastResponseText: '',
          lastResponseCode: '',
          lastPhone: normalizedPhone,
          lastError: ''
        }
      };
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'confirmation',
        provider: providerState.provider,
        recipientPhone: normalizedPhone,
        recipientName: trip?.rider || 'patient',
        messageBody: message,
        messageId: providerResult.messageId,
        providerStatus: providerResult.providerStatus,
        status: 'sent',
        metadata: { code, requestId }
      });
      results.push({
        tripId,
        ok: true,
        provider: providerState.provider,
        messageId: providerResult.messageId,
        status: providerResult.providerStatus,
        code
      });
    } catch (error) {
      updatedTrips[tripIndex] = {
        ...trip,
        safeRideStatus: 'Needs Call',
        confirmation: {
          ...trip.confirmation,
          status: 'Needs Call',
          provider: providerState.provider,
          requestId,
          code,
          lastPhone: normalizedPhone,
          lastError: error.message || 'Unable to send SMS confirmation.'
        }
      };
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'confirmation',
        provider: providerState.provider,
        recipientPhone: normalizedPhone,
        recipientName: trip?.rider || 'patient',
        messageBody: message,
        status: 'failed',
        error: error.message || 'Unable to send SMS confirmation.',
        metadata: { code, requestId }
      });
      results.push({ tripId, ok: false, error: error.message || 'Unable to send SMS confirmation.' });
    }
  }

  if (consentListChanged) {
    await writeIntegrationsState({
      ...integrationsState,
      sms: {
        ...integrationsState.sms,
        consentList: nextConsentList
      }
    });
  }

  await writeNemtDispatchState({
    ...dispatchState,
    trips: updatedTrips
  });

  return {
    consentRequestedCount: results.filter(item => item.consentRequested).length,
    sentCount: results.filter(item => item.ok).length,
    failedCount: results.filter(item => !item.ok).length,
    skippedCount: results.filter(item => item.skipped).length,
    results
  };
};

export const sendCustomSmsRequests = async ({ tripIds, message }) => {
  const uniqueTripIds = Array.from(new Set((Array.isArray(tripIds) ? tripIds : []).filter(Boolean)));
  if (uniqueTripIds.length === 0) throw new Error('Select at least one trip before sending a custom SMS.');
  if (!String(message || '').trim()) throw new Error('Custom SMS message cannot be empty.');

  const integrationsState = await readIntegrationsState();
  const dispatchState = await readNemtDispatchState();
  const smsState = integrationsState.sms;
  const providerState = getProviderSettings(smsState);
  if (!providerState.valid) throw new Error(`The active SMS provider (${providerState.provider}) is missing required credentials.`);

  const updatedTrips = [...dispatchState.trips];
  const results = [];

  for (const tripId of uniqueTripIds) {
    const tripIndex = updatedTrips.findIndex(trip => trip.id === tripId);
    if (tripIndex === -1) {
      results.push({ tripId, ok: false, error: 'Trip not found.' });
      continue;
    }

    const trip = updatedTrips[tripIndex];
    const normalizedPhone = normalizePhoneNumber(trip.patientPhoneNumber, smsState.defaultCountryCode);
    if (!normalizedPhone) {
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'custom',
        provider: providerState.provider,
        recipientPhone: '',
        recipientName: trip?.rider || 'patient',
        messageBody: String(message).trim(),
        status: 'failed',
        error: 'Trip is missing a valid patient phone number.'
      });
      results.push({ tripId, ok: false, error: 'Trip is missing a valid patient phone number.' });
      continue;
    }

    try {
      const providerResult = await sendThroughProvider({
        provider: providerState.provider,
        settings: providerState.settings,
        to: normalizedPhone,
        body: String(message).trim()
      });
      updatedTrips[tripIndex] = {
        ...trip,
        safeRideStatus: trip.safeRideStatus || 'Custom SMS sent',
        confirmation: {
          ...trip.confirmation,
          provider: providerState.provider,
          lastMessageId: providerResult.messageId,
          lastPhone: normalizedPhone,
          lastError: '',
          lastCustomMessageAt: new Date().toISOString(),
          lastCustomMessageText: String(message).trim()
        }
      };
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'custom',
        provider: providerState.provider,
        recipientPhone: normalizedPhone,
        recipientName: trip?.rider || 'patient',
        messageBody: String(message).trim(),
        messageId: providerResult.messageId,
        providerStatus: providerResult.providerStatus,
        status: 'sent'
      });
      results.push({ tripId, ok: true, messageId: providerResult.messageId, status: providerResult.providerStatus });
    } catch (error) {
      updatedTrips[tripIndex] = {
        ...trip,
        confirmation: {
          ...trip.confirmation,
          lastPhone: normalizedPhone,
          lastError: error.message || 'Unable to send custom SMS.'
        }
      };
      await logSmsDelivery({
        tripId,
        driverId: trip?.driverId || null,
        audience: 'patient',
        eventType: 'custom',
        provider: providerState.provider,
        recipientPhone: normalizedPhone,
        recipientName: trip?.rider || 'patient',
        messageBody: String(message).trim(),
        status: 'failed',
        error: error.message || 'Unable to send custom SMS.'
      });
      results.push({ tripId, ok: false, error: error.message || 'Unable to send custom SMS.' });
    }
  }

  await writeNemtDispatchState({
    ...dispatchState,
    trips: updatedTrips
  });

  return {
    sentCount: results.filter(item => item.ok).length,
    failedCount: results.filter(item => !item.ok).length,
    results
  };
};

export const sendTestSmsRequest = async ({ to, message }) => {
  if (!String(to || '').trim()) throw new Error('Enter a phone number before sending a test SMS.');
  if (!String(message || '').trim()) throw new Error('Enter a test message before sending.');

  const integrationsState = await readIntegrationsState();
  const smsState = integrationsState.sms;
  const providerState = getProviderSettings(smsState);
  if (!providerState.valid) throw new Error(`The active SMS provider (${providerState.provider}) is missing required credentials.`);

  const normalizedPhone = normalizePhoneNumber(to, smsState.defaultCountryCode);
  if (!normalizedPhone) throw new Error('Enter a valid phone number before sending a test SMS.');

  const providerResult = await sendThroughProvider({
    provider: providerState.provider,
    settings: providerState.settings,
    to: normalizedPhone,
    body: String(message).trim()
  });

  return {
    ok: true,
    provider: providerState.provider,
    to: normalizedPhone,
    messageId: providerResult.messageId,
    status: providerResult.providerStatus
  };
};

export const processInboundConfirmationReply = async ({ provider, fromPhone, messageText, providerMessageId }) => {
  const optOutKeyword = extractOptOutKeyword(messageText);
  const optInKeyword = extractOptInKeyword(messageText);
  const integrationsState = await readIntegrationsState();
  const dispatchState = await readNemtDispatchState();
  const normalizedPhone = normalizePhoneNumber(fromPhone, integrationsState.sms.defaultCountryCode);

  if (optInKeyword && normalizedPhone) {
    const existingConsentList = Array.isArray(integrationsState?.sms?.consentList) ? integrationsState.sms.consentList : [];
    const existingOptOutList = Array.isArray(integrationsState?.sms?.optOutList) ? integrationsState.sms.optOutList : [];
    const respondedAt = new Date().toISOString();
    const matchingConsent = existingConsentList.find(entry => normalizePhoneNumber(entry?.phone, integrationsState.sms.defaultCountryCode) === normalizedPhone);

    const nextConsentEntry = {
      id: matchingConsent?.id || `${normalizedPhone}-${Date.now()}`,
      name: matchingConsent?.name || '',
      phone: normalizedPhone,
      status: 'granted',
      source: 'inbound-sms',
      lastKeyword: optInKeyword,
      createdAt: matchingConsent?.createdAt || respondedAt,
      updatedAt: respondedAt,
      consentedAt: respondedAt,
      revokedAt: ''
    };

    const nextConsentList = existingConsentList.filter(entry => normalizePhoneNumber(entry?.phone, integrationsState.sms.defaultCountryCode) !== normalizedPhone);
    nextConsentList.unshift(nextConsentEntry);
    const nextOptOutList = existingOptOutList.filter(entry => normalizePhoneNumber(entry?.phone, integrationsState.sms.defaultCountryCode) !== normalizedPhone);

    await writeIntegrationsState({
      ...integrationsState,
      sms: {
        ...integrationsState.sms,
        consentList: nextConsentList,
        optOutList: nextOptOutList
      }
    });

    const nextTrips = dispatchState.trips.map(trip => {
      const tripPhone = normalizePhoneNumber(trip?.patientPhoneNumber, integrationsState.sms.defaultCountryCode);
      const confirmationPhone = normalizePhoneNumber(trip?.confirmation?.lastPhone, integrationsState.sms.defaultCountryCode);
      if (tripPhone !== normalizedPhone && confirmationPhone !== normalizedPhone) return trip;
      return {
        ...trip,
        safeRideStatus: trip.safeRideStatus === 'Do Not Confirm' || trip.safeRideStatus === 'Needs Consent' ? 'Consent Granted' : trip.safeRideStatus,
        confirmation: {
          ...trip.confirmation,
          status: trip?.confirmation?.status === 'Awaiting Consent' || trip?.confirmation?.status === 'Opted Out' ? 'Consent Granted' : trip?.confirmation?.status,
          provider,
          respondedAt,
          lastMessageId: providerMessageId || trip.confirmation?.lastMessageId || '',
          lastResponseText: String(messageText || ''),
          lastResponseCode: optInKeyword,
          lastPhone: normalizedPhone,
          lastError: ''
        }
      };
    });

    await writeNemtDispatchState({
      ...dispatchState,
      trips: nextTrips
    });

    await logSmsDelivery({
      tripId: null,
      driverId: null,
      audience: 'patient',
      eventType: 'opt-in',
      provider,
      recipientPhone: normalizedPhone,
      recipientName: 'patient',
      messageBody: String(messageText || ''),
      messageId: providerMessageId,
      status: 'received',
      metadata: { keyword: optInKeyword }
    });

    return {
      updated: true,
      confirmationStatus: 'Consent Granted',
      safeRideStatus: 'Consent Granted',
      patientPhone: normalizedPhone,
      replyMessage: 'SMS consent received. Future trip confirmations can be sent by text.'
    };
  }

  if (optOutKeyword) {
    const existingOptOutList = Array.isArray(integrationsState?.sms?.optOutList) ? integrationsState.sms.optOutList : [];
    const existingConsentList = Array.isArray(integrationsState?.sms?.consentList) ? integrationsState.sms.consentList : [];
    const hasExistingEntry = existingOptOutList.some(entry => normalizePhoneNumber(entry?.phone, integrationsState.sms.defaultCountryCode) === normalizedPhone);
    const respondedAt = new Date().toISOString();

    const matchingConsent = existingConsentList.find(entry => normalizePhoneNumber(entry?.phone, integrationsState.sms.defaultCountryCode) === normalizedPhone);
    const nextConsentList = normalizedPhone ? [
      {
        id: matchingConsent?.id || `${normalizedPhone}-${Date.now()}`,
        name: matchingConsent?.name || '',
        phone: normalizedPhone,
        status: 'revoked',
        source: 'inbound-sms',
        lastKeyword: optOutKeyword,
        createdAt: matchingConsent?.createdAt || respondedAt,
        updatedAt: respondedAt,
        consentedAt: matchingConsent?.consentedAt || '',
        revokedAt: respondedAt
      },
      ...existingConsentList.filter(entry => normalizePhoneNumber(entry?.phone, integrationsState.sms.defaultCountryCode) !== normalizedPhone)
    ] : existingConsentList;

    const nextOptOutList = !hasExistingEntry && normalizedPhone ? [{
      id: `${normalizedPhone}-${Date.now()}`,
      name: '',
      phone: normalizedPhone,
      reason: `Inbound ${optOutKeyword} reply`,
      createdAt: respondedAt
    }, ...existingOptOutList] : existingOptOutList;

    await writeIntegrationsState({
      ...integrationsState,
      sms: {
        ...integrationsState.sms,
        consentList: nextConsentList,
        optOutList: nextOptOutList
      }
    });

    const nextTrips = dispatchState.trips.map(trip => {
      const tripPhone = normalizePhoneNumber(trip?.patientPhoneNumber, integrationsState.sms.defaultCountryCode);
      const confirmationPhone = normalizePhoneNumber(trip?.confirmation?.lastPhone, integrationsState.sms.defaultCountryCode);
      if (!normalizedPhone || (tripPhone !== normalizedPhone && confirmationPhone !== normalizedPhone)) return trip;
      return {
        ...trip,
        safeRideStatus: 'Do Not Confirm',
        confirmation: {
          ...trip.confirmation,
          status: 'Opted Out',
          provider,
          respondedAt,
          lastMessageId: providerMessageId || trip.confirmation?.lastMessageId || '',
          lastResponseText: String(messageText || ''),
          lastResponseCode: optOutKeyword,
          lastPhone: normalizedPhone,
          lastError: ''
        }
      };
    });

    await writeNemtDispatchState({
      ...dispatchState,
      trips: nextTrips
    });

    await logSmsDelivery({
      tripId: null,
      driverId: null,
      audience: 'patient',
      eventType: 'opt-out',
      provider,
      recipientPhone: normalizedPhone || String(fromPhone || ''),
      recipientName: 'patient',
      messageBody: String(messageText || ''),
      messageId: providerMessageId,
      status: 'received',
      metadata: { keyword: optOutKeyword }
    });

    return {
      updated: true,
      confirmationStatus: 'Opted Out',
      safeRideStatus: 'Do Not Confirm',
      patientPhone: normalizedPhone,
      replyMessage: ''
    };
  }

  const action = extractReplyAction(messageText);
  if (!action) {
    return {
      updated: false,
      reason: 'No confirmation action found in inbound message.'
    };
  }
  const code = extractReplyCode(messageText);
  const pendingTrips = dispatchState.trips.filter(trip => {
    const confirmation = trip.confirmation || {};
    return confirmation.status === 'Pending' && (!normalizedPhone || confirmation.lastPhone === normalizedPhone);
  });
  const matchedTrip = code ? dispatchState.trips.find(trip => trip.confirmation?.code === code) : pendingTrips.length === 1 ? pendingTrips[0] : null;

  if (!matchedTrip) {
    return {
      updated: false,
      reason: code ? `No trip matched confirmation code ${code}.` : 'Unable to match inbound SMS to a single pending trip.'
    };
  }

  const nextTrips = dispatchState.trips.map(trip => {
    if (trip.id !== matchedTrip.id) return trip;
    return {
      ...trip,
      driverId: action.status === 'Cancelled' ? null : trip.driverId,
      routeId: action.status === 'Cancelled' ? null : trip.routeId,
      status: action.status === 'Cancelled' ? 'Cancelled' : trip.status,
      safeRideStatus: action.safeRideStatus,
      confirmation: {
        ...trip.confirmation,
        status: action.status,
        provider,
        respondedAt: new Date().toISOString(),
        lastMessageId: providerMessageId || trip.confirmation?.lastMessageId || '',
        lastResponseText: String(messageText || ''),
        lastResponseCode: code,
        lastPhone: normalizedPhone || trip.confirmation?.lastPhone || '',
        lastError: ''
      }
    };
  });

  const nextRoutePlans = action.status === 'Cancelled' ? removeTripFromRoutes(dispatchState.routePlans, matchedTrip.id) : dispatchState.routePlans;

  await writeNemtDispatchState({
    ...dispatchState,
    routePlans: nextRoutePlans,
    trips: nextTrips
  });

  return {
    updated: true,
    tripId: matchedTrip.id,
    confirmationStatus: action.status,
    safeRideStatus: action.safeRideStatus,
    patientPhone: normalizedPhone,
    replyMessage: action.replyMessage
  };
};