import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Vibration } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { DRIVER_APP_CONFIG } from '../config/driverAppConfig';
import { DriverNotificationMode, clearStoredDriverSession, readOrCreateDriverDeviceId, readStoredDriverSession, readStoredNotificationMode, readStoredTrackingPreference, writeStoredDriverSession, writeStoredNotificationMode, writeStoredTrackingPreference } from '../services/driverSessionStorage';
import { isBackgroundLocationTrackingActive, startBackgroundLocationTracking, stopBackgroundLocationTracking } from '../services/driverBackgroundLocation';
import { DriverAppTab, DriverDocuments, DriverFuelReceipt, DriverFuelRequest, DriverMessage, DriverReviewSummary, DriverSession, DriverShiftState, DriverTrip, LocationSnapshot } from '../types/driver';

const formatDateTime = (value: number | null) => {
  if (!value) return 'No update yet';
  return new Date(value).toLocaleString();
};

const SESSION_RESTORE_TIMEOUT_MS = 2500;
const NETWORK_TIMEOUT_MS = 45000;
const isLocalPasswordlessDriverLoginEnabled = __DEV__;
const DRIVER_RENDER_API_BASE_URL = 'https://care-mobility-dispatch-web.onrender.com';
const DRIVER_ALERT_CHANNEL_ID = 'driver-alerts';
const shouldRegisterRemotePushToken = true;

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});
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

export const useDriverRuntime = () => {
  const [tripDateFilter, setTripDateFilter] = useState<'all' | 'today' | 'next-day'>('all');
  const [driverCode, setDriverCode] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [driverSession, setDriverSession] = useState<DriverSession | null>(null);
  const [activeTab, setActiveTab] = useState<DriverAppTab>('home');
  const [trackingEnabled, setTrackingEnabledState] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
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
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
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
  const [currentCity, setCurrentCity] = useState('Locating city...');
  const [notificationMode, setNotificationMode] = useState<DriverNotificationMode>('sound');
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [isRegisteringPushToken, setIsRegisteringPushToken] = useState(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const requestedBackgroundSettingsRef = useRef(false);

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
    const code = String(payload?.code || '').trim().toLowerCase();
    if (![401, 409].includes(response.status) || !code.startsWith('driver-session')) {
      return false;
    }

    await clearDriverRuntimeState(payload?.error || fallbackMessage);
    return true;
  };

  const setTrackingEnabled = (nextValue: boolean) => {
    setTrackingEnabledState(nextValue);
    void writeStoredTrackingPreference(nextValue);
  };

  const reloadTrips = async () => {
    if (!loggedIn) return false;

    try {
      const lookupQuery = driverSession?.driverId ? `driverId=${encodeURIComponent(driverSession.driverId)}` : `driverCode=${encodeURIComponent(driverCode.trim())}`;
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-trips?${lookupQuery}`, {
        headers: getDriverAuthHeaders(driverSession)
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load trips.'));

      const nextTrips: DriverTrip[] = Array.isArray(payload?.trips) ? payload.trips : [];
      setAssignedTrips(nextTrips);
      setActiveTrip(currentTrip => {
        if (currentTrip) {
          const refreshedCurrentTrip = nextTrips.find(trip => trip.id === currentTrip.id);
          if (refreshedCurrentTrip) return refreshedCurrentTrip;
        }
        return payload?.activeTrip ?? nextTrips[0] ?? null;
      });
      setTripSyncError('');
      setLastTripSyncAt(Date.now());
      return true;
    } catch (error) {
      setTripSyncError(error instanceof Error ? error.message : 'Unable to load trips.');
      return false;
    }
  };

  const loadMessages = async (signalActive = true) => {
    if (!loggedIn || !driverSession?.driverId) return;
    setIsLoadingMessages(true);
    try {
      const requestUrl = `${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages?driverId=${encodeURIComponent(driverSession.driverId)}&t=${Date.now()}`;
      const { response, payload } = await fetchJsonWithTimeout(requestUrl, {
        cache: 'no-store',
        headers: getDriverAuthHeaders(driverSession)
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load messages.'));
      if (!signalActive) return;
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
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
    if (!loggedIn || !driverSession?.driverId) return;
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
    void Notifications.setNotificationChannelAsync(DRIVER_ALERT_CHANNEL_ID, {
      name: 'Dispatcher Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 120, 300],
      enableVibrate: true,
      enableLights: true,
      lightColor: '#16a34a',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      showBadge: true
    });
  }, []);

  useEffect(() => {
    if (!shouldRegisterRemotePushToken) return;
    if (!loggedIn || !driverSession?.driverId || !notificationPermissionGranted || isRegisteringPushToken) return;

    let active = true;
    const registerPushToken = async () => {
      try {
        setIsRegisteringPushToken(true);
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        if (!projectId) {
          throw new Error('Missing EAS project ID for push registration.');
        }

        const tokenPayload = await Notifications.getExpoPushTokenAsync({ projectId });
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
      const settings = await Notifications.getPermissionsAsync();
      if (!active) return;
      const granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
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
      if (!trackingEnabled || !loggedIn) return;

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionStatus('denied');
        setTrackingEnabled(false);
        setWatchError('Location permission denied. Tap Refresh GPS permissions and allow location access.');
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
  }, [effectiveForegroundGpsDistanceIntervalMeters, effectiveForegroundGpsTimeIntervalMs, loggedIn, trackingEnabled]);

  useEffect(() => {
    let active = true;

    const syncBackgroundTrackingState = async () => {
      if (!loggedIn) {
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
  }, [loggedIn]);

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

      if (!loggedIn || !driverSession?.driverId) {
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
  }, [driverSession?.driverId, loggedIn, trackingEnabled]);

  useEffect(() => {
    if (!loggedIn || !trackingEnabled || !driverSession?.driverId || !DRIVER_APP_CONFIG.enableBackgroundTracking) return;

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
  }, [driverSession?.driverId, loggedIn, trackingEnabled]);

  useEffect(() => {
    if (!loggedIn) {
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
        setAssignedTrips([]);
        setActiveTrip(null);
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
  }, [driverCode, driverSession?.driverId, loggedIn]);

  useEffect(() => {
    if (!loggedIn || !driverSession?.driverId) {
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
  }, [driverSession?.driverId, loggedIn]);

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
    if (!loggedIn || !driverSession?.driverId) {
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
  }, [driverSession?.driverId, loggedIn]);

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
    if (!loggedIn || !driverSession?.driverId) {
      setDriverDocuments(EMPTY_DRIVER_DOCUMENTS);
      setDocumentsError('');
      return;
    }

    let active = true;
    void loadDriverDocuments(active);
    return () => {
      active = false;
    };
  }, [driverSession?.driverId, loggedIn]);

  useEffect(() => {
    if (!trackingEnabled || !loggedIn || !driverSession?.driverId || !locationSnapshot) return;

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
  }, [currentCity, driverSession?.driverId, locationSnapshot, loggedIn, trackingEnabled]);

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

      await Notifications.scheduleNotificationAsync({
        content: {
          title: latest.subject || 'New dispatch message',
          body: latest.body || 'You have a new dispatcher message.',
          sound: notificationMode === 'sound' ? 'default' : undefined,
          channelId: DRIVER_ALERT_CHANNEL_ID
        },
        trigger: null
      });
    };

    void notify();
  }, [loggedIn, messages, notificationMode, notificationPermissionGranted]);

  const statusCard = useMemo(() => {
    if (!loggedIn) return 'Sign in to begin driver operations.';
    if (!trackingEnabled) return 'Tracking is off. Turn it on when your shift starts.';
    if (permissionStatus !== 'granted') return 'Waiting for GPS permission.';
    if (backgroundTrackingError) return backgroundTrackingError;
    if (isManagingBackgroundTracking) return 'Preparing background GPS tracking for dispatcher.';
    if (isBackgroundTrackingEnabled) return 'Background GPS is active and dispatcher can keep tracking the vehicle.';
    if (isSyncingLocation) return 'GPS is active and syncing to dispatch.';
    if (locationSnapshot) return 'GPS is active and ready to sync with dispatcher.';
    return 'Preparing GPS...';
  }, [backgroundTrackingError, isBackgroundTrackingEnabled, isManagingBackgroundTracking, isSyncingLocation, locationSnapshot, loggedIn, permissionStatus, trackingEnabled]);

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

  const requestLocationPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const foregroundPermission = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(foregroundPermission.status === 'granted' ? 'granted' : 'denied');
      if (foregroundPermission.status !== 'granted') {
        setWatchError('Location permission denied.');
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
      const settings = await Notifications.requestPermissionsAsync();
      const granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
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

  const submitTripAction = async (action: 'accept' | 'en-route' | 'arrived' | 'patient-onboard' | 'start-trip' | 'arrived-destination' | 'complete' | 'cancel', options: {
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
    if (!driverSession?.driverId || !targetTripId) return false;

    setActiveTripAction(action);
    setTripActionError('');

    const optimisticStatus = action === 'complete'
      ? 'Completed'
      : action === 'cancel'
        ? 'Cancelled'
      : action === 'arrived' || action === 'arrived-destination'
        ? 'Arrived'
        : 'In Progress';
    setAssignedTrips(current => current.map(trip => trip.id === targetTripId ? {
      ...trip,
      status: optimisticStatus
    } : trip));
    setActiveTrip(current => current?.id === targetTripId ? {
      ...current,
      status: optimisticStatus
    } : current);

    try {
      const sendTripActionRequest = async (overrides: Record<string, unknown> = {}) => {
        return await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-trip-actions`, {
          method: 'POST',
          headers: {
            ...getDriverAuthHeaders(driverSession, {
              'Content-Type': 'application/json'
            })
          },
          body: JSON.stringify({
            driverId: driverSession.driverId,
            tripId: targetTripId,
            action,
            riderSignatureName: String(options.riderSignatureName || '').trim() || undefined,
            riderSignatureData: options.riderSignatureData || undefined,
            cancellationReason: String(options.cancellationReason || '').trim() || undefined,
            cancellationPhotoDataUrl: String(options.cancellationPhotoDataUrl || '').trim() || undefined,
            completionPhotoDataUrl: String(options.completionPhotoDataUrl || '').trim() || undefined,
            locationSnapshot: locationSnapshot || undefined,
            ...overrides
          })
        });
      };

      let { response, payload } = await sendTripActionRequest();
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;

      const actionAllowsSignatureBypass = ['en-route', 'arrived', 'patient-onboard', 'start-trip', 'arrived-destination'].includes(action);
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

      if (action === 'accept') setShiftState('available');
      if (action === 'en-route') setShiftState('en-route');
      if (action === 'arrived') setShiftState('arrived');
      if (action === 'start-trip') setShiftState('en-route');
      if (action === 'arrived-destination') setShiftState('arrived');
      if (action === 'complete') setShiftState('completed');
      if (action === 'cancel') setShiftState('available');
      await reloadTrips();
      await loadDriverReviewSummary(true);
      if (action === 'complete' || action === 'cancel') setActiveTab('history');
      return true;
    } catch (error) {
      setTripActionError(error instanceof Error ? error.message : 'Unable to update trip.');
      await reloadTrips();
      return false;
    } finally {
      setActiveTripAction('');
    }
  };

  const sendDriverMessage = async (recipientName?: string, options?: { mediaUrl?: string; mediaType?: string }) => {
    const nextBody = messageDraft.trim();
    const mediaUrl = String(options?.mediaUrl || '').trim();
    const mediaType = String(options?.mediaType || '').trim();
    if (!driverSession?.driverId || (!nextBody && !mediaUrl)) return false;

    setIsSendingMessage(true);
    try {
      const recipientTag = String(recipientName || '').trim();
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages`, {
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

      setMessages(current => [payload.message, ...current]);
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
    if (!driverSession?.driverId || !trip) return false;

    const messageText = String(riderMessage || '').trim();
    if (!messageText) return false;

    const phoneDigits = String(phoneNumber || '').replace(/\D+/g, '');
    const tripReference = String(trip.rideId || trip.id || '').trim() || 'Unknown trip';
    const riderName = String(trip.rider || '').trim() || 'rider';

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
          body: `Driver ${driverSession.name} sent rider SMS for trip ${tripReference} (${riderName})${phoneDigits ? ` to ${phoneDigits}` : ''}: "${messageText}"`,
          subject: `Rider SMS sent for trip ${tripReference}`,
          type: 'rider-sms-outside',
          priority: 'normal',
          deliveryMethod: 'sms'
        })
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to log rider SMS notice.'));

      setMessages(current => [payload.message, ...current]);
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
    if (!driverSession?.driverId || !activeTrip) return false;

    const lateMinutes = activeTrip.lateMinutes || '-';
    const tripReference = activeTrip.rideId || activeTrip.id;
    const riderName = activeTrip.rider || 'the rider';

    let subject = `Driver alert for trip ${tripReference}`;
    let body = '';

    if (mode === 'delay') {
      subject = `Late ETA for trip ${tripReference}`;
      body = `Driver ${driverSession.name} reports trip ${tripReference} for ${riderName} is running late by about ${lateMinutes} minutes. Please review coverage and advise if another driver or Uber is needed.`;
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
          body,
          subject,
          type: mode === 'delay' ? 'delay-alert' : mode === 'backup-driver' ? 'backup-driver-request' : 'uber-request',
          priority: 'high',
          deliveryMethod: 'in-app'
        })
      });
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to send driver alert.'));

      setMessages(current => [payload.message, ...current]);
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

  const updateDriverProfile = async (nextProfile: { name: string; email: string; phone: string }) => {
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

  const submitFuelRequest = async (payload: { requestedMileage: number }): Promise<boolean> => {
    if (!loggedIn || !driverSession) return false;
    setIsSubmittingFuelRequest(true);
    setFuelRequestError('');
    setFuelRequestSuccess('');
    try {
      const driverId = String(driverSession?.driverId || '').trim();
      const { response, payload } = await fetchJsonWithTimeout(
        `${DRIVER_APP_CONFIG.apiBaseUrl}/api/driver-portal/me/fuel-request`,
        {
          method: 'POST',
          headers: getDriverAuthHeaders(driverSession, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ driverId, requestedMileage: payload.requestedMileage })
        }
      );
      if (await handleDriverSessionFailure(response, payload, 'Your driver session ended. Sign in again.')) return false;
      if (!response.ok) throw new Error(String(payload?.error || '') || 'Unable to submit fuel request.');
      const created = payload?.request as DriverFuelRequest | undefined;
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
    isSavingProfile,
    profileError,
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
    requestLocationPermission,
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
    formatDateTime
  };
};

export type DriverRuntime = ReturnType<typeof useDriverRuntime>;
