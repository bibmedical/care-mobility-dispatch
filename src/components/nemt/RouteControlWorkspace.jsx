'use client';

import { useNemtContext } from '@/context/useNemtContext';
import { getTripLateMinutes, getTripServiceDateKey, getTripTimelineDateKey, isTripAssignedToDriver } from '@/helpers/nemt-dispatch-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getMapTileConfig } from '@/utils/map-tiles';
import { MapContainer, Marker, Polyline, Popup } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

const toMinutes = value => {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
};

const getNormalizedStatus = trip => String(trip?.status || '').trim().toLowerCase();

const sortRouteTrips = trips => [...trips].sort((a, b) => toMinutes(a?.pickup) - toMinutes(b?.pickup));
const CLOSED_ROUTE_STATE_KEY = '__CARE_MOBILITY_CLOSED_ROUTE_STATE__';
const normalizeTripId = tripId => String(tripId || '').trim();
const normalizeDriverId = driverId => String(driverId || '').trim();
const getClosedRouteKey = (driverId, dateKey) => {
  const normalizedDriverId = normalizeDriverId(driverId);
  const normalizedDateKey = String(dateKey || '').trim();
  if (!normalizedDriverId || !normalizedDateKey || normalizedDateKey === 'all') return '';
  return `${normalizedDriverId}::${normalizedDateKey}`;
};

const getTripsForRoute = (route, allTrips) => {
  if (!route) return [];
  const routeId = String(route.id || '').trim();
  const routeTripIds = new Set((Array.isArray(route.tripIds) ? route.tripIds : []).map(value => String(value || '').trim()).filter(Boolean));
  return allTrips.filter(trip => {
    const tripId = String(trip?.id || '').trim();
    const matchesRouteId = String(trip?.routeId || '').trim() === routeId;
    const matchesTripId = tripId && routeTripIds.has(tripId);
    return matchesRouteId || matchesTripId;
  });
};

const getRouteHealth = routeTrips => {
  const lateTrips = routeTrips.filter(trip => {
    const lateMinutes = getTripLateMinutes(trip);
    return Number.isFinite(lateMinutes) && lateMinutes > 0;
  });
  const willCallTrips = routeTrips.filter(trip => getNormalizedStatus(trip) === 'willcall');
  const unassignedTrips = routeTrips.filter(trip => !trip?.driverId && !trip?.secondaryDriverId);

  if (lateTrips.length >= 3 || unassignedTrips.length > 0) {
    return {
      level: 'High Risk',
      variant: 'danger',
      details: `${lateTrips.length} late, ${unassignedTrips.length} unassigned, ${willCallTrips.length} will call.`
    };
  }

  if (lateTrips.length > 0 || willCallTrips.length > 0) {
    return {
      level: 'Needs Attention',
      variant: 'warning',
      details: `${lateTrips.length} late and ${willCallTrips.length} will call.`
    };
  }

  return {
    level: 'Healthy',
    variant: 'success',
    details: 'Route timing looks stable.'
  };
};

const getDriverLoadMap = trips => trips.reduce((acc, trip) => {
  const primary = String(trip?.driverId || '').trim();
  const secondary = String(trip?.secondaryDriverId || '').trim();
  if (primary) acc.set(primary, (acc.get(primary) || 0) + 1);
  if (secondary) acc.set(secondary, (acc.get(secondary) || 0) + 1);
  return acc;
}, new Map());

const buildRouteSuggestion = ({ route, routeTrips, drivers, trips }) => {
  const health = getRouteHealth(routeTrips);
  const driverLoads = getDriverLoadMap(trips);
  const availableDrivers = drivers.filter(driver => String(driver?.id || '').trim());
  const currentDriverId = String(route?.driverId || '').trim();

  const rankedDrivers = [...availableDrivers]
    .filter(driver => String(driver.id) !== currentDriverId)
    .sort((a, b) => {
      const aLoad = driverLoads.get(String(a.id)) || 0;
      const bLoad = driverLoads.get(String(b.id)) || 0;
      const aOnline = String(a.live || '').toLowerCase() === 'online' ? 0 : 1;
      const bOnline = String(b.live || '').toLowerCase() === 'online' ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return aLoad - bLoad;
    });

  const recommendedDriver = rankedDrivers[0] || null;
  const problematicTrips = routeTrips.filter(trip => {
    const lateMinutes = getTripLateMinutes(trip);
    return (Number.isFinite(lateMinutes) && lateMinutes > 10) || getNormalizedStatus(trip) === 'willcall';
  });

  return {
    health,
    recommendedDriver,
    problematicTrips,
    summary: recommendedDriver
      ? `Local GPT suggests ${recommendedDriver.name} as alternative based on lower load and route risk.`
      : 'No better driver suggestion found right now.'
  };
};

const shiftDateValue = (dateKey, offsetDays) => {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const shiftedDate = new Date(year, month - 1, day + offsetDays);
  const nextYear = shiftedDate.getFullYear();
  const nextMonth = String(shiftedDate.getMonth() + 1).padStart(2, '0');
  const nextDay = String(shiftedDate.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

const logSystemActivity = async (eventLabel, target = '', metadata = null) => {
  try {
    await fetch('/api/system-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventLabel, target, metadata })
    });
  } catch (error) {
    console.error('Error recording route control activity:', error);
  }
};

const RouteControlWorkspace = () => {
  const {
    drivers,
    trips,
    routePlans,
    uiPreferences,
    refreshDrivers,
    refreshDispatchState,
    assignTripsToDriver,
    assignTripsToSecondaryDriver,
    unassignTrips,
    assignRoutePrimaryDriver,
    assignRouteSecondaryDriver,
    updateRoutePlan,
    deleteRoute,
    createRoute
  } = useNemtContext();

  const [dateFilter, setDateFilter] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [primaryDriverId, setPrimaryDriverId] = useState('');
  const [secondaryDriverId, setSecondaryDriverId] = useState('');
  const [routeNameDraft, setRouteNameDraft] = useState('');
  const [routeNotesDraft, setRouteNotesDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState('Select a work day to load Route Control.');
  const [closedRouteStateByKey, setClosedRouteStateByKey] = useState({});
  const closedRouteSnapshotRef = useRef('');

  const mapTileConfig = useMemo(() => {
    const preferred = getMapTileConfig(uiPreferences?.mapProvider);
    return preferred || getMapTileConfig('auto');
  }, [uiPreferences?.mapProvider]);
  const hasSelectedDate = Boolean(dateFilter);

  const effectiveRoutes = useMemo(() => Array.isArray(routePlans) ? routePlans : [], [routePlans]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        await Promise.all([refreshDrivers(), refreshDispatchState()]);
      } catch {
        if (active) setStatusMessage('Live sync failed. Showing latest local data.');
      }
    };
    sync();
    return () => {
      active = false;
    };
  }, [refreshDispatchState, refreshDrivers]);

  useEffect(() => {
    const handleAssistantAction = event => {
      const detail = event?.detail || {};
      void refreshDispatchState({ forceServer: true });
      if (detail?.serviceDate) {
        setDateFilter(String(detail.serviceDate));
      }
      if (detail?.focusDriverId) {
        setSelectedDriverId(String(detail.focusDriverId));
        setSelectedRouteId('');
      }
    };

    window.addEventListener('nemt-assistant-action', handleAssistantAction);
    return () => window.removeEventListener('nemt-assistant-action', handleAssistantAction);
  }, [refreshDispatchState]);

  useEffect(() => {
    const loadClosedRouteState = () => {
      try {
        const rawValue = window.localStorage.getItem(CLOSED_ROUTE_STATE_KEY);
        if (!rawValue) {
          if (closedRouteSnapshotRef.current !== '') {
            closedRouteSnapshotRef.current = '';
            setClosedRouteStateByKey({});
          }
          return;
        }
        if (rawValue === closedRouteSnapshotRef.current) return;
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          if (closedRouteSnapshotRef.current !== '') {
            closedRouteSnapshotRef.current = '';
            setClosedRouteStateByKey({});
          }
          return;
        }
        closedRouteSnapshotRef.current = rawValue;
        setClosedRouteStateByKey(parsed);
      } catch {
        if (closedRouteSnapshotRef.current !== '') {
          closedRouteSnapshotRef.current = '';
          setClosedRouteStateByKey({});
        }
      }
    };

    loadClosedRouteState();
    window.addEventListener('storage', loadClosedRouteState);
    return () => {
      window.removeEventListener('storage', loadClosedRouteState);
    };
  }, []);

  const filteredRoutes = useMemo(() => {
    if (!hasSelectedDate) return [];
    return effectiveRoutes.filter(route => {
    return String(route?.serviceDate || '').trim() === dateFilter;
    });
  }, [dateFilter, effectiveRoutes, hasSelectedDate]);

  const driversWithInfo = useMemo(() => {
    if (!hasSelectedDate) return [];
    return drivers.map(driver => {
    const driverId = String(driver.id);
    const driverTrips = trips.filter(trip => {
      const matchesDriver = isTripAssignedToDriver(trip, driverId);
      const matchesDate = getTripTimelineDateKey(trip, effectiveRoutes, trips) === dateFilter;
      return matchesDriver && matchesDate;
    });
    const driverRoute = filteredRoutes.find(route => {
      const matchesDriver = String(route?.driverId || '') === driverId;
      const matchesDate = String(route?.serviceDate || '') === dateFilter;
      return matchesDriver && matchesDate;
    });
    return { driver, trips: driverTrips, route: driverRoute || null, hasRoute: Boolean(driverRoute) };
  });
  }, [drivers, trips, filteredRoutes, effectiveRoutes, dateFilter, hasSelectedDate]);

  const selectedRoute = useMemo(() => {
    if (!hasSelectedDate) return null;
    if (selectedRouteId) return filteredRoutes.find(route => route.id === selectedRouteId) || null;
    if (selectedDriverId) {
      return filteredRoutes.find(route => {
        const matchesDriver = String(route?.driverId || '') === selectedDriverId;
        const matchesDate = String(route?.serviceDate || '') === dateFilter;
        return matchesDriver && matchesDate;
      }) || null;
    }
    return null;
  }, [filteredRoutes, selectedRouteId, selectedDriverId, dateFilter, hasSelectedDate]);

  const selectedRouteTrips = useMemo(() => {
    if (!hasSelectedDate) return [];
    if (selectedRoute) return sortRouteTrips(getTripsForRoute(selectedRoute, trips));
    if (selectedDriverId) {
      return sortRouteTrips(trips.filter(trip => {
        const matchesDriver = isTripAssignedToDriver(trip, selectedDriverId);
        const matchesDate = getTripTimelineDateKey(trip, effectiveRoutes, trips) === dateFilter;
        return matchesDriver && matchesDate;
      }));
    }
    return [];
  }, [selectedRoute, selectedDriverId, trips, effectiveRoutes, dateFilter, hasSelectedDate]);

  const selectedTripIds = useMemo(() => selectedRouteTrips.map(trip => trip.id).filter(Boolean), [selectedRouteTrips]);

  const resolvedRoute = useMemo(() => {
    if (selectedRoute) return selectedRoute;
    if (!hasSelectedDate) return null;

    const selectedTripIdSet = new Set(selectedTripIds.map(value => String(value || '').trim()).filter(Boolean));
    if (selectedTripIdSet.size === 0) return null;

    const selectedTripRouteIds = new Set(selectedRouteTrips.map(trip => String(trip?.routeId || '').trim()).filter(Boolean));

    return effectiveRoutes.find(route => {
      const routeId = String(route?.id || '').trim();
      const sameDate = String(route?.serviceDate || '').trim() === dateFilter;
      if (!sameDate) return false;

      const hasDirectRouteMatch = routeId && selectedTripRouteIds.has(routeId);
      if (hasDirectRouteMatch) return true;

      const routeTripIds = Array.isArray(route?.tripIds) ? route.tripIds : [];
      return routeTripIds.some(routeTripId => selectedTripIdSet.has(String(routeTripId || '').trim()));
    }) || null;
  }, [selectedRoute, hasSelectedDate, selectedTripIds, selectedRouteTrips, effectiveRoutes, dateFilter]);

  const isPersistedRoute = Boolean(resolvedRoute);

  const selectedRouteDriver = useMemo(() => {
    const driverId = selectedDriverId || String(resolvedRoute?.driverId || '');
    return drivers.find(driver => String(driver.id) === driverId) || null;
  }, [drivers, resolvedRoute, selectedDriverId]);

  const routeSuggestion = useMemo(() => {
    if (!hasSelectedDate || selectedRouteTrips.length === 0) return null;
    return buildRouteSuggestion({
      route: selectedRoute || { id: '', driverId: selectedDriverId },
      routeTrips: selectedRouteTrips,
      drivers,
      trips
    });
  }, [drivers, selectedRoute, selectedDriverId, selectedRouteTrips, trips, hasSelectedDate]);

  const mapCenter = useMemo(() => {
    const firstTrip = selectedRouteTrips.find(trip => Array.isArray(trip?.position) && trip.position.length === 2);
    return firstTrip?.position || [28.5383, -81.3792];
  }, [selectedRouteTrips]);

  const routePath = useMemo(() => selectedRouteTrips
    .map(trip => trip?.position)
    .filter(position => Array.isArray(position) && position.length === 2), [selectedRouteTrips]);

  const dayHistory = useMemo(() => {
    const dateKey = selectedRoute?.serviceDate || dateFilter || null;
    const driverId = selectedDriverId || String(resolvedRoute?.driverId || '');
    if (!dateKey || !driverId) return null;
    const dayTrips = trips.filter(trip => {
      const matchesDriver = isTripAssignedToDriver(trip, driverId);
      return matchesDriver && getTripTimelineDateKey(trip, effectiveRoutes, trips) === dateKey;
    });
    if (dayTrips.length === 0) return null;
    const completed = dayTrips.filter(trip => ['completed', 'done', 'closed'].includes(getNormalizedStatus(trip))).length;
    const cancelled = dayTrips.filter(trip => ['cancelled', 'canceled'].includes(getNormalizedStatus(trip))).length;
    const assigned = dayTrips.filter(trip => getNormalizedStatus(trip) === 'assigned').length;
    return { total: dayTrips.length, completed, cancelled, assigned };
  }, [selectedRoute, resolvedRoute, selectedDriverId, trips, effectiveRoutes, dateFilter]);

  const selectedClosedRouteState = useMemo(() => {
    const dateKey = selectedRoute?.serviceDate || dateFilter || '';
    const driverId = selectedDriverId || String(resolvedRoute?.driverId || '');
    const routeKey = getClosedRouteKey(driverId, dateKey);
    if (!routeKey) return null;
    return closedRouteStateByKey[routeKey] ?? null;
  }, [closedRouteStateByKey, dateFilter, resolvedRoute?.driverId, selectedDriverId, selectedRoute?.serviceDate]);

  const selectedClosedRouteEvents = useMemo(() => {
    if (!selectedClosedRouteState) return [];
    const events = Array.isArray(selectedClosedRouteState.events) ? selectedClosedRouteState.events : [];
    return [...events].sort((a, b) => Number(a?.at || 0) - Number(b?.at || 0));
  }, [selectedClosedRouteState]);

  const handleSelectDriver = driverInfo => {
    const driverId = String(driverInfo.driver.id);
    setSelectedDriverId(driverId);
    if (driverInfo.route) {
      setSelectedRouteId(driverInfo.route.id);
      setPrimaryDriverId(String(driverInfo.route.driverId || driverId));
      setSecondaryDriverId(String(driverInfo.route.secondaryDriverId || ''));
      setRouteNameDraft(String(driverInfo.route.name || ''));
      setRouteNotesDraft(String(driverInfo.route.notes || ''));
    } else {
      setSelectedRouteId('');
      setPrimaryDriverId(driverId);
      setSecondaryDriverId('');
      setRouteNameDraft('');
      setRouteNotesDraft('');
    }
  };

  useEffect(() => {
    if (!resolvedRoute) return;
    setSelectedRouteId(resolvedRoute.id);
    setPrimaryDriverId(String(resolvedRoute.driverId || ''));
    setSecondaryDriverId(String(resolvedRoute.secondaryDriverId || ''));
    setRouteNameDraft(String(resolvedRoute.name || ''));
    setRouteNotesDraft(String(resolvedRoute.notes || ''));
  }, [resolvedRoute?.id, resolvedRoute?.driverId, resolvedRoute?.secondaryDriverId, resolvedRoute?.name, resolvedRoute?.notes]);

  const handleApplyPrimary = () => {
    if (!primaryDriverId || selectedTripIds.length === 0) return;
    if (isPersistedRoute) {
      assignRoutePrimaryDriver(resolvedRoute.id, primaryDriverId);
    } else {
      assignTripsToDriver(primaryDriverId, selectedTripIds);
      setSelectedDriverId(primaryDriverId);
      setSelectedRouteId('');
    }
    setStatusMessage('Primary driver updated for full route.');
    void logSystemActivity('Updated route primary driver', resolvedRoute?.name || selectedRouteDriver?.name || 'Route Control', {
      driverId: primaryDriverId,
      tripCount: selectedTripIds.length,
      routeId: resolvedRoute?.id || ''
    });
  };

  const handleApplySecondary = () => {
    if (selectedTripIds.length === 0) return;
    if (isPersistedRoute) {
      assignRouteSecondaryDriver(resolvedRoute.id, secondaryDriverId);
    } else {
      assignTripsToSecondaryDriver(secondaryDriverId || '', selectedTripIds);
    }
    setStatusMessage(secondaryDriverId ? 'Secondary driver assigned to full route.' : 'Secondary driver removed from route.');
    void logSystemActivity(secondaryDriverId ? 'Assigned route secondary driver' : 'Removed route secondary driver', resolvedRoute?.name || selectedRouteDriver?.name || 'Route Control', {
      driverId: secondaryDriverId || '',
      tripCount: selectedTripIds.length,
      routeId: resolvedRoute?.id || ''
    });
  };

  const handleSaveRouteMeta = () => {
    if (selectedTripIds.length === 0) return;
    if (isPersistedRoute) {
      updateRoutePlan(resolvedRoute.id, {
        name: routeNameDraft,
        notes: routeNotesDraft,
        serviceDate: resolvedRoute.serviceDate
      });
      setStatusMessage('Route details updated.');
      void logSystemActivity('Updated route details', routeNameDraft || resolvedRoute?.name || 'Route Control', {
        routeId: resolvedRoute.id,
        tripCount: selectedTripIds.length,
        serviceDate: resolvedRoute.serviceDate
      });
      return;
    }

    const nextDriverId = primaryDriverId || selectedDriverId;
    if (!nextDriverId) {
      setStatusMessage('Select a primary driver before saving the route.');
      return;
    }

    createRoute({
      name: routeNameDraft || `${selectedRouteDriver?.name || 'Driver'} Route`,
      driverId: nextDriverId,
      tripIds: selectedTripIds,
      notes: routeNotesDraft,
      serviceDate: resolvedRoute?.serviceDate || dateFilter || getTripServiceDateKey(selectedRouteTrips[0])
    });
    setSelectedDriverId(nextDriverId);
    setSelectedRouteId('');
    setStatusMessage('Route created and saved.');
    void logSystemActivity('Created route plan', routeNameDraft || `${selectedRouteDriver?.name || 'Driver'} Route`, {
      driverId: nextDriverId,
      tripCount: selectedTripIds.length,
      serviceDate: resolvedRoute?.serviceDate || dateFilter || getTripServiceDateKey(selectedRouteTrips[0])
    });
  };

  const handleDeleteRoute = () => {
    const targetRouteId = String(resolvedRoute?.id || selectedRoute?.id || selectedRouteId || '').trim();
    if (!targetRouteId && selectedTripIds.length === 0) return;
    const routeLabel = resolvedRoute?.name || selectedRouteDriver?.name || 'this route';
    const ok = window.confirm(`Delete route ${routeLabel}? This will unassign all trips in this route.`);
    if (!ok) return;
    if (targetRouteId) {
      deleteRoute(targetRouteId);
    } else {
      unassignTrips(selectedTripIds);
    }
    setSelectedRouteId('');
    setStatusMessage('Route deleted. Trips returned to unassigned.');
    void logSystemActivity('Deleted route plan', routeLabel, {
      routeId: targetRouteId,
      tripCount: selectedTripIds.length
    });
  };

  const handleAutoAssignFix = () => {
    if (selectedTripIds.length === 0 || !routeSuggestion?.recommendedDriver) {
      setStatusMessage('No auto-assign recommendation available.');
      return;
    }
    if (isPersistedRoute) {
      assignRoutePrimaryDriver(resolvedRoute.id, routeSuggestion.recommendedDriver.id);
    } else {
      assignTripsToDriver(routeSuggestion.recommendedDriver.id, selectedTripIds);
      setSelectedRouteId('');
    }
    setSelectedDriverId(String(routeSuggestion.recommendedDriver.id));
    setPrimaryDriverId(String(routeSuggestion.recommendedDriver.id));
    setStatusMessage(`Auto-assign applied. Route moved to ${routeSuggestion.recommendedDriver.name}.`);
    void logSystemActivity('Applied auto-assign fix', routeSuggestion.recommendedDriver.name, {
      driverId: routeSuggestion.recommendedDriver.id,
      tripCount: selectedTripIds.length,
      routeId: resolvedRoute?.id || ''
    });
  };

  const handleTripReassign = (tripId, driverId) => {
    if (!tripId || !driverId) return;
    assignTripsToDriver(driverId, [tripId]);
    setStatusMessage('Trip reassigned without breaking the route.');
    void logSystemActivity('Reassigned trip from route control', `Trip ${tripId}`, {
      tripId,
      driverId
    });
  };

  const handleShiftDateFilter = offsetDays => {
    const nextDate = shiftDateValue(dateFilter, offsetDays);
    setDateFilter(nextDate);
    setSelectedDriverId('');
    setSelectedRouteId('');
  };

  return (
    <>
      <Row className="g-3 mb-3">
        <Col xl={8}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
                <h5 className="mb-0">Route Control</h5>
                <div className="d-flex gap-2 align-items-center">
                  <Button variant="outline-dark" size="sm" onClick={() => handleShiftDateFilter(-1)} disabled={!dateFilter}>Prev</Button>
                  <Form.Control size="sm" type="date" value={dateFilter} onChange={event => { setDateFilter(event.target.value); setSelectedDriverId(''); setSelectedRouteId(''); }} style={{ width: 150 }} />
                  <Button variant="outline-dark" size="sm" onClick={() => handleShiftDateFilter(1)} disabled={!dateFilter}>Next</Button>
                  <Badge bg="light" text="dark">{driversWithInfo.length} drivers</Badge>
                </div>
              </div>
              <div className="small text-muted">{hasSelectedDate ? 'Click a driver to see their route, trips and map.' : 'Open the day selector and choose the day you will work.'}</div>
              {hasSelectedDate ? <div className="small text-muted mt-1">Loaded: {drivers.length} drivers · {trips.length} trips · {effectiveRoutes.length} routes</div> : null}
              <div className="mt-3 table-responsive" style={{ maxHeight: 300 }}>
                <Table hover className="mb-0 align-middle">
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>Driver</th>
                      <th>Status</th>
                      <th>Route</th>
                      <th>Trips</th>
                      <th>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSelectedDate ? <tr><td colSpan={5} className="text-center text-muted py-4">Choose a work day to load drivers and routes.</td></tr> : driversWithInfo.length > 0 ? driversWithInfo.map(info => {
                      const health = info.trips.length > 0 ? getRouteHealth(info.trips) : null;
                      const isSelected = selectedDriverId === String(info.driver.id);
                      return (
                        <tr key={info.driver.id} className={isSelected ? 'table-primary' : ''} onClick={() => handleSelectDriver(info)} style={{ cursor: 'pointer' }}>
                          <td className="fw-semibold">{info.driver.name}</td>
                          <td><Badge bg={String(info.driver.live || '').toLowerCase() === 'online' ? 'success' : 'secondary'}>{info.driver.live || 'Offline'}</Badge></td>
                          <td>{info.hasRoute ? <Badge bg="info">Has Route</Badge> : <Badge bg="light" text="dark">No Route</Badge>}{(() => {
                        const key = getClosedRouteKey(info.driver.id, dateFilter);
                        const closure = key ? closedRouteStateByKey[key] : null;
                        if (!closure?.closedAt) return null;
                        return <Badge bg={closure.closed ? 'danger' : 'secondary'} className="ms-1">{closure.closed ? 'Closed' : 'Closed (Open)'}</Badge>;
                      })()}</td>
                          <td>{info.trips.length}</td>
                          <td>{health ? <Badge bg={health.variant}>{health.level}</Badge> : <span className="text-muted small">-</span>}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan={5} className="text-center text-muted py-4">No drivers found.</td></tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={4}>
          <Card className="h-100">
            <CardBody>
              <h6 className="mb-2">Day History</h6>
              {dayHistory ? (
                <div className="d-flex flex-column gap-2">
                  <div><Badge bg="light" text="dark">Total: {dayHistory.total}</Badge></div>
                  <div><Badge bg="success">Completed: {dayHistory.completed}</Badge></div>
                  <div><Badge bg="warning" text="dark">Assigned: {dayHistory.assigned}</Badge></div>
                  <div><Badge bg="danger">Cancelled: {dayHistory.cancelled}</Badge></div>
                  {selectedClosedRouteState?.closedAt ? <div><Badge bg="dark">Completed by: {String(selectedClosedRouteState.closedBy || 'Dispatcher')}</Badge></div> : null}
                  {selectedClosedRouteState?.closed ? <div><Badge bg="danger">Route: Closed</Badge></div> : selectedClosedRouteState?.closedAt ? <div><Badge bg="secondary">Route: Reopened</Badge></div> : null}
                </div>
              ) : <div className="small text-muted">{hasSelectedDate ? 'Select a driver to see day closure summary.' : 'Choose a day first.'}</div>}
              {selectedClosedRouteEvents.length > 0 ? <div className="mt-3">
                  <div className="small text-uppercase fw-semibold mb-2">Daily Route Log</div>
                  <div className="d-flex flex-column gap-1" style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {selectedClosedRouteEvents.map(event => <div key={event.id || `${event.type}-${event.at}`} className="small" style={{ color: '#cbd5e1' }}>
                        {new Date(Number(event.at || Date.now())).toLocaleTimeString()} • {event.type === 'route-closed' ? `Closed by ${event.by || 'Dispatcher'}` : event.type === 'route-reopened' ? `Reopened by ${event.by || 'Dispatcher'}` : event.type === 'trip-added' ? `Trip ${event.tripId || '-'} added by ${event.by || 'Dispatcher'}` : event.type === 'trip-removed' ? `Trip ${event.tripId || '-'} removed by ${event.by || 'Dispatcher'}` : `${event.type || 'event'} by ${event.by || 'Dispatcher'}`}
                      </div>)}
                  </div>
                </div> : null}
              {hasSelectedDate ? <Alert variant="info" className="mt-3 mb-0 small">Connected to shared dispatch tree for this day. Changes here are reflected across Dispatcher, Trip Dashboard, messaging and AI tools.</Alert> : null}
              <Alert variant="secondary" className="mt-3 mb-0 small">{statusMessage}</Alert>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3">
        <Col xl={7}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">{selectedRouteDriver ? selectedRouteDriver.name : 'Route Mini Map'}</h6>
                {selectedRouteTrips.length > 0 ? <Badge bg="info">{selectedRouteTrips.length} stops</Badge> : null}
              </div>
              {hasSelectedDate ? (
                <div style={{ height: 280, borderRadius: 8, overflow: 'hidden' }}>
                  <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%' }}>
                    <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
                    {routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: '#2563eb', weight: 4 }} /> : null}
                    {selectedRouteTrips.map((trip, index) => Array.isArray(trip?.position) && trip.position.length === 2 ? (
                      <Marker key={`${trip.id}-${index}`} position={trip.position}>
                        <Popup>
                          <div className="fw-semibold">{trip.rider || trip.id}</div>
                          <div>PU {trip.pickup} • DO {trip.dropoff}</div>
                          <div>{trip.address || '-'}</div>
                        </Popup>
                      </Marker>
                    ) : null)}
                  </MapContainer>
                </div>
              ) : <div className="text-muted small" style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8 }}>Choose a work day to load the route map.</div>}
              {routeSuggestion ? (
                <Alert variant={routeSuggestion.health.variant} className="mt-3 mb-0">
                  <div className="fw-semibold">{routeSuggestion.health.level}</div>
                  <div className="small mb-1">{routeSuggestion.health.details}</div>
                  <div className="small">{routeSuggestion.summary}</div>
                </Alert>
              ) : null}
            </CardBody>
          </Card>
        </Col>

        <Col xl={5}>
          <Card className="h-100">
            <CardBody>
              <h6 className="mb-3">Route Actions</h6>
              {selectedDriverId ? (
                <div className="d-flex flex-column gap-3">
                  <Form.Group>
                    <Form.Label>Route name</Form.Label>
                    <Form.Control value={routeNameDraft} onChange={event => setRouteNameDraft(event.target.value)} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Route notes</Form.Label>
                    <Form.Control as="textarea" rows={2} value={routeNotesDraft} onChange={event => setRouteNotesDraft(event.target.value)} />
                  </Form.Group>
                  <div className="d-flex gap-2">
                    <Button variant="primary" onClick={handleSaveRouteMeta}>Save Route</Button>
                    <Button variant="danger" onClick={handleDeleteRoute}>Delete Route</Button>
                  </div>

                  <Form.Group>
                    <Form.Label>Primary driver (full route)</Form.Label>
                    <Form.Select value={primaryDriverId} onChange={event => setPrimaryDriverId(event.target.value)}>
                      <option value="">Select driver</option>
                      {drivers.map(driver => <option key={`primary-${driver.id}`} value={driver.id}>{driver.name}</option>)}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Secondary driver (full route)</Form.Label>
                    <Form.Select value={secondaryDriverId} onChange={event => setSecondaryDriverId(event.target.value)}>
                      <option value="">No secondary driver</option>
                      {drivers.map(driver => <option key={`secondary-${driver.id}`} value={driver.id}>{driver.name}</option>)}
                    </Form.Select>
                  </Form.Group>
                  <div className="d-flex gap-2 flex-wrap">
                    <Button variant="outline-primary" onClick={handleApplyPrimary}>Apply Primary</Button>
                    <Button variant="outline-secondary" onClick={handleApplySecondary}>Apply Secondary</Button>
                    <Button variant="warning" onClick={handleAutoAssignFix}>Auto-Assign Fix</Button>
                  </div>
                  <div className="small text-muted">Current driver: {selectedRouteDriver?.name || 'Unassigned'}</div>
                  {!isPersistedRoute ? <div className="small text-muted">This driver view is using trips from the selected day. Save Route will create a formal route.</div> : null}
                </div>
              ) : <div className="text-muted">{hasSelectedDate ? 'Select a driver first.' : 'Select a work day first.'}</div>}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mt-1">
        <Col xl={12}>
          <Card>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Trips Inside Selected Route</h6>
                {routeSuggestion?.problematicTrips?.length ? <Badge bg="warning" text="dark">{routeSuggestion.problematicTrips.length} with possible delay issues</Badge> : null}
              </div>
              <div className="table-responsive" style={{ maxHeight: 360 }}>
                <Table hover className="mb-0 align-middle">
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>Trip</th>
                      <th>Rider</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Late</th>
                      <th>Status</th>
                      <th>Suggestion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSelectedDate ? <tr><td colSpan={7} className="text-center text-muted py-4">Choose a work day to load trips.</td></tr> : selectedRouteTrips.length > 0 ? selectedRouteTrips.map(trip => {
                      const lateMinutes = getTripLateMinutes(trip);
                      const delayed = Number.isFinite(lateMinutes) && lateMinutes > 10;
                      const suggestedDriver = routeSuggestion?.recommendedDriver;
                      return (
                        <tr key={trip.id}>
                          <td className="fw-semibold">{trip.id}</td>
                          <td>{trip.rider || '-'}</td>
                          <td>{trip.pickup || '-'}</td>
                          <td>{trip.dropoff || '-'}</td>
                          <td>{Number.isFinite(lateMinutes) ? `${Math.round(lateMinutes)} min` : '-'}</td>
                          <td><Badge bg={delayed ? 'danger' : 'secondary'}>{trip.status || 'Unassigned'}</Badge></td>
                          <td>
                            {suggestedDriver && delayed ? (
                              <div className="d-flex align-items-center gap-2 flex-wrap">
                                <span className="small">Try {suggestedDriver.name}</span>
                                <Button size="sm" variant="outline-warning" onClick={() => handleTripReassign(trip.id, suggestedDriver.id)}>Reassign</Button>
                              </div>
                            ) : <span className="small text-muted">Stable</span>}
                          </td>
                        </tr>
                      );
                    }) : <tr><td colSpan={7} className="text-center text-muted py-4">No trips in selected route.</td></tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default RouteControlWorkspace;
