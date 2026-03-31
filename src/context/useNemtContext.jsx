'use client';

import { getTripServiceDateKey, normalizeDispatcherVisibleTripColumns, normalizeMapProviderPreference, normalizeNemtUiPreferences, normalizePersistentDispatchState, normalizeRoutePlanRecord, normalizeTripRecord, normalizeTripRecords } from '@/helpers/nemt-dispatch-state';
import { normalizePrintSetup } from '@/helpers/nemt-print-setup';
import useLocalStorage from '@/hooks/useLocalStorage';
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
  selectedTripIds: Array.isArray(value?.selectedTripIds) ? value.selectedTripIds.filter(Boolean) : [],
  selectedDriverId: value?.selectedDriverId || null,
  selectedRouteId: value?.selectedRouteId || null,
  uiPreferences: normalizeNemtUiPreferences(value?.uiPreferences)
});

const createInitialState = () => buildClientState();

const createPersistedSnapshot = state => normalizePersistentDispatchState({
  trips: state?.trips,
  routePlans: state?.routePlans,
  uiPreferences: state?.uiPreferences
});

const routeColors = ['#2563eb', '#16a34a', '#7c3aed', '#ea580c', '#dc2626', '#0891b2'];
const NemtContext = createContext(undefined);
const getMutationTimestamp = () => Date.now();

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
  const [state, setState] = useLocalStorage('__CARE_MOBILITY_NEMT__', createInitialState());
  const [isDispatchLoaded, setIsDispatchLoaded] = useState(false);
  const lastPersistedSnapshotRef = useRef('');
  const hasLocalDispatchChangesRef = useRef(false);
  const persistInFlightRef = useRef(false);
  const pendingPersistSnapshotRef = useRef('');

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
          const useLocalTrips = !forceServer && (localState.trips.length > payload.trips.length || hasLocalDispatchChangesRef.current && localState.trips.length > 0);
          const useLocalRoutes = !forceServer && (localState.routePlans.length > payload.routePlans.length || hasLocalDispatchChangesRef.current && localState.routePlans.length > 0);
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
            uiPreferences: useLocalPreferences ? localState.uiPreferences : payload.uiPreferences
          });
          lastPersistedSnapshotRef.current = useLocalTrips || useLocalRoutes || useLocalPreferences ? '' : JSON.stringify(createPersistedSnapshot(nextState));
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
    if (!state || state.version !== STORAGE_VERSION) {
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
  }, [setState]);

  useEffect(() => {
    if (!isDispatchLoaded || !state) return;
    const snapshot = JSON.stringify(createPersistedSnapshot(state));
    if (snapshot === lastPersistedSnapshotRef.current) return;

    pendingPersistSnapshotRef.current = snapshot;

    const flushPersistQueue = async () => {
      if (persistInFlightRef.current) return;
      const nextSnapshot = pendingPersistSnapshotRef.current;
      if (!nextSnapshot || nextSnapshot === lastPersistedSnapshotRef.current) return;

      persistInFlightRef.current = true;
      pendingPersistSnapshotRef.current = '';

      try {
        const response = await fetch('/api/nemt/dispatch', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
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

    const timeoutId = window.setTimeout(async () => {
      await flushPersistQueue();
    }, 250);

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

  const updateState = (updater, options = {}) => {
    const shouldMarkDispatchDirty = options.markDispatchDirty ?? false;
    setState(currentState => {
      const baseState = currentState ?? createInitialState();
      if (shouldMarkDispatchDirty) {
        hasLocalDispatchChangesRef.current = true;
      }
      return updater(baseState);
    });
  };

  const setSelectedTripIds = tripIds => updateState(currentState => ({
    ...currentState,
    selectedTripIds: tripIds
  }));

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
  }, { markDispatchDirty: true });

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
  }, { markDispatchDirty: true });

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
  }, { markDispatchDirty: true });

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
  }, { markDispatchDirty: true });

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
  }, { markDispatchDirty: true });

  const createRoute = ({
    name,
    driverId,
    tripIds,
    notes,
    serviceDate
  }) => updateState(currentState => {
    const targetTripIds = tripIds.length > 0 ? tripIds : currentState.selectedTripIds;
    const updatedAt = getMutationTimestamp();
    const routeId = `route-${Date.now()}`;
    const firstTripInRoute = currentState.trips.find(trip => targetTripIds.includes(trip.id));
    const routeServiceDate = String(serviceDate || getTripServiceDateKey(firstTripInRoute) || '').trim();
    const cleanedRoutePlans = currentState.routePlans.map(routePlan => ({
      ...routePlan,
      tripIds: routePlan.tripIds.filter(id => !targetTripIds.includes(id))
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
      trips: currentState.trips.map(trip => targetTripIds.includes(trip.id) ? {
        ...trip,
        driverId,
        routeId,
        updatedAt,
        status: 'Assigned'
      } : trip),
      selectedTripIds: targetTripIds
    };
  }, { markDispatchDirty: true });

  const deleteRoute = routeId => updateState(currentState => {
    const updatedAt = getMutationTimestamp();
    return {
      ...currentState,
      selectedRouteId: currentState.selectedRouteId === routeId ? null : currentState.selectedRouteId,
      routePlans: currentState.routePlans.filter(routePlan => routePlan.id !== routeId),
      trips: currentState.trips.map(trip => trip.routeId === routeId ? {
        ...trip,
        driverId: null,
        secondaryDriverId: null,
        routeId: null,
        updatedAt,
        status: 'Unassigned'
      } : trip)
    };
  }, { markDispatchDirty: true });

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
  }), { markDispatchDirty: true });

  const clearTrips = () => updateState(currentState => ({
    ...currentState,
    trips: [],
    routePlans: [],
    selectedTripIds: [],
    selectedRouteId: null,
    selectedDriverId: null
  }), { markDispatchDirty: true });

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
  }, { markDispatchDirty: true });

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
  }, { markDispatchDirty: true });

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
    addDriver,
    replaceTrips,
    clearTrips,
    updateTripNotes,
    updateTripRecord,
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