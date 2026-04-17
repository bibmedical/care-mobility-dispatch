import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Vibration } from 'react-native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { DRIVER_APP_CONFIG } from '../config/driverAppConfig';
import { DriverNotificationMode, clearStoredDriverSession, enqueueStoredPendingTripAction, readOrCreateDriverDeviceId, readStoredDriverSession, readStoredNotificationMode, readStoredPendingTripActions, readStoredTrackingPreference, removeStoredPendingTripAction, writeStoredDriverSession, writeStoredNotificationMode, writeStoredPendingTripActions, writeStoredTrackingPreference } from '../services/driverSessionStorage';
import { isBackgroundLocationTrackingActive, startBackgroundLocationTracking, stopBackgroundLocationTracking } from '../services/driverBackgroundLocation';
import { DriverAppTab, DriverDocuments, DriverFuelReceipt, DriverFuelRequest, DriverMessage, DriverPendingTripAction, DriverReviewSummary, DriverSession, DriverShiftState, DriverTimeOffAppointment, DriverTrip, DriverTripActionName, LocationSnapshot } from '../types/driver';

const formatDateTime = (value: number | null) => {
  if (!value) return 'No update yet';
  return new Date(value).toLocaleString();
};

const SESSION_RESTORE_TIMEOUT_MS = 2500;
const NETWORK_TIMEOUT_MS = 45000;
const isLocalPasswordlessDriverLoginEnabled = __DEV__;
const DRIVER_RENDER_API_BASE_URL = 'https://care-mobility-dispatch-web-v2.onrender.com';
const DRIVER_ALERT_CHANNEL_ID = 'driver-alerts';
const shouldRegisterRemotePushToken = true;
const isExpoGoRuntime = Constants.appOwnership === 'expo'
  || String((Constants as { executionEnvironment?: unknown }).executionEnvironment || '').toLowerCase() === 'storeclient';
const shouldDisableNotificationsRuntime = __DEV__ || isExpoGoRuntime;
let cachedNotificationsModule: any | null | undefined;

const getNotificationsModule = () => {
  if (shouldDisableNotificationsRuntime) return null;
  if (cachedNotificationsModule !== undefined) return cachedNotificationsModule;

  try {
    cachedNotificationsModule = require('expo-notifications');
    cachedNotificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false
      })
    });
  } catch {
    cachedNotificationsModule = null;
  }

  return cachedNotificationsModule;
};

const buildLoginApiBaseCandidates = () => {
  const candidates = [DRIVER_APP_CONFIG.apiBaseUrl, DRIVER_RENDER_API_BASE_URL]
    .map(value => String(value || '').trim().replace(/\/$/, ''))
    .filter(Boolean);

  return Array.from(new Set(candidates));
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>(resolve => {
      setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
};

const parseJsonResponse = async (response: Response) => {
  const rawText = await response.text();

  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
};

const fetchJsonWithTimeout = async (input: string, init?: RequestInit, timeoutMs = NETWORK_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    const payload = await parseJsonResponse(response);

    return {
      response,
      payload
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The server took too long to respond. Check your connection and try again.');
    }

    if (error instanceof Error && /failed to fetch|network request failed/i.test(error.message)) {
      throw new Error(`Unable to reach the driver API at ${DRIVER_APP_CONFIG.apiBaseUrl}. If you are testing on web/local, make sure the backend is running there or keep using Render after the CORS fix is deployed.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getMobileApiErrorMessage = (response: Response, fallbackMessage: string) => {
  if (response.status === 404) {
    return 'The mobile API is not deployed on Render yet.';
  }

  return fallbackMessage;
};

const isDriverSessionErrorResponse = (response: Response | null | undefined, payload: any) => {
  const code = String(payload?.code || '').trim().toLowerCase();
  return Boolean(response && [401, 409].includes(response.status) && code.startsWith('driver-session'));
};

const getDriverAuthHeaders = (session: DriverSession | null, baseHeaders: HeadersInit = {}) => {
  const headers = {
    ...baseHeaders
  } as Record<string, string>;

  if (session?.deviceId) {
    headers['x-driver-device-id'] = session.deviceId;
  }
  if (session?.sessionToken) {
    headers['x-driver-session-token'] = session.sessionToken;
  }

  return headers;
};

const omitDriverAuthHeaders = (headers: HeadersInit = {}) => {
  const nextHeaders = {
    ...(headers as Record<string, string>)
  };

  delete nextHeaders['x-driver-device-id'];
  delete nextHeaders['x-driver-session-token'];

  return nextHeaders;
};

const EMPTY_DRIVER_DOCUMENTS: DriverDocuments = {
  profilePhoto: null,
  licenseFront: null,
  licenseBack: null,
  insuranceCertificate: null,
  w9Document: null,
  trainingCertificate: null
};

const getDocumentUri = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const candidate = value as { dataUrl?: string; url?: string; path?: string };
    return String(candidate.dataUrl || candidate.url || candidate.path || '').trim();
  }
  return '';
};

const getDriverMessageIdentity = (message: Partial<DriverMessage> | null | undefined) => {
  const explicitId = String(message?.id || '').trim();
  if (explicitId) return explicitId;
  return [
    String(message?.subject || '').trim(),
    String(message?.body || '').trim(),
    String(message?.createdAt || '').trim(),
    String(message?.source || '').trim()
  ].join('|');
};

const dedupeDriverMessages = (messages: DriverMessage[]) => {
  const seen = new Set<string>();
  return (Array.isArray(messages) ? messages : []).filter(message => {
    const identity = getDriverMessageIdentity(message);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const appendDriverMessage = (currentMessages: DriverMessage[], nextMessage: DriverMessage | null | undefined) => {
  if (!nextMessage) return dedupeDriverMessages(currentMessages);
  return dedupeDriverMessages([nextMessage, ...(Array.isArray(currentMessages) ? currentMessages : [])]);
};

export const useDriverRuntime = () => {
  const [tripDateFilter, setTripDateFilter] = useState<'all' | 'today' | 'next-day'>('all');
  const [driverCode, setDriverCode] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [driverSession, setDriverSession] = useState<DriverSession | null>(null);
  const [activeTab, setActiveTab] = useState<DriverAppTab>('home');
  const [trackingEnabled, setTrackingEnabledState] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);
  const [locationSnapshot, setLocationSnapshot] = useState<LocationSnapshot | null>(null);
  const [watchError, setWatchError] = useState('');
  const [backgroundTrackingError, setBackgroundTrackingError] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isSyncingLocation, setIsSyncingLocation] = useState(false);
  const [isManagingBackgroundTracking, setIsManagingBackgroundTracking] = useState(false);
  const [isBackgroundTrackingEnabled, setIsBackgroundTrackingEnabled] = useState(false);
  const [shiftState, setShiftState] = useState<DriverShiftState>('available');
  const [assignedTrips, setAssignedTrips] = useState<DriverTrip[]>([]);
  const [activeTrip, setActiveTrip] = useState<DriverTrip | null>(null);
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [tripSyncError, setTripSyncError] = useState('');
  const [lastTripSyncAt, setLastTripSyncAt] = useState<number | null>(null);
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [readIncomingMessageIds, setReadIncomingMessageIds] = useState<string[]>([]);
  const [driverReviewSummary, setDriverReviewSummary] = useState<DriverReviewSummary | null>(null);
  const effectiveForegroundGpsTimeIntervalMs = useMemo(() => {
    const configured = Number(driverSession?.gpsSettings?.fgTimeIntervalMs);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return DRIVER_APP_CONFIG.gpsTimeIntervalMs;
  }, [driverSession?.gpsSettings?.fgTimeIntervalMs]);
  const effectiveForegroundGpsDistanceIntervalMeters = useMemo(() => {
    const configured = Number(driverSession?.gpsSettings?.fgDistanceIntervalMeters);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return DRIVER_APP_CONFIG.gpsDistanceIntervalMeters;
  }, [driverSession?.gpsSettings?.fgDistanceIntervalMeters]);
  const [driverReviewError, setDriverReviewError] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [lastMessageSyncAt, setLastMessageSyncAt] = useState<number | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [tripActionError, setTripActionError] = useState('');
  const [activeTripAction, setActiveTripAction] = useState('');
  const [pendingTripActions, setPendingTripActions] = useState<DriverPendingTripAction[]>([]);
  const [isProcessingPendingTripActions, setIsProcessingPendingTripActions] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [driverDocuments, setDriverDocuments] = useState<DriverDocuments>(EMPTY_DRIVER_DOCUMENTS);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [fuelReceipts, setFuelReceipts] = useState<DriverFuelReceipt[]>([]);
  const [isSubmittingFuelReceipt, setIsSubmittingFuelReceipt] = useState(false);
  const [fuelReceiptError, setFuelReceiptError] = useState('');
  const [fuelReceiptSuccess, setFuelReceiptSuccess] = useState('');
  const [fuelRequests, setFuelRequests] = useState<DriverFuelRequest[]>([]);
  const [isSubmittingFuelRequest, setIsSubmittingFuelRequest] = useState(false);
  const [fuelRequestError, setFuelRequestError] = useState('');
  const [fuelRequestSuccess, setFuelRequestSuccess] = useState('');
  const [driverTimeOffAppointment, setDriverTimeOffAppointment] = useState<DriverTimeOffAppointment | null>(null);
  const [isSubmittingDriverTimeOff, setIsSubmittingDriverTimeOff] = useState(false);
  const [driverTimeOffError, setDriverTimeOffError] = useState('');
  const [driverTimeOffSuccess, setDriverTimeOffSuccess] = useState('');
  const [currentCity, setCurrentCity] = useState('Locating city...');
  const [notificationMode, setNotificationMode] = useState<DriverNotificationMode>('sound');
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [isRegisteringPushToken, setIsRegisteringPushToken] = useState(false);
  const requiresPasswordReset = Boolean(loggedIn && driverSession?.passwordResetRequired);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const requestedBackgroundSettingsRef = useRef(false);
  const processingPendingTripActionsRef = useRef(false);

  const syncLocationProviderState = async (promptToEnable = false) => {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    setLocationServicesEnabled(servicesEnabled);

    if (servicesEnabled) return true;

    if (promptToEnable && Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
        const enabledAfterPrompt = await Location.hasServicesEnabledAsync();
        setLocationServicesEnabled(enabledAfterPrompt);
        if (enabledAfterPrompt) {
          setWatchError('');
          return true;
        }
      } catch {
        // Fall back to showing a clear error and opening settings manually.
      }
    }

    setWatchError('Location service is off on this tablet. Turn on GPS/Location in Android settings.');
    return false;
  };

  const clearDriverRuntimeState = async (message = '') => {
    setLoggedIn(false);
    setDriverSession(null);
    setTrackingEnabled(false);
    setActiveTab('home');
    setTripDateFilter('all');
    setShiftState('available');
    setLocationSnapshot(null);
    setWatchError('');
    setTripSyncError('');
    setMessages([]);
    setReadIncomingMessageIds([]);
    setDriverReviewSummary(null);
    setDriverReviewError('');
    setMessageDraft('');
    seenMessageIdsRef.current.clear();
    setDriverDocuments(EMPTY_DRIVER_DOCUMENTS);
    setDocumentsError('');
    setPassword('');
    setBackgroundTrackingError('');
    setIsBackgroundTrackingEnabled(false);
    setAuthError(message);
    await stopBackgroundLocationTracking();
    await clearStoredDriverSession();
  };

  const handleDriverSessionFailure = async (response: Response, payload: any, fallbackMessage: string) => {
    if (!isDriverSessionErrorResponse(response, payload)) {
      return false;
    }

    await clearDriverRuntimeState(payload?.error || fallbackMessage);
    return true;
  };

  const fetchDriverMessagesWithLegacyFallback = async (input: string, init?: RequestInit) => {
    const primaryResult = await fetchJsonWithTimeout(input, init);
    if (!isDriverSessionErrorResponse(primaryResult.response, primaryResult.payload)) {
      return primaryResult;
    }

    return await fetchJsonWithTimeout(input, {
      ...init,
      headers: omitDriverAuthHeaders(init?.headers)
    });
  };

  const setTrackingEnabled = (nextValue: boolean) => {
    setTrackingEnabledState(nextValue);
    void writeStoredTrackingPreference(nextValue);
  };

  const syncPendingTripActions = async () => {
    const storedActions = await readStoredPendingTripActions();
    setPendingTripActions(storedActions);
    return storedActions;
  };


  const buildOptimisticTripPatch = (action: DriverTripActionName, options: {
    cancellationReason?: string;
    cancellationPhotoDataUrl?: string;
    completionPhotoDataUrl?: string;
  } = {}) => {
    const now = Date.now();
    const workflow: NonNullable<DriverTrip['driverWorkflow']> = {
      status: action
    };
    const patch: Partial<DriverTrip> = {
      status: action === 'complete' ? 'Completed' : action === 'cancel' ? 'Cancelled' : action === 'arrived' || action === 'arrived-destination' ? 'Arrived' : 'In Progress'
    };

    if (action === 'accept') {
      workflow.acceptedAt = now;
      workflow.acceptedTimeLabel = formatDateTime(now);
    }
    if (action === 'en-route') {
      patch.enRouteAt = now;
      workflow.departureToPickupAt = now;
      workflow.departureToPickupTimeLabel = formatDateTime(now);
    }
    if (action === 'arrived') {
      patch.arrivedAt = now;
      workflow.arrivedPickupAt = now;
      workflow.arrivedPickupTimeLabel = formatDateTime(now);
    }
    if (action === 'patient-onboard') {
      patch.patientOnboardAt = now;
      workflow.patientOnboardAt = now;
      workflow.patientOnboardTimeLabel = formatDateTime(now);
    }
    if (action === 'start-trip') {
      patch.startTripAt = now;
      workflow.startTripAt = now;
      workflow.startTripTimeLabel = formatDateTime(now);
    }
    if (action === 'arrived-destination') {
      patch.arrivedDestinationAt = now;
      workflow.arrivedDestinationAt = now;
      workflow.arrivedDestinationTimeLabel = formatDateTime(now);
    }
    if (action === 'complete') {
      patch.completedAt = now;
      patch.completionPhotoDataUrl = String(options.completionPhotoDataUrl || '').trim() || undefined;
      workflow.completedAt = now;
      workflow.completedTimeLabel = formatDateTime(now);
    }

    if (action === 'cancel') {
      patch.canceledAt = now;
      patch.cancellationReason = String(options.cancellationReason || '').trim() || undefined;
      patch.cancellationPhotoDataUrl = String(options.cancellationPhotoDataUrl || '').trim() || undefined;
    }

    patch.driverWorkflow = workflow;
    return patch;
  };

  const applyOptimisticTripAction = (tripId: string, action: DriverTripActionName, options: {
    cancellationReason?: string;
    cancellationPhotoDataUrl?: string;
    completionPhotoDataUrl?: string;
  } = {}) => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return;
    const optimisticPatch = buildOptimisticTripPatch(action, options);

    setAssignedTrips(currentTrips => currentTrips.map(trip => String(trip.id || '').trim() === normalizedTripId ? {
      ...trip,
      ...optimisticPatch,
      driverWorkflow: {
        ...(trip.driverWorkflow || {}),
        ...(optimisticPatch.driverWorkflow || {})
      }
    } : trip));
    setActiveTrip(currentTrip => {
      if (!currentTrip || String(currentTrip.id || '').trim() !== normalizedTripId) {
        return currentTrip;
      }

      return {
        ...currentTrip,
        ...optimisticPatch,
        driverWorkflow: {
          ...(currentTrip.driverWorkflow || {}),
          ...(optimisticPatch.driverWorkflow || {})
        }
      };
    });

    if (action === 'accept') setShiftState('available');
    if (action === 'en-route') setShiftState('en-route');
    if (action === 'arrived') setShiftState('arrived');
    if (action === 'start-trip') setShiftState('en-route');
    if (action === 'arrived-destination') setShiftState('arrived');
    if (action === 'complete') setShiftState('completed');
    if (action === 'cancel') setShiftState('available');
    if (action === 'complete' || action === 'cancel') setActiveTab('history');
  };

  const applyPendingActionsToTrips = (trips: DriverTrip[], queuedActions: DriverPendingTripAction[]) => {
    if (!Array.isArray(trips) || !trips.length || !Array.isArray(queuedActions) || !queuedActions.length) {
      return Array.isArray(trips) ? trips : [];
    }

    const sortedActions = [...queuedActions]
      .filter(action => action.driverId === driverSession?.driverId)
      .sort((leftAction, rightAction) => Number(leftAction.eventTimestamp || leftAction.createdAt || 0) - Number(rightAction.eventTimestamp || rightAction.createdAt || 0));

    if (!sortedActions.length) return trips;

    return trips.map(trip => {
      const normalizedTripId = String(trip?.id || '').trim();
      if (!normalizedTripId) return trip;

      return sortedActions.reduce<DriverTrip>((currentTrip, queuedAction) => {
        if (String(queuedAction.tripId || '').trim() !== normalizedTripId) {
          return currentTrip;
        }

        const optimisticPatch = buildOptimisticTripPatch(queuedAction.action, {
          cancellationReason: queuedAction.cancellationReason,
          cancellationPhotoDataUrl: queuedAction.cancellationPhotoDataUrl,
          completionPhotoDataUrl: queuedAction.completionPhotoDataUrl
        });

        return {
          ...currentTrip,
          ...optimisticPatch,
          driverWorkflow: {
            ...(currentTrip.driverWorkflow || {}),
            ...(optimisticPatch.driverWorkflow || {})
          }
        };
      }, trip);
    });
  };

  const reloadTrips = async () => {
    if (!loggedIn || requiresPasswordReset) return false;

    try {
      const lookupQuery = driverSession?.driverId ? `driverId=${encodeURIComponent(driverSession.driverId)}` : `driverCode=${encodeURIComponent(driverCode.trim())}`;
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-trips?${lookupQuery}`, {
        headers: getDriverAuthHeaders(driverSession)
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load trips.'));

      const pendingActions = await readStoredPendingTripActions();
      const fetchedTrips: DriverTrip[] = Array.isArray(payload?.trips) ? payload.trips : [];
      const nextTrips = applyPendingActionsToTrips(fetchedTrips, pendingActions);
      setAssignedTrips(nextTrips);
      setActiveTrip(currentTrip => {
        if (currentTrip) {
          const refreshedCurrentTrip = nextTrips.find(trip => trip.id === currentTrip.id);
          if (refreshedCurrentTrip) return refreshedCurrentTrip;
        }

        const payloadActiveTrip = payload?.activeTrip && typeof payload.activeTrip === 'object'
          ? applyPendingActionsToTrips([payload.activeTrip], pendingActions)[0]
          : null;

        return payloadActiveTrip ?? nextTrips[0] ?? null;
      });
      setTripSyncError('');
      setLastTripSyncAt(Date.now());
      return true;
    } catch (error) {
      setTripSyncError(error instanceof Error ? error.message : 'Unable to load trips.');
      return false;
    }
  };

  const processPendingTripActions = async () => {
    if (processingPendingTripActionsRef.current || !driverSession?.driverId || requiresPasswordReset) return false;

    processingPendingTripActionsRef.current = true;
    setIsProcessingPendingTripActions(true);

    try {
      let queuedActions = await readStoredPendingTripActions();
      if (!queuedActions.length) {
        setPendingTripActions([]);
        return true;
      }

      let successfulSend = false;

      for (const queuedAction of queuedActions) {
        if (queuedAction.driverId !== driverSession.driverId) continue;

        const sendTripActionRequest = async (overrides: Record<string, unknown> = {}) => {
          return await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-trip-actions`, {
            method: 'POST',
            headers: {
              ...getDriverAuthHeaders(driverSession, {
                'Content-Type': 'application/json'
              })
            },
            body: JSON.stringify({
              driverId: queuedAction.driverId,
              tripId: queuedAction.tripId,
              action: queuedAction.action,
              eventTimestamp: queuedAction.eventTimestamp,
              riderSignatureName: String(queuedAction.riderSignatureName || '').trim() || undefined,
              riderSignatureData: queuedAction.riderSignatureData || undefined,
              cancellationReason: String(queuedAction.cancellationReason || '').trim() || undefined,
              cancellationPhotoDataUrl: String(queuedAction.cancellationPhotoDataUrl || '').trim() || undefined,
              completionPhotoDataUrl: String(queuedAction.completionPhotoDataUrl || '').trim() || undefined,
              locationSnapshot: queuedAction.locationSnapshot || undefined,
              ...overrides
            })
          });
        };

        try {
          let { response, payload } = await sendTripActionRequest();
          if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;

          const actionAllowsSignatureBypass = ['en-route', 'arrived', 'patient-onboard', 'start-trip', 'arrived-destination'].includes(queuedAction.action);
          const backendSignatureError = /signature|firma/i.test(String(payload?.error || ''));

          if (!response.ok && actionAllowsSignatureBypass && backendSignatureError) {
            const retryResult = await sendTripActionRequest({
              riderSignatureName: 'Driver workflow acknowledgment'
            });
            response = retryResult.response;
            payload = retryResult.payload;
            if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
          }

          if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to update trip.'));

          await removeStoredPendingTripAction(queuedAction.id);
          queuedActions = queuedActions.filter(item => item.id !== queuedAction.id);
          successfulSend = true;
        } catch (error) {
          const failureMessage = error instanceof Error ? error.message : 'Unable to send pending trip update.';
          const nextQueuedActions = queuedActions.map(item => item.id === queuedAction.id ? {
            ...item,
            attemptCount: Number(item.attemptCount || 0) + 1,
            lastAttemptAt: Date.now()
          } : item);
          await writeStoredPendingTripActions(nextQueuedActions);
          queuedActions = nextQueuedActions;
          setPendingTripActions(nextQueuedActions);
          if (/unable to reach the driver api|failed to fetch|network request failed|too long to respond/i.test(failureMessage.toLowerCase())) {
            setTripActionError('Trip update queued. Driver can keep working and resend pending updates later.');
          } else {
            setTripActionError(failureMessage);
          }
          return false;
        }
      }

      setPendingTripActions(queuedActions);
      if (successfulSend) {
        await reloadTrips();
        await loadDriverReviewSummary(true);
      }
      if (!queuedActions.length) {
        setTripActionError('');
      }
      return true;
    } finally {
      processingPendingTripActionsRef.current = false;
      setIsProcessingPendingTripActions(false);
    }
  };

  const resendPendingTripActions = async () => {
    return await processPendingTripActions();
  };

  const loadMessages = async (signalActive = true) => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) return;
    setIsLoadingMessages(true);
    try {
      const requestUrl = `${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages?driverId=${encodeURIComponent(driverSession.driverId)}&t=${Date.now()}`;
      const { response, payload } = await fetchDriverMessagesWithLegacyFallback(requestUrl, {
        cache: 'no-store',
        headers: getDriverAuthHeaders(driverSession)
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load messages.'));
      if (!signalActive) return;
      setMessages(dedupeDriverMessages(Array.isArray(payload?.messages) ? payload.messages : []));
      setMessagesError('');
      setLastMessageSyncAt(Date.now());
    } catch (error) {
      if (!signalActive) return;
      setMessages([]);
      setMessagesError(error instanceof Error ? error.message : 'Unable to load messages.');
    } finally {
      if (signalActive) setIsLoadingMessages(false);
    }
  };

  const loadDriverReviewSummary = async (signalActive = true) => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) return;
    try {
      const query = `driverId=${encodeURIComponent(driverSession.driverId)}`;
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-reviews?${query}`, {
        headers: getDriverAuthHeaders(driverSession),
        cache: 'no-store'
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load driver reviews.'));
      if (!signalActive) return;
      setDriverReviewSummary(payload?.summary || null);
      setDriverReviewError('');
    } catch (error) {
      if (!signalActive) return;
      setDriverReviewSummary(null);
      setDriverReviewError(error instanceof Error ? error.message : 'Unable to load driver reviews.');
    }
  };

  const loadDriverDocuments = async (signalActive = true) => {
    if (!loggedIn || !driverSession?.driverId) return;
    setIsLoadingDocuments(true);
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-documents?driverId=${encodeURIComponent(driverSession.driverId)}`, {
        headers: getDriverAuthHeaders(driverSession)
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load documents.'));
      if (!signalActive) return;
      setDriverDocuments(payload?.documents || EMPTY_DRIVER_DOCUMENTS);
      const profilePhotoUrl = String(payload?.profilePhotoUrl || getDocumentUri(payload?.documents?.profilePhoto) || '').trim();
      setDriverSession(current => current ? {
        ...current,
        profilePhotoUrl: profilePhotoUrl || current.profilePhotoUrl || ''
      } : current);
      setDocumentsError('');
    } catch (error) {
      if (!signalActive) return;
      setDocumentsError(error instanceof Error ? error.message : 'Unable to load documents.');
    } finally {
      if (signalActive) setIsLoadingDocuments(false);
    }
  };

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        if (active) setIsRestoringSession(true);
        const [storedSession, storedTrackingEnabled, storedNotificationMode] = await withTimeout(Promise.all([readStoredDriverSession(), readStoredTrackingPreference(), readStoredNotificationMode()]), SESSION_RESTORE_TIMEOUT_MS, [null, false, 'sound'] as const);
        if (!active || !storedSession) return;
        if (!storedSession.sessionToken || !storedSession.deviceId) {
          await clearStoredDriverSession();
          if (active) setAuthError('Your saved driver session is outdated. Sign in again.');
          return;
        }
        setDriverSession(storedSession);
        setDriverCode(storedSession.driverCode || storedSession.username || storedSession.driverId);
        setTrackingEnabledState(storedTrackingEnabled);
        setNotificationMode(storedNotificationMode);
        setLoggedIn(true);
      } finally {
        if (active) setIsRestoringSession(false);
      }
    };

    void restoreSession().catch(() => {
      if (active) setIsRestoringSession(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId) return;

    void refreshDriverSession(driverSession);
  }, [driverSession?.driverId, loggedIn]);

  useEffect(() => {
    void syncPendingTripActions();
  }, []);

  useEffect(() => {
    const notifications = getNotificationsModule();
    if (!notifications) return;

    void notifications.setNotificationChannelAsync(DRIVER_ALERT_CHANNEL_ID, {
      name: 'Dispatcher Alerts',
      importance: notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 120, 300],
      enableVibrate: true,
      enableLights: true,
      lightColor: '#16a34a',
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      showBadge: true
    });
  }, []);

  useEffect(() => {
    if (!shouldRegisterRemotePushToken) return;
    if (!loggedIn || !driverSession?.driverId || !notificationPermissionGranted || isRegisteringPushToken) return;

    if (shouldDisableNotificationsRuntime) {
      setNotificationError('Remote push registration is skipped in Expo Go. Use a development build or APK for live push notifications.');
      return;
    }

    let active = true;
    const registerPushToken = async () => {
      try {
        setIsRegisteringPushToken(true);
        const notifications = getNotificationsModule();
        if (!notifications) {
          throw new Error('Push notifications require a development build or APK, not Expo Go.');
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        if (!projectId) {
          throw new Error('Missing EAS project ID for push registration.');
        }

        const tokenPayload = await notifications.getExpoPushTokenAsync({ projectId });
        const pushToken = String(tokenPayload?.data || '').trim();
        if (!pushToken) {
          throw new Error('Unable to retrieve Expo push token.');
        }

        const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-notifications`, {
          method: 'POST',
          headers: {
            ...getDriverAuthHeaders(driverSession, {
              'Content-Type': 'application/json'
            })
          },
          body: JSON.stringify({
            driverId: driverSession.driverId,
            pushToken
          })
        });

        if (!response.ok) {
          if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
          throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to register device notifications.'));
        }

        if (active) setNotificationError('');
      } catch (error) {
        if (active) setNotificationError(error instanceof Error ? error.message : 'Unable to register push notifications.');
      } finally {
        if (active) setIsRegisteringPushToken(false);
      }
    };

    void registerPushToken();
    return () => {
      active = false;
    };
  }, [driverSession?.driverId, isRegisteringPushToken, loggedIn, notificationPermissionGranted]);

  useEffect(() => {
    let active = true;

    const syncNotificationPermission = async () => {
      const notifications = getNotificationsModule();
      if (!notifications) {
        if (!active) return;
        setNotificationPermissionGranted(false);
        setNotificationError('Expo Go on Android does not support remote push notifications. Use a development build or APK for push testing.');
        return;
      }

      const settings = await notifications.getPermissionsAsync();
      if (!active) return;
      const granted = settings.granted || settings.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL;
      setNotificationPermissionGranted(Boolean(granted));
      if (!granted) {
        setNotificationError('Notifications are disabled. Enable notifications to receive dispatcher alerts in real time.');
      } else {
        setNotificationError('');
      }
    };

    void syncNotificationPermission();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      if (!trackingEnabled || !loggedIn || requiresPasswordReset) return;

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionStatus('denied');
        setTrackingEnabled(false);
        setWatchError('Location permission denied. Tap Refresh GPS permissions and allow location access.');
        return;
      }

      const servicesEnabled = await syncLocationProviderState();
      if (!servicesEnabled) {
        return;
      }

      setPermissionStatus('granted');
      setWatchError('');

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setLocationSnapshot({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy ?? null,
        speed: current.coords.speed ?? null,
        heading: current.coords.heading ?? null,
        timestamp: current.timestamp
      });

      subscription = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.Highest,
        distanceInterval: effectiveForegroundGpsDistanceIntervalMeters,
        timeInterval: effectiveForegroundGpsTimeIntervalMs
      }, update => {
        setLocationSnapshot({
          latitude: update.coords.latitude,
          longitude: update.coords.longitude,
          accuracy: update.coords.accuracy ?? null,
          speed: update.coords.speed ?? null,
          heading: update.coords.heading ?? null,
          timestamp: update.timestamp
        });
      });
    };

    startWatching().catch(error => {
      setWatchError(error instanceof Error ? error.message : 'Unable to start tracking.');
    });

    return () => {
      subscription?.remove();
    };
  }, [effectiveForegroundGpsDistanceIntervalMeters, effectiveForegroundGpsTimeIntervalMs, loggedIn, requiresPasswordReset, trackingEnabled]);

  useEffect(() => {
    let active = true;

    const syncProviderOnMount = async () => {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (active) setLocationServicesEnabled(servicesEnabled);
      } catch {
        if (active) setLocationServicesEnabled(true);
      }
    };

    void syncProviderOnMount();

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void syncProviderOnMount();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const syncBackgroundTrackingState = async () => {
      if (!loggedIn || requiresPasswordReset) {
        if (active) {
          setIsBackgroundTrackingEnabled(false);
          setBackgroundTrackingError('');
        }
        return;
      }

      const running = await isBackgroundLocationTrackingActive();
      if (active) setIsBackgroundTrackingEnabled(running);
    };

    void syncBackgroundTrackingState().catch(() => {
      if (active) setIsBackgroundTrackingEnabled(false);
    });

    return () => {
      active = false;
    };
  }, [loggedIn, requiresPasswordReset]);

  useEffect(() => {
    let active = true;

    const manageBackgroundTracking = async () => {
      if (!DRIVER_APP_CONFIG.enableBackgroundTracking) {
        await stopBackgroundLocationTracking();
        if (active) {
          setIsBackgroundTrackingEnabled(false);
          setBackgroundTrackingError('Background GPS is temporarily disabled in this build for stability.');
        }
        return;
      }

      if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) {
        await stopBackgroundLocationTracking();
        if (active) setIsBackgroundTrackingEnabled(false);
        return;
      }

      if (!trackingEnabled) {
        await stopBackgroundLocationTracking();
        if (active) {
          setIsBackgroundTrackingEnabled(false);
          setBackgroundTrackingError('');
        }
        return;
      }

      try {
        if (active) setIsManagingBackgroundTracking(true);
        await startBackgroundLocationTracking();
        if (active) {
          setIsBackgroundTrackingEnabled(true);
          setBackgroundTrackingError('');
        }
      } catch (error) {
        if (active) {
          setIsBackgroundTrackingEnabled(false);
          setBackgroundTrackingError(error instanceof Error ? error.message : 'Unable to start background GPS.');
        }
        if (active && !requestedBackgroundSettingsRef.current && error instanceof Error && /background location permission/i.test(error.message)) {
          requestedBackgroundSettingsRef.current = true;
          await Linking.openSettings();
        }
      } finally {
        if (active) setIsManagingBackgroundTracking(false);
      }
    };

    void manageBackgroundTracking();

    return () => {
      active = false;
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset, trackingEnabled]);

  useEffect(() => {
    if (!loggedIn || !trackingEnabled || !driverSession?.driverId || !DRIVER_APP_CONFIG.enableBackgroundTracking || requiresPasswordReset) return;

    let active = true;

    const ensureBackgroundTracking = async () => {
      try {
        await startBackgroundLocationTracking();
        if (active) {
          setIsBackgroundTrackingEnabled(true);
          setBackgroundTrackingError('');
        }
      } catch (error) {
        if (active) {
          setIsBackgroundTrackingEnabled(false);
          setBackgroundTrackingError(error instanceof Error ? error.message : 'Unable to keep background GPS active.');
        }
      }
    };

    void ensureBackgroundTracking();

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' || nextState === 'inactive' || nextState === 'active') {
        void ensureBackgroundTracking();
      }
    });

    const watchdogInterval = setInterval(() => {
      void (async () => {
        try {
          const running = await isBackgroundLocationTrackingActive();
          if (!running) {
            await ensureBackgroundTracking();
          }
        } catch {
          // The next cycle retries automatically.
        }
      })();
    }, 20000);

    return () => {
      active = false;
      subscription.remove();
      clearInterval(watchdogInterval);
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset, trackingEnabled]);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) return;

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void syncPendingTripActions().then(actions => {
          if (actions.some(action => action.driverId === driverSession.driverId)) {
            void processPendingTripActions();
          }
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset]);

  useEffect(() => {
    if (!loggedIn || requiresPasswordReset) {
      setAssignedTrips([]);
      setActiveTrip(null);
      setTripSyncError('');
      setLastTripSyncAt(null);
      return;
    }

    let active = true;

    const loadTrips = async () => {
      setIsLoadingTrips(true);
      try {
        await reloadTrips();
      } catch (error) {
        if (!active) return;
        setTripSyncError(error instanceof Error ? error.message : 'Unable to load trips.');
      } finally {
        if (active) setIsLoadingTrips(false);
      }
    };

    loadTrips();
    const intervalId = setInterval(loadTrips, DRIVER_APP_CONFIG.tripSyncIntervalMs);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [driverCode, driverSession?.driverId, loggedIn, requiresPasswordReset]);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) {
      setMessages([]);
      setReadIncomingMessageIds([]);
      setMessagesError('');
      setLastMessageSyncAt(null);
      return;
    }

    let active = true;

    void loadMessages(active);
    const intervalId = setInterval(() => {
      void loadMessages(active);
    }, DRIVER_APP_CONFIG.messageSyncIntervalMs);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset]);

  useEffect(() => {
    if (!loggedIn || activeTab !== 'messages') return;
    const incomingIds = messages
      .filter(message => String(message.source || '').toLowerCase() !== 'mobile-driver-app')
      .map(message => String(message.id || '').trim())
      .filter(Boolean);

    if (incomingIds.length === 0) return;

    setReadIncomingMessageIds(current => {
      const merged = new Set([...current, ...incomingIds]);
      return Array.from(merged);
    });
  }, [activeTab, loggedIn, messages]);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) {
      setDriverReviewSummary(null);
      setDriverReviewError('');
      return;
    }

    let active = true;

    void loadDriverReviewSummary(active);
    const intervalId = setInterval(() => {
      void loadDriverReviewSummary(active);
    }, DRIVER_APP_CONFIG.tripSyncIntervalMs);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset]);

  useEffect(() => {
    if (!locationSnapshot) {
      setCurrentCity('Waiting for GPS...');
      return;
    }

    let active = true;
    const resolveCity = async () => {
      try {
        const candidates = await Location.reverseGeocodeAsync({
          latitude: locationSnapshot.latitude,
          longitude: locationSnapshot.longitude
        });
        if (!active) return;
        const item = candidates[0];
        const city = [item?.city, item?.subregion, item?.region].filter(Boolean).join(', ');
        setCurrentCity(city || 'Unknown city');
      } catch {
        if (active) setCurrentCity('Unknown city');
      }
    };

    void resolveCity();
    return () => {
      active = false;
    };
  }, [locationSnapshot?.latitude, locationSnapshot?.longitude]);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) {
      setDriverTimeOffAppointment(null);
      setDriverTimeOffError('');
      setDriverTimeOffSuccess('');
      return;
    }

    let active = true;
    void (async () => {
      await loadDriverTimeOff();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset]);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId || requiresPasswordReset) {
      setDriverDocuments(EMPTY_DRIVER_DOCUMENTS);
      setDocumentsError('');
      return;
    }

    let active = true;
    void loadDriverDocuments(active);
    return () => {
      active = false;
    };
  }, [driverSession?.driverId, loggedIn, requiresPasswordReset]);

  useEffect(() => {
    if (!trackingEnabled || !loggedIn || !driverSession?.driverId || !locationSnapshot || requiresPasswordReset) return;

    let cancelled = false;

    const syncLocation = async () => {
      setIsSyncingLocation(true);
      try {
        await fetch(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-location`, {
          method: 'POST',
          headers: {
            ...getDriverAuthHeaders(driverSession, {
              'Content-Type': 'application/json'
            })
          },
          body: JSON.stringify({
            driverId: driverSession.driverId,
            latitude: locationSnapshot.latitude,
            longitude: locationSnapshot.longitude,
            city: currentCity,
            accuracy: locationSnapshot.accuracy,
            speed: locationSnapshot.speed,
            heading: locationSnapshot.heading,
            timestamp: locationSnapshot.timestamp
          })
        });
      } catch (error) {
        if (!cancelled) {
          setWatchError(error instanceof Error ? error.message : 'Unable to sync GPS.');
        }
      } finally {
        if (!cancelled) setIsSyncingLocation(false);
      }
    };

    syncLocation();
    return () => {
      cancelled = true;
    };
  }, [currentCity, driverSession?.driverId, locationSnapshot, loggedIn, requiresPasswordReset, trackingEnabled]);

  useEffect(() => {
    if (!loggedIn || messages.length === 0) return;

    const incomingMessages = messages.filter(message => String(message.source || '').toLowerCase() !== 'mobile-driver-app');

    if (seenMessageIdsRef.current.size === 0) {
      incomingMessages.forEach(message => seenMessageIdsRef.current.add(message.id));
      return;
    }

    const nextMessages = incomingMessages.filter(message => !seenMessageIdsRef.current.has(message.id));
    if (nextMessages.length === 0) return;

    nextMessages.forEach(message => seenMessageIdsRef.current.add(message.id));
    const latest = nextMessages[0];

    const notify = async () => {
      if (!notificationPermissionGranted) return;

      if (notificationMode !== 'silent') {
        Vibration.vibrate([0, 300, 120, 300]);
      }

      if (notificationMode === 'silent') return;

      const notifications = getNotificationsModule();
      if (!notifications) return;

      await notifications.scheduleNotificationAsync({
        content: {
          title: latest.subject || 'New dispatch message',
          body: latest.body || 'You have a new dispatcher message.',
          sound: notificationMode === 'sound' ? 'default' : undefined
        },
        trigger: null
      });
    };

    void notify();
  }, [loggedIn, messages, notificationMode, notificationPermissionGranted]);

  const statusCard = useMemo(() => {
    if (!loggedIn) return 'Sign in to begin driver operations.';
    if (requiresPasswordReset) return 'Password reset required. Driver operations stay locked until the new password is saved.';
    if (!trackingEnabled) return 'Tracking is off. Turn it on when your shift starts.';
    if (permissionStatus !== 'granted') return 'Waiting for GPS permission.';
    if (backgroundTrackingError) return backgroundTrackingError;
    if (isManagingBackgroundTracking) return 'Preparing background GPS tracking for dispatcher.';
    if (isBackgroundTrackingEnabled) return 'Background GPS is active and dispatcher can keep tracking the vehicle.';
    if (isSyncingLocation) return 'GPS is active and syncing to dispatch.';
    if (locationSnapshot) return 'GPS is active and ready to sync with dispatcher.';
    return 'Preparing GPS...';
  }, [backgroundTrackingError, isBackgroundTrackingEnabled, isManagingBackgroundTracking, isSyncingLocation, locationSnapshot, loggedIn, permissionStatus, requiresPasswordReset, trackingEnabled]);

  const lateRiskTrip = useMemo(() => {
    const candidateTrips = [activeTrip, ...assignedTrips].filter(Boolean) as DriverTrip[];
    return candidateTrips.find(trip => {
      const lateMinutes = Number(trip.lateMinutes || 0);
      return trip.punctualityVariant === 'danger' || lateMinutes >= DRIVER_APP_CONFIG.lateAlertThresholdMinutes;
    }) || null;
  }, [activeTrip, assignedTrips]);

  const currentAlert = useMemo(() => {
    if (lateRiskTrip) {
      return {
        type: 'late-trip',
        title: `Trip ${lateRiskTrip.rideId || lateRiskTrip.id} is running late`,
        body: `Late minutes: ${lateRiskTrip.lateMinutes || '-'}. Tell dispatch if another driver or Uber should cover it.`
      };
    }

    return null;
  }, [lateRiskTrip]);

  const unreadIncomingMessageCount = useMemo(() => {
    if (!loggedIn) return 0;
    const readSet = new Set(readIncomingMessageIds);
    return messages.filter(message => {
      const incoming = String(message.source || '').toLowerCase() !== 'mobile-driver-app';
      if (!incoming) return false;
      const messageId = String(message.id || '').trim();
      if (!messageId) return false;
      return !readSet.has(messageId);
    }).length;
  }, [loggedIn, messages, readIncomingMessageIds]);

  const signIn = async () => {
    if (!driverCode.trim()) {
      setAuthError('Enter your email or username first.');
      return false;
    }
    if (!password.trim() && !isLocalPasswordlessDriverLoginEnabled) {
      setAuthError('Enter your password.');
      return false;
    }

    setIsSigningIn(true);

    try {
      const deviceId = await readOrCreateDriverDeviceId();
      const loginApiBaseCandidates = buildLoginApiBaseCandidates();
      let response: Response | null = null;
      let payload: any = null;
      let lastError: Error | null = null;

      for (const [index, baseUrl] of loginApiBaseCandidates.entries()) {
        const isLastCandidate = index >= loginApiBaseCandidates.length - 1;

        try {
          const loginResult = await fetchJsonWithTimeout(`${baseUrl}/api/mobile/driver-login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              identifier: driverCode.trim(),
              password: password.trim(),
              pin: password.trim(),
              deviceId
            })
          });

          response = loginResult.response;
          payload = loginResult.payload;

          if (!response.ok || !payload?.session) {
            const errorMessage = payload?.error || getMobileApiErrorMessage(response, 'Unable to sign in.');
            lastError = new Error(errorMessage);
            const shouldTryNext = !isLastCandidate && (response.status === 404 || response.status >= 500);
            if (shouldTryNext) continue;
            throw lastError;
          }

          DRIVER_APP_CONFIG.apiBaseUrl = baseUrl;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          const canRetryWithNextBase = !isLastCandidate && /unable to reach the driver api|failed to fetch|network request failed/i.test(message);
          if (canRetryWithNextBase) {
            lastError = error instanceof Error ? error : new Error('Unable to sign in.');
            continue;
          }
          throw error;
        }
      }

      if (!response || !response.ok || !payload?.session) {
        throw lastError || new Error('Unable to sign in.');
      }

      setAuthError('');
      setDriverSession(payload.session);
      setDriverCode(payload.session.driverCode || payload.session.username || payload.session.driverId);
      setLoggedIn(true);
      setActiveTab('home');
      await writeStoredDriverSession(payload.session);
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    try {
      if (driverSession?.driverId && driverSession?.deviceId && driverSession?.sessionToken) {
        await fetch(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            driverId: driverSession.driverId,
            deviceId: driverSession.deviceId,
            sessionToken: driverSession.sessionToken
          })
        });
      }
    } catch {
      // Local sign-out should still complete even if the logout request fails.
    }

    await clearDriverRuntimeState('');
  };

  const changeDriverPassword = async (newPassword: string, currentPassword = '') => {
    if (!driverSession?.driverId) return false;

    setIsChangingPassword(true);
    setPasswordChangeError('');
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-password`, {
        method: 'POST',
        headers: {
          ...getDriverAuthHeaders(driverSession, {
            'Content-Type': 'application/json'
          })
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          currentPassword: String(currentPassword || '').trim(),
          newPassword: String(newPassword || '').trim()
        })
      });

      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to change password.'));
      }

      setDriverSession(payload.session);
      setPassword(String(newPassword || '').trim());
      await writeStoredDriverSession(payload.session);
      setPasswordChangeError('');
      return true;
    } catch (error) {
      setPasswordChangeError(error instanceof Error ? error.message : 'Unable to change password.');
      return false;
    } finally {
      setIsChangingPassword(false);
    }
  };

  const refreshDriverSession = async (session = driverSession) => {
    if (!session?.driverId) return false;

    try {
      const { response, payload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-profile?driverId=${encodeURIComponent(session.driverId)}`,
        {
          headers: getDriverAuthHeaders(session)
        }
      );

      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok || !payload?.session) return false;

      setDriverSession(payload.session);
      setDriverCode(payload.session.driverCode || payload.session.username || payload.session.driverId);
      await writeStoredDriverSession(payload.session);
      return true;
    } catch {
      return false;
    }
  };

  const requestLocationPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const foregroundPermission = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(foregroundPermission.status === 'granted' ? 'granted' : 'denied');
      if (foregroundPermission.status !== 'granted') {
        setWatchError('Location permission denied.');
        return;
      }

      const servicesEnabled = await syncLocationProviderState(true);
      if (!servicesEnabled) {
        await Linking.openSettings();
        return;
      }

      const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
      if (backgroundPermission.status !== 'granted') {
        setBackgroundTrackingError('Foreground GPS is allowed, but background GPS is still off. The app will open Android settings so you can set Location to "Allow all the time".');
        await Linking.openSettings();
        return;
      }

      setBackgroundTrackingError('');
      setWatchError('');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const notifications = getNotificationsModule();
      if (!notifications) {
        setNotificationPermissionGranted(false);
        setNotificationError('Expo Go on Android does not support remote push notifications. Use a development build or APK for push testing.');
        return false;
      }

      const settings = await notifications.requestPermissionsAsync();
      const granted = settings.granted || settings.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL;
      setNotificationPermissionGranted(Boolean(granted));
      setNotificationError(granted ? '' : 'Notifications are still disabled. Enable them in device settings.');
      if (!granted) {
        await Linking.openSettings();
      }
      return Boolean(granted);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to request notification permission.');
      return false;
    }
  };

  const setDriverNotificationMode = (mode: DriverNotificationMode) => {
    setNotificationMode(mode);
    void writeStoredNotificationMode(mode);
  };

  const submitTripAction = async (action: DriverTripActionName, options: {
    tripId?: string;
    riderSignatureName?: string;
    riderSignatureData?: {
      points: Array<{ x: number; y: number }>;
      width: number;
      height: number;
    };
    cancellationReason?: string;
    cancellationPhotoDataUrl?: string;
    completionPhotoDataUrl?: string;
  } = {}) => {
    const targetTripId = String(options.tripId || activeTrip?.id || '').trim();
    if (!driverSession?.driverId || !targetTripId || requiresPasswordReset) return false;
    const eventTimestamp = Date.now();

    setActiveTripAction(action);
    setTripActionError('');

    applyOptimisticTripAction(targetTripId, action, {
      cancellationReason: options.cancellationReason,
      cancellationPhotoDataUrl: options.cancellationPhotoDataUrl,
      completionPhotoDataUrl: options.completionPhotoDataUrl
    });

    const queuedAction: DriverPendingTripAction = {
      id: `trip-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      driverId: driverSession.driverId,
      tripId: targetTripId,
      action,
      eventTimestamp,
      createdAt: Date.now(),
      attemptCount: 0,
      riderSignatureName: String(options.riderSignatureName || '').trim() || undefined,
      riderSignatureData: options.riderSignatureData || undefined,
      cancellationReason: String(options.cancellationReason || '').trim() || undefined,
      cancellationPhotoDataUrl: String(options.cancellationPhotoDataUrl || '').trim() || undefined,
      completionPhotoDataUrl: String(options.completionPhotoDataUrl || '').trim() || undefined,
      locationSnapshot: locationSnapshot || undefined
    };

    await enqueueStoredPendingTripAction(queuedAction);
    setPendingTripActions(current => [...current, queuedAction]);
    setActiveTripAction('');
    void processPendingTripActions();
    return true;
  };

  const sendDriverMessage = async (recipientName?: string, options?: { mediaUrl?: string; mediaType?: string }) => {
    const nextBody = messageDraft.trim();
    const mediaUrl = String(options?.mediaUrl || '').trim();
    const mediaType = String(options?.mediaType || '').trim();
    if (!driverSession?.driverId || (!nextBody && !mediaUrl) || requiresPasswordReset) return false;

    setIsSendingMessage(true);
    try {
      const recipientTag = String(recipientName || '').trim();
      const { response, payload } = await fetchDriverMessagesWithLegacyFallback(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages`, {
        method: 'POST',
        headers: {
          ...getDriverAuthHeaders(driverSession, {
            'Content-Type': 'application/json'
          })
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          body: nextBody || (mediaUrl ? '[Photo]' : ''),
          subject: recipientTag ? `[To: ${recipientTag}] Driver message from ${driverSession.name}` : `Driver message from ${driverSession.name}`,
          deliveryMethod: 'in-app',
          mediaUrl: mediaUrl || undefined,
          mediaType: mediaType || undefined
        })
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to send message.'));

      setMessages(current => appendDriverMessage(current, payload?.message));
      setMessageDraft('');
      setMessagesError('');
      return true;
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Unable to send message.');
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  };

  const sendOutsideSmsNotice = async (trip: DriverTrip | null | undefined, riderMessage: string, phoneNumber?: string) => {
    if (!driverSession?.driverId || !trip || requiresPasswordReset) return false;

    const messageText = String(riderMessage || '').trim();
    if (!messageText) return false;

    const phoneDigits = String(phoneNumber || '').replace(/\D+/g, '');
    const tripReference = String(trip.rideId || trip.id || '').trim() || 'Unknown trip';
    const riderName = String(trip.rider || '').trim() || 'rider';

    setIsSendingMessage(true);
    try {
      const { response, payload } = await fetchDriverMessagesWithLegacyFallback(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages`, {
        method: 'POST',
        headers: {
          ...getDriverAuthHeaders(driverSession, {
            'Content-Type': 'application/json'
          })
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          body: `Driver ${driverSession.name} sent rider SMS for trip ${tripReference} (${riderName})${phoneDigits ? ` to ${phoneDigits}` : ''}: "${messageText}"`,
          subject: `Rider SMS sent for trip ${tripReference}`,
          type: 'rider-sms-outside',
          priority: 'normal',
          deliveryMethod: 'sms'
        })
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to log rider SMS notice.'));

      setMessages(current => appendDriverMessage(current, payload?.message));
      setMessagesError('');
      return true;
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Unable to log rider SMS notice.');
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  };

  const sendPresetDriverAlert = async (mode: 'delay' | 'backup-driver' | 'request-uber') => {
    if (!driverSession?.driverId || !activeTrip || requiresPasswordReset) return false;
    const createdAt = new Date().toISOString();

    const lateMinutes = activeTrip.lateMinutes || '-';
    const tripReference = activeTrip.rideId || activeTrip.id;
    const riderName = activeTrip.rider || 'the rider';

    let subject = `Driver alert for trip ${tripReference}`;
    let body = '';

    if (mode === 'delay') {
      subject = `Late ETA for trip ${tripReference}`;
      body = `Driver ${driverSession.name} reports trip ${tripReference} for ${riderName} is running late by about ${lateMinutes} minutes. Please review coverage and advise if backup help is needed.`;
    }

    if (mode === 'backup-driver') {
      subject = `Backup driver requested for trip ${tripReference}`;
      body = `Driver ${driverSession.name} recommends dispatch send another driver for trip ${tripReference} for ${riderName}. Current late window is about ${lateMinutes} minutes.`;
    }

    if (mode === 'request-uber') {
      subject = `Uber recommended for trip ${tripReference}`;
      body = `Driver ${driverSession.name} recommends sending Uber for trip ${tripReference} for ${riderName} due to delay pressure. Current late window is about ${lateMinutes} minutes.`;
    }

    setMessageDraft(body);
    setIsSendingMessage(true);
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages`, {
        method: 'POST',
        headers: {
          ...getDriverAuthHeaders(driverSession, {
            'Content-Type': 'application/json'
          })
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          tripId: String(activeTrip.id || '').trim(),
          body,
          subject,
          createdAt,
          type: mode === 'delay' ? 'delay-alert' : mode === 'backup-driver' ? 'backup-driver-request' : 'uber-request',
          priority: 'high',
          deliveryMethod: 'in-app'
        })
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to send driver alert.'));

      if (!payload?.suppressed) {
        setMessages(current => appendDriverMessage(current, payload?.message));
      }
      setMessageDraft('');
      setMessagesError('');
      return true;
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Unable to send driver alert.');
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  };

  const updateDriverProfile = async (nextProfile: { name: string; email: string; phone: string; address: string }) => {
    if (!driverSession?.driverId) return false;

    setIsSavingProfile(true);
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-profile`, {
        method: 'POST',
        headers: {
          ...getDriverAuthHeaders(driverSession, {
            'Content-Type': 'application/json'
          })
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          ...nextProfile
        })
      });

      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;

      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to save profile.'));
      }

      setDriverSession(payload.session);
      setDriverCode(payload.session.driverCode || payload.session.username || payload.session.driverId);
      setProfileError('');
      await writeStoredDriverSession(payload.session);
      await loadDriverDocuments(true);
      return true;
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save profile.');
      return false;
    } finally {
      setIsSavingProfile(false);
    }
  };

  const uploadDriverDocument = async (documentKey: keyof DriverDocuments, fileDataUrl: string, fileName: string) => {
    if (!driverSession?.driverId || !fileDataUrl.trim()) return false;

    setIsUploadingDocument(true);
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-documents`, {
        method: 'POST',
        headers: {
          ...getDriverAuthHeaders(driverSession, {
            'Content-Type': 'application/json'
          })
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          documentKey,
          fileDataUrl,
          fileName
        })
      });

      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;

      if (!response.ok) {
        throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to upload document.'));
      }

      setDriverDocuments(payload?.documents || driverDocuments);
      const profilePhotoUrl = String(payload?.profilePhotoUrl || getDocumentUri(payload?.documents?.profilePhoto) || '').trim();
      setDriverSession(current => current ? {
        ...current,
        profilePhotoUrl: profilePhotoUrl || current.profilePhotoUrl || ''
      } : current);
      setDocumentsError('');
      return true;
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : 'Unable to upload document.');
      return false;
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const uploadDriverDocumentFile = async (documentKey: keyof DriverDocuments, fileUri: string, mimeType: string, fileName: string): Promise<boolean> => {
    if (!driverSession?.driverId || !fileUri) return false;
    setIsUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append('driverId', driverSession.driverId);
      formData.append('documentKey', documentKey);
      formData.append('fileName', fileName);
      // React Native supports file URI in FormData without reading to base64
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formData.append('file', { uri: fileUri, type: mimeType, name: fileName } as any);
      const authHeaders = getDriverAuthHeaders(driverSession);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
      let response: Response;
      let payload: Record<string, unknown>;
      try {
        response = await fetch(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-documents`, {
          method: 'POST',
          headers: authHeaders,
          body: formData,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(String(payload?.error || '') || getMobileApiErrorMessage(response, 'Unable to upload document.'));
      setDriverDocuments((payload?.documents as DriverDocuments) || driverDocuments);
      const profilePhotoUrl = String(payload?.profilePhotoUrl || getDocumentUri((payload?.documents as DriverDocuments)?.profilePhoto) || '').trim();
      setDriverSession(current => current ? { ...current, profilePhotoUrl: profilePhotoUrl || current.profilePhotoUrl || '' } : current);
      setDocumentsError('');
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setDocumentsError('Upload took too long and was stopped. Please try a smaller photo.');
      } else {
        setDocumentsError(error instanceof Error ? error.message : 'Unable to upload document.');
      }
      return false;
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const submitFuelReceipt = async (payload: {
    serviceDate: string;
    amount: number;
    gallons: number;
    vehicleMileage: number | null;
    receiptReference: string;
    receiptImageUrl: string;
    notes: string;
  }): Promise<boolean> => {
    if (!loggedIn || !driverSession) return false;
    setIsSubmittingFuelReceipt(true);
    setFuelReceiptError('');
    setFuelReceiptSuccess('');
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      const { response, payload: resPayload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-receipts`,
        {
          method: 'POST',
          headers: getDriverAuthHeaders(driverSession, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ ...payload, driverId })
        }
      );
      if (await handleDriverSessionFailure(response, resPayload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(String(resPayload?.error || '') || 'Unable to submit fuel receipt.');
      const created = resPayload?.receipt as DriverFuelReceipt | undefined;
      if (created) setFuelReceipts(current => [created, ...current]);
      setFuelReceiptSuccess('Fuel receipt submitted successfully.');
      return true;
    } catch (error) {
      setFuelReceiptError(error instanceof Error ? error.message : 'Unable to submit fuel receipt.');
      return false;
    } finally {
      setIsSubmittingFuelReceipt(false);
    }
  };

  const loadFuelReceipts = async (serviceDate = '') => {
    if (!loggedIn || !driverSession) return;
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      const query = new URLSearchParams();
      if (serviceDate) query.set('serviceDate', serviceDate);
      if (driverId) query.set('driverId', driverId);
      const { response, payload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-receipts${query.toString() ? `?${query.toString()}` : ''}`,
        { headers: getDriverAuthHeaders(driverSession) }
      );
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) return;
      setFuelReceipts(Array.isArray(payload?.rows) ? (payload.rows as DriverFuelReceipt[]) : []);
    } catch {
      // non-critical, fail silently
    }
  };

  const loadFuelRequests = async () => {
    if (!loggedIn || !driverSession) return;
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      const { response, payload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-request${driverId ? `?driverId=${encodeURIComponent(driverId)}` : ''}`,
        { headers: getDriverAuthHeaders(driverSession) }
      );
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) return;
      setFuelRequests(Array.isArray(payload?.rows) ? (payload.rows as DriverFuelRequest[]) : []);
    } catch {
      // non-critical
    }
  };

  const submitFuelRequest = async (requestPayload: { requestedMileage: number }): Promise<boolean> => {
    if (!loggedIn || !driverSession) return false;
    setIsSubmittingFuelRequest(true);
    setFuelRequestError('');
    setFuelRequestSuccess('');
    setDriverTimeOffAppointment(null);
    setDriverTimeOffError('');
    setDriverTimeOffSuccess('');
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      const requestedMileage = Number(requestPayload?.requestedMileage);
      if (!Number.isFinite(requestedMileage) || requestedMileage < 0) {
        throw new Error('Current mileage is required.');
      }

      const { response, payload: responsePayload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-request`,
        {
          method: 'POST',
          headers: getDriverAuthHeaders(driverSession, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ driverId, requestedMileage })
        }
      );
      if (await handleDriverSessionFailure(response, responsePayload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(String(responsePayload?.error || '') || 'Unable to submit fuel request.');
      const created = responsePayload?.request as DriverFuelRequest | undefined;
      if (created) setFuelRequests(current => [created, ...current]);
      const mileageDelta = created?.milesSinceLastFuel;
      if (mileageDelta != null && Number.isFinite(Number(mileageDelta))) {
        setFuelRequestSuccess(`Fuel request submitted! You drove ${Number(mileageDelta).toFixed(1)} miles since last fuel.`);
      } else {
        setFuelRequestSuccess('Fuel request submitted! Waiting for dispatcher approval.');
      }
      return true;
    } catch (error) {
      setFuelRequestError(error instanceof Error ? error.message : 'Unable to submit fuel request.');
      return false;
    } finally {
      setIsSubmittingFuelRequest(false);
    }
  };

  const submitFuelRequestReceipt = async (payload: {
    requestId: string;
    serviceDate: string;
    receiptImageUrl: string;
    paymentCardImageUrl: string;
    paymentCardLast4: string;
    gallons: number;
    vehicleMileage: number;
  }): Promise<boolean> => {
    if (!loggedIn || !driverSession) return false;
    setIsSubmittingFuelRequest(true);
    setFuelRequestError('');
    setFuelRequestSuccess('');
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      const { response, payload: resPayload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-request/${encodeURIComponent(payload.requestId)}/receipt`,
        {
          method: 'POST',
          headers: getDriverAuthHeaders(driverSession, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ ...payload, driverId })
        }
      );
      if (await handleDriverSessionFailure(response, resPayload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(String(resPayload?.error || '') || 'Unable to submit receipt.');
      const updated = resPayload?.request as DriverFuelRequest | undefined;
      if (updated) {
        setFuelRequests(current => current.map(r => r.id === updated.id ? updated : r));
      }
      setFuelRequestSuccess('Receipt submitted! Added to Genius billing.');
      return true;
    } catch (error) {
      setFuelRequestError(error instanceof Error ? error.message : 'Unable to submit receipt.');
      return false;
    } finally {
      setIsSubmittingFuelRequest(false);
    }
  };

  const loadDriverTimeOff = async () => {
    if (!loggedIn || !driverSession?.driverId) return;

    try {
      const { response, payload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-time-off?driverId=${encodeURIComponent(driverSession.driverId)}`,
        {
          headers: getDriverAuthHeaders(driverSession)
        }
      );

      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) return;

      const nextAppointment = payload?.appointment as DriverTimeOffAppointment | null | undefined;
      setDriverTimeOffAppointment(nextAppointment || null);
      setDriverTimeOffError('');
    } catch {
      // non-critical
    }
  };

  const submitDriverTimeOff = async (payload: {
    appointmentType: string;
    appointmentDate: string;
    note: string;
    excuseImageUrl: string;
  }): Promise<boolean> => {
    if (!loggedIn || !driverSession?.driverId) return false;

    setIsSubmittingDriverTimeOff(true);
    setDriverTimeOffError('');
    setDriverTimeOffSuccess('');

    try {
      const { response, payload: responsePayload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-time-off`,
        {
          method: 'POST',
          headers: getDriverAuthHeaders(driverSession, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            driverId: driverSession.driverId,
            ...payload
          })
        }
      );

      if (await handleDriverSessionFailure(response, responsePayload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) {
        throw new Error(String(responsePayload?.error || '') || 'Unable to submit time off.');
      }

      const nextAppointment = responsePayload?.appointment as DriverTimeOffAppointment | null | undefined;
      if (nextAppointment) {
        setDriverTimeOffAppointment(nextAppointment);
        const nextSession = {
          ...driverSession,
          timeOffAppointment: nextAppointment
        };
        setDriverSession(nextSession);
        await writeStoredDriverSession(nextSession);
      }
      setDriverTimeOffSuccess('Time off saved. Dispatch was notified and route assignment is blocked for that date.');
      return true;
    } catch (error) {
      setDriverTimeOffError(error instanceof Error ? error.message : 'Unable to submit time off.');
      return false;
    } finally {
      setIsSubmittingDriverTimeOff(false);
    }
  };

  const clearDriverTimeOff = async (): Promise<boolean> => {
    if (!loggedIn || !driverSession?.driverId) return false;

    setIsSubmittingDriverTimeOff(true);
    setDriverTimeOffError('');
    setDriverTimeOffSuccess('');

    try {
      const { response, payload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-time-off?driverId=${encodeURIComponent(driverSession.driverId)}`,
        {
          method: 'DELETE',
          headers: getDriverAuthHeaders(driverSession)
        }
      );

      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) {
        throw new Error(String(payload?.error || '') || 'Unable to clear time off.');
      }

      setDriverTimeOffAppointment(null);
      const nextSession = {
        ...driverSession,
        timeOffAppointment: null
      };
      setDriverSession(nextSession);
      await writeStoredDriverSession(nextSession);
      setDriverTimeOffSuccess('You are active again. Dispatch was notified and route assignment can resume.');
      return true;
    } catch (error) {
      setDriverTimeOffError(error instanceof Error ? error.message : 'Unable to clear time off.');
      return false;
    } finally {
      setIsSubmittingDriverTimeOff(false);
    }
  };

  const resetFuelData = async (): Promise<boolean> => {
    if (!loggedIn || !driverSession) return false;
    setIsSubmittingFuelRequest(true);
    setFuelRequestError('');
    setFuelRequestSuccess('');
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      let call = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-request${driverId ? `?driverId=${encodeURIComponent(driverId)}` : ''}`,
        {
          method: 'DELETE',
          headers: getDriverAuthHeaders(driverSession)
        }
      );

      if (!call.response.ok) {
        call = await fetchJsonWithTimeout(
          `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-request/reset`,
          {
            method: 'POST',
            headers: getDriverAuthHeaders(driverSession, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ driverId })
          }
        );
      }

      const { response, payload } = call;
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(String(payload?.error || '') || getMobileApiErrorMessage(response, 'Unable to reset fuel data.'));
      setFuelRequests([]);
      setFuelRequestSuccess('Fuel requests reset. You can start from zero now.');
      return true;
    } catch (error) {
      setFuelRequestError(error instanceof Error ? error.message : 'Unable to reset fuel data.');
      return false;
    } finally {
      setIsSubmittingFuelRequest(false);
    }
  };

  return {
    driverCode,
    tripDateFilter,
    setTripDateFilter,
    setDriverCode,
    password,
    setPassword,
    loggedIn,
    driverSession,
    activeTab,
    setActiveTab,
    trackingEnabled,
    setTrackingEnabled,
    permissionStatus,
    locationServicesEnabled,
    locationSnapshot,
    watchError,
    backgroundTrackingError,
    currentCity,
    authError,
    isSigningIn,
    isRestoringSession,
    isRequestingPermission,
    isSyncingLocation,
    isManagingBackgroundTracking,
    isBackgroundTrackingEnabled,
    shiftState,
    setShiftState,
    assignedTrips,
    activeTrip,
    setActiveTrip,
    isLoadingTrips,
    tripSyncError,
    lastTripSyncAt,
    messages,
    unreadIncomingMessageCount,
    driverReviewSummary,
    driverReviewError,
    messageDraft,
    setMessageDraft,
    messagesError,
    lastMessageSyncAt,
    isLoadingMessages,
    isSendingMessage,
    tripActionError,
    activeTripAction,
    pendingTripActions,
    pendingTripActionCount: pendingTripActions.length,
    isProcessingPendingTripActions,
    isSavingProfile,
    profileError,
    isChangingPassword,
    passwordChangeError,
    requiresPasswordReset,
    driverDocuments,
    isLoadingDocuments,
    isUploadingDocument,
    documentsError,
    notificationMode,
    notificationPermissionGranted,
    notificationError,
    isRegisteringPushToken,
    currentAlert,
    lateRiskTrip,
    statusCard,
    signIn,
    signOut,
    changeDriverPassword,
    requestLocationPermission,
    reloadTrips,
    resendPendingTripActions,
    requestNotificationPermission,
    setDriverNotificationMode,
    submitTripAction,
    sendDriverMessage,
    sendOutsideSmsNotice,
    sendPresetDriverAlert,
    updateDriverProfile,
    uploadDriverDocument,
    uploadDriverDocumentFile,
    reloadDriverDocuments: () => loadDriverDocuments(true),
    reloadDriverReviewSummary: () => loadDriverReviewSummary(true),
    reloadMessages: () => loadMessages(true),
    fuelReceipts,
    isSubmittingFuelReceipt,
    fuelReceiptError,
    fuelReceiptSuccess,
    setFuelReceiptSuccess,
    setFuelReceiptError,
    submitFuelReceipt,
    loadFuelReceipts,
    fuelRequests,
    isSubmittingFuelRequest,
    fuelRequestError,
    fuelRequestSuccess,
    setFuelRequestSuccess,
    setFuelRequestError,
    submitFuelRequest,
    submitFuelRequestReceipt,
    resetFuelData,
    loadFuelRequests,
    driverTimeOffAppointment,
    isSubmittingDriverTimeOff,
    driverTimeOffError,
    driverTimeOffSuccess,
    setDriverTimeOffError,
    setDriverTimeOffSuccess,
    loadDriverTimeOff,
    submitDriverTimeOff,
    clearDriverTimeOff,
    formatDateTime
  };
};

export type DriverRuntime = ReturnType<typeof useDriverRuntime>;
