'use client';

import { useNemtContext } from '@/context/useNemtContext';
import { getTripDropoffPosition, getTripPickupPosition } from '@/helpers/nemt-dispatch-state';
import { getMapTileConfig } from '@/utils/map-tiles';
import { divIcon } from 'leaflet';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Form, Spinner } from 'react-bootstrap';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';

const DEFAULT_CENTER = [28.5383, -81.3792];
const DEFAULT_ZOOM = 10;
const RESULT_ZOOM = 16;
const DETACHED_MAP_SELECTION_STORAGE_KEY = '__CARE_MOBILITY_DETACHED_MAP_SELECTION__';

const normalizeDetachedMapSelection = value => ({
  selectedTripIds: Array.isArray(value?.selectedTripIds) ? value.selectedTripIds.map(item => String(item || '').trim()).filter(Boolean) : [],
  selectedDriverId: String(value?.selectedDriverId || '').trim() || null,
  selectedRouteId: String(value?.selectedRouteId || '').trim() || null,
  updatedAt: Number(value?.updatedAt) || 0
});

const readDetachedMapSelection = () => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(DETACHED_MAP_SELECTION_STORAGE_KEY);
    if (!rawValue) return null;
    return normalizeDetachedMapSelection(JSON.parse(rawValue));
  } catch {
    return null;
  }
};

const areDetachedSelectionsEqual = (left, right) => {
  const normalizedLeft = normalizeDetachedMapSelection(left);
  const normalizedRight = normalizeDetachedMapSelection(right);
  return normalizedLeft.selectedDriverId === normalizedRight.selectedDriverId
    && normalizedLeft.selectedRouteId === normalizedRight.selectedRouteId
    && normalizedLeft.selectedTripIds.length === normalizedRight.selectedTripIds.length
    && normalizedLeft.selectedTripIds.every((tripId, index) => tripId === normalizedRight.selectedTripIds[index]);
};

const sortTripsByPickupTime = items => [...(Array.isArray(items) ? items : [])].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip?.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip?.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip?.id || '').localeCompare(String(rightTrip?.id || ''));
});

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#ef4444'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

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
  top: 24,
  left: 24,
  zIndex: 500,
  width: 'min(460px, calc(100% - 48px))',
  backgroundColor: 'rgba(255, 255, 255, 0.96)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: 18,
  boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
  padding: 16,
  backdropFilter: 'blur(10px)'
};

const mapSurfaceStyle = {
  height: 'calc(100vh - 94px)',
  width: '100%',
  borderRadius: 22,
  overflow: 'hidden',
  boxShadow: '0 28px 60px rgba(15, 23, 42, 0.18)',
  border: '1px solid rgba(148, 163, 184, 0.3)'
};

const ViewportController = ({ coordinatesList, zoom, focusKey }) => {
  const map = useMap();
  const lastAppliedKeyRef = React.useRef('');

  React.useEffect(() => {
    const validCoordinates = Array.isArray(coordinatesList)
      ? coordinatesList.filter(coordinates => Array.isArray(coordinates) && coordinates.length === 2)
      : [];
    const nextKey = String(focusKey || '');

    if (nextKey && lastAppliedKeyRef.current === nextKey) {
      return;
    }

    if (validCoordinates.length === 0) {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
      lastAppliedKeyRef.current = '';
      return;
    }

    if (validCoordinates.length === 1) {
      map.flyTo(validCoordinates[0], zoom, { duration: 0.8 });
      lastAppliedKeyRef.current = nextKey;
      return;
    }

    map.fitBounds(validCoordinates, {
      padding: [60, 60],
      maxZoom: 14
    });
    lastAppliedKeyRef.current = nextKey;
  }, [coordinatesList, focusKey, map, zoom]);

  return null;
};

const buildExternalMapUrl = coordinates => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return '#';
  return `https://www.google.com/maps/search/?api=1&query=${coordinates[0]},${coordinates[1]}`;
};

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

const MapScreenWorkspace = () => {
  const {
    drivers = [],
    trips = [],
    routePlans = [],
    selectedTripIds: contextSelectedTripIds = [],
    selectedDriverId: contextSelectedDriverId,
    selectedRouteId: contextSelectedRouteId,
    uiPreferences
  } = useNemtContext();
  const [originQuery, setOriginQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [originResult, setOriginResult] = useState(null);
  const [destinationResult, setDestinationResult] = useState(null);
  const [routeResult, setRouteResult] = useState(null);
  const [sharedRouteResult, setSharedRouteResult] = useState(null);
  const [detachedSelection, setDetachedSelection] = useState(() => readDetachedMapSelection());
  const [mapProviderPreference, setMapProviderPreference] = useState(() => uiPreferences?.mapProvider || 'auto');

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncDetachedSelection = nextValue => {
      setDetachedSelection(currentValue => {
        const resolvedValue = nextValue ?? readDetachedMapSelection();
        return areDetachedSelectionsEqual(currentValue, resolvedValue) ? currentValue : resolvedValue;
      });
    };

    const handleStorage = event => {
      if (event.key !== DETACHED_MAP_SELECTION_STORAGE_KEY) return;
      try {
        syncDetachedSelection(event.newValue ? normalizeDetachedMapSelection(JSON.parse(event.newValue)) : null);
      } catch {
        syncDetachedSelection(null);
      }
    };

    const handleFocus = () => syncDetachedSelection();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncDetachedSelection();
      }
    };
    const handlePageShow = () => syncDetachedSelection();

    syncDetachedSelection();
    const syncInterval = window.setInterval(syncDetachedSelection, 1500);

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(syncInterval);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const effectiveSelection = detachedSelection || normalizeDetachedMapSelection({
    selectedTripIds: contextSelectedTripIds,
    selectedDriverId: contextSelectedDriverId,
    selectedRouteId: contextSelectedRouteId
  });
  const selectedTripIds = effectiveSelection.selectedTripIds;
  const selectedDriverId = effectiveSelection.selectedDriverId;
  const selectedRouteId = effectiveSelection.selectedRouteId;

  const mapTileConfig = useMemo(() => getMapTileConfig(mapProviderPreference), [mapProviderPreference]);
  const manualMapPoints = useMemo(() => routeResult?.geometry?.length > 1 ? routeResult.geometry : [originResult?.coordinates, destinationResult?.coordinates].filter(Boolean), [destinationResult?.coordinates, originResult?.coordinates, routeResult?.geometry]);
  const selectedTripIdSet = useMemo(() => new Set((Array.isArray(selectedTripIds) ? selectedTripIds : []).map(value => String(value || '').trim()).filter(Boolean)), [selectedTripIds]);
  const selectedTrips = useMemo(() => trips.filter(trip => selectedTripIdSet.has(String(trip?.id || '').trim())), [selectedTripIdSet, trips]);
  const selectedRoute = useMemo(() => routePlans.find(routePlan => String(routePlan?.id || '').trim() === String(selectedRouteId || '').trim()) ?? null, [routePlans, selectedRouteId]);
  const routeTrips = useMemo(() => {
    if (!selectedRoute) return [];
    const routeTripIdSet = new Set((Array.isArray(selectedRoute?.tripIds) ? selectedRoute.tripIds : []).map(value => String(value || '').trim()).filter(Boolean));
    return sortTripsByPickupTime(trips.filter(trip => routeTripIdSet.has(String(trip?.id || '').trim())));
  }, [selectedRoute, trips]);
  const selectedDriver = useMemo(() => drivers.find(driver => String(driver?.id || '').trim() === String(selectedDriverId || '').trim()) ?? null, [drivers, selectedDriverId]);
  const sharedTripPoints = useMemo(() => {
    const sourceTrips = sortTripsByPickupTime(selectedTrips.length > 0 ? selectedTrips : routeTrips);
    return sourceTrips.flatMap(trip => {
      const pickupPosition = getTripPickupPosition(trip);
      const dropoffPosition = getTripDropoffPosition(trip);
      const points = [];

      if (pickupPosition) {
        points.push({
          key: `${trip.id}-pickup`,
          position: pickupPosition,
          color: '#0284c7',
          title: `PU ${trip?.rider || trip?.id || 'Trip'}`,
          detail: trip?.address || 'No pickup address available'
        });
      }

      if (dropoffPosition) {
        points.push({
          key: `${trip.id}-dropoff`,
          position: dropoffPosition,
          color: '#16a34a',
          title: `DO ${trip?.rider || trip?.id || 'Trip'}`,
          detail: trip?.destination || 'No dropoff address available'
        });
      }

      return points;
    });
  }, [routeTrips, selectedTrips]);
  const sharedRouteStops = useMemo(() => {
    const sourceTrips = sortTripsByPickupTime(selectedTrips.length > 0 ? selectedTrips : routeTrips);
    return sourceTrips.flatMap((trip, index) => {
      const pickupPosition = getTripPickupPosition(trip);
      const dropoffPosition = getTripDropoffPosition(trip);
      const stops = [];

      if (pickupPosition) {
        stops.push({
          key: `${trip.id}-pickup-stop`,
          label: `${index * 2 + 1}`,
          variant: 'pickup',
          position: pickupPosition,
          title: `PU ${trip?.rider || trip?.id || 'Trip'}`,
          detail: trip?.address || 'No pickup address available'
        });
      }

      if (dropoffPosition) {
        stops.push({
          key: `${trip.id}-dropoff-stop`,
          label: `${index * 2 + 2}`,
          variant: 'dropoff',
          position: dropoffPosition,
          title: `DO ${trip?.rider || trip?.id || 'Trip'}`,
          detail: trip?.destination || 'No dropoff address available'
        });
      }

      return stops;
    });
  }, [routeTrips, selectedTrips]);
  const sharedDriverPoints = useMemo(() => {
    const normalizedSelectedDriverId = String(selectedDriverId || '').trim();
    return drivers.filter(driver => {
      if (!Array.isArray(driver?.position) || driver.position.length !== 2) return false;
      if (!driver?.hasRealLocation) return false;
      const normalizedDriverId = String(driver?.id || '').trim();
      if (normalizedSelectedDriverId) return normalizedDriverId === normalizedSelectedDriverId;
      return String(driver?.live || '').trim().toLowerCase() === 'online';
    });
  }, [drivers, selectedDriverId]);
  const showTripSelection = selectedTripIdSet.size > 0 && sharedTripPoints.length > 0;
  const showRouteSelection = !showTripSelection && Boolean(selectedRoute) && sharedTripPoints.length > 0;
  const showDriverSelection = !showTripSelection && !showRouteSelection && sharedDriverPoints.length > 0;
  React.useEffect(() => {
    let cancelled = false;

    const loadSharedRoute = async () => {
      if (!(showTripSelection || showRouteSelection) || sharedRouteStops.length < 2) {
        setSharedRouteResult(null);
        return;
      }

      try {
        const nextRouteResult = await loadRouteGeometry(sharedRouteStops.map(stop => stop.position));
        if (!cancelled) {
          setSharedRouteResult(nextRouteResult);
        }
      } catch {
        if (!cancelled) {
          setSharedRouteResult(null);
        }
      }
    };

    loadSharedRoute();

    return () => {
      cancelled = true;
    };
  }, [sharedRouteStops, showRouteSelection, showTripSelection]);
  const sharedRoutePath = useMemo(() => {
    if (!(showTripSelection || showRouteSelection)) return [];
    if (Array.isArray(sharedRouteResult?.geometry) && sharedRouteResult.geometry.length > 1) return sharedRouteResult.geometry;
    if (sharedRouteStops.length > 0) return sharedRouteStops.map(stop => stop.position);
    return [];
  }, [sharedRouteResult?.geometry, sharedRouteStops, showRouteSelection, showTripSelection]);
  const showSharedSelection = !originResult && !destinationResult;
  const sharedMapPoints = useMemo(() => {
      if (showTripSelection || showRouteSelection) {
        return [
          ...sharedTripPoints.map(point => point.position),
          ...sharedDriverPoints.map(driver => driver.position)
        ];
      }
    if (showDriverSelection) return sharedDriverPoints.map(driver => driver.position);
    return [];
  }, [sharedDriverPoints, sharedTripPoints, showDriverSelection, showRouteSelection, showTripSelection]);
  const mapPoints = showSharedSelection && sharedMapPoints.length > 0 ? sharedMapPoints : manualMapPoints;
  const mapFocusKey = useMemo(() => mapPoints.map(point => `${Number(point?.[0] || 0).toFixed(5)},${Number(point?.[1] || 0).toFixed(5)}`).join('|'), [mapPoints]);

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
  };

  return <div style={shellStyle}>
      <div style={toolbarStyle}>
        <div>
          <div className="fw-semibold" style={{ fontSize: '1.1rem', letterSpacing: '0.01em' }}>Detached Map Screen</div>
          <div className="small" style={{ color: 'rgba(226, 232, 240, 0.88)' }}>{showSharedSelection ? 'Showing the current Trip Dashboard selection on your other monitor.' : 'Search any address and keep this window on your other monitor.'}</div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Badge bg="light" text="dark" pill>{showSharedSelection ? 'Trip Dashboard map' : 'Live search map'}</Badge>
          {selectedDriver ? <Badge bg="warning" text="dark" pill>{selectedDriver.name}</Badge> : null}
          {selectedTripIdSet.size > 0 ? <Badge bg="info" pill>{selectedTripIdSet.size} trip(s)</Badge> : null}
          {selectedRoute ? <Badge bg="primary" pill>{selectedRoute.name || selectedRoute.id || 'Route selected'}</Badge> : null}
        </div>
      </div>

      <div style={panelStyle}>
        <div style={overlayCardStyle}>
          <Form onSubmit={handleSearch} className="d-flex flex-column gap-3">
            <div>
              <div className="fw-semibold mb-1">Address search</div>
              <div className="small text-muted">Leave search empty to mirror the current Trip Dashboard selection, or search manually for a separate route.</div>
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
                <option value="local">Map: Local</option>
              </Form.Select>
              {originResult ? <Badge bg="success">Origin: {originResult.provider}</Badge> : null}
              {destinationResult ? <Badge bg="primary">Destination: {destinationResult.provider}</Badge> : null}
              {routeResult ? <Badge bg={routeResult.isFallback ? 'warning' : 'dark'} text={routeResult.isFallback ? 'dark' : 'light'}>Route: {routeResult.provider}</Badge> : null}
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
              </div> : null}
          </Form>
        </div>
        <div style={mapSurfaceStyle}>
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} scrollWheelZoom dragging doubleClickZoom touchZoom boxZoom keyboard preferCanvas style={{ height: '100%', width: '100%' }}>
            <ViewportController coordinatesList={mapPoints} zoom={mapPoints.length > 0 ? RESULT_ZOOM : DEFAULT_ZOOM} focusKey={mapFocusKey} />
            <ZoomControl position="bottomright" />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} updateWhenZooming={false} />
            {showSharedSelection && sharedRoutePath.length > 1 ? <Polyline positions={sharedRoutePath} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.78 }} /> : null}
            {showSharedSelection && (showTripSelection || showRouteSelection) ? sharedRouteStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                <Popup>
                  <div className="fw-semibold">{stop.title}</div>
                  <div>{stop.detail}</div>
                </Popup>
              </Marker>) : null}
            {showSharedSelection && sharedDriverPoints.length > 0 ? sharedDriverPoints.map(driver => <CircleMarker key={`driver-${driver.id}`} center={driver.position} radius={11} pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 3 }}>
                <Popup>
                  <div className="fw-semibold">{driver.name || 'Driver'}</div>
                  <div className="small text-muted">{driver.live || 'Offline'}</div>
                  <div>{driver.checkpoint || 'No checkpoint available'}</div>
                </Popup>
              </CircleMarker>) : null}
            {showSharedSelection && (showTripSelection || showRouteSelection) ? sharedTripPoints.map(point => <CircleMarker key={point.key} center={point.position} radius={9} pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.88, weight: 3 }}>
                <Popup>
                  <div className="fw-semibold">{point.title}</div>
                  <div>{point.detail}</div>
                </Popup>
              </CircleMarker>) : null}
            {originResult ? <CircleMarker center={originResult.coordinates} radius={12} pathOptions={{ color: '#065f46', fillColor: '#10b981', fillOpacity: 0.85, weight: 3 }}>
                <Popup>
                  <div className="fw-semibold mb-1">Origin</div>
                  <div>{originResult.label}</div>
                  <div className="small text-muted">{originResult.coordinates[0].toFixed(6)}, {originResult.coordinates[1].toFixed(6)}</div>
                </Popup>
              </CircleMarker> : null}
            {destinationResult ? <CircleMarker center={destinationResult.coordinates} radius={12} pathOptions={{ color: '#1d4ed8', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 3 }}>
                <Popup>
                  <div className="fw-semibold mb-1">Destination</div>
                  <div>{destinationResult.label}</div>
                  <div className="small text-muted">{destinationResult.coordinates[0].toFixed(6)}, {destinationResult.coordinates[1].toFixed(6)}</div>
                </Popup>
              </CircleMarker> : null}
            {routeResult?.geometry?.length > 1 ? <Polyline positions={routeResult.geometry} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.78, dashArray: routeResult.isFallback ? '8 8' : undefined }} /> : originResult && destinationResult ? <Polyline positions={[originResult.coordinates, destinationResult.coordinates]} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.7, dashArray: '8 8' }} /> : null}
          </MapContainer>
        </div>
      </div>
    </div>;
};

export default MapScreenWorkspace;