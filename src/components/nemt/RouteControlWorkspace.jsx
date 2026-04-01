'use client';

import { useNemtContext } from '@/context/useNemtContext';
import { formatTripDateLabel, getRouteServiceDateKey, getTripLateMinutes, getTripServiceDateKey } from '@/helpers/nemt-dispatch-state';
import { useEffect, useMemo, useState } from 'react';
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

const buildFallbackRoutesFromTrips = trips => {
  const routeBuckets = new Map();
  trips.forEach(trip => {
    const routeId = String(trip?.routeId || '').trim();
    if (!routeId) return;
    if (!routeBuckets.has(routeId)) routeBuckets.set(routeId, []);
    routeBuckets.get(routeId).push(trip);
  });

  return Array.from(routeBuckets.entries()).map(([routeId, routeTrips], index) => {
    const firstTrip = routeTrips[0] || {};
    return {
      id: routeId,
      name: String(firstTrip?.routeName || `Route ${index + 1}`),
      driverId: String(firstTrip?.driverId || ''),
      secondaryDriverId: String(firstTrip?.secondaryDriverId || ''),
      serviceDate: getRouteServiceDateKey({ tripIds: routeTrips.map(trip => trip.id) }, routeTrips),
      tripIds: routeTrips.map(trip => trip.id),
      notes: String(firstTrip?.routeNotes || ''),
      isFallback: true
    };
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

const RouteControlWorkspace = () => {
  const {
    drivers,
    trips,
    routePlans,
    refreshDrivers,
    refreshDispatchState,
    assignTripsToDriver,
    assignRoutePrimaryDriver,
    assignRouteSecondaryDriver,
    updateRoutePlan,
    deleteRoute
  } = useNemtContext();

  const [dateFilter, setDateFilter] = useState('all');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [primaryDriverId, setPrimaryDriverId] = useState('');
  const [secondaryDriverId, setSecondaryDriverId] = useState('');
  const [routeNameDraft, setRouteNameDraft] = useState('');
  const [routeNotesDraft, setRouteNotesDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState('Route Control ready.');
  const [isSyncing, setIsSyncing] = useState(false);

  const effectiveRoutes = useMemo(() => {
    if (Array.isArray(routePlans) && routePlans.length > 0) return routePlans;
    return buildFallbackRoutesFromTrips(trips);
  }, [routePlans, trips]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      setIsSyncing(true);
      try {
        await Promise.all([refreshDrivers(), refreshDispatchState({ forceServer: true })]);
      } catch {
        if (active) setStatusMessage('Live sync failed. Showing latest local data.');
      } finally {
        if (active) setIsSyncing(false);
      }
    };
    sync();
    return () => {
      active = false;
    };
  }, [refreshDispatchState, refreshDrivers]);

  const allDateKeys = useMemo(() => {
    const routeDates = effectiveRoutes.map(route => String(route?.serviceDate || '').trim()).filter(Boolean);
    const tripDates = trips.map(getTripServiceDateKey).filter(Boolean);
    return Array.from(new Set([...routeDates, ...tripDates])).sort();
  }, [effectiveRoutes, trips]);

  const filteredRoutes = useMemo(() => effectiveRoutes.filter(route => {
    if (dateFilter === 'all') return true;
    return String(route?.serviceDate || '').trim() === dateFilter;
  }), [dateFilter, effectiveRoutes]);

  const selectedRoute = useMemo(() => filteredRoutes.find(route => route.id === selectedRouteId) || filteredRoutes[0] || null, [filteredRoutes, selectedRouteId]);

  const selectedRouteTrips = useMemo(() => {
    if (!selectedRoute) return [];
    return sortRouteTrips(getTripsForRoute(selectedRoute, trips));
  }, [selectedRoute, trips]);

  const selectedRouteDriver = useMemo(() => drivers.find(driver => String(driver.id) === String(selectedRoute?.driverId || '')) || null, [drivers, selectedRoute]);

  const routeSuggestion = useMemo(() => selectedRoute ? buildRouteSuggestion({
    route: selectedRoute,
    routeTrips: selectedRouteTrips,
    drivers,
    trips
  }) : null, [drivers, selectedRoute, selectedRouteTrips, trips]);

  const mapCenter = useMemo(() => {
    const firstTrip = selectedRouteTrips.find(trip => Array.isArray(trip?.position) && trip.position.length === 2);
    return firstTrip?.position || [28.5383, -81.3792];
  }, [selectedRouteTrips]);

  const routePath = useMemo(() => selectedRouteTrips
    .map(trip => trip?.position)
    .filter(position => Array.isArray(position) && position.length === 2), [selectedRouteTrips]);

  const dayHistory = useMemo(() => {
    if (!selectedRoute?.serviceDate) return null;
    const dayTrips = trips.filter(trip => getTripServiceDateKey(trip) === selectedRoute.serviceDate);
    const completed = dayTrips.filter(trip => ['completed', 'done', 'closed'].includes(getNormalizedStatus(trip))).length;
    const cancelled = dayTrips.filter(trip => ['cancelled', 'canceled'].includes(getNormalizedStatus(trip))).length;
    const assigned = dayTrips.filter(trip => getNormalizedStatus(trip) === 'assigned').length;
    return {
      total: dayTrips.length,
      completed,
      cancelled,
      assigned
    };
  }, [selectedRoute, trips]);

  const handleSelectRoute = route => {
    setSelectedRouteId(route.id);
    setPrimaryDriverId(String(route.driverId || ''));
    setSecondaryDriverId(String(route.secondaryDriverId || ''));
    setRouteNameDraft(String(route.name || ''));
    setRouteNotesDraft(String(route.notes || ''));
  };

  useEffect(() => {
    if (!selectedRoute) return;
    setSelectedRouteId(selectedRoute.id);
    setPrimaryDriverId(String(selectedRoute.driverId || ''));
    setSecondaryDriverId(String(selectedRoute.secondaryDriverId || ''));
    setRouteNameDraft(String(selectedRoute.name || ''));
    setRouteNotesDraft(String(selectedRoute.notes || ''));
  }, [selectedRoute?.id, selectedRoute?.driverId, selectedRoute?.secondaryDriverId, selectedRoute?.name, selectedRoute?.notes]);

  const handleApplyPrimary = () => {
    if (!selectedRoute || !primaryDriverId) return;
    assignRoutePrimaryDriver(selectedRoute.id, primaryDriverId);
    setStatusMessage('Primary driver updated for full route.');
  };

  const handleApplySecondary = () => {
    if (!selectedRoute) return;
    assignRouteSecondaryDriver(selectedRoute.id, secondaryDriverId);
    setStatusMessage(secondaryDriverId ? 'Secondary driver assigned to full route.' : 'Secondary driver removed from route.');
  };

  const handleSaveRouteMeta = () => {
    if (!selectedRoute) return;
    updateRoutePlan(selectedRoute.id, {
      name: routeNameDraft,
      notes: routeNotesDraft,
      serviceDate: selectedRoute.serviceDate
    });
    setStatusMessage('Route details updated.');
  };

  const handleDeleteRoute = () => {
    if (!selectedRoute) return;
    const ok = window.confirm(`Delete route ${selectedRoute.name || selectedRoute.id}? This will unassign all trips in this route.`);
    if (!ok) return;
    deleteRoute(selectedRoute.id);
    setSelectedRouteId('');
    setStatusMessage('Route deleted. Trips returned to unassigned.');
  };

  const handleAutoAssignFix = () => {
    if (!selectedRoute || !routeSuggestion?.recommendedDriver) {
      setStatusMessage('No auto-assign recommendation available.');
      return;
    }
    assignRoutePrimaryDriver(selectedRoute.id, routeSuggestion.recommendedDriver.id);
    setPrimaryDriverId(String(routeSuggestion.recommendedDriver.id));
    setStatusMessage(`Auto-assign applied. Route moved to ${routeSuggestion.recommendedDriver.name}.`);
  };

  const handleTripReassign = (tripId, driverId) => {
    if (!tripId || !driverId) return;
    assignTripsToDriver(driverId, [tripId]);
    setStatusMessage('Trip reassigned without breaking the route.');
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
                  {isSyncing ? <Badge bg="secondary">Syncing...</Badge> : null}
                  <Form.Select value={dateFilter} onChange={event => setDateFilter(event.target.value)} style={{ width: 180 }}>
                    <option value="all">All dates</option>
                    {allDateKeys.map(dateKey => <option key={dateKey} value={dateKey}>{formatTripDateLabel(dateKey)}</option>)}
                  </Form.Select>
                  <Badge bg="light" text="dark">{filteredRoutes.length} routes</Badge>
                </div>
              </div>
              <div className="small text-muted">Select a route to review health, delays, suggestions, reassignment and auto-fix.</div>
              <div className="mt-3 table-responsive" style={{ maxHeight: 300 }}>
                <Table hover className="mb-0 align-middle">
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th>Route</th>
                      <th>Date</th>
                      <th>Driver</th>
                      <th>Trips</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoutes.length > 0 ? filteredRoutes.map(route => {
                      const routeTrips = getTripsForRoute(route, trips);
                      const routeHealth = getRouteHealth(routeTrips);
                      const driverName = drivers.find(driver => String(driver.id) === String(route.driverId || ''))?.name || 'Unassigned';
                      return (
                        <tr key={route.id} className={selectedRoute?.id === route.id ? 'table-primary' : ''} onClick={() => handleSelectRoute(route)} style={{ cursor: 'pointer' }}>
                          <td className="fw-semibold">{route.name || route.id}</td>
                          <td>{route.serviceDate || '-'}</td>
                          <td>{driverName}</td>
                          <td>{routeTrips.length}</td>
                          <td><Badge bg={routeHealth.variant}>{routeHealth.level}</Badge></td>
                        </tr>
                      );
                    }) : <tr><td colSpan={5} className="text-center text-muted py-4">No routes for this date filter.</td></tr>}
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
                </div>
              ) : <div className="small text-muted">Select a route to see day closure summary.</div>}
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
                <h6 className="mb-0">Route Mini Map</h6>
                {selectedRoute ? <Badge bg="info">{selectedRouteTrips.length} stops</Badge> : null}
              </div>
              <div style={{ height: 280, borderRadius: 8, overflow: 'hidden' }}>
                <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
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
              {selectedRoute ? (
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
                </div>
              ) : <div className="text-muted">Select a route first.</div>}
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
                    {selectedRouteTrips.length > 0 ? selectedRouteTrips.map(trip => {
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
