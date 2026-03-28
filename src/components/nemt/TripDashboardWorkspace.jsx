'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import PageTitle from '@/components/PageTitle';
import { useNemtContext } from '@/context/useNemtContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { mapTilesConfig } from '@/utils/map-tiles';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  return 'secondary';
};

const getDriverCheckpoint = driver => {
  if (driver.checkpoint) return driver.checkpoint;
  if (!driver.position) return 'No GPS';
  return `${driver.position[0].toFixed(4)}, ${driver.position[1].toFixed(4)}`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const TripDashboardWorkspace = () => {
  const router = useRouter();
  const {
    drivers,
    trips,
    routePlans,
    selectedTripIds,
    selectedDriverId,
    selectedRouteId,
    setSelectedTripIds,
    setSelectedDriverId,
    setSelectedRouteId,
    toggleTripSelection,
    assignTripsToDriver,
    unassignTrips,
    createRoute,
    deleteRoute,
    refreshDrivers,
    getDriverName
  } = useNemtContext();
  const { showNotification } = useNotificationContext();
  const [routeName, setRouteName] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [driverGrouping, setDriverGrouping] = useState('VDR Grouping');
  const [routeSearch, setRouteSearch] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [mapLocked, setMapLocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Trip dashboard listo.');
  const [columnSplit, setColumnSplit] = useState(50);
  const [rowSplit, setRowSplit] = useState(56);
  const [dragMode, setDragMode] = useState(null);
  const workspaceRef = useRef(null);
  const deferredRouteSearch = useDeferredValue(routeSearch);

  const selectedDriver = useMemo(() => drivers.find(driver => driver.id === selectedDriverId) ?? null, [drivers, selectedDriverId]);
  const selectedRoute = useMemo(() => routePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [routePlans, selectedRouteId]);
  const filteredTrips = useMemo(() => trips.filter(trip => tripStatusFilter === 'all' || trip.status.toLowerCase() === tripStatusFilter), [tripStatusFilter, trips]);
  const selectedTrips = useMemo(() => trips.filter(trip => selectedTripIds.includes(trip.id)), [selectedTripIds, trips]);
  const visibleTripIds = filteredTrips.map(trip => trip.id);
  const filteredDrivers = drivers;

  const routeTrips = useMemo(() => {
    const baseTrips = selectedRoute ? trips.filter(trip => selectedRoute.tripIds.includes(trip.id)) : selectedDriver ? trips.filter(trip => trip.driverId === selectedDriver.id) : trips.filter(trip => selectedTripIds.includes(trip.id));
    const term = deferredRouteSearch.trim().toLowerCase();
    return baseTrips.filter(trip => !term || [trip.id, trip.rider, trip.address].some(value => value.toLowerCase().includes(term)));
  }, [deferredRouteSearch, selectedDriver, selectedRoute, selectedTripIds, trips]);

  const routePath = useMemo(() => {
    if (!showRoute) return [];
    if (routeTrips.length > 1) return routeTrips.map(trip => trip.position);
    return filteredTrips.slice(0, 4).map(trip => trip.position);
  }, [filteredTrips, routeTrips, showRoute]);

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const assignedTripsCount = trips.filter(trip => trip.status === 'Assigned').length;
  const activeInfoTrip = routeTrips[0] ?? filteredTrips[0] ?? null;
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIds.includes(id));

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...visibleTripIds])));
      setStatusMessage('Trips visibles seleccionados.');
      return;
    }

    setSelectedTripIds(selectedTripIds.filter(id => !visibleTripIds.includes(id)));
    setStatusMessage('Trips visibles deseleccionados.');
  };

  const handleCreateRoute = () => {
    if (!routeName.trim()) {
      setStatusMessage('Escribe un nombre para la ruta.');
      return;
    }
    if (!selectedDriverId) {
      setStatusMessage('Selecciona un chofer para la ruta.');
      return;
    }
    if (selectedTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip para la ruta.');
      return;
    }

    createRoute({
      name: routeName.trim(),
      driverId: selectedDriverId,
      tripIds: selectedTripIds,
      notes: routeNotes.trim()
    });
    setStatusMessage('Ruta creada y sincronizada con dispatcher.');
    showNotification({
      message: 'Route created and synced with dispatcher.',
      variant: 'success'
    });
    setRouteName('');
    setRouteNotes('');
  };

  const handleAssign = driverId => {
    if (!driverId || selectedTripIds.length === 0) {
      setStatusMessage('Selecciona chofer y al menos un trip.');
      return;
    }

    assignTripsToDriver(driverId);
    setStatusMessage('Trips asignados al chofer seleccionado.');
  };

  const handleUnassign = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip para quitar asignacion.');
      return;
    }

    unassignTrips();
    setStatusMessage('Trips desasignados.');
  };

  const handleLoadRoute = routeId => {
    const route = routePlans.find(item => item.id === routeId);
    if (!route) return;
    setSelectedRouteId(routeId);
    setSelectedDriverId(route.driverId);
    setSelectedTripIds(route.tripIds);
    setStatusMessage(`Ruta ${route.name} cargada.`);
  };

  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = event => {
      if (!workspaceRef.current) return;
      const bounds = workspaceRef.current.getBoundingClientRect();
      const nextColumnSplit = clamp((event.clientX - bounds.left) / bounds.width * 100, 28, 72);
      const nextRowSplit = clamp((event.clientY - bounds.top) / bounds.height * 100, 32, 74);

      if (dragMode === 'column' || dragMode === 'both') {
        setColumnSplit(nextColumnSplit);
      }

      if (dragMode === 'row' || dragMode === 'both') {
        setRowSplit(nextRowSplit);
      }
    };

    const stopDragging = () => {
      setDragMode(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopDragging);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopDragging);
      document.body.style.userSelect = '';
    };
  }, [dragMode]);

  const workspaceHeight = expanded ? 980 : 860;
  const dividerSize = 10;
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns: `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)`,
    gridTemplateRows: `${rowSplit}% ${dividerSize}px minmax(0, ${100 - rowSplit}%)`,
    height: workspaceHeight,
    minHeight: workspaceHeight,
    position: 'relative'
  };
  const dividerBaseStyle = {
    backgroundColor: '#1f2433',
    borderRadius: 999,
    position: 'relative',
    zIndex: 30
  };

  return <>
      <PageTitle title="Trip Dashboard" subName="Route Builder" />
      <div className="small text-muted mb-3">{statusMessage}</div>
      <div ref={workspaceRef} style={workspaceGridStyle}>
        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="position-relative h-100">
                <div className="position-absolute top-0 start-0 p-2 d-flex align-items-center gap-2 flex-wrap" style={{ zIndex: 650, maxWidth: '100%' }}>
                  <Button variant="dark" size="sm" onClick={() => setShowRoute(current => !current)}>Route</Button>
                  <Button variant="dark" size="sm" onClick={() => setSelectedTripIds([])}>Clear</Button>
                  <Button variant="dark" size="sm" onClick={() => setShowInfo(current => !current)}>{showInfo ? 'Hide Info' : 'Show Info'}</Button>
                  <Button variant="dark" size="sm" onClick={() => router.push('/drivers/grouping')}>Grouping</Button>
                  <Button variant="dark" size="sm" onClick={() => setMapLocked(current => !current)}>{mapLocked ? 'Unlock' : 'Lock'}</Button>
                </div>
                {showInfo && activeInfoTrip ? <div className="position-absolute top-0 start-50 translate-middle-x bg-white border rounded shadow-sm p-3" style={{ zIndex: 500, minWidth: 220 }}>
                    <div className="small text-uppercase text-muted">PU {activeInfoTrip.id}</div>
                    <div className="fw-semibold">{activeInfoTrip.rider}</div>
                    <div>{activeInfoTrip.pickup}</div>
                    <div className="text-muted small">{activeInfoTrip.address}</div>
                  </div> : null}
                <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution={mapTilesConfig.attribution} url={mapTilesConfig.url} />
                  <ZoomControl position="bottomleft" />
                  {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#e53e3e', weight: 4 }} /> : null}
                  {filteredTrips.map(trip => <CircleMarker key={trip.id} center={trip.position} radius={selectedTripIds.includes(trip.id) ? 10 : 7} pathOptions={{ color: selectedTripIds.includes(trip.id) ? '#0ea5e9' : trip.status === 'Assigned' ? '#16a34a' : '#64748b', fillColor: selectedTripIds.includes(trip.id) ? '#0ea5e9' : trip.status === 'Assigned' ? '#16a34a' : '#64748b', fillOpacity: 0.9 }} eventHandlers={{
                    click: () => toggleTripSelection(trip.id)
                  }}>
                      <Popup>{`${trip.id} | ${trip.rider} | ${trip.pickup}`}</Popup>
                    </CircleMarker>)}
                </MapContainer>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => setDragMode('column')} style={{
        ...dividerBaseStyle,
        cursor: 'col-resize',
        gridColumn: 2,
        gridRow: '1 / span 3'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 4, backgroundColor: '#4c536a' }} />
        </div>

        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-white flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>Trips</strong>
                  <Badge bg="light" text="dark">{assignedTripsCount}/{trips.length}</Badge>
                  <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ width: 130 }}>
                    <option value="all">All</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                  </Form.Select>
                  <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => setSelectedDriverId(event.target.value)} style={{ width: 220 }}>
                    <option value="">Select driver</option>
                    {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  <Button variant="light" size="sm" onClick={() => window.print()}>Print Route</Button>
                  <Button variant="light" size="sm" onClick={() => handleAssign(selectedDriverId)}>A</Button>
                  <Button variant="light" size="sm" onClick={handleUnassign}>U</Button>
                  <span className="small">{selectedTripIds.length} sel.</span>
                </div>
                <div className="d-flex gap-2 small flex-wrap">
                  <Badge bg="primary">{trips.length} trips</Badge>
                  <Badge bg="info">{drivers.length} drivers</Badge>
                  <Badge bg="secondary">{liveDrivers} live</Badge>
                  <Button variant="outline-light" size="sm" onClick={() => router.push('/drivers/grouping')}>Billing Grouping</Button>
                  <Button variant="outline-light" size="sm" onClick={handleCreateRoute}>Create Route</Button>
                </div>
              </div>
              <div className="table-responsive" style={{ maxHeight: expanded ? 520 : 390 }}>
                <Table hover className="align-middle mb-0">
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: 48 }}><Form.Check checked={allVisibleSelected} onChange={event => handleSelectAll(event.target.checked)} /></th>
                      <th style={{ width: 60 }}>ACT</th>
                      <th>Trip ID</th>
                      <th>Status</th>
                      <th>Driver</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Rider</th>
                      <th>PU Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrips.length > 0 ? filteredTrips.map(trip => <tr key={trip.id} className={selectedTripIds.includes(trip.id) ? 'table-primary' : ''}>
                        <td><Form.Check checked={selectedTripIds.includes(trip.id)} onChange={() => toggleTripSelection(trip.id)} /></td>
                        <td><Button variant={trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" onClick={() => {
                      setSelectedTripIds([trip.id]);
                      setSelectedDriverId(trip.driverId ?? selectedDriverId);
                      setSelectedRouteId(trip.routeId);
                      setStatusMessage(`Trip ${trip.id} activo.`);
                    }}>ACT</Button></td>
                        <td className="fw-semibold">{trip.id}</td>
                        <td><Badge bg={getStatusBadge(trip.status)}>{trip.status}</Badge></td>
                        <td>{getDriverName(trip.driverId)}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.rider}</td>
                        <td>{trip.address}</td>
                      </tr>) : <tr>
                        <td colSpan={9} className="text-center text-muted py-4">No hay viajes cargados. Esperando tus trips reales.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => setDragMode('row')} style={{
        ...dividerBaseStyle,
        cursor: 'row-resize',
        gridColumn: '1 / span 3',
        gridRow: 2
      }}>
          <div className="position-absolute top-50 start-50 translate-middle rounded-pill" style={{ width: 42, height: 4, backgroundColor: '#4c536a' }} />
        </div>

        <div onMouseDown={() => setDragMode('both')} style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: '#58607a',
        border: '3px solid #0f1320',
        position: 'absolute',
        left: `calc(${columnSplit}% - ${dividerSize / 2}px)`,
        top: `calc(${rowSplit}% - ${dividerSize / 2}px)`,
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        zIndex: 50,
        boxShadow: '0 0 0 2px rgba(88, 96, 122, 0.25)'
      }} />

        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-white flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>VDRS: {drivers.length}</strong>
                  <Form.Select size="sm" value={driverGrouping} onChange={event => setDriverGrouping(event.target.value)} style={{ width: 150 }}>
                    <option>VDR Grouping</option>
                    <option>By Live Status</option>
                    <option>By Vehicle</option>
                  </Form.Select>
                  <span>{liveDrivers} live</span>
                </div>
                <div className="d-flex gap-2">
                  <Button variant="outline-light" size="sm" onClick={() => {
                refreshDrivers();
                router.push('/drivers/grouping');
                setStatusMessage('Abriendo billing grouping del roster real.');
              }}>Open Grouping</Button>
                  <Button variant="outline-light" size="sm" onClick={() => {
                refreshDrivers();
                router.push('/drivers');
                setStatusMessage('Abriendo Drivers para administrar el roster real.');
              }}>Manage Drivers</Button>
                </div>
              </div>
              <div className="table-responsive" style={{ maxHeight: 360 }}>
                <Table className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 60 }}>ACT</th>
                      <th>#</th>
                      <th>VID</th>
                      <th>Vehicle</th>
                      <th>Driver</th>
                      <th>Checkpoint</th>
                      <th>Attendant</th>
                      <th>Info</th>
                      <th>Live</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.length > 0 ? filteredDrivers.map((driver, index) => <tr key={driver.id} className={selectedDriverId === driver.id ? 'table-primary' : ''}>
                        <td>
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check type="radio" checked={selectedDriverId === driver.id} onChange={() => setSelectedDriverId(driver.id)} />
                            <Button variant="light" size="sm" onClick={() => handleAssign(driver.id)}>
                              <IconifyIcon icon="la:arrow-right" />
                            </Button>
                          </div>
                        </td>
                        <td>{index + 1}</td>
                        <td>{driver.code}</td>
                        <td>{driver.vehicle}</td>
                        <td><div className="fw-semibold">{driver.name}</div><div className="small text-muted">{driver.nickname}</div></td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <IconifyIcon icon="iconoir:maps-arrow-diagonal" className={driver.live === 'Online' ? 'text-success' : 'text-muted'} />
                            <div>
                              <div className="fw-medium small">{getDriverCheckpoint(driver)}</div>
                              <div className="text-muted small">{driver.live === 'Online' ? 'Tracking ready' : 'Waiting signal'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{driver.attendant}</td>
                        <td>{driver.info}</td>
                        <td>{driver.live}</td>
                      </tr>) : <tr>
                        <td colSpan={9} className="text-center text-muted py-4">No hay choferes ni vehiculos cargados.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0 d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-white gap-2 flex-wrap">
                <Form.Select size="sm" value={selectedRouteId ?? ''} onChange={event => setSelectedRouteId(event.target.value)} style={{ width: 180 }}>
                  <option value="">Current selection</option>
                  {routePlans.map(routePlan => <option key={routePlan.id} value={routePlan.id}>{routePlan.name}</option>)}
                </Form.Select>
                <Form.Control size="sm" value={routeSearch} onChange={event => setRouteSearch(event.target.value)} placeholder="Search" style={{ width: 180 }} />
              </div>
              <div className="p-3 border-bottom bg-light">
                <Row className="g-2 align-items-end">
                  <Col md={4}>
                    <Form.Label className="small text-muted mb-1">Route Name</Form.Label>
                    <Form.Control size="sm" value={routeName} onChange={event => setRouteName(event.target.value)} placeholder="Ocala PM Route" />
                  </Col>
                  <Col md={4}>
                    <Form.Label className="small text-muted mb-1">Notes</Form.Label>
                    <Form.Control size="sm" value={routeNotes} onChange={event => setRouteNotes(event.target.value)} placeholder="Stop sequence or notes" />
                  </Col>
                  <Col md={4}>
                    <div className="d-flex gap-2 flex-wrap">
                      <Button variant="success" size="sm" onClick={handleCreateRoute}>Save Route</Button>
                      <Button variant="outline-primary" size="sm" onClick={() => handleAssign(selectedDriverId)}>Assign</Button>
                      <Button variant="outline-dark" size="sm" onClick={() => router.push('/dispatcher')}>Dispatch</Button>
                    </div>
                  </Col>
                </Row>
              </div>
              <div className="table-responsive" style={{ minHeight: 170, maxHeight: 170 }}>
                <Table className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 48 }} />
                      <th>Trip ID</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Rider</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeTrips.length > 0 ? routeTrips.map(trip => <tr key={trip.id} className={selectedTripIds.includes(trip.id) ? 'table-success' : ''}>
                        <td>
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check checked={selectedTripIds.includes(trip.id)} onChange={() => toggleTripSelection(trip.id)} />
                            <Badge bg={trip.status === 'Assigned' ? 'primary' : 'secondary'}>{trip.status === 'Assigned' ? 'A' : 'U'}</Badge>
                          </div>
                        </td>
                        <td className="fw-semibold">{trip.id}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.rider}</td>
                      </tr>) : <tr>
                        <td colSpan={5} className="text-center text-muted py-4">Selecciona una ruta, un chofer o trips para ver el menu de ruta.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
              <div className="d-flex justify-content-between align-items-center px-3 py-2 border-top border-bottom bg-primary text-white">
                <strong>Saved Routes</strong>
                <Badge bg="light" text="dark">{routePlans.length}</Badge>
              </div>
              <div className="table-responsive" style={{ minHeight: 145, maxHeight: 145 }}>
                <Table className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Route</th>
                      <th>Driver</th>
                      <th>Stops</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routePlans.length > 0 ? routePlans.map(routePlan => <tr key={routePlan.id} className={selectedRouteId === routePlan.id ? 'table-primary' : ''}>
                        <td>
                          <div className="fw-semibold">{routePlan.name}</div>
                          <div className="small text-muted">{routePlan.notes || 'No notes'}</div>
                        </td>
                        <td>{getDriverName(routePlan.driverId)}</td>
                        <td>{routePlan.tripIds.length}</td>
                        <td>
                          <div className="d-flex gap-1">
                            <Button variant="outline-primary" size="sm" onClick={() => handleLoadRoute(routePlan.id)}>Load</Button>
                            <Button variant="outline-dark" size="sm" onClick={() => {
                          handleLoadRoute(routePlan.id);
                          router.push('/dispatcher');
                        }}>Dispatch</Button>
                            <Button variant="outline-danger" size="sm" onClick={() => {
                          deleteRoute(routePlan.id);
                          setStatusMessage('Ruta eliminada y trips liberados.');
                        }}>Delete</Button>
                          </div>
                        </td>
                      </tr>) : <tr>
                        <td colSpan={4} className="text-center text-muted py-4">No hay rutas guardadas todavia.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>;
};

export default TripDashboardWorkspace;