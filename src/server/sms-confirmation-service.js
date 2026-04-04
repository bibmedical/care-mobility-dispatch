import { readIntegrationsState } from '@/server/integrations-store';
import { readBlacklistState } from '@/server/blacklist-store';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { getTripBlockingState } from '@/helpers/trip-confirmation-blocking';

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

export const SMS_PROVIDER_PORTALS = PROVIDER_PORTALS;
export const normalizeSmsPhoneNumber = normalizePhoneNumber;

const normalizePhoneNumber = (value, defaultCountryCode = '1') => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
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
        results.push({ audience: 'patient', phone: normalizedPhone, ok: true, messageId: providerResult.messageId, status: providerResult.providerStatus });
      } catch (error) {
        results.push({ audience: 'patient', phone: normalizedPhone, ok: false, error: error.message || 'Unable to send patient arrival SMS.' });
      }
    } else {
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
        results.push({ audience: 'office', recipientId: officeRecipient.id, phone: normalizedOfficePhone, ok: true, messageId: providerResult.messageId, status: providerResult.providerStatus });
      } catch (error) {
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

export const sendTripConfirmationRequests = async ({ tripIds }) => {
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

    const requestId = `sms-${Date.now()}-${tripIndex + 1}`;
    const code = buildConfirmationCode();
    const message = renderConfirmationTemplate(smsState.confirmationTemplate, trip, code);

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
      results.push({ tripId, ok: false, error: error.message || 'Unable to send SMS confirmation.' });
    }
  }

  await writeNemtDispatchState({
    ...dispatchState,
    trips: updatedTrips
  });

  return {
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
  const action = extractReplyAction(messageText);
  if (!action) {
    return {
      updated: false,
      reason: 'No confirmation action found in inbound message.'
    };
  }

  const integrationsState = await readIntegrationsState();
  const dispatchState = await readNemtDispatchState();
  const normalizedPhone = normalizePhoneNumber(fromPhone, integrationsState.sms.defaultCountryCode);
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