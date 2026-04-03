import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Vibration } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { DRIVER_APP_CONFIG } from '../config/driverAppConfig';
import { DriverNotificationMode, clearStoredDriverSession, readStoredDriverSession, readStoredNotificationMode, readStoredTrackingPreference, writeStoredDriverSession, writeStoredNotificationMode, writeStoredTrackingPreference } from '../services/driverSessionStorage';
import { isBackgroundLocationTrackingActive, startBackgroundLocationTracking, stopBackgroundLocationTracking } from '../services/driverBackgroundLocation';
import { DriverAppTab, DriverDocuments, DriverMessage, DriverSession, DriverShiftState, DriverTrip, LocationSnapshot } from '../types/driver';

const formatDateTime = (value: number | null) => {
  if (!value) return 'No update yet';
  return new Date(value).toLocaleString();
};

const SESSION_RESTORE_TIMEOUT_MS = 2500;
const NETWORK_TIMEOUT_MS = 20000;

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
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

export const useDriverRuntime = () => {
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
  const [messageDraft, setMessageDraft] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [tripActionError, setTripActionError] = useState('');
  const [activeTripAction, setActiveTripAction] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [driverDocuments, setDriverDocuments] = useState<DriverDocuments>(EMPTY_DRIVER_DOCUMENTS);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [currentCity, setCurrentCity] = useState('Locating city...');
  const [notificationMode, setNotificationMode] = useState<DriverNotificationMode>('sound');
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [isRegisteringPushToken, setIsRegisteringPushToken] = useState(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  const setTrackingEnabled = (nextValue: boolean) => {
    setTrackingEnabledState(nextValue);
    void writeStoredTrackingPreference(nextValue);
  };

  const reloadTrips = async () => {
    if (!loggedIn) return false;

    try {
      const lookupQuery = driverSession?.driverId ? `driverId=${encodeURIComponent(driverSession.driverId)}` : `driverCode=${encodeURIComponent(driverCode.trim())}`;
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-trips?${lookupQuery}`);
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
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages?driverId=${encodeURIComponent(driverSession.driverId)}`);
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load messages.'));
      if (!signalActive) return;
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setMessagesError('');
    } catch (error) {
      if (!signalActive) return;
      setMessages([]);
      setMessagesError(error instanceof Error ? error.message : 'Unable to load messages.');
    } finally {
      if (signalActive) setIsLoadingMessages(false);
    }
  };

  const loadDriverDocuments = async (signalActive = true) => {
    if (!loggedIn || !driverSession?.driverId) return;
    setIsLoadingDocuments(true);
    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-documents?driverId=${encodeURIComponent(driverSession.driverId)}`);
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to load documents.'));
      if (!signalActive) return;
      setDriverDocuments(payload?.documents || EMPTY_DRIVER_DOCUMENTS);
      setDriverSession(current => current ? {
        ...current,
        profilePhotoUrl: payload?.profilePhotoUrl || current.profilePhotoUrl || ''
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            driverId: driverSession.driverId,
            pushToken
          })
        });

        if (!response.ok) {
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
        distanceInterval: DRIVER_APP_CONFIG.gpsDistanceIntervalMeters,
        timeInterval: DRIVER_APP_CONFIG.gpsTimeIntervalMs
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
  }, [loggedIn, trackingEnabled]);

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
      setMessagesError('');
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
            'Content-Type': 'application/json'
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

      if (notificationMode === 'vibrate') {
        Vibration.vibrate([0, 300, 120, 300]);
      }

      if (notificationMode === 'silent') return;

      await Notifications.scheduleNotificationAsync({
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

  const signIn = async () => {
    if (!driverCode.trim()) {
      setAuthError('Enter your email or username first.');
      return false;
    }
    if (!password.trim()) {
      setAuthError('Enter your password.');
      return false;
    }

    setIsSigningIn(true);

    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier: driverCode.trim(),
          password: password.trim(),
          pin: password.trim()
        })
      });

      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to sign in.'));
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
    setLoggedIn(false);
    setDriverSession(null);
    setTrackingEnabled(false);
    setActiveTab('home');
    setShiftState('available');
    setLocationSnapshot(null);
    setWatchError('');
    setTripSyncError('');
    setMessages([]);
    setMessageDraft('');
    seenMessageIdsRef.current.clear();
    setDriverDocuments(EMPTY_DRIVER_DOCUMENTS);
    setDocumentsError('');
    setPassword('');
    setBackgroundTrackingError('');
    setIsBackgroundTrackingEnabled(false);
    await stopBackgroundLocationTracking();
    await clearStoredDriverSession();
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

      const backgroundPermission = await Location.getBackgroundPermissionsAsync();
      if (backgroundPermission.status !== 'granted') {
        setBackgroundTrackingError('Foreground GPS is allowed. The app will open Android settings so you can set Location to "Allow all the time".');
        await Linking.openSettings();
        return;
      }

      setBackgroundTrackingError('');
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

  const submitTripAction = async (action: 'en-route' | 'arrived' | 'complete') => {
    if (!driverSession?.driverId || !activeTrip?.id) return false;

    setActiveTripAction(action);
    setTripActionError('');

    const optimisticStatus = action === 'en-route' ? 'In Progress' : action === 'arrived' ? 'Arrived' : 'Completed';
    setAssignedTrips(current => current.map(trip => trip.id === activeTrip.id ? {
      ...trip,
      status: optimisticStatus
    } : trip));
    setActiveTrip(current => current?.id === activeTrip.id ? {
      ...current,
      status: optimisticStatus
    } : current);

    try {
      const { response, payload } = await fetchJsonWithTimeout(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-trip-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          tripId: activeTrip.id,
          action
        })
      });
      if (!response.ok) throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to update trip.'));

      if (action === 'en-route') setShiftState('en-route');
      if (action === 'arrived') setShiftState('arrived');
      if (action === 'complete') setShiftState('completed');
      await reloadTrips();
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
          'Content-Type': 'application/json'
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
      const response = await fetch(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send driver alert.');

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          ...nextProfile
        })
      });

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          driverId: driverSession.driverId,
          documentKey,
          fileDataUrl,
          fileName
        })
      });

      if (!response.ok) {
        throw new Error(payload?.error || getMobileApiErrorMessage(response, 'Unable to upload document.'));
      }

      setDriverDocuments(payload?.documents || driverDocuments);
      setDriverSession(current => current ? {
        ...current,
        profilePhotoUrl: payload?.profilePhotoUrl || current.profilePhotoUrl || ''
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

  return {
    driverCode,
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
    messageDraft,
    setMessageDraft,
    messagesError,
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
    sendPresetDriverAlert,
    updateDriverProfile,
    uploadDriverDocument,
    reloadDriverDocuments: () => loadDriverDocuments(true),
    reloadMessages: () => loadMessages(true),
    formatDateTime
  };
};

export type DriverRuntime = ReturnType<typeof useDriverRuntime>;