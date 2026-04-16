'use client';

import { buildTripProviderSnapshot, getTripServiceDateKey, normalizeDailyDriverRecord, normalizeDispatchAuditRecord, normalizeDispatchMessageRecord, normalizeDispatchThreadRecord, normalizeDispatcherVisibleTripColumns, normalizeMapProviderPreference, normalizeNemtUiPreferences, normalizePersistentDispatchState, normalizeRoutePlanRecord, normalizeTripRecord, normalizeTripRecords } from '@/helpers/nemt-dispatch-state';
import { normalizePrintSetup } from '@/helpers/nemt-print-setup';
import { normalizeUserPreferences } from '@/helpers/user-preferences';
import { hasMapboxConfigured } from '@/utils/map-tiles';
import { useSession } from 'next-auth/react';
import { createContext, startTransition, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_VERSION = 5;
const INITIAL_DRIVERS = [];
const INITIAL_TRIPS = [];
const INITIAL_ROUTE_PLANS = [];

const buildClientState = value => ({
  version: STORAGE_VERSION,
  drivers: Array.isArray(value?.drivers) ? value.drivers.map(driver => ({
    ...driver
  })) : INITIAL_DRIVERS.map(driver => ({
    ...driver
  })),
  trips: Array.isArray(value?.trips) ? normalizeTripRecords(value?.trips) : INITIAL_TRIPS.map(trip => ({
    ...trip
  })),
  routePlans: Array.isArray(value?.routePlans) ? value.routePlans.map(normalizeRoutePlanRecord) : INITIAL_ROUTE_PLANS.map(routePlan => ({
    ...routePlan,
    tripIds: [...routePlan.tripIds]
  })),
  dispatchThreads: Array.isArray(value?.dispatchThreads) ? value.dispatchThreads.map(normalizeDispatchThreadRecord) : [],
  dailyDrivers: Array.isArray(value?.dailyDrivers) ? value.dailyDrivers.map(normalizeDailyDriverRecord) : [],
  auditLog: Array.isArray(value?.auditLog) ? value.auditLog.map(normalizeDispatchAuditRecord).slice(-500) : [],
  selectedTripIds: Array.isArray(value?.selectedTripIds) ? value.selectedTripIds.filter(Boolean) : [],
  selectedDriverId: value?.selectedDriverId || null,
  selectedRouteId: value?.selectedRouteId || null,
  uiPreferences: normalizeNemtUiPreferences(value?.uiPreferences)
});

const createInitialState = () => buildClientState();

const createPersistedSnapshot = state => normalizePersistentDispatchState({
  trips: state?.trips,
  routePlans: state?.routePlans,
  dispatchThreads: state?.dispatchThreads,
  dailyDrivers: state?.dailyDrivers,
  auditLog: state?.auditLog,
  uiPreferences: state?.uiPreferences
});

const routeColors = ['#2563eb', '#16a34a', '#7c3aed', '#ea580c', '#dc2626', '#0891b2'];
const NemtContext = createContext(undefined);
const getMutationTimestamp = () => Date.now();
const MAX_AUDIT_LOG_ENTRIES = 500;
const DISPATCH_MESSAGES_SYNC_ACTIVE_POLL_MS = 2500;
const DISPATCH_DRIVERS_SYNC_ACTIVE_POLL_MS = 5000;
const TRIP_DASHBOARD_DRIVERS_SYNC_ACTIVE_POLL_MS = 15000;

const getTargetTripIdsForAudit = (currentState, tripIds = []) => {
  if (Array.isArray(tripIds) && tripIds.length > 0) return tripIds;
  return Array.isArray(currentState?.selectedTripIds) ? currentState.selectedTripIds : [];
};

const getRouteTripIdSet = (currentState, routeId) => {
  const normalizedRouteId = String(routeId || '').trim();
  if (!normalizedRouteId) return new Set();
  const routePlan = (Array.isArray(currentState?.routePlans) ? currentState.routePlans : []).find(item => String(item?.id || '').trim() === normalizedRouteId);
  return new Set((Array.isArray(routePlan?.tripIds) ? routePlan.tripIds : []).map(value => String(value || '').trim()).filter(Boolean));
};

const getTripLookupKeys = trip => {
  const keys = [];
  const tripId = String(trip?.id || '').trim();
  const rideId = String(trip?.rideId || '').trim();
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  const importFingerprint = String(trip?.importFingerprint || '').trim().toLowerCase();

  if (tripId) keys.push(`id:${tripId}`);
  if (importFingerprint) keys.push(`import:${importFingerprint}`);
  // Imported round trips can share ride/broker identifiers across multiple legs.
  // When a per-leg fingerprint exists, avoid broad ride-level matching so sibling
  // legs do not overwrite each other during import merges.
  if (rideId && !importFingerprint) keys.push(`ride:${rideId}`);
  if (rideId && brokerTripId && !importFingerprint) keys.push(`ride-broker:${rideId}:${brokerTripId}`);
  // SafeRide round trips can share the same broker trip id across multiple legs.
  // Only use broker-only matching when there is no ride id or fingerprint to disambiguate the leg.
  if (brokerTripId && !rideId && !importFingerprint) keys.push(`broker:${brokerTripId}`);

  return keys;
};

const isCancelledLikeStatus = value => {
  const token = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  return token === 'cancelled' || token === 'canceled' || token === 'disconnected';
};

const isSafeRideCancelledImport = importedTrip => {
  return isCancelledLikeStatus(importedTrip?.status) || isCancelledLikeStatus(importedTrip?.safeRideStatus) || isCancelledLikeStatus(importedTrip?.confirmationStatus);
};

const LOCAL_OVERRIDE_FIELD_GROUPS = {
  notes: ['notes'],
  pickupTime: ['pickup', 'scheduledPickup', 'pickupSortValue'],
  dropoffTime: ['dropoff', 'scheduledDropoff', 'dropoffSortValue'],
  pickupAddress: ['address', 'fromAddress', 'pickupAddress', 'fromZipcode', 'fromZip', 'pickupZipcode', 'pickupZip', 'originZip'],
  dropoffAddress: ['destination', 'toAddress', 'dropoffAddress', 'toZipcode', 'toZip', 'dropoffZipcode', 'dropoffZip', 'destinationZip'],
  serviceLevel: ['vehicleType', 'tripType', 'mobilityType', 'assistanceNeeds', 'subMobilityType', 'assistLevel', 'serviceLevel', 'serviceLevelCode', 'los'],
  contact: ['patientPhoneNumber', 'phone', 'phoneNumber', 'memberPhone']
};

const buildTripLocalOverrides = (trip, updates) => {
  const nextOverrides = {
    ...(trip?.localOverrides && typeof trip.localOverrides === 'object' ? trip.localOverrides : {})
  };

  const updateKeys = Object.keys(updates || {});
  Object.entries(LOCAL_OVERRIDE_FIELD_GROUPS).forEach(([overrideKey, keys]) => {
    if (keys.some(key => updateKeys.includes(key))) {
      nextOverrides[overrideKey] = true;
    }
  });

  if (updateKeys.includes('status')) {
    nextOverrides.localCancellation = isCancelledLikeStatus(updates?.status);
  }

  return nextOverrides;
};

const getPreferredImportedValue = (overrideFlag, currentValue, importedValue) => {
  if (overrideFlag) return currentValue;
  const normalizedImported = String(importedValue ?? '').trim();
  return normalizedImported ? importedValue : currentValue;
};

const getPreferredImportedNumericValue = (overrideFlag, currentValue, importedValue) => {
  if (overrideFlag) return currentValue;
  const parsedImported = Number(importedValue);
  return Number.isFinite(parsedImported) ? parsedImported : currentValue;
};

const normalizeRouteComparisonValue = value => String(value ?? '').trim().toLowerCase();

const hasImportedTripRoutingChange = (currentTrip, importedTrip) => {
  const fieldsToCompare = [
    'rideId',
    'brokerTripId',
    'serviceDate',
    'address',
    'destination',
    'fromZipcode',
    'toZipcode'
  ];

  return fieldsToCompare.some(field => {
    const currentValue = normalizeRouteComparisonValue(currentTrip?.[field]);
    const importedValue = normalizeRouteComparisonValue(importedTrip?.[field]);
    return Boolean(currentValue || importedValue) && currentValue !== importedValue;
  });
};

const mergeImportedTripWithCurrent = (currentTrip, importedTrip) => {
  const shouldAutoCancel = isSafeRideCancelledImport(importedTrip);
  const hasRoutingChange = hasImportedTripRoutingChange(currentTrip, importedTrip);
  const baseLocalOverrides = currentTrip?.localOverrides && typeof currentTrip.localOverrides === 'object' ? currentTrip.localOverrides : {};
  const localOverrides = hasRoutingChange ? {
    ...baseLocalOverrides,
    pickupTime: false,
    dropoffTime: false,
    pickupAddress: false,
    dropoffAddress: false
  } : baseLocalOverrides;
  const providerSnapshot = {
    ...buildTripProviderSnapshot(importedTrip),
    importedAt: new Date().toISOString()
  };
  return normalizeTripRecord({
    ...currentTrip,
    ...importedTrip,
    id: String(currentTrip?.id || importedTrip?.id || '').trim(),
    importFingerprint: String(currentTrip?.importFingerprint || importedTrip?.importFingerprint || '').trim(),
    driverId: shouldAutoCancel ? null : currentTrip?.driverId ?? null,
    secondaryDriverId: shouldAutoCancel ? null : currentTrip?.secondaryDriverId ?? null,
    routeId: shouldAutoCancel ? null : currentTrip?.routeId ?? null,
    status: shouldAutoCancel ? 'Cancelled' : (currentTrip?.status || importedTrip?.status),
    safeRideStatus: shouldAutoCancel ? 'Canceled by SafeRide' : getPreferredImportedValue(false, currentTrip?.safeRideStatus, importedTrip?.safeRideStatus),
    cancellationReason: shouldAutoCancel ? 'Canceled by SafeRide' : (localOverrides.localCancellation ? currentTrip?.cancellationReason : getPreferredImportedValue(false, currentTrip?.cancellationReason, importedTrip?.cancellationReason)),
    cancellationSource: shouldAutoCancel ? 'saferide-import' : (localOverrides.localCancellation ? currentTrip?.cancellationSource : getPreferredImportedValue(false, currentTrip?.cancellationSource, importedTrip?.cancellationSource)),
    cancelledAt: shouldAutoCancel ? new Date().toISOString() : (localOverrides.localCancellation ? currentTrip?.cancelledAt || null : getPreferredImportedValue(false, currentTrip?.cancelledAt, importedTrip?.cancelledAt)),
    pickup: getPreferredImportedValue(localOverrides.pickupTime, currentTrip?.pickup, importedTrip?.pickup),
    scheduledPickup: getPreferredImportedValue(localOverrides.pickupTime, currentTrip?.scheduledPickup, importedTrip?.scheduledPickup),
    pickupSortValue: getPreferredImportedNumericValue(localOverrides.pickupTime, currentTrip?.pickupSortValue, importedTrip?.pickupSortValue),
    dropoff: getPreferredImportedValue(localOverrides.dropoffTime, currentTrip?.dropoff, importedTrip?.dropoff),
    scheduledDropoff: getPreferredImportedValue(localOverrides.dropoffTime, currentTrip?.scheduledDropoff, importedTrip?.scheduledDropoff),
    dropoffSortValue: getPreferredImportedNumericValue(localOverrides.dropoffTime, currentTrip?.dropoffSortValue, importedTrip?.dropoffSortValue),
    address: getPreferredImportedValue(localOverrides.pickupAddress, currentTrip?.address, importedTrip?.address),
    fromAddress: getPreferredImportedValue(localOverrides.pickupAddress, currentTrip?.fromAddress, importedTrip?.fromAddress),
    fromZipcode: getPreferredImportedValue(localOverrides.pickupAddress, currentTrip?.fromZipcode, importedTrip?.fromZipcode),
    destination: getPreferredImportedValue(localOverrides.dropoffAddress, currentTrip?.destination, importedTrip?.destination),
    toAddress: getPreferredImportedValue(localOverrides.dropoffAddress, currentTrip?.toAddress, importedTrip?.toAddress),
    toZipcode: getPreferredImportedValue(localOverrides.dropoffAddress, currentTrip?.toZipcode, importedTrip?.toZipcode),
    patientPhoneNumber: getPreferredImportedValue(localOverrides.contact, currentTrip?.patientPhoneNumber, importedTrip?.patientPhoneNumber),
    notes: getPreferredImportedValue(localOverrides.notes, currentTrip?.notes, importedTrip?.notes),
    vehicleType: getPreferredImportedValue(localOverrides.serviceLevel, currentTrip?.vehicleType, importedTrip?.vehicleType),
    tripType: getPreferredImportedValue(localOverrides.serviceLevel, currentTrip?.tripType, importedTrip?.tripType),
    assistanceNeeds: getPreferredImportedValue(localOverrides.serviceLevel, currentTrip?.assistanceNeeds, importedTrip?.assistanceNeeds),
    actualPickup: currentTrip?.actualPickup || importedTrip?.actualPickup,
    actualDropoff: currentTrip?.actualDropoff || importedTrip?.actualDropoff,
    confirmation: currentTrip?.confirmation || importedTrip?.confirmation,
    localOverrides,
    providerSnapshot,
    updatedAt: Number(currentTrip?.updatedAt) || Number(importedTrip?.updatedAt) || 0
  });
};

const DRIVER_RUNTIME_TRIP_FIELDS = [
  'status',
  'driverTripStatus',
  'acceptedAt',
  'enRouteAt',
  'arrivedAt',
  'patientOnboardAt',
  'startTripAt',
  'arrivedDestinationAt',
  'completedAt',
  'actualPickup',
  'actualDropoff',
  'departureLocationSnapshot',
  'arrivalLocationSnapshot',
  'destinationDepartureLocationSnapshot',
  'destinationArrivalLocationSnapshot',
  'completionLocationSnapshot',
  'cancellationReason',
  'cancellationPhotoDataUrl',
  'completionPhotoDataUrl',
  'reviewRequestToken',
  'reviewRequestStatus',
  'reviewRequestSentAt',
  'completedByDriverId',
  'completedByDriverName',
  'canceledByDriverId',
  'canceledByDriverName',
  'riderSignatureName',
  'riderSignedAt',
  'riderSignatureData',
  'driverWorkflow',
  'updatedAt'
];

const mergeRemoteDriverTripRuntime = (localTrips, serverTrips) => {
  const serverTripLookup = new Map();

  (Array.isArray(serverTrips) ? serverTrips : []).forEach(serverTrip => {
    getTripLookupKeys(serverTrip).forEach(key => {
      if (!serverTripLookup.has(key)) {
        serverTripLookup.set(key, serverTrip);
      }
    });
  });

  return normalizeTripRecords((Array.isArray(localTrips) ? localTrips : []).map(localTrip => {
    const matchingServerTrip = getTripLookupKeys(localTrip).map(key => serverTripLookup.get(key)).find(Boolean);
    if (!matchingServerTrip) return localTrip;

    const localUpdatedAt = Number(localTrip?.updatedAt) || 0;
    const serverUpdatedAt = Number(matchingServerTrip?.updatedAt) || 0;
    if (serverUpdatedAt > 0 && localUpdatedAt > serverUpdatedAt) return localTrip;

    const runtimePatch = DRIVER_RUNTIME_TRIP_FIELDS.reduce((accumulator, field) => {
      if (Object.prototype.hasOwnProperty.call(matchingServerTrip, field)) {
        accumulator[field] = matchingServerTrip[field];
      }
      return accumulator;
    }, {});

    return {
      ...localTrip,
      ...runtimePatch
    };
  }));
};

const dedupeImportedTripBatch = trips => {
  const dedupedTrips = [];
  const lookupToTripIndex = new Map();

  (Array.isArray(trips) ? trips : []).forEach(importedTrip => {
    const lookupKeys = getTripLookupKeys(importedTrip);
    const existingIndex = lookupKeys.map(key => lookupToTripIndex.get(key)).find(index => Number.isInteger(index));

    if (!Number.isInteger(existingIndex)) {
      const nextIndex = dedupedTrips.length;
      dedupedTrips.push(importedTrip);
      lookupKeys.forEach(key => {
        if (key) lookupToTripIndex.set(key, nextIndex);
      });
      return;
    }

    const mergedDuplicate = normalizeTripRecord({
      ...dedupedTrips[existingIndex],
      ...importedTrip,
      id: dedupedTrips[existingIndex]?.id || importedTrip?.id
    });
    dedupedTrips[existingIndex] = mergedDuplicate;
    getTripLookupKeys(mergedDuplicate).forEach(key => {
      if (key) lookupToTripIndex.set(key, existingIndex);
    });
  });

  return dedupedTrips;
};

const appendAuditEntry = (currentState, entry) => {
  const nextEntry = normalizeDispatchAuditRecord(entry);
  return [...(Array.isArray(currentState?.auditLog) ? currentState.auditLog : []), nextEntry].slice(-MAX_AUDIT_LOG_ENTRIES);
};

const getActorIdentity = session => {
  const displayName = String(session?.user?.name || session?.user?.username || session?.user?.email || 'Dispatcher').trim() || 'Dispatcher';
  const initialsSource = displayName
    .replace(/@.*/, '')
    .split(/[^A-Za-z0-9]+/)
    .map(part => part.trim())
    .filter(Boolean);
  const initials = (initialsSource.length > 1
    ? initialsSource.slice(0, 3).map(part => part.charAt(0))
    : String(initialsSource[0] || '').slice(0, 3).split(''))
    .join('')
    .toUpperCase()
    .trim();

  return {
    name: displayName,
    initials: initials || 'DSP'
  };
};

const getTomorrowDateKey = () => {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
};

const mergeDispatchThreadsForSync = (localThreads, serverThreads) => {
  const localList = Array.isArray(localThreads) ? localThreads.map(normalizeDispatchThreadRecord) : [];
  const serverList = Array.isArray(serverThreads) ? serverThreads.map(normalizeDispatchThreadRecord) : [];
  const localThreadsByDriverId = new Map(localList.map(thread => [String(thread?.driverId || '').trim(), thread]));

  const mergedServerThreads = serverList.map(serverThread => {
    const driverId = String(serverThread?.driverId || '').trim();
    const localThread = localThreadsByDriverId.get(driverId);
    if (!localThread) return serverThread;

    const localMessagesById = new Map((Array.isArray(localThread.messages) ? localThread.messages : []).map(message => [String(message?.id || '').trim(), normalizeDispatchMessageRecord(message)]));
    const mergedMessages = (Array.isArray(serverThread.messages) ? serverThread.messages : []).map(serverMessage => {
      const normalizedServerMessage = normalizeDispatchMessageRecord(serverMessage);
      const localMessage = localMessagesById.get(String(normalizedServerMessage?.id || '').trim());
      if (!localMessage) return normalizedServerMessage;

      const localStatus = String(localMessage?.status || '').trim().toLowerCase();
      const serverStatus = String(normalizedServerMessage?.status || '').trim().toLowerCase();
      const shouldPreserveLocalStatus = localStatus && localStatus !== 'sending' && (!serverStatus || serverStatus === 'sending');

      return shouldPreserveLocalStatus ? {
        ...normalizedServerMessage,
        status: localMessage.status
      } : normalizedServerMessage;
    });

    const mergedMessageIds = new Set(mergedMessages.map(message => String(message?.id || '').trim()).filter(Boolean));
    const localOnlyMessages = (Array.isArray(localThread.messages) ? localThread.messages : []).filter(message => {
      const messageId = String(message?.id || '').trim();
      return messageId && !mergedMessageIds.has(messageId);
    }).map(normalizeDispatchMessageRecord);

    return normalizeDispatchThreadRecord({
      ...serverThread,
      messages: [...mergedMessages, ...localOnlyMessages]
    });
  });

  const mergedDriverIds = new Set(mergedServerThreads.map(thread => String(thread?.driverId || '').trim()).filter(Boolean));
  const localOnlyThreads = localList.filter(thread => {
    const driverId = String(thread?.driverId || '').trim();
    return driverId && !mergedDriverIds.has(driverId);
  });

  return [...mergedServerThreads, ...localOnlyThreads];
};

export const useNemtContext = () => {
  const context = use(NemtContext);
  if (!context) {
    throw new Error('useNemtContext must be used within NemtProvider');
  }
  return context;
};

export const NemtProvider = ({
  children,
  syncEnabled = true
}) => {
  const { data: session } = useSession();
  const [persistedState, setPersistedState] = useState(() => createInitialState());
  const [selectedDriverIdState, setSelectedDriverIdState] = useState(() => persistedState?.selectedDriverId || null);
  const [userUiPreferences, setUserUiPreferences] = useState(normalizeNemtUiPreferences(null));
  const [hasLoadedUserUiPreferences, setHasLoadedUserUiPreferences] = useState(false);
  const [isDispatchLoaded, setIsDispatchLoaded] = useState(false);
  const persistedStateRef = useRef(persistedState ?? createInitialState());
  const selectedDriverIdRef = useRef(selectedDriverIdState);
  const lastPersistedSnapshotRef = useRef('');
  const hasLocalDispatchChangesRef = useRef(false);
  const persistInFlightRef = useRef(false);
  const liveSyncInFlightRef = useRef(false);
  const driverSyncInFlightRef = useRef(false);
  const pendingPersistSnapshotRef = useRef('');
  const allowTripShrinkNextPersistRef = useRef(false);
  const pendingAllowTripShrinkRef = useRef(false);
  const allowTripShrinkReasonNextPersistRef = useRef('');
  const pendingAllowTripShrinkReasonRef = useRef('');
  const dispatchQueryDateKeyRef = useRef('');
  const dispatchWindowPastDaysRef = useRef(1);
  const dispatchWindowFutureDaysRef = useRef(1);
  const userUiPreferencesSnapshotRef = useRef(JSON.stringify(normalizeNemtUiPreferences(null)));
  const userUiPreferencesPersistPromiseRef = useRef(null);
  const userUiPreferencesPersistSnapshotRef = useRef('');

  useEffect(() => {
    persistedStateRef.current = persistedState ?? createInitialState();
  }, [persistedState]);

  useEffect(() => {
    selectedDriverIdRef.current = selectedDriverIdState;
  }, [selectedDriverIdState]);

  const state = useMemo(() => ({
    ...buildClientState(persistedState ?? createInitialState()),
    selectedDriverId: selectedDriverIdState
  }), [persistedState, selectedDriverIdState]);

  const setState = useCallback(value => {
    const currentCompositeState = {
      ...buildClientState(persistedStateRef.current ?? createInitialState()),
      selectedDriverId: selectedDriverIdRef.current
    };
    const resolvedState = value instanceof Function ? value(currentCompositeState) : value;
    const normalizedState = buildClientState(resolvedState ?? createInitialState());
    const nextSelectedDriverId = normalizedState.selectedDriverId || null;
    const nextPersistedState = {
      ...normalizedState,
      selectedDriverId: null
    };

    persistedStateRef.current = nextPersistedState;
    selectedDriverIdRef.current = nextSelectedDriverId;
    setSelectedDriverIdState(nextSelectedDriverId);
    setPersistedState(nextPersistedState);
  }, [setPersistedState]);

  const sendRoutePushMessage = async ({
    driverId,
    routeName,
    serviceDate,
    reason = 'route-update'
  }) => {
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedDriverId) {
      console.log('[ROUTE PUSH] No driverId, skipping');
      return;
    }

    const normalizedDate = String(serviceDate || '').trim();
    const isTomorrowRoute = normalizedDate && normalizedDate === getTomorrowDateKey();
    const normalizedRouteName = String(routeName || '').trim() || 'your route';

    const subject = isTomorrowRoute ? 'Route for tomorrow' : 'Route update from dispatch';
    const body = isTomorrowRoute
      ? `You receive the route for tomorrow. Route: ${normalizedRouteName}.`
      : `Dispatch assigned/updated ${normalizedRouteName}${normalizedDate ? ` for ${normalizedDate}` : ''}.`;

    console.log('[ROUTE PUSH] Sending route push', {
      driverId: normalizedDriverId,
      routeName: normalizedRouteName,
      serviceDate: normalizedDate,
      isTomorrow: isTomorrowRoute
    });

    try {
      const response = await fetch('/api/system-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'dispatch-message',
          priority: 'high',
          audience: 'Driver',
          subject,
          body,
          driverId: normalizedDriverId,
          source: reason,
          deliveryMethod: 'push'
        })
      });

      const data = await response.json();
      console.log('[ROUTE PUSH] Response', {
        status: response.status,
        messageId: data?.message?.id,
        driverId: normalizedDriverId
      });

      if (!response.ok) {
        console.error('[ROUTE PUSH] Error response', {
          status: response.status,
          error: data?.error,
          driverId: normalizedDriverId
        });
      }
    } catch (error) {
      console.error('[ROUTE PUSH] Fetch error', {
        message: error?.message,
        driverId: normalizedDriverId
      });
    }
  };

  const sendTripNotification = async ({
    driverId,
    driverName,
    tripId,
    tripRiderId,
    tripRiderName
  }) => {
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedDriverId) {
      console.log('[TRIP PUSH] No driverId, skipping');
      return;
    }

    const normalizedTripId = String(tripId || '').trim();
    const normalizedRiderName = String(tripRiderName || tripRiderId || 'Patient').trim();

    const subject = 'New Trip Assignment';
    const body = `You have a new trip assigned for ${normalizedRiderName}. Please check your app.`;

    console.log('[TRIP PUSH] Sending trip notification', {
      driverId: normalizedDriverId,
      driverName: String(driverName || '').trim(),
      tripId: normalizedTripId,
      riderName: normalizedRiderName
    });

    try {
      const response = await fetch('/api/system-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'dispatch-message',
          priority: 'high',
          audience: 'Driver',
          subject,
          body,
          driverId: normalizedDriverId,
          driverName: String(driverName || '').trim(),
          source: 'trip-assignment',
          deliveryMethod: 'push'
        })
      });

      const data = await response.json();
      console.log('[TRIP PUSH] Response', {
        status: response.status,
        messageId: data?.message?.id,
        driverId: normalizedDriverId
      });

      if (!response.ok) {
        console.error('[TRIP PUSH] Error response', {
          status: response.status,
          error: data?.error,
          driverId: normalizedDriverId
        });
      }
    } catch (error) {
      console.error('[TRIP PUSH] Fetch error', {
        message: error?.message,
        driverId: normalizedDriverId
      });
    }
  };

  const flushPersistQueue = async () => {
    if (persistInFlightRef.current) return;
    const nextSnapshot = pendingPersistSnapshotRef.current;
    if (!nextSnapshot || nextSnapshot === lastPersistedSnapshotRef.current) return;
    const allowTripShrink = pendingAllowTripShrinkRef.current;
    const allowTripShrinkReason = pendingAllowTripShrinkReasonRef.current;
    const actorName = String(session?.user?.name || session?.user?.username || session?.user?.email || '').trim();

    persistInFlightRef.current = true;
    pendingPersistSnapshotRef.current = '';
    pendingAllowTripShrinkRef.current = false;
    pendingAllowTripShrinkReasonRef.current = '';

    try {
      const response = await fetch('/api/nemt/dispatch', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-dispatch-allow-trip-shrink': allowTripShrink ? '1' : '0',
          'x-dispatch-shrink-reason': allowTripShrink ? allowTripShrinkReason || 'manual-admin-delete' : '',
          'x-dispatch-actor-name': allowTripShrink ? actorName : ''
        },
        body: nextSnapshot
      });
      if (response.ok) {
        lastPersistedSnapshotRef.current = nextSnapshot;
        hasLocalDispatchChangesRef.current = false;
      } else {
        // Keep failed snapshots queued so trip updates are not lost on transient server errors.
        pendingPersistSnapshotRef.current = nextSnapshot;
        pendingAllowTripShrinkRef.current = allowTripShrink;
        pendingAllowTripShrinkReasonRef.current = allowTripShrinkReason;
      }
    } catch {
      // Keep failed snapshots queued so trip updates are not lost on transient network issues.
      pendingPersistSnapshotRef.current = nextSnapshot;
      pendingAllowTripShrinkRef.current = allowTripShrink;
      pendingAllowTripShrinkReasonRef.current = allowTripShrinkReason;
    } finally {
      persistInFlightRef.current = false;
      if (pendingPersistSnapshotRef.current && pendingPersistSnapshotRef.current !== lastPersistedSnapshotRef.current) {
        void flushPersistQueue();
      }
    }
  };

  const syncDriversFromServer = async () => {
    if (driverSyncInFlightRef.current) return false;
    driverSyncInFlightRef.current = true;
    try {
      const response = await fetch('/api/nemt/admin/drivers', {
        cache: 'no-store'
      });
      if (!response.ok) return false;
      const payload = await response.json();
      const nextDrivers = Array.isArray(payload?.dispatchDrivers) ? payload.dispatchDrivers : [];
      startTransition(() => {
        setState(currentState => {
          const baseState = currentState ?? createInitialState();
          const currentDriversJson = JSON.stringify(Array.isArray(baseState?.drivers) ? baseState.drivers : []);
          const nextDriversJson = JSON.stringify(nextDrivers);

          if (currentDriversJson === nextDriversJson) {
            return baseState;
          }

          return {
            ...baseState,
            drivers: nextDrivers
          };
        });
      });
      return true;
    } catch {
      // Keep the last known dispatch state if the admin API is temporarily unavailable.
      return false;
    } finally {
      driverSyncInFlightRef.current = false;
    }
  };

  const syncDispatchFromServer = async (options = {}) => {
    const forceServer = options.forceServer ?? false;
    const nextDateKey = String(options?.dateKey || dispatchQueryDateKeyRef.current || '').trim();
    const nextWindowPastDays = Math.max(Number(options?.windowPastDays ?? dispatchWindowPastDaysRef.current) || 0, 0);
    const nextWindowFutureDays = Math.max(Number(options?.windowFutureDays ?? dispatchWindowFutureDaysRef.current) || 0, 0);

    if (nextDateKey) {
      dispatchQueryDateKeyRef.current = nextDateKey;
    }
    dispatchWindowPastDaysRef.current = nextWindowPastDays;
    dispatchWindowFutureDaysRef.current = nextWindowFutureDays;

    try {
      const searchParams = new URLSearchParams();
      if (dispatchQueryDateKeyRef.current) searchParams.set('date', dispatchQueryDateKeyRef.current);
      searchParams.set('windowPastDays', String(dispatchWindowPastDaysRef.current));
      searchParams.set('windowFutureDays', String(dispatchWindowFutureDaysRef.current));
      const response = await fetch(`/api/nemt/dispatch?${searchParams.toString()}`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Unable to load dispatch state');
      const payload = normalizePersistentDispatchState(await response.json());
      startTransition(() => {
        setState(currentState => {
          const localState = buildClientState(currentState ?? createInitialState());
          const useLocalTrips = !forceServer && hasLocalDispatchChangesRef.current;
          const useLocalRoutes = !forceServer && hasLocalDispatchChangesRef.current;
          const useLocalDispatchThreads = !forceServer && hasLocalDispatchChangesRef.current;
          const useLocalDailyDrivers = !forceServer && hasLocalDispatchChangesRef.current;
          const useLocalAuditLog = !forceServer && hasLocalDispatchChangesRef.current;
          const localColumns = normalizeDispatcherVisibleTripColumns(localState.uiPreferences?.dispatcherVisibleTripColumns);
          const serverColumns = normalizeDispatcherVisibleTripColumns(payload.uiPreferences?.dispatcherVisibleTripColumns);
          const localMapProvider = normalizeMapProviderPreference(localState.uiPreferences?.mapProvider);
          const serverMapProvider = normalizeMapProviderPreference(payload.uiPreferences?.mapProvider);
          const localPrintSetup = normalizePrintSetup(localState.uiPreferences?.printSetup);
          const serverPrintSetup = normalizePrintSetup(payload.uiPreferences?.printSetup);
          // Keep operator UI preferences stable across day switches and route reloads.
          // Server payload can arrive with stale defaults, so local preferences win when they differ.
          const useLocalPreferences = !forceServer && (JSON.stringify(localColumns) !== JSON.stringify(serverColumns) || localMapProvider !== serverMapProvider || JSON.stringify(localPrintSetup) !== JSON.stringify(serverPrintSetup));
          const nextState = buildClientState({
            ...localState,
            trips: useLocalTrips ? mergeRemoteDriverTripRuntime(localState.trips, payload.trips) : payload.trips,
            routePlans: useLocalRoutes ? localState.routePlans : payload.routePlans,
            dispatchThreads: useLocalDispatchThreads ? localState.dispatchThreads : payload.dispatchThreads,
            dailyDrivers: useLocalDailyDrivers ? localState.dailyDrivers : payload.dailyDrivers,
            auditLog: useLocalAuditLog ? localState.auditLog : payload.auditLog,
            uiPreferences: useLocalPreferences ? localState.uiPreferences : payload.uiPreferences
          });
          lastPersistedSnapshotRef.current = useLocalTrips || useLocalRoutes || useLocalDispatchThreads || useLocalDailyDrivers || useLocalAuditLog || useLocalPreferences ? '' : JSON.stringify(createPersistedSnapshot(nextState));
          return nextState;
        });
      });
      return true;
    } catch {
      lastPersistedSnapshotRef.current = JSON.stringify(createPersistedSnapshot(buildClientState(state ?? createInitialState())));
      return false;
    }
  };

  const syncDispatchThreadsFromServer = async () => {
    try {
      const response = await fetch('/api/nemt/dispatch/threads', {
        cache: 'no-store'
      });
      if (!response.ok) return;
      const payload = await response.json();
      startTransition(() => {
        setState(currentState => {
          const localState = buildClientState(currentState ?? createInitialState());
          const nextThreads = mergeDispatchThreadsForSync(localState.dispatchThreads, Array.isArray(payload?.dispatchThreads) ? payload.dispatchThreads : []);
          const nextThreadsJson = JSON.stringify(nextThreads);
          const currentThreadsJson = JSON.stringify(Array.isArray(localState.dispatchThreads) ? localState.dispatchThreads : []);
          if (currentThreadsJson === nextThreadsJson) return localState;
          return {
            ...localState,
            dispatchThreads: nextThreads
          };
        });
      });
    } catch {
      // Keep current message threads if background sync is temporarily unavailable.
    }
  };

  useEffect(() => {
    const needsNormalization = !state || state.version !== STORAGE_VERSION || !Array.isArray(state?.trips) || !Array.isArray(state?.routePlans) || !Array.isArray(state?.selectedTripIds) || typeof state?.uiPreferences !== 'object' || state?.uiPreferences == null;
    if (needsNormalization) {
      startTransition(() => {
        setState(buildClientState(state));
      });
    }
  }, [setState, state]);

  useEffect(() => {
    if (!syncEnabled) {
      setIsDispatchLoaded(false);
      return undefined;
    }

    let active = true;

    const loadDispatchState = async () => {
      try {
        await syncDispatchFromServer();
      } finally {
        if (active) {
          setIsDispatchLoaded(true);
        }
      }
    };

    loadDispatchState();

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled]);

  useEffect(() => {
    if (!syncEnabled || !isDispatchLoaded || !state) return;
    const snapshot = JSON.stringify(createPersistedSnapshot(state));
    if (snapshot === lastPersistedSnapshotRef.current) return;

    pendingPersistSnapshotRef.current = snapshot;
    pendingAllowTripShrinkRef.current = allowTripShrinkNextPersistRef.current;
    pendingAllowTripShrinkReasonRef.current = allowTripShrinkReasonNextPersistRef.current;
    allowTripShrinkNextPersistRef.current = false;
    allowTripShrinkReasonNextPersistRef.current = '';

    const timeoutId = window.setTimeout(async () => {
      await flushPersistQueue();
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isDispatchLoaded, state, syncEnabled]);

  useEffect(() => {
    let active = true;

    const loadUserUiPreferences = async () => {
      if (!session?.user?.id) {
        if (active) {
          setUserUiPreferences(normalizeNemtUiPreferences(null));
          setHasLoadedUserUiPreferences(false);
        }
        return;
      }

      try {
        const response = await fetch('/api/user-preferences', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Unable to load user preferences');
        const nextPreferences = normalizeUserPreferences(payload?.preferences);
        if (active) {
          const normalizedUiPreferences = normalizeNemtUiPreferences(nextPreferences.nemtUiPreferences);
          userUiPreferencesSnapshotRef.current = JSON.stringify(normalizedUiPreferences);
          setUserUiPreferences(normalizedUiPreferences);
          setHasLoadedUserUiPreferences(true);
        }
      } catch {
        if (active) {
          const fallbackPreferences = normalizeNemtUiPreferences(state?.uiPreferences);
          userUiPreferencesSnapshotRef.current = JSON.stringify(fallbackPreferences);
          setUserUiPreferences(fallbackPreferences);
          setHasLoadedUserUiPreferences(true);
        }
      }
    };

    loadUserUiPreferences();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const persistUserUiPreferences = useCallback(async nextPreferences => {
    if (!session?.user?.id) return;
    const normalizedPreferences = normalizeNemtUiPreferences(nextPreferences);
    const nextSnapshot = JSON.stringify(normalizedPreferences);

    if (nextSnapshot === userUiPreferencesSnapshotRef.current) {
      return normalizedPreferences;
    }

    if (userUiPreferencesPersistPromiseRef.current && userUiPreferencesPersistSnapshotRef.current === nextSnapshot) {
      return userUiPreferencesPersistPromiseRef.current;
    }

    const persistPromise = fetch('/api/user-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          preferences: {
            nemtUiPreferences: normalizedPreferences
          }
        })
      }).then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to save user preferences');
        }
        userUiPreferencesSnapshotRef.current = nextSnapshot;
        return normalizedPreferences;
      });

    userUiPreferencesPersistPromiseRef.current = persistPromise;
    userUiPreferencesPersistSnapshotRef.current = nextSnapshot;

    try {
      return await persistPromise;
    } catch {
      // Keep local in-memory preferences if the user preference API is temporarily unavailable.
      return normalizedPreferences;
    } finally {
      if (userUiPreferencesPersistPromiseRef.current === persistPromise) {
        userUiPreferencesPersistPromiseRef.current = null;
        userUiPreferencesPersistSnapshotRef.current = '';
      }
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!syncEnabled) return undefined;

    syncDriversFromServer();

    const handleAdminUpdate = () => {
      syncDriversFromServer();
    };

    window.addEventListener('nemt-admin-updated', handleAdminUpdate);

    return () => {
      window.removeEventListener('nemt-admin-updated', handleAdminUpdate);
    };
  }, [syncEnabled]);

  useEffect(() => {
    if (!syncEnabled || !isDispatchLoaded) return;

    let active = true;
    let intervalId = null;

    const isDispatchViewActive = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return false;
      const path = String(window.location?.pathname || '').toLowerCase();
      const inDispatchRoute = path.includes('/dispatch');
      return inDispatchRoute && document.visibilityState === 'visible';
    };

    const syncLiveMessages = async () => {
      if (!active || liveSyncInFlightRef.current) return;
      if (!isDispatchViewActive()) return;
      liveSyncInFlightRef.current = true;
      try {
        await syncDispatchThreadsFromServer();
      } finally {
        liveSyncInFlightRef.current = false;
      }
    };

    const startPolling = () => {
      if (intervalId != null) return;
      intervalId = window.setInterval(() => {
        void syncLiveMessages();
      }, DISPATCH_MESSAGES_SYNC_ACTIVE_POLL_MS);
    };

    const stopPolling = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const syncPollingState = () => {
      if (!active) return;
      if (isDispatchViewActive()) {
        startPolling();
        void syncLiveMessages();
        return;
      }
      stopPolling();
    };

    const handleVisibilityOrFocus = () => {
      syncPollingState();
    };

    syncPollingState();

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('blur', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      active = false;
      stopPolling();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('blur', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isDispatchLoaded, syncEnabled]);

  useEffect(() => {
    if (!syncEnabled || !isDispatchLoaded) return;

    let active = true;
    let intervalId = null;

    const getActiveDriverSyncPollMs = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return null;
      const path = String(window.location?.pathname || '').toLowerCase();
      if (document.visibilityState !== 'visible') return null;
      if (path.includes('/dispatch')) return DISPATCH_DRIVERS_SYNC_ACTIVE_POLL_MS;
      if (path.includes('/trip-dashboard')) return TRIP_DASHBOARD_DRIVERS_SYNC_ACTIVE_POLL_MS;
      return null;
    };

    const syncLiveDrivers = async () => {
      if (!active) return;
      if (getActiveDriverSyncPollMs() == null) return;
      await syncDriversFromServer();
    };

    const startPolling = pollMs => {
      if (intervalId != null) return;
      intervalId = window.setInterval(() => {
        void syncLiveDrivers();
      }, pollMs);
    };

    const stopPolling = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const syncPollingState = () => {
      if (!active) return;
      const pollMs = getActiveDriverSyncPollMs();
      if (pollMs != null) {
        stopPolling();
        startPolling(pollMs);
        void syncLiveDrivers();
        return;
      }
      stopPolling();
    };

    const handleVisibilityOrFocus = () => {
      syncPollingState();
    };

    syncPollingState();

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('blur', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      active = false;
      stopPolling();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('blur', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isDispatchLoaded, syncEnabled]);

  const updateState = (updater, options = {}) => {
    const shouldMarkDispatchDirty = options.markDispatchDirty ?? false;
    const shouldAllowTripShrink = options.allowTripShrink ?? false;
    const allowTripShrinkReason = String(options.allowTripShrinkReason || '').trim();
    const buildAuditEntry = typeof options.buildAuditEntry === 'function' ? options.buildAuditEntry : null;
    setState(currentState => {
      const baseState = currentState ?? createInitialState();
      if (shouldMarkDispatchDirty) {
        hasLocalDispatchChangesRef.current = true;
        if (shouldAllowTripShrink) {
          allowTripShrinkNextPersistRef.current = true;
          allowTripShrinkReasonNextPersistRef.current = allowTripShrinkReason || 'manual-admin-delete';
        }
      }
      const nextState = updater(baseState);
      if (!buildAuditEntry || !shouldMarkDispatchDirty) return nextState;
      const auditEntry = buildAuditEntry(baseState, nextState);
      if (!auditEntry) return nextState;
      return {
        ...nextState,
        auditLog: appendAuditEntry(nextState, auditEntry)
      };
    });
  };

  const upsertDispatchThreadMessage = ({ driverId, message, markIncomingRead = false, markDispatchDirty = true }) => updateState(currentState => {
    const normalizedDriverId = String(driverId || '').trim();
    const normalizedMessage = normalizeDispatchMessageRecord(message);
    if (!normalizedDriverId || (!normalizedMessage.text && normalizedMessage.attachments.length === 0)) return currentState;
    const existingThreads = Array.isArray(currentState.dispatchThreads) ? currentState.dispatchThreads : [];
    const nextThreads = existingThreads.some(thread => thread.driverId === normalizedDriverId)
      ? existingThreads.map(thread => thread.driverId === normalizedDriverId ? {
        ...thread,
        messages: thread.messages.some(currentMessage => String(currentMessage?.id || '').trim() === normalizedMessage.id)
          ? thread.messages.map(currentMessage => {
            if (String(currentMessage?.id || '').trim() === normalizedMessage.id) return normalizedMessage;
            if (markIncomingRead && currentMessage.direction === 'incoming') return { ...currentMessage, status: 'read' };
            return currentMessage;
          })
          : [...thread.messages.map(currentMessage => markIncomingRead && currentMessage.direction === 'incoming' ? {
            ...currentMessage,
            status: 'read'
          } : currentMessage), normalizedMessage]
      } : thread)
      : [...existingThreads, normalizeDispatchThreadRecord({ driverId: normalizedDriverId, messages: [normalizedMessage] })];
    return {
      ...currentState,
      dispatchThreads: nextThreads
    };
  }, {
    markDispatchDirty,
    buildAuditEntry: () => ({
      action: 'message-thread-upsert',
      entityType: 'dispatch-thread',
      entityId: String(driverId || '').trim(),
      source: 'dispatcher-messaging',
      summary: `Message added to driver thread ${String(driverId || '').trim()}`,
      metadata: {
        direction: String(message?.direction || 'outgoing').trim() || 'outgoing',
        text: String(message?.text || '').trim()
      }
    })
  });

  const markDispatchThreadRead = driverId => updateState(currentState => {
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedDriverId) return currentState;
    return {
      ...currentState,
      dispatchThreads: (Array.isArray(currentState.dispatchThreads) ? currentState.dispatchThreads : []).map(thread => thread.driverId === normalizedDriverId ? {
        ...thread,
        messages: thread.messages.map(message => message.direction === 'incoming' ? {
          ...message,
          status: 'read'
        } : message)
      } : thread)
    };
  }, { markDispatchDirty: false });

  const removeDispatchThreadMessageMedia = messageId => updateState(currentState => {
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedMessageId) return currentState;

    return {
      ...currentState,
      dispatchThreads: (Array.isArray(currentState.dispatchThreads) ? currentState.dispatchThreads : []).map(thread => normalizeDispatchThreadRecord({
        ...thread,
        messages: (Array.isArray(thread?.messages) ? thread.messages : []).map(message => {
          if (String(message?.id || '').trim() !== normalizedMessageId) return message;
          return {
            ...message,
            attachments: []
          };
        })
      }))
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: currentState => {
      const targetThread = (Array.isArray(currentState.dispatchThreads) ? currentState.dispatchThreads : []).find(thread => {
        return (Array.isArray(thread?.messages) ? thread.messages : []).some(message => String(message?.id || '').trim() === String(messageId || '').trim());
      });

      return {
        action: 'message-media-remove',
        entityType: 'dispatch-thread',
        entityId: String(targetThread?.driverId || '').trim(),
        source: 'dispatcher-messaging',
        summary: `Removed media from dispatch message ${String(messageId || '').trim()}`,
        metadata: {
          messageId: String(messageId || '').trim(),
          driverId: String(targetThread?.driverId || '').trim()
        }
      };
    }
  });

  const addDailyDriver = payload => updateState(currentState => {
    const nextDriver = normalizeDailyDriverRecord(payload);
    if (!nextDriver.id || !nextDriver.firstName) return currentState;
    return {
      ...currentState,
      dailyDrivers: [...(Array.isArray(currentState.dailyDrivers) ? currentState.dailyDrivers.filter(driver => driver.id !== nextDriver.id) : []), nextDriver]
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'daily-driver-add',
      entityType: 'daily-driver',
      entityId: String(payload?.id || '').trim(),
      source: 'dispatcher-messaging',
      summary: `Daily driver added: ${String(payload?.firstName || '').trim()}`
    })
  });

  const removeDailyDriver = driverId => updateState(currentState => ({
    ...currentState,
    dailyDrivers: (Array.isArray(currentState.dailyDrivers) ? currentState.dailyDrivers : []).filter(driver => driver.id !== driverId)
  }), {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'daily-driver-remove',
      entityType: 'daily-driver',
      entityId: String(driverId || '').trim(),
      source: 'dispatcher-messaging',
      summary: `Daily driver removed: ${String(driverId || '').trim()}`
    })
  });

  const setSelectedTripIds = tripIdsOrUpdater => updateState(currentState => {
    const nextTripIds = typeof tripIdsOrUpdater === 'function' ? tripIdsOrUpdater(Array.isArray(currentState.selectedTripIds) ? currentState.selectedTripIds : []) : tripIdsOrUpdater;
    return {
      ...currentState,
      selectedTripIds: Array.isArray(nextTripIds) ? nextTripIds.filter(Boolean) : []
    };
  });

  const setSelectedDriverId = driverId => updateState(currentState => ({
    ...currentState,
    selectedDriverId: driverId || null
  }));

  const setSelectedRouteId = routeId => updateState(currentState => ({
    ...currentState,
    selectedRouteId: routeId || null
  }));

  const toggleTripSelection = tripId => updateState(currentState => ({
    ...currentState,
    selectedTripIds: currentState.selectedTripIds.includes(tripId) ? currentState.selectedTripIds.filter(id => id !== tripId) : [...currentState.selectedTripIds, tripId]
  }));

  const assignTripsToDriver = (driverId, tripIds = []) => updateState(currentState => {
    const targetTripIds = tripIds.length > 0 ? tripIds : currentState.selectedTripIds;
    const updatedAt = getMutationTimestamp();
    const selectedDriver = (Array.isArray(currentState?.drivers) ? currentState.drivers : []).find(driver => String(driver?.id || '').trim() === String(driverId || '').trim()) || null;
    const blockedDate = String(selectedDriver?.timeOffAppointment?.status || '').trim().toLowerCase() === 'active'
      ? String(selectedDriver?.timeOffAppointment?.appointmentDate || '').trim()
      : '';
    return {
      ...currentState,
      selectedDriverId: driverId,
      trips: currentState.trips.map(trip => {
        if (!targetTripIds.includes(trip.id)) return trip;
        const serviceDate = getTripServiceDateKey(trip);
        if (blockedDate && serviceDate === blockedDate) return trip;
        return {
          ...trip,
          driverId,
          updatedAt,
          status: 'Assigned'
        };
      })
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: currentState => ({
      action: 'assign-trips-primary',
      entityType: 'trip',
      entityId: String(driverId || '').trim(),
      source: 'dispatcher',
      summary: `Assigned ${getTargetTripIdsForAudit(currentState, tripIds).length} trip(s) to ${String(driverId || '').trim()}`,
      metadata: { driverId, tripIds: getTargetTripIdsForAudit(currentState, tripIds) }
    })
  });

  const assignTripsToSecondaryDriver = (driverId, tripIds = []) => updateState(currentState => {
    const targetTripIds = tripIds.length > 0 ? tripIds : currentState.selectedTripIds;
    const updatedAt = getMutationTimestamp();
    const selectedDriver = (Array.isArray(currentState?.drivers) ? currentState.drivers : []).find(driver => String(driver?.id || '').trim() === String(driverId || '').trim()) || null;
    const blockedDate = String(selectedDriver?.timeOffAppointment?.status || '').trim().toLowerCase() === 'active'
      ? String(selectedDriver?.timeOffAppointment?.appointmentDate || '').trim()
      : '';
    return {
      ...currentState,
      trips: currentState.trips.map(trip => {
        if (!targetTripIds.includes(trip.id)) return trip;
        const serviceDate = getTripServiceDateKey(trip);
        if (blockedDate && serviceDate === blockedDate) return trip;
        return {
          ...trip,
          secondaryDriverId: driverId,
          updatedAt,
          status: trip.driverId || driverId ? 'Assigned' : trip.status
        };
      })
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: currentState => ({
      action: 'assign-trips-secondary',
      entityType: 'trip',
      entityId: String(driverId || '').trim(),
      source: 'dispatcher',
      summary: `Assigned ${getTargetTripIdsForAudit(currentState, tripIds).length} trip(s) to secondary driver ${String(driverId || '').trim()}`,
      metadata: { driverId, tripIds: getTargetTripIdsForAudit(currentState, tripIds) }
    })
  });

  const unassignTrips = (tripIds = []) => updateState(currentState => {
    const targetTripIds = tripIds.length > 0 ? tripIds : currentState.selectedTripIds;
    const updatedAt = getMutationTimestamp();
    const updatedRoutePlans = currentState.routePlans.map(routePlan => ({
      ...routePlan,
      tripIds: routePlan.tripIds.filter(id => !targetTripIds.includes(id))
    })).filter(routePlan => routePlan.tripIds.length > 0);
    return {
      ...currentState,
      routePlans: updatedRoutePlans,
      trips: currentState.trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        updatedAt,
        status: 'Unassigned'
      } : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: currentState => ({
      action: 'unassign-trips',
      entityType: 'trip',
      source: 'dispatcher',
      summary: `Unassigned ${getTargetTripIdsForAudit(currentState, tripIds).length} trip(s)`,
      metadata: { tripIds: getTargetTripIdsForAudit(currentState, tripIds) }
    })
  });

  const cancelTrips = (tripIds = [], options = {}) => {
    const cancellationSource = String(options?.source || 'dispatcher-manual').trim() || 'dispatcher-manual';
    const providedReason = String(options?.reason || '').trim();
    const cancellationReason = providedReason || (cancellationSource === 'saferide-import' ? 'Canceled by SafeRide' : 'Cancelled by dispatcher');

    return updateState(currentState => {
    const selectedTripIds = Array.isArray(currentState.selectedTripIds) ? currentState.selectedTripIds : [];
    const targetTripIds = tripIds.length > 0 ? tripIds : selectedTripIds;
    const cancelledAt = new Date().toISOString();
    const updatedAt = getMutationTimestamp();
    const routePlans = Array.isArray(currentState.routePlans) ? currentState.routePlans : [];
    const trips = Array.isArray(currentState.trips) ? currentState.trips : [];
    const updatedRoutePlans = routePlans.map(routePlan => ({
      ...routePlan,
      tripIds: routePlan.tripIds.filter(id => !targetTripIds.includes(id))
    })).filter(routePlan => routePlan.tripIds.length > 0);
    return {
      ...currentState,
      routePlans: updatedRoutePlans,
      selectedTripIds: selectedTripIds.filter(id => !targetTripIds.includes(id)),
      trips: trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        canceledByDriverId: String(trip.driverId || trip.canceledByDriverId || '').trim() || null,
        canceledByDriverName: String(trip.driverName || trip.canceledByDriverName || '').trim() || null,
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        updatedAt,
        status: 'Cancelled',
        safeRideStatus: cancellationSource === 'saferide-import' ? 'Canceled by SafeRide' : trip.safeRideStatus,
        cancellationReason,
        cancellationSource,
        cancelledAt
      } : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: currentState => ({
      action: 'cancel-trips',
      entityType: 'trip',
      source: 'dispatcher',
      summary: `Cancelled ${getTargetTripIdsForAudit(currentState, tripIds).length} trip(s)`,
      metadata: {
        tripIds: getTargetTripIdsForAudit(currentState, tripIds),
        cancellationReason,
        cancellationSource
      }
    })
  });
  };

  const reinstateTrips = (tripIds = []) => updateState(currentState => {
    const targetTripIds = tripIds.length > 0 ? tripIds : currentState.selectedTripIds;
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      selectedTripIds: currentState.selectedTripIds.filter(id => !targetTripIds.includes(id)),
      trips: currentState.trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        updatedAt,
        status: 'Unassigned'
      } : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'reinstate-trips',
      entityType: 'trip',
      source: 'dispatcher',
      summary: `Reinstated ${tripIds.length} trip(s)`,
      metadata: { tripIds }
    })
  });

  const createRoute = ({
    name,
    driverId,
    tripIds,
    notes,
    serviceDate
  }) => {
    const normalizedDriverId = String(driverId || '').trim();
    const normalizedRouteName = String(name || '').trim() || 'Route';
    const normalizedServiceDate = String(serviceDate || '').trim();

    const result = updateState(currentState => {
    const targetTripIds = (Array.isArray(tripIds) && tripIds.length > 0 ? tripIds : currentState.selectedTripIds)
      .map(value => String(value || '').trim())
      .filter(Boolean);
    if (targetTripIds.length === 0) return currentState;
    const updatedAt = getMutationTimestamp();
    const routeId = `route-${Date.now()}`;
    const firstTripInRoute = currentState.trips.find(trip => targetTripIds.includes(String(trip?.id || '').trim()));
    const routeServiceDate = String(serviceDate || getTripServiceDateKey(firstTripInRoute) || '').trim();
    const cleanedRoutePlans = currentState.routePlans.map(routePlan => ({
      ...routePlan,
      tripIds: routePlan.tripIds.filter(id => !targetTripIds.includes(String(id || '').trim()))
    })).filter(routePlan => routePlan.tripIds.length > 0);
    const routePlan = {
      id: routeId,
      name,
      driverId,
      serviceDate: routeServiceDate,
      tripIds: targetTripIds,
      notes,
      color: routeColors[cleanedRoutePlans.length % routeColors.length]
    };
    return {
      ...currentState,
      selectedDriverId: driverId,
      selectedRouteId: routeId,
      routePlans: [...cleanedRoutePlans, routePlan],
      trips: currentState.trips.map(trip => targetTripIds.includes(String(trip?.id || '').trim()) ? {
        ...trip,
        driverId,
        routeId,
        updatedAt,
        status: 'Assigned'
      } : trip),
      selectedTripIds: targetTripIds
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'create-route',
      entityType: 'route',
      entityId: String(name || '').trim(),
      source: 'dispatcher',
      summary: `Created route ${String(name || '').trim() || 'unnamed route'}`,
      metadata: { driverId, tripIds, serviceDate }
    })
  });

    if (normalizedDriverId) {
      console.log('[CREATE ROUTE] Triggering push for', {
        driverId: normalizedDriverId,
        routeName: normalizedRouteName,
        serviceDate: normalizedServiceDate
      });
      sendRoutePushMessage({
        driverId: normalizedDriverId,
        routeName: normalizedRouteName,
        serviceDate: normalizedServiceDate,
        reason: 'route-create'
      }).catch(error => {
        console.error('[CREATE ROUTE] Push error', error);
      });
    }

    return result;
  };

  const deleteRoute = routeId => updateState(currentState => {
    const normalizedRouteId = String(routeId || '').trim();
    if (!normalizedRouteId) return currentState;
    const routeTripIds = getRouteTripIdSet(currentState, normalizedRouteId);
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      selectedRouteId: String(currentState.selectedRouteId || '').trim() === normalizedRouteId ? null : currentState.selectedRouteId,
      routePlans: currentState.routePlans.filter(routePlan => String(routePlan?.id || '').trim() !== normalizedRouteId),
      trips: currentState.trips.map(trip => {
        const tripId = String(trip?.id || '').trim();
        const shouldResetTrip = String(trip?.routeId || '').trim() === normalizedRouteId || (tripId && routeTripIds.has(tripId));
        return shouldResetTrip ? {
        ...trip,
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        updatedAt,
        status: 'Unassigned'
      } : trip;
      })
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'delete-route',
      entityType: 'route',
      entityId: String(routeId || '').trim(),
      source: 'dispatcher',
      summary: `Deleted route ${String(routeId || '').trim()}`
    })
  });

  const updateRoutePlan = (routeId, updates = {}) => updateState(currentState => {
    const normalizedRouteId = String(routeId || '').trim();
    if (!normalizedRouteId) return currentState;
    const normalizedUpdates = updates || {};
    return {
      ...currentState,
      routePlans: currentState.routePlans.map(routePlan => routePlan.id === normalizedRouteId ? normalizeRoutePlanRecord({
        ...routePlan,
        ...normalizedUpdates,
        id: routePlan.id,
        tripIds: Array.isArray(routePlan.tripIds) ? routePlan.tripIds : []
      }) : routePlan)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'update-route',
      entityType: 'route',
      entityId: String(routeId || '').trim(),
      source: 'dispatcher',
      summary: `Updated route ${String(routeId || '').trim()}`,
      metadata: updates
    })
  });

  const assignRoutePrimaryDriver = (routeId, driverId) => {
    const normalizedRouteId = String(routeId || '').trim();
    const normalizedDriverId = String(driverId || '').trim();
    const existingRoute = (Array.isArray(state?.routePlans) ? state.routePlans : []).find(routePlan => String(routePlan?.id || '').trim() === normalizedRouteId);

    const result = updateState(currentState => {
    const normalizedRouteId = String(routeId || '').trim();
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedRouteId || !normalizedDriverId) return currentState;
    const routeTripIds = getRouteTripIdSet(currentState, normalizedRouteId);
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      selectedDriverId: normalizedDriverId,
      routePlans: currentState.routePlans.map(routePlan => routePlan.id === normalizedRouteId ? {
        ...routePlan,
        driverId: normalizedDriverId
      } : routePlan),
      trips: currentState.trips.map(trip => {
        const tripId = String(trip?.id || '').trim();
        const isRouteTrip = String(trip?.routeId || '').trim() === normalizedRouteId || (tripId && routeTripIds.has(tripId));
        return isRouteTrip ? {
        ...trip,
        driverId: normalizedDriverId,
        routeId: normalizedRouteId,
        updatedAt,
        status: 'Assigned'
      } : trip;
      })
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'route-primary-driver',
      entityType: 'route',
      entityId: String(routeId || '').trim(),
      source: 'dispatcher',
      summary: `Changed primary driver on route ${String(routeId || '').trim()} to ${String(driverId || '').trim()}`
    })
  });

    if (normalizedRouteId && normalizedDriverId) {
      console.log('[ASSIGN ROUTE DRIVER] Triggering push for', {
        driverId: normalizedDriverId,
        routeName: String(existingRoute?.name || normalizedRouteId).trim(),
        serviceDate: String(existingRoute?.serviceDate || '').trim()
      });
      sendRoutePushMessage({
        driverId: normalizedDriverId,
        routeName: String(existingRoute?.name || normalizedRouteId).trim(),
        serviceDate: String(existingRoute?.serviceDate || '').trim(),
        reason: 'route-primary-driver'
      }).catch(error => {
        console.error('[ASSIGN ROUTE DRIVER] Push error', error);
      });
    }

    return result;
  };

  const assignRouteSecondaryDriver = (routeId, driverId) => updateState(currentState => {
    const normalizedRouteId = String(routeId || '').trim();
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedRouteId) return currentState;
    const routeTripIds = getRouteTripIdSet(currentState, normalizedRouteId);
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      routePlans: currentState.routePlans.map(routePlan => routePlan.id === normalizedRouteId ? {
        ...routePlan,
        secondaryDriverId: normalizedDriverId || null
      } : routePlan),
      trips: currentState.trips.map(trip => {
        const tripId = String(trip?.id || '').trim();
        const isRouteTrip = String(trip?.routeId || '').trim() === normalizedRouteId || (tripId && routeTripIds.has(tripId));
        return isRouteTrip ? {
        ...trip,
        secondaryDriverId: normalizedDriverId || null,
        routeId: normalizedRouteId,
        updatedAt,
        status: trip.driverId || normalizedDriverId ? 'Assigned' : trip.status
      } : trip;
      })
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'route-secondary-driver',
      entityType: 'route',
      entityId: String(routeId || '').trim(),
      source: 'dispatcher',
      summary: `Changed secondary driver on route ${String(routeId || '').trim()} to ${String(driverId || '').trim()}`
    })
  });

  const addDriver = () => updateState(currentState => {
    const nextIndex = currentState.drivers.length + 19;
    const driver = {
      id: `d-${nextIndex}`,
      code: `d-${nextIndex}`,
      vehicle: 'Pending vehicle',
      name: `Standby Driver ${nextIndex}`,
      nickname: 'Standby',
      checkpoint: 'Base dispatch',
      attendant: 'Not Set',
      info: 'Needs onboarding',
      live: 'Offline',
      group: 'VDR',
      position: [28.5383, -81.3792]
    };
    return {
      ...currentState,
      drivers: [driver, ...currentState.drivers],
      selectedDriverId: driver.id
    };
  });

  const replaceTrips = trips => updateState(currentState => ({
    ...currentState,
    trips: normalizeTripRecords(trips),
    routePlans: [],
    selectedTripIds: [],
    selectedRouteId: null,
    selectedDriverId: null
  }), {
    markDispatchDirty: true,
    allowTripShrink: true,
    allowTripShrinkReason: 'replace-trips'
  });

  const upsertImportedTrips = trips => updateState(currentState => {
    const currentTrips = normalizeTripRecords(currentState.trips);
    const importedTrips = dedupeImportedTripBatch(normalizeTripRecords(trips));
    const currentTripLookup = new Map();
    const importedLookupKeys = new Set();

    importedTrips.forEach(importedTrip => {
      getTripLookupKeys(importedTrip).forEach(key => {
        if (key) importedLookupKeys.add(key);
      });
    });

    currentTrips.forEach(trip => {
      getTripLookupKeys(trip).forEach(key => {
        if (key && !currentTripLookup.has(key)) {
          currentTripLookup.set(key, trip);
        }
      });
    });

    const mergedImportedTrips = importedTrips.map(importedTrip => {
      const currentTrip = getTripLookupKeys(importedTrip).map(key => currentTripLookup.get(key)).find(Boolean);
      if (!currentTrip) {
        return importedTrip;
      }
      return mergeImportedTripWithCurrent(currentTrip, importedTrip);
    });

    const untouchedCurrentTrips = currentTrips.filter(trip => {
      const lookupKeys = getTripLookupKeys(trip);
      return !lookupKeys.some(key => importedLookupKeys.has(key));
    });
    const nextTrips = normalizeTripRecords([...untouchedCurrentTrips, ...mergedImportedTrips]);
    const nextTripIds = new Set(nextTrips.map(trip => trip.id));
    const cancelledTripIds = new Set(nextTrips.filter(trip => isCancelledLikeStatus(trip?.status)).map(trip => String(trip.id || '').trim()));

    return {
      ...currentState,
      trips: nextTrips,
      routePlans: currentState.routePlans.map(routePlan => ({
        ...routePlan,
        tripIds: routePlan.tripIds.filter(tripId => {
          const normalizedTripId = String(tripId || '').trim();
          return nextTripIds.has(tripId)
            && !cancelledTripIds.has(normalizedTripId);
        })
      })).filter(routePlan => routePlan.tripIds.length > 0),
      selectedTripIds: currentState.selectedTripIds.filter(tripId => nextTripIds.has(tripId))
    };
  }, { markDispatchDirty: true });

  const clearTripsByServiceDates = serviceDateKeys => updateState(currentState => {
    const targetDateKeys = new Set((Array.isArray(serviceDateKeys) ? serviceDateKeys : []).map(value => String(value || '').trim()).filter(Boolean));
    if (targetDateKeys.size === 0) return currentState;

    const nextTrips = currentState.trips.filter(trip => !targetDateKeys.has(getTripServiceDateKey(trip)));
    const nextTripIds = new Set(nextTrips.map(trip => trip.id));

    return {
      ...currentState,
      trips: nextTrips,
      routePlans: currentState.routePlans.filter(routePlan => routePlan.tripIds.some(tripId => nextTripIds.has(tripId))),
      selectedTripIds: currentState.selectedTripIds.filter(tripId => nextTripIds.has(tripId)),
      selectedRouteId: currentState.selectedRouteId && currentState.routePlans.some(routePlan => routePlan.id === currentState.selectedRouteId && routePlan.tripIds.some(tripId => nextTripIds.has(tripId))) ? currentState.selectedRouteId : null
    };
  }, {
    markDispatchDirty: true,
    allowTripShrink: true,
    allowTripShrinkReason: 'clear-trips-by-service-date'
  });

  const clearTrips = () => updateState(currentState => ({
    ...currentState,
    trips: [],
    routePlans: [],
    selectedTripIds: [],
    selectedRouteId: null,
    selectedDriverId: null
  }), {
    markDispatchDirty: true,
    allowTripShrink: true,
    allowTripShrinkReason: 'clear-all-trips'
  });

  const updateTripNotes = (tripId, notes) => updateState(currentState => {
    const normalizedTripId = String(tripId || '').trim();
    const normalizedNotes = String(notes ?? '').trim();
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      trips: currentState.trips.map(trip => String(trip.id) === normalizedTripId ? normalizeTripRecord({
        ...trip,
        updatedAt,
        notes: normalizedNotes,
        localOverrides: buildTripLocalOverrides(trip, { notes: normalizedNotes })
      }) : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'trip-notes-update',
      entityType: 'trip',
      entityId: String(tripId || '').trim(),
      source: 'dispatcher',
      summary: `Updated notes on trip ${String(tripId || '').trim()}`
    })
  });

  const updateTripRecord = (tripId, updates, auditOptions = {}) => updateState(currentState => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return currentState;
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      trips: currentState.trips.map(trip => String(trip.id) === normalizedTripId ? normalizeTripRecord({
        ...trip,
        updatedAt,
        ...(updates || {}),
        localOverrides: buildTripLocalOverrides(trip, updates || {})
      }) : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: String(auditOptions?.action || 'trip-record-update').trim() || 'trip-record-update',
      entityType: 'trip',
      entityId: String(tripId || '').trim(),
      actorId: String(auditOptions?.actorId || session?.user?.id || '').trim(),
      actorName: String(auditOptions?.actorName || getActorIdentity(session).name).trim(),
      source: String(auditOptions?.source || 'dispatcher').trim() || 'dispatcher',
      summary: String(auditOptions?.summary || `Updated trip ${String(tripId || '').trim()}`).trim(),
      metadata: auditOptions?.metadata && typeof auditOptions.metadata === 'object' ? auditOptions.metadata : updates || {}
    })
  });

  const cloneTripRecord = tripId => {
    const normalizedTripId = String(tripId || '').trim();
    const sourceTrip = (Array.isArray(state?.trips) ? state.trips : []).find(trip => String(trip?.id || '').trim() === normalizedTripId);
    if (!sourceTrip) return null;

    const clonedAt = getMutationTimestamp();
    const cloneToken = String(clonedAt).slice(-6);
    const nextTripId = `${normalizedTripId}-copy-${clonedAt}`;
    const actor = getActorIdentity(session);

    updateState(currentState => ({
      ...currentState,
      trips: normalizeTripRecords([normalizeTripRecord({
        ...sourceTrip,
        id: nextTripId,
        rideId: sourceTrip?.rideId ? `${String(sourceTrip.rideId).trim()}-COPY-${cloneToken}` : nextTripId,
        brokerTripId: sourceTrip?.brokerTripId ? `${String(sourceTrip.brokerTripId).trim()}-COPY-${cloneToken}` : String(sourceTrip?.brokerTripId || '').trim(),
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        status: 'Unassigned',
        actualPickup: '',
        actualDropoff: '',
        confirmation: {
          status: 'Not Sent',
          provider: '',
          requestId: '',
          code: '',
          sentAt: '',
          respondedAt: '',
          lastMessageId: '',
          lastResponseText: '',
          lastResponseCode: '',
          lastPhone: '',
          lastError: ''
        },
        clonedFromTripId: normalizedTripId,
        clonedAt,
        addedBy: actor.name,
        addedByInitials: actor.initials,
        createdBy: actor.name,
        createdByInitials: actor.initials,
        createdAt: clonedAt,
        clonedBy: actor.name,
        clonedByInitials: actor.initials,
        updatedAt: clonedAt
      }), ...currentState.trips])
    }), {
      markDispatchDirty: true,
      buildAuditEntry: () => ({
        action: 'trip-clone',
        entityType: 'trip',
        entityId: nextTripId,
        source: 'dispatcher',
        summary: `Cloned trip ${normalizedTripId} into ${nextTripId}`,
        metadata: {
          sourceTripId: normalizedTripId,
          clonedTripId: nextTripId,
          actorName: actor.name,
          actorInitials: actor.initials
        }
      })
    });

    return nextTripId;
  };

  const deleteTripRecord = (tripId) => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return;
    updateState(currentState => ({
      ...currentState,
      selectedTripIds: currentState.selectedTripIds.filter(id => id !== normalizedTripId),
      routePlans: currentState.routePlans.map(routePlan => ({
        ...routePlan,
        tripIds: routePlan.tripIds.filter(id => id !== normalizedTripId)
      })).filter(routePlan => routePlan.tripIds.length > 0),
      trips: currentState.trips.filter(trip => String(trip?.id || '').trim() !== normalizedTripId)
    }), {
      markDispatchDirty: true,
      allowTripShrink: true,
      allowTripShrinkReason: 'manual-admin-delete',
      buildAuditEntry: () => ({
        action: 'delete-trip',
        entityType: 'trip',
        entityId: normalizedTripId,
        source: 'confirmation',
        summary: `Deleted trip ${normalizedTripId}`
      })
    });
  };

  const setDispatcherVisibleTripColumns = useCallback(columnKeys => {
    const nextPreferences = normalizeNemtUiPreferences({
      ...userUiPreferences,
      dispatcherVisibleTripColumns: normalizeDispatcherVisibleTripColumns(columnKeys)
    });
    const nextSnapshot = JSON.stringify(nextPreferences);
    if (nextSnapshot === userUiPreferencesSnapshotRef.current) return;
    setUserUiPreferences(nextPreferences);
    void persistUserUiPreferences(nextPreferences);
  }, [persistUserUiPreferences, userUiPreferences]);

  const setMapProvider = useCallback(provider => {
    const nextPreferences = normalizeNemtUiPreferences({
      ...userUiPreferences,
      mapProvider: normalizeMapProviderPreference(provider)
    });
    const nextSnapshot = JSON.stringify(nextPreferences);
    if (nextSnapshot === userUiPreferencesSnapshotRef.current) return;
    setUserUiPreferences(nextPreferences);
    void persistUserUiPreferences(nextPreferences);
  }, [persistUserUiPreferences, userUiPreferences]);

  useEffect(() => {
    if (!hasLoadedUserUiPreferences || !hasMapboxConfigured) return;
    if (normalizeMapProviderPreference(userUiPreferences?.mapProvider) === 'mapbox') return;
    setMapProvider('mapbox');
  }, [hasLoadedUserUiPreferences, setMapProvider, userUiPreferences?.mapProvider]);

  const setPrintSetup = useCallback(updates => {
    const nextPreferences = normalizeNemtUiPreferences({
      ...userUiPreferences,
      printSetup: normalizePrintSetup({
        ...userUiPreferences?.printSetup,
        ...(updates || {})
      })
    });
    const nextSnapshot = JSON.stringify(nextPreferences);
    if (nextSnapshot === userUiPreferencesSnapshotRef.current) return;
    setUserUiPreferences(nextPreferences);
    void persistUserUiPreferences(nextPreferences);
  }, [persistUserUiPreferences, userUiPreferences]);

  const resetNemtState = () => {
    startTransition(() => {
      setState(createInitialState());
    });
  };

  const getDriverName = driverId => {
    const driver = state.drivers.find(item => item.id === driverId);
    return driver ? driver.name : 'Unassigned';
  };

  const resolvedUiPreferences = hasLoadedUserUiPreferences ? userUiPreferences : normalizeNemtUiPreferences(state?.uiPreferences);

  return <NemtContext.Provider value={useMemo(() => ({
    ...state,
    uiPreferences: resolvedUiPreferences,
    hasLoadedUserUiPreferences,
    setSelectedTripIds,
    setSelectedDriverId,
    setSelectedRouteId,
    toggleTripSelection,
    assignTripsToDriver,
    assignTripsToSecondaryDriver,
    unassignTrips,
    cancelTrips,
    reinstateTrips,
    createRoute,
    deleteRoute,
    updateRoutePlan,
    assignRoutePrimaryDriver,
    assignRouteSecondaryDriver,
    addDriver,
    replaceTrips,
    upsertImportedTrips,
    clearTripsByServiceDates,
    clearTrips,
    updateTripNotes,
    updateTripRecord,
    cloneTripRecord,
    deleteTripRecord,
    upsertDispatchThreadMessage,
    markDispatchThreadRead,
    removeDispatchThreadMessageMedia,
    addDailyDriver,
    removeDailyDriver,
    setDispatcherVisibleTripColumns,
    setMapProvider,
    setPrintSetup,
    resetNemtState,
    getDriverName,
    sendTripNotification,
    refreshDrivers: syncDriversFromServer,
    refreshDispatchState: syncDispatchFromServer,
    refreshDispatchMessages: syncDispatchThreadsFromServer
  }), [resolvedUiPreferences, session, state])}>
      {children}
    </NemtContext.Provider>;
};
