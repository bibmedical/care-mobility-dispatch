'use client';

import { getMapTileConfig } from '@/utils/map-tiles';
import { divIcon } from 'leaflet';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Form, Spinner } from 'react-bootstrap';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';

const DEFAULT_CENTER = [28.5383, -81.3792];
const DEFAULT_ZOOM = 10;
const RESULT_ZOOM = 16;
const DETACHED_MAP_SELECTION_STORAGE_KEY = '__CARE_MOBILITY_DETACHED_MAP_SELECTION__';

const shellStyle = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)'
};

const toolbarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 18px',
  background: 'linear-gradient(135deg, #14532d 0%, #0f766e 100%)',
  color: '#f8fafc',
  borderBottom: '1px solid rgba(15, 23, 42, 0.18)',
  flexWrap: 'wrap'
};

const panelStyle = {
  position: 'relative',
  minHeight: 0,
  padding: 12
};

const overlayCardStyle = {
  position: 'absolute',
  top: 16,
  left: 16,
  zIndex: 500,
  width: 'min(360px, calc(100% - 32px))',
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: 10,
  boxShadow: '0 16px 34px rgba(15, 23, 42, 0.16)',
  padding: '10px 12px',
  color: '#0f172a',
  fontSize: 13,
  lineHeight: 1.25,
  backdropFilter: 'blur(10px)'
};

const emptyHintStyle = {
  position: 'absolute',
  right: 24,
  bottom: 24,
  zIndex: 500,
  maxWidth: 320,
  padding: '12px 14px',
  borderRadius: 16,
  backgroundColor: 'rgba(15, 23, 42, 0.88)',
  color: '#e2e8f0',
  boxShadow: '0 18px 38px rgba(15, 23, 42, 0.24)'
};

const mapSurfaceStyle = {
  height: 'calc(100vh - 94px)',
  width: '100%',
  borderRadius: 22,
  overflow: 'hidden',
  boxShadow: '0 28px 60px rgba(15, 23, 42, 0.18)',
  border: '1px solid rgba(148, 163, 184, 0.3)'
};

const ViewportController = ({ coordinatesList, zoom }) => {
  const map = useMap();

  React.useEffect(() => {
    const validCoordinates = Array.isArray(coordinatesList)
      ? coordinatesList.filter(coordinates => Array.isArray(coordinates) && coordinates.length === 2)
      : [];

    if (validCoordinates.length === 0) {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
      return;
    }

    if (validCoordinates.length === 1) {
      map.flyTo(validCoordinates[0], zoom, { duration: 0.8 });
      return;
    }

    map.fitBounds(validCoordinates, {
      padding: [60, 60],
      maxZoom: 14
    });
  }, [coordinatesList, map, zoom]);

  return null;
};

const buildExternalMapUrl = coordinates => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return '#';
  return `https://www.google.com/maps/search/?api=1&query=${coordinates[0]},${coordinates[1]}`;
};

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#ef4444'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.34);color:#ffffff;font-size:13px;font-weight:800;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const searchAddress = async query => {
  const response = await fetch(`/api/maps/search?q=${encodeURIComponent(query)}`, {
    cache: 'no-store'
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || 'Address not found.');
  }

  return {
    label: String(payload?.label || query),
    provider: String(payload?.provider || 'search'),
    coordinates: Array.isArray(payload?.coordinates) ? payload.coordinates : DEFAULT_CENTER
  };
};

const loadRouteGeometry = async coordinatesList => {
  const coordinates = (Array.isArray(coordinatesList) ? coordinatesList : []).filter(item => Array.isArray(item) && item.length === 2);
  if (coordinates.length < 2) return null;

  const coordinateQuery = coordinates.map(([latitude, longitude]) => `${latitude},${longitude}`).join(';');
  const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinateQuery)}`, {
    cache: 'no-store'
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load route.');
  }

  return {
    geometry: Array.isArray(payload?.geometry) ? payload.geometry : coordinates,
    provider: String(payload?.provider || 'route'),
    distanceMiles: Number.isFinite(payload?.distanceMiles) ? payload.distanceMiles : null,
    durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null,
    isFallback: payload?.isFallback === true
  };
};

const readTripDashboardMapSelection = () => {
  if (typeof window === 'undefined') return null;
  try {
    const rawValue = window.localStorage.getItem(DETACHED_MAP_SELECTION_STORAGE_KEY);
    if (!rawValue) return null;
    const parsedValue = JSON.parse(rawValue);
    const routeWaypoints = Array.isArray(parsedValue?.routeWaypoints)
      ? parsedValue.routeWaypoints.filter(point => Array.isArray(point) && point.length === 2)
      : [];
    if (routeWaypoints.length === 0 && !Array.isArray(parsedValue?.trips)) return null;
    return {
      ...parsedValue,
      routeWaypoints,
      routeGeometry: Array.isArray(parsedValue?.routeGeometry) ? parsedValue.routeGeometry : [],
      routeStops: Array.isArray(parsedValue?.routeStops) ? parsedValue.routeStops.filter(stop => Array.isArray(stop?.position)) : [],
      trips: Array.isArray(parsedValue?.trips) ? parsedValue.trips : [],
      drivers: Array.isArray(parsedValue?.drivers) ? parsedValue.drivers.filter(driver => Array.isArray(driver?.position)) : []
    };
  } catch {
    return null;
  }
};

const MapScreenWorkspace = () => {
  const [originQuery, setOriginQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [originResult, setOriginResult] = useState(null);
  const [destinationResult, setDestinationResult] = useState(null);
  const [routeResult, setRouteResult] = useState(null);
  const [dashboardSelection, setDashboardSelection] = useState(() => readTripDashboardMapSelection());
  const [dashboardRouteResult, setDashboardRouteResult] = useState(null);
  const [mapProviderPreference, setMapProviderPreference] = useState('auto');

  const mapTileConfig = useMemo(() => getMapTileConfig(mapProviderPreference), [mapProviderPreference]);
  const hasManualMapSearch = Boolean(originResult || destinationResult || routeResult);
  const dashboardRouteGeometry = dashboardRouteResult?.geometry?.length > 1 ? dashboardRouteResult.geometry : dashboardSelection?.routeGeometry?.length > 1 ? dashboardSelection.routeGeometry : dashboardSelection?.routeWaypoints || [];
  const dashboardRouteStops = useMemo(() => {
    if (dashboardSelection?.routeStops?.length > 0) return dashboardSelection.routeStops;
    return (dashboardSelection?.trips || []).flatMap((trip, index) => [{
      key: `${trip.id || index}-pickup`,
      label: `${index * 2 + 1}`,
      variant: 'pickup',
      position: trip.pickupPosition,
      title: 'Pickup'
    }, {
      key: `${trip.id || index}-dropoff`,
      label: `${index * 2 + 2}`,
      variant: 'dropoff',
      position: trip.dropoffPosition,
      title: 'Dropoff'
    }]).filter(stop => Array.isArray(stop.position));
  }, [dashboardSelection?.routeStops, dashboardSelection?.trips]);
  const dashboardDrivers = useMemo(() => {
    if (dashboardSelection?.drivers?.length > 0) return dashboardSelection.drivers;
    return dashboardSelection?.driver?.position ? [dashboardSelection.driver] : [];
  }, [dashboardSelection?.driver, dashboardSelection?.drivers]);
  const dashboardDriverNames = useMemo(() => dashboardDrivers.map(driver => driver.name || driver.id).filter(Boolean), [dashboardDrivers]);
  const dashboardTrips = dashboardSelection?.trips || [];
  const mapPoints = useMemo(() => {
    if (routeResult?.geometry?.length > 1) return routeResult.geometry;
    if (!hasManualMapSearch && dashboardRouteGeometry.length > 0) return dashboardRouteGeometry;
    return [originResult?.coordinates, destinationResult?.coordinates].filter(Boolean);
  }, [dashboardRouteGeometry, destinationResult?.coordinates, hasManualMapSearch, originResult?.coordinates, routeResult?.geometry]);

  useEffect(() => {
    const refreshSelection = () => setDashboardSelection(readTripDashboardMapSelection());
    refreshSelection();
    window.addEventListener('storage', refreshSelection);
    window.addEventListener('focus', refreshSelection);
    const intervalId = window.setInterval(refreshSelection, 1500);
    return () => {
      window.removeEventListener('storage', refreshSelection);
      window.removeEventListener('focus', refreshSelection);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (hasManualMapSearch || !dashboardSelection?.routeWaypoints || dashboardSelection.routeWaypoints.length < 2) {
      setDashboardRouteResult(null);
      return undefined;
    }

    let cancelled = false;
    const loadDashboardRoute = async () => {
      try {
        const nextRoute = await loadRouteGeometry(dashboardSelection.routeWaypoints);
        if (!cancelled) setDashboardRouteResult(nextRoute);
      } catch {
        if (!cancelled) {
          setDashboardRouteResult({
            geometry: dashboardSelection.routeWaypoints,
            provider: 'fallback',
            distanceMiles: null,
            durationMinutes: null,
            isFallback: true
          });
        }
      }
    };

    loadDashboardRoute();
    return () => {
      cancelled = true;
    };
  }, [dashboardSelection?.updatedAt, hasManualMapSearch]);

  const handleSearch = async event => {
    event.preventDefault();
    const trimmedOriginQuery = String(originQuery || '').trim();
    const trimmedDestinationQuery = String(destinationQuery || '').trim();

    if (!trimmedOriginQuery && !trimmedDestinationQuery) {
      setErrorMessage('Enter at least one address in origin or destination.');
      setOriginResult(null);
      setDestinationResult(null);
      setRouteResult(null);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const [nextOriginResult, nextDestinationResult] = await Promise.all([
        trimmedOriginQuery ? searchAddress(trimmedOriginQuery) : Promise.resolve(null),
        trimmedDestinationQuery ? searchAddress(trimmedDestinationQuery) : Promise.resolve(null)
      ]);

      const nextRouteResult = nextOriginResult?.coordinates && nextDestinationResult?.coordinates
        ? await loadRouteGeometry([nextOriginResult.coordinates, nextDestinationResult.coordinates])
        : null;

      setOriginResult(nextOriginResult);
      setDestinationResult(nextDestinationResult);
      setRouteResult(nextRouteResult);
    } catch (error) {
      setOriginResult(null);
      setDestinationResult(null);
      setRouteResult(null);
      setErrorMessage(error instanceof Error ? error.message : 'Address not found.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setOriginQuery('');
    setDestinationQuery('');
    setOriginResult(null);
    setDestinationResult(null);
    setRouteResult(null);
    setErrorMessage('');
    setDashboardSelection(readTripDashboardMapSelection());
  };

  return <div style={shellStyle}>
      <div style={toolbarStyle}>
        <div>
          <div className="fw-semibold" style={{ fontSize: '1.1rem', letterSpacing: '0.01em' }}>Detached Map Screen</div>
          <div className="small" style={{ color: 'rgba(226, 232, 240, 0.88)' }}>Search any address and keep this window on your other monitor.</div>
        </div>
        <Badge bg="light" text="dark" pill>Live search map</Badge>
      </div>

      <div style={panelStyle}>
        <div style={overlayCardStyle}>
          <Form onSubmit={handleSearch} className="d-flex flex-column gap-2">
            <div>
              <div className="fw-semibold mb-1">Address search</div>
              <div className="small" style={{ color: '#475569' }}>Use two address fields for origin and destination, or fill only one if you just need a single location.</div>
            </div>

            <div className="d-flex gap-2 flex-wrap">
              <Form.Control value={originQuery} onChange={event => setOriginQuery(event.target.value)} placeholder="Origin address..." autoFocus style={{ minWidth: 220, flex: '1 1 260px' }} />
              <Form.Control value={destinationQuery} onChange={event => setDestinationQuery(event.target.value)} placeholder="Destination address..." style={{ minWidth: 220, flex: '1 1 260px' }} />
              <Button type="submit" variant="success" disabled={loading}>{loading ? <><Spinner size="sm" animation="border" className="me-2" />Searching</> : 'Search'}</Button>
              <Button type="button" variant="outline-secondary" onClick={handleReset} disabled={loading && !originResult && !destinationResult}>Clear</Button>
            </div>

            <div className="d-flex gap-2 flex-wrap align-items-center">
              <Form.Select value={mapProviderPreference} onChange={event => setMapProviderPreference(event.target.value)} style={{ width: 170 }}>
                <option value="auto">Map: Auto</option>
                <option value="openstreetmap">Map: OSM</option>
              </Form.Select>
              {originResult ? <Badge bg="success">Origin: {originResult.provider}</Badge> : null}
              {destinationResult ? <Badge bg="primary">Destination: {destinationResult.provider}</Badge> : null}
              {routeResult ? <Badge bg={routeResult.isFallback ? 'warning' : 'dark'} text={routeResult.isFallback ? 'dark' : 'light'}>Route: {routeResult.provider}</Badge> : null}
              {!hasManualMapSearch && dashboardSelection?.routeWaypoints?.length > 1 ? <Badge bg={dashboardRouteResult?.isFallback ? 'warning' : 'dark'} text={dashboardRouteResult?.isFallback ? 'dark' : 'light'}>{dashboardSelection?.routeLoading ? 'Calculating route' : 'Trip Dashboard route'}</Badge> : null}
            </div>

            {errorMessage ? <div className="small text-danger fw-semibold">{errorMessage}</div> : null}

            {originResult || destinationResult ? <div className="d-flex flex-column gap-3">
                {originResult ? <div className="d-flex flex-column gap-1">
                    <div className="fw-semibold">Origin</div>
                    <div>{originResult.label}</div>
                    <div className="small text-muted">Lat {originResult.coordinates[0].toFixed(6)} | Lng {originResult.coordinates[1].toFixed(6)}</div>
                    <div className="d-flex gap-2 flex-wrap">
                      <Button as="a" href={buildExternalMapUrl(originResult.coordinates)} target="_blank" rel="noreferrer" variant="outline-success" size="sm">Open Origin</Button>
                    </div>
                  </div> : null}

                {destinationResult ? <div className="d-flex flex-column gap-1">
                    <div className="fw-semibold">Destination</div>
                    <div>{destinationResult.label}</div>
                    <div className="small text-muted">Lat {destinationResult.coordinates[0].toFixed(6)} | Lng {destinationResult.coordinates[1].toFixed(6)}</div>
                    <div className="d-flex gap-2 flex-wrap">
                      <Button as="a" href={buildExternalMapUrl(destinationResult.coordinates)} target="_blank" rel="noreferrer" variant="outline-primary" size="sm">Open Destination</Button>
                    </div>
                  </div> : null}

                {routeResult ? <div className="d-flex gap-2 flex-wrap small text-muted">
                    <span>{routeResult.distanceMiles != null ? `${routeResult.distanceMiles.toFixed(1)} miles` : 'Miles unavailable'}</span>
                    <span>{routeResult.durationMinutes != null ? `${Math.round(routeResult.durationMinutes)} min` : 'ETA unavailable'}</span>
                  </div> : null}
              </div> : !hasManualMapSearch && dashboardSelection ? <div className="d-flex flex-column gap-2">
                <div className="fw-semibold">Trip Dashboard route</div>
                <div className="small text-muted">Driver: {dashboardDriverNames.length > 0 ? dashboardDriverNames.join(', ') : 'None selected'}</div>
                <div className="d-flex gap-2 flex-wrap small text-muted">
                  <span>{dashboardTrips.length} trip(s)</span>
                  <span>{dashboardRouteStops.length} stop(s)</span>
                </div>
                {dashboardRouteResult ? <div className="d-flex gap-2 flex-wrap small text-muted">
                    <span>{dashboardRouteResult.distanceMiles != null ? `${dashboardRouteResult.distanceMiles.toFixed(1)} miles` : 'Miles unavailable'}</span>
                    <span>{dashboardRouteResult.durationMinutes != null ? `${Math.round(dashboardRouteResult.durationMinutes)} min` : 'ETA unavailable'}</span>
                  </div> : null}
                {dashboardTrips.length > 0 ? <div className="d-flex flex-column gap-1" style={{ paddingRight: 4 }}>
                    {dashboardTrips.map((trip, index) => <div key={`dashboard-route-trip-${trip.id || index}`} className="d-flex gap-2 small" style={{ borderTop: index === 0 ? '1px solid rgba(148, 163, 184, 0.22)' : 0, paddingTop: index === 0 ? 6 : 0 }}>
                        <Badge bg="success" pill style={{ alignSelf: 'flex-start' }}>{index + 1}</Badge>
                        <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                          <span className="fw-semibold text-truncate">{trip.rider || `Trip ${trip.id || index + 1}`}</span>
                          {trip.pickup ? <span className="text-muted text-truncate">PU: {trip.pickup}</span> : null}
                          {trip.dropoff ? <span className="text-muted text-truncate">DO: {trip.dropoff}</span> : null}
                        </div>
                      </div>)}
                  </div> : <div className="small text-muted">No active Trip Dashboard route.</div>}
              </div> : null}
          </Form>
        </div>

        {!originResult && !destinationResult && !dashboardSelection?.routeWaypoints?.length ? <div style={emptyHintStyle}>
            <div className="fw-semibold mb-1">Ready for second monitor</div>
            <div className="small">Search an address from dispatch and keep this map open as a dedicated location screen.</div>
          </div> : null}

        <div style={mapSurfaceStyle}>
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} scrollWheelZoom dragging doubleClickZoom touchZoom boxZoom keyboard preferCanvas style={{ height: '100%', width: '100%' }}>
            <ViewportController coordinatesList={mapPoints} zoom={mapPoints.length > 0 ? RESULT_ZOOM : DEFAULT_ZOOM} />
            <ZoomControl position="bottomright" />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} updateWhenZooming={false} />
            {originResult ? <Marker position={originResult.coordinates} icon={createRouteStopIcon('1', 'pickup')}>
                <Popup>
                  <div className="fw-semibold mb-1">Origin</div>
                  <div>{originResult.label}</div>
                  <div className="small text-muted">{originResult.coordinates[0].toFixed(6)}, {originResult.coordinates[1].toFixed(6)}</div>
                </Popup>
              </Marker> : null}
            {destinationResult ? <Marker position={destinationResult.coordinates} icon={createRouteStopIcon('2', 'dropoff')}>
                <Popup>
                  <div className="fw-semibold mb-1">Destination</div>
                  <div>{destinationResult.label}</div>
                  <div className="small text-muted">{destinationResult.coordinates[0].toFixed(6)}, {destinationResult.coordinates[1].toFixed(6)}</div>
                </Popup>
              </Marker> : null}
            {!hasManualMapSearch && dashboardDrivers.map(driver => <CircleMarker key={`dashboard-driver-${driver.id || driver.name || driver.position.join(',')}`} center={driver.position} radius={12} pathOptions={{ color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 3 }}>
                <Popup>
                  <div className="fw-semibold">Driver</div>
                  <div>{driver.name || driver.id || '-'}</div>
                  {driver.live ? <div className="small text-muted">{driver.live}</div> : null}
                </Popup>
              </CircleMarker>)}
            {!hasManualMapSearch && dashboardRouteStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                <Popup>
                  <div className="fw-semibold">{stop.title || (stop.variant === 'pickup' ? 'Pickup' : 'Dropoff')}</div>
                </Popup>
              </Marker>)}
            {routeResult?.geometry?.length > 1 ? <Polyline positions={routeResult.geometry} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.78, dashArray: routeResult.isFallback ? '8 8' : undefined }} /> : originResult && destinationResult ? <Polyline positions={[originResult.coordinates, destinationResult.coordinates]} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.7, dashArray: '8 8' }} /> : null}
            {!hasManualMapSearch && dashboardRouteGeometry.length > 1 ? <Polyline positions={dashboardRouteGeometry} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.82, dashArray: dashboardRouteResult?.isFallback ? '8 8' : undefined }} /> : null}
          </MapContainer>
        </div>
      </div>
    </div>;
};

export default MapScreenWorkspace;