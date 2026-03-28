'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import DispatcherMessagingPanel from '@/components/nemt/DispatcherMessagingPanel';
import { useNemtContext } from '@/context/useNemtContext';
import { DISPATCH_TRIP_COLUMN_OPTIONS } from '@/helpers/nemt-dispatch-state';
import { mapTilesConfig } from '@/utils/map-tiles';
import { divIcon } from 'leaflet';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  return 'secondary';
};

const getLegBadge = trip => {
  if (trip.legVariant && trip.legLabel) return {
    variant: trip.legVariant,
    label: trip.legLabel
  };
  return null;
};

const getDriverCheckpoint = driver => {
  if (driver.checkpoint) return driver.checkpoint;
  if (!driver.position) return 'No GPS';
  return `${driver.position[0].toFixed(4)}, ${driver.position[1].toFixed(4)}`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toRadians = value => value * (Math.PI / 180);

const getDistanceMiles = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return null;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatEta = miles => {
  if (miles == null) return 'ETA unavailable';
  const speedMph = 28;
  const minutes = Math.max(1, Math.round(miles / speedMph * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? trip?.destinationPosition ?? trip?.position : trip?.position;

const createDriverMapIcon = ({ isSelected, isOnline }) => divIcon({
  className: 'driver-map-icon-shell',
  html: `<div style="width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${isSelected ? '#f59e0b' : isOnline ? '#16a34a' : '#475569'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:16px;line-height:1;">&#128663;</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -16]
});

const DispatcherWorkspace = () => {
  const router = useRouter();
  const {
    drivers,
    trips,
    routePlans,
    selectedTripIds,
    selectedDriverId,
    selectedRouteId,
    setSelectedDriverId,
    setSelectedRouteId,
    setSelectedTripIds,
    uiPreferences,
    toggleTripSelection,
    assignTripsToDriver,
    unassignTrips,
    refreshDrivers,
    getDriverName,
    setDispatcherVisibleTripColumns
  } = useNemtContext();
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [routeSearch, setRouteSearch] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showBottomPanels, setShowBottomPanels] = useState(false);
  const [mapLocked, setMapLocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Dispatcher listo.');
  const [columnSplit, setColumnSplit] = useState(50);
  const [rowSplit, setRowSplit] = useState(56);
  const [dragMode, setDragMode] = useState(null);
  const workspaceRef = useRef(null);
  const deferredRouteSearch = useDeferredValue(routeSearch);

  const selectedDriver = useMemo(() => drivers.find(driver => driver.id === selectedDriverId) ?? null, [drivers, selectedDriverId]);
  const selectedRoute = useMemo(() => routePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [routePlans, selectedRouteId]);

  const filteredTrips = useMemo(() => trips.filter(trip => tripStatusFilter === 'all' || trip.status.toLowerCase() === tripStatusFilter), [tripStatusFilter, trips]);
  const visibleTripIds = filteredTrips.map(trip => trip.id);
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const filteredDrivers = drivers;
  const groupedFilteredTripRows = useMemo(() => {
    const sortedTrips = [...filteredTrips].sort((leftTrip, rightTrip) => {
      const leftGroup = leftTrip.brokerTripId || leftTrip.id;
      const rightGroup = rightTrip.brokerTripId || rightTrip.id;
      if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup);
      const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
      const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return leftTrip.id.localeCompare(rightTrip.id);
    });

    return sortedTrips.reduce((rows, trip) => {
      const groupKey = trip.brokerTripId || trip.id;
      const lastRow = rows[rows.length - 1];
      if (!lastRow || lastRow.groupKey !== groupKey) {
        const groupTrips = sortedTrips.filter(item => (item.brokerTripId || item.id) === groupKey);
        rows.push({
          type: 'group',
          groupKey,
          ridesCount: groupTrips.length,
          label: groupTrips.length > 1 ? `Trip ${groupKey} • ${groupTrips.length} rides` : `Trip ${groupKey}`
        });
      }
      rows.push({
        type: 'trip',
        groupKey,
        trip
      });
      return rows;
    }, []);
  }, [filteredTrips]);

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
  const tripTableColumnCount = visibleTripColumns.length + 2;
  const selectedDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const preferredTrip = trips.find(trip => selectedTripIds.includes(trip.id) && trip.driverId === selectedDriver.id);
    if (preferredTrip) return preferredTrip;
    const routeTrip = routeTrips.find(trip => trip.driverId === selectedDriver.id);
    if (routeTrip) return routeTrip;
    return trips.find(trip => trip.driverId === selectedDriver.id) ?? null;
  }, [routeTrips, selectedDriver, selectedTripIds, trips]);
  const selectedDriverEta = useMemo(() => {
    if (!selectedDriver || !selectedDriver.hasRealLocation || !selectedDriverActiveTrip) return null;
    const miles = getDistanceMiles(selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip));
    return {
      miles,
      label: formatEta(miles)
    };
  }, [selectedDriver, selectedDriverActiveTrip]);
  const driversWithRealLocation = useMemo(() => drivers.filter(driver => driver.hasRealLocation), [drivers]);

  const handleToggleTripColumn = columnKey => {
    const nextColumns = visibleTripColumns.includes(columnKey) ? visibleTripColumns.filter(item => item !== columnKey) : [...visibleTripColumns, columnKey];
    if (nextColumns.length === 0) {
      setStatusMessage('Debe quedar al menos una columna visible.');
      return;
    }
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage('Vista de columnas actualizada.');
  };

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...visibleTripIds])));
      setStatusMessage('Trips visibles seleccionados.');
      return;
    }
    setSelectedTripIds(selectedTripIds.filter(id => !visibleTripIds.includes(id)));
    setStatusMessage('Trips visibles deseleccionados.');
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
    gridTemplateRows: showBottomPanels ? `${rowSplit}% ${dividerSize}px minmax(0, ${100 - rowSplit}%)` : '1fr 0px 0px',
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
                  <Button variant="dark" size="sm" onClick={() => {
                  setShowBottomPanels(current => !current);
                  setStatusMessage(showBottomPanels ? 'Paneles inferiores ocultos.' : 'Paneles inferiores visibles.');
                }}>{showBottomPanels ? 'Hide Panels' : 'Show Panels'}</Button>
                  <Button variant="dark" size="sm" onClick={() => setMapLocked(current => !current)}>{mapLocked ? 'Unlock' : 'Lock'}</Button>
                </div>
                {showInfo && activeInfoTrip ? <div className="position-absolute top-0 start-50 translate-middle-x bg-white border rounded shadow-sm p-3" style={{ zIndex: 500, minWidth: 220 }}>
                    <div className="small text-uppercase text-muted">PU {activeInfoTrip.id}</div>
                    <div className="fw-semibold">{activeInfoTrip.rider}</div>
                    <div>{activeInfoTrip.pickup}</div>
                    <div className="text-muted small">{activeInfoTrip.address}</div>
                  </div> : null}
                {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <div className="position-absolute bottom-0 start-0 m-3 bg-dark text-white border rounded shadow-sm p-3" style={{ zIndex: 500, minWidth: 260, borderColor: '#2a3144' }}>
                    <div className="small text-uppercase text-secondary">Driver ETA</div>
                    <div className="fw-semibold d-flex align-items-center gap-2"><IconifyIcon icon="iconoir:map-pin" /> {selectedDriver.name}</div>
                    <div className="small mt-1">Heading to {selectedDriverActiveTrip.id} • {selectedDriverActiveTrip.rider}</div>
                    <div className="small text-secondary">{selectedDriverActiveTrip.pickup} • {selectedDriverActiveTrip.address}</div>
                    <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                      <Badge bg="info">{selectedDriverEta?.label || 'ETA unavailable'}</Badge>
                      <Badge bg="secondary">{selectedDriverEta?.miles != null ? `${selectedDriverEta.miles.toFixed(1)} mi` : 'No distance'}</Badge>
                      <Badge bg={selectedDriver.live === 'Online' ? 'success' : 'dark'}>{selectedDriver.live}</Badge>
                    </div>
                  </div> : null}
                <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution={mapTilesConfig.attribution} url={mapTilesConfig.url} />
                  <ZoomControl position="bottomleft" />
                  {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#e53e3e', weight: 4 }} /> : null}
                  {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
                  {driversWithRealLocation.map(driver => <Marker key={`driver-${driver.id}`} position={driver.position} icon={createDriverMapIcon({
                    isSelected: selectedDriverId === driver.id,
                    isOnline: driver.live === 'Online'
                  })} eventHandlers={{
                    click: () => setSelectedDriverId(driver.id)
                  }}>
                      <Popup>
                        <div className="fw-semibold">{driver.name}</div>
                        <div>{driver.vehicle}</div>
                        <div>{getDriverCheckpoint(driver)}</div>
                        <div>Status: {driver.live}</div>
                        {selectedDriverId === driver.id && selectedDriverEta ? <div>ETA: {selectedDriverEta.label}</div> : null}
                      </Popup>
                    </Marker>)}
                  {filteredTrips.map(trip => <CircleMarker key={trip.id} center={trip.position} radius={selectedTripIds.includes(trip.id) ? 10 : 7} pathOptions={{ color: selectedTripIds.includes(trip.id) ? '#0ea5e9' : trip.status === 'Assigned' ? '#16a34a' : '#64748b', fillColor: selectedTripIds.includes(trip.id) ? '#0ea5e9' : trip.status === 'Assigned' ? '#16a34a' : '#64748b', fillOpacity: 0.9 }} eventHandlers={{
                    click: () => toggleTripSelection(trip.id)
                  }}>
                      <Popup>{`${trip.brokerTripId || trip.id} | ${trip.legLabel || 'Ride'} | ${trip.rider} | ${trip.pickup}`}</Popup>
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
                <div className="d-flex gap-2 small flex-wrap position-relative">
                  <Badge bg="primary">{trips.length} trips</Badge>
                  <Badge bg="info">{drivers.length} drivers</Badge>
                  <Badge bg="secondary">{liveDrivers} live</Badge>
                  <Button variant="outline-light" size="sm" onClick={() => router.push('/drivers/grouping')}>Billing Grouping</Button>
                  <Button variant="outline-light" size="sm" onClick={() => setShowColumnPicker(current => !current)}>
                    Columns
                  </Button>
                  <Button variant="outline-light" size="sm" onClick={() => router.push('/forms-safe-ride-import')}>Import Excel</Button>
                  {showColumnPicker ? <Card className="shadow position-absolute end-0 mt-5" style={{ zIndex: 35, width: 240 }}>
                      <CardBody className="p-3 text-dark">
                        <div className="fw-semibold mb-2">Escoge que quieres ver</div>
                        <div className="small text-muted mb-3">Estos cambios se guardan para la proxima vez.</div>
                        <div className="d-flex flex-column gap-2">
                          {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={option.key} type="switch" id={`dispatcher-column-${option.key}`} label={option.label} checked={visibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} />)}
                        </div>
                      </CardBody>
                    </Card> : null}
                </div>
              </div>
              <div className="table-responsive" style={{ maxHeight: expanded ? 520 : 390 }}>
                <Table hover className="align-middle mb-0">
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: 48 }}><Form.Check checked={allVisibleSelected} onChange={event => handleSelectAll(event.target.checked)} /></th>
                      <th style={{ width: 60 }}>ACT</th>
                      {visibleTripColumns.includes('trip') ? <th>Trip / Ride</th> : null}
                      {visibleTripColumns.includes('status') ? <th>Status</th> : null}
                      {visibleTripColumns.includes('driver') ? <th>Driver</th> : null}
                      {visibleTripColumns.includes('pickup') ? <th>PU</th> : null}
                      {visibleTripColumns.includes('dropoff') ? <th>DO</th> : null}
                      {visibleTripColumns.includes('rider') ? <th>Rider</th> : null}
                      {visibleTripColumns.includes('address') ? <th>PU Address</th> : null}
                      {visibleTripColumns.includes('destination') ? <th>DO Address</th> : null}
                      {visibleTripColumns.includes('phone') ? <th>Phone</th> : null}
                      {visibleTripColumns.includes('miles') ? <th>Miles</th> : null}
                      {visibleTripColumns.includes('vehicle') ? <th>Vehicle</th> : null}
                      {visibleTripColumns.includes('leg') ? <th>Leg</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFilteredTripRows.length > 0 ? groupedFilteredTripRows.map(row => row.type === 'group' ? <tr key={`group-${row.groupKey}`} className="table-light">
                        <td colSpan={tripTableColumnCount} className="small fw-semibold text-uppercase text-muted">{row.label}</td>
                      </tr> : <tr key={row.trip.id} className={selectedTripIds.includes(row.trip.id) ? 'table-primary' : ''}>
                        <td><Form.Check checked={selectedTripIds.includes(row.trip.id)} onChange={() => toggleTripSelection(row.trip.id)} /></td>
                        <td><Button variant={row.trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" onClick={() => {
                      setSelectedTripIds([row.trip.id]);
                      setSelectedDriverId(row.trip.driverId ?? selectedDriverId);
                      setSelectedRouteId(row.trip.routeId);
                      setStatusMessage(`Trip ${row.trip.id} activo.`);
                    }}>ACT</Button></td>
                        {visibleTripColumns.includes('trip') ? <td>
                            <div className="fw-semibold">{row.trip.id}</div>
                            <div className="small text-muted">{row.trip.brokerTripId || row.trip.id}</div>
                            {getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant} className="mt-1">{getLegBadge(row.trip).label}</Badge> : null}
                          </td> : null}
                        {visibleTripColumns.includes('status') ? <td><Badge bg={getStatusBadge(row.trip.status)}>{row.trip.status}</Badge>{row.trip.safeRideStatus ? <div className="small text-muted mt-1">{row.trip.safeRideStatus}</div> : null}</td> : null}
                        {visibleTripColumns.includes('driver') ? <td>{getDriverName(row.trip.driverId)}</td> : null}
                        {visibleTripColumns.includes('pickup') ? <td>{row.trip.pickup}</td> : null}
                        {visibleTripColumns.includes('dropoff') ? <td>{row.trip.dropoff}</td> : null}
                        {visibleTripColumns.includes('rider') ? <td>{row.trip.rider}</td> : null}
                        {visibleTripColumns.includes('address') ? <td>{row.trip.address}</td> : null}
                        {visibleTripColumns.includes('destination') ? <td>{row.trip.destination || '-'}</td> : null}
                        {visibleTripColumns.includes('phone') ? <td>{row.trip.patientPhoneNumber || '-'}</td> : null}
                        {visibleTripColumns.includes('miles') ? <td>{row.trip.miles || '-'}</td> : null}
                        {visibleTripColumns.includes('vehicle') ? <td>{row.trip.vehicleType || '-'}</td> : null}
                        {visibleTripColumns.includes('leg') ? <td>{getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant}>{getLegBadge(row.trip).label}</Badge> : '-'}</td> : null}
                      </tr>) : <tr>
                        <td colSpan={tripTableColumnCount} className="text-center text-muted py-4">No hay viajes cargados. Esperando tus trips reales.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => showBottomPanels ? setDragMode('row') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'row-resize',
        gridColumn: '1 / span 3',
        gridRow: 2,
        display: showBottomPanels ? 'block' : 'none'
      }}>
          <div className="position-absolute top-50 start-50 translate-middle rounded-pill" style={{ width: 42, height: 4, backgroundColor: '#4c536a' }} />
        </div>

        <div onMouseDown={() => showBottomPanels ? setDragMode('both') : undefined} style={{
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
        boxShadow: '0 0 0 2px rgba(88, 96, 122, 0.25)',
        display: showBottomPanels ? 'block' : 'none'
      }} />

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <DispatcherMessagingPanel drivers={filteredDrivers} selectedDriverId={selectedDriverId} setSelectedDriverId={setSelectedDriverId} openFullChat={() => {
              refreshDrivers();
              router.push('/driver-chat');
              setStatusMessage('Abriendo mensajeria completa de choferes.');
            }} />
            </CardBody>
          </Card>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-white gap-2 flex-wrap">
                <Form.Select size="sm" value={selectedRouteId ?? ''} onChange={event => setSelectedRouteId(event.target.value)} style={{ width: 180 }}>
                  <option value="">Current selection</option>
                  {routePlans.map(routePlan => <option key={routePlan.id} value={routePlan.id}>{routePlan.name}</option>)}
                </Form.Select>
                <Form.Control size="sm" value={routeSearch} onChange={event => setRouteSearch(event.target.value)} placeholder="Search" style={{ width: 180 }} />
              </div>
              <div className="table-responsive" style={{ minHeight: 360, maxHeight: 360 }}>
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
            </CardBody>
          </Card>
        </div>
      </div>
    </>;
};

export default DispatcherWorkspace;