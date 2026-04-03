'use client';

import { getTripServiceDateKey, normalizeDailyDriverRecord, normalizeDispatchAuditRecord, normalizeDispatchMessageRecord, normalizeDispatchThreadRecord, normalizeDispatcherVisibleTripColumns, normalizeMapProviderPreference, normalizeNemtUiPreferences, normalizePersistentDispatchState, normalizeRoutePlanRecord, normalizeTripRecord, normalizeTripRecords } from '@/helpers/nemt-dispatch-state';
import { normalizePrintSetup } from '@/helpers/nemt-print-setup';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useSession } from 'next-auth/react';
import { createContext, startTransition, use, useEffect, useMemo, useRef, useState } from 'react';

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
const DISPATCH_SYNC_POLL_MS = 5000;

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

  if (tripId) keys.push(`id:${tripId}`);
  if (rideId) keys.push(`ride:${rideId}`);
  if (rideId && brokerTripId) keys.push(`ride-broker:${rideId}:${brokerTripId}`);

  return keys;
};

const mergeImportedTripWithCurrent = (currentTrip, importedTrip) => normalizeTripRecord({
  ...importedTrip,
  id: String(currentTrip?.id || importedTrip?.id || '').trim(),
  driverId: currentTrip?.driverId ?? null,
  secondaryDriverId: currentTrip?.secondaryDriverId ?? null,
  routeId: currentTrip?.routeId ?? null,
  status: currentTrip?.status || importedTrip?.status,
  notes: String(currentTrip?.notes || '').trim() || importedTrip?.notes,
  confirmation: currentTrip?.confirmation || importedTrip?.confirmation,
  updatedAt: Number(currentTrip?.updatedAt) || Number(importedTrip?.updatedAt) || 0
});

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

export const useNemtContext = () => {
  const context = use(NemtContext);
  if (!context) {
    throw new Error('useNemtContext must be used within NemtProvider');
  }
  return context;
};

export const NemtProvider = ({
  children
}) => {
  const { data: session } = useSession();
  const [state, setState] = useLocalStorage('__CARE_MOBILITY_NEMT__', createInitialState());
  const [isDispatchLoaded, setIsDispatchLoaded] = useState(false);
  const lastPersistedSnapshotRef = useRef('');
  const hasLocalDispatchChangesRef = useRef(false);
  const persistInFlightRef = useRef(false);
  const pendingPersistSnapshotRef = useRef('');
  const allowTripShrinkNextPersistRef = useRef(false);
  const pendingAllowTripShrinkRef = useRef(false);
  const allowTripShrinkReasonNextPersistRef = useRef('');
  const pendingAllowTripShrinkReasonRef = useRef('');

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
      }
    } catch {
      // Keep local state if the server is temporarily unavailable.
    } finally {
      persistInFlightRef.current = false;
      if (pendingPersistSnapshotRef.current && pendingPersistSnapshotRef.current !== lastPersistedSnapshotRef.current) {
        void flushPersistQueue();
      }
    }
  };

  const syncDriversFromServer = async () => {
    try {
      const response = await fetch('/api/nemt/admin', {
        cache: 'no-store'
      });
      if (!response.ok) return;
      const payload = await response.json();
      const nextDrivers = Array.isArray(payload?.dispatchDrivers) ? payload.dispatchDrivers : [];
      startTransition(() => {
        setState(currentState => {
          const baseState = currentState ?? createInitialState();
          return {
            ...baseState,
            drivers: nextDrivers
          };
        });
      });
    } catch {
      // Keep the last known dispatch state if the admin API is temporarily unavailable.
    }
  };

  const syncDispatchFromServer = async (options = {}) => {
    const forceServer = options.forceServer ?? false;
    try {
      const response = await fetch('/api/nemt/dispatch', {
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
            trips: useLocalTrips ? localState.trips : payload.trips,
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

  useEffect(() => {
    const needsNormalization = !state || state.version !== STORAGE_VERSION || !Array.isArray(state?.trips) || !Array.isArray(state?.routePlans) || !Array.isArray(state?.selectedTripIds) || typeof state?.uiPreferences !== 'object' || state?.uiPreferences == null;
    if (needsNormalization) {
      startTransition(() => {
        setState(buildClientState(state));
      });
    }
  }, [setState, state]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!isDispatchLoaded || !state) return;
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
  }, [isDispatchLoaded, state]);

  useEffect(() => {
    syncDriversFromServer();

    const handleAdminUpdate = () => {
      syncDriversFromServer();
    };

    window.addEventListener('nemt-admin-updated', handleAdminUpdate);
    window.addEventListener('focus', handleAdminUpdate);

    return () => {
      window.removeEventListener('nemt-admin-updated', handleAdminUpdate);
      window.removeEventListener('focus', handleAdminUpdate);
    };
  }, []);

  useEffect(() => {
    if (!isDispatchLoaded) return;

    let active = true;

    const syncLiveState = async () => {
      if (!active) return;
      await Promise.allSettled([syncDriversFromServer(), syncDispatchFromServer()]);
    };

    const intervalId = window.setInterval(() => {
      void syncLiveState();
    }, DISPATCH_SYNC_POLL_MS);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void syncLiveState();
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isDispatchLoaded]);

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

  const upsertDispatchThreadMessage = ({ driverId, message, markIncomingRead = false }) => updateState(currentState => {
    const normalizedDriverId = String(driverId || '').trim();
    const normalizedMessage = normalizeDispatchMessageRecord(message);
    if (!normalizedDriverId || (!normalizedMessage.text && normalizedMessage.attachments.length === 0)) return currentState;
    const existingThreads = Array.isArray(currentState.dispatchThreads) ? currentState.dispatchThreads : [];
    const nextThreads = existingThreads.some(thread => thread.driverId === normalizedDriverId)
      ? existingThreads.map(thread => thread.driverId === normalizedDriverId ? {
        ...thread,
        messages: [...thread.messages.map(currentMessage => markIncomingRead && currentMessage.direction === 'incoming' ? {
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
    markDispatchDirty: true,
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
  }, { markDispatchDirty: true });

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
    return {
      ...currentState,
      selectedDriverId: driverId,
      trips: currentState.trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        driverId,
        updatedAt,
        status: 'Assigned'
      } : trip)
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
    return {
      ...currentState,
      trips: currentState.trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        secondaryDriverId: driverId,
        updatedAt,
        status: trip.driverId || driverId ? 'Assigned' : trip.status
      } : trip)
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

  const cancelTrips = (tripIds = []) => updateState(currentState => {
    const targetTripIds = tripIds.length > 0 ? tripIds : currentState.selectedTripIds;
    const updatedAt = getMutationTimestamp();
    const updatedRoutePlans = currentState.routePlans.map(routePlan => ({
      ...routePlan,
      tripIds: routePlan.tripIds.filter(id => !targetTripIds.includes(id))
    })).filter(routePlan => routePlan.tripIds.length > 0);
    return {
      ...currentState,
      routePlans: updatedRoutePlans,
      selectedTripIds: currentState.selectedTripIds.filter(id => !targetTripIds.includes(id)),
      trips: currentState.trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        updatedAt,
        status: 'Cancelled'
      } : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'cancel-trips',
      entityType: 'trip',
      source: 'dispatcher',
      summary: `Cancelled ${tripIds.length} trip(s)`,
      metadata: { tripIds }
    })
  });

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
  }) => updateState(currentState => {
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

  const assignRoutePrimaryDriver = (routeId, driverId) => updateState(currentState => {
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
    const consumedCurrentTripIds = new Set();

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
      consumedCurrentTripIds.add(String(currentTrip.id || '').trim());
      return mergeImportedTripWithCurrent(currentTrip, importedTrip);
    });

    const untouchedCurrentTrips = currentTrips.filter(trip => !consumedCurrentTripIds.has(String(trip.id || '').trim()));
    const nextTrips = normalizeTripRecords([...untouchedCurrentTrips, ...mergedImportedTrips]);
    const nextTripIds = new Set(nextTrips.map(trip => trip.id));

    return {
      ...currentState,
      trips: nextTrips,
      routePlans: currentState.routePlans.filter(routePlan => routePlan.tripIds.some(tripId => nextTripIds.has(tripId))),
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
      trips: currentState.trips.map(trip => String(trip.id) === normalizedTripId ? {
        ...trip,
        updatedAt,
        notes: normalizedNotes
      } : trip)
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

  const updateTripRecord = (tripId, updates) => updateState(currentState => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return currentState;
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      trips: currentState.trips.map(trip => String(trip.id) === normalizedTripId ? normalizeTripRecord({
        ...trip,
        updatedAt,
        ...(updates || {})
      }) : trip)
    };
  }, {
    markDispatchDirty: true,
    buildAuditEntry: () => ({
      action: 'trip-record-update',
      entityType: 'trip',
      entityId: String(tripId || '').trim(),
      source: 'dispatcher',
      summary: `Updated trip ${String(tripId || '').trim()}`,
      metadata: updates || {}
    })
  });

  const setDispatcherVisibleTripColumns = columnKeys => updateState(currentState => ({
    ...currentState,
    uiPreferences: {
      ...currentState.uiPreferences,
      dispatcherVisibleTripColumns: normalizeDispatcherVisibleTripColumns(columnKeys)
    }
  }), { markDispatchDirty: true });

  const setMapProvider = provider => updateState(currentState => ({
    ...currentState,
    uiPreferences: {
      ...currentState.uiPreferences,
      mapProvider: normalizeMapProviderPreference(provider)
    }
  }), { markDispatchDirty: true });

  const setPrintSetup = updates => updateState(currentState => ({
    ...currentState,
    uiPreferences: {
      ...currentState.uiPreferences,
      printSetup: normalizePrintSetup({
        ...currentState.uiPreferences?.printSetup,
        ...(updates || {})
      })
    }
  }), { markDispatchDirty: true });

  const resetNemtState = () => {
    startTransition(() => {
      setState(createInitialState());
    });
  };

  const getDriverName = driverId => {
    const driver = state.drivers.find(item => item.id === driverId);
    return driver ? driver.name : 'Unassigned';
  };

  return <NemtContext.Provider value={useMemo(() => ({
    ...state,
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
    upsertDispatchThreadMessage,
    markDispatchThreadRead,
    addDailyDriver,
    removeDailyDriver,
    setDispatcherVisibleTripColumns,
    setMapProvider,
    setPrintSetup,
    resetNemtState,
    getDriverName,
    refreshDrivers: syncDriversFromServer,
    refreshDispatchState: syncDispatchFromServer
  }), [state])}>
      {children}
    </NemtContext.Provider>;
};
