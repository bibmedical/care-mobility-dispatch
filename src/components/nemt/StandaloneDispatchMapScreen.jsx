'use client';

import { useNemtContext } from '@/context/useNemtContext';
import { getMapTileConfig } from '@/utils/map-tiles';
import { divIcon } from 'leaflet';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button } from 'react-bootstrap';
import { CircleMarker, MapContainer, Marker, Polyline, Popup } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';

const DEFAULT_CENTER = [28.5383, -81.3792];

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

const formatDriveMinutes = minutes => {
  if (!Number.isFinite(minutes)) return 'Time unavailable';
  const roundedMinutes = Math.max(1, Math.round(minutes));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? trip?.destinationPosition ?? trip?.position : trip?.position;

const createDriverMapIcon = ({ isSelected, isOnline }) => divIcon({
  className: 'driver-map-icon-shell',
  html: `<div style="width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${isSelected ? '#f59e0b' : isOnline ? '#16a34a' : '#475569'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:16px;line-height:1;">&#128663;</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -16]
});

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#2563eb'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const StandaloneDispatchMapScreen = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get('source') === 'dashboard' ? 'dashboard' : 'dispatcher';
  const {
    drivers,
    trips,
    routePlans,
    selectedTripIds,
    selectedDriverId,
    selectedRouteId,
    uiPreferences,
    toggleTripSelection,
    getDriverName
  } = useNemtContext();
  const [showRoute, setShowRoute] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [mapLocked, setMapLocked] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);

  const selectedDriver = useMemo(() => drivers.find(driver => driver.id === selectedDriverId) ?? null, [drivers, selectedDriverId]);
  const selectedRoute = useMemo(() => routePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [routePlans, selectedRouteId]);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);
  const selectedTrips = useMemo(() => sortTripsByPickupTime(trips.filter(trip => selectedTripIds.includes(trip.id))), [selectedTripIds, trips]);
  const routeTrips = useMemo(() => {
    if (selectedRoute) return sortTripsByPickupTime(trips.filter(trip => selectedRoute.tripIds.includes(trip.id)));
    if (selectedDriver) return sortTripsByPickupTime(trips.filter(trip => trip.driverId === selectedDriver.id));
    return selectedTrips;
  }, [selectedDriver, selectedRoute, selectedTrips, trips]);
  const activeInfoTrip = selectedTrips[0] ?? routeTrips[0] ?? null;

  const routeStops = useMemo(() => {
    const baseTrips = selectedTrips.length > 0 ? selectedTrips : routeTrips;
    return baseTrips.flatMap((trip, index) => [{
      key: `${trip.id}-pickup`,
      label: `${index * 2 + 1}`,
      variant: 'pickup',
      position: trip.position,
      title: `Pickup ${trip.pickup}`,
      detail: trip.address || 'Pickup pending'
    }, {
      key: `${trip.id}-dropoff`,
      label: `${index * 2 + 2}`,
      variant: 'dropoff',
      position: trip.destinationPosition ?? trip.position,
      title: `Dropoff ${trip.dropoff}`,
      detail: trip.destination || 'Destination pending'
    }]);
  }, [routeTrips, selectedTrips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;
  const selectedDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const preferredTrip = selectedTrips.find(trip => trip.driverId === selectedDriver.id);
    if (preferredTrip) return preferredTrip;
    return routeTrips.find(trip => trip.driverId === selectedDriver.id) ?? trips.find(trip => trip.driverId === selectedDriver.id) ?? null;
  }, [routeTrips, selectedDriver, selectedTrips, trips]);
  const selectedDriverEta = useMemo(() => {
    if (!selectedDriver || !selectedDriver.hasRealLocation || !selectedDriverActiveTrip) return null;
    const miles = getDistanceMiles(selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip));
    return {
      miles,
      label: formatEta(miles)
    };
  }, [selectedDriver, selectedDriverActiveTrip]);
  const mapCenter = selectedDriver?.position ?? routeStops[0]?.position ?? trips[0]?.position ?? DEFAULT_CENTER;
  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const backHref = source === 'dashboard' ? '/trip-dashboard' : '/dispatcher';
  const hasMapSelection = routeTrips.length > 0 || selectedTrips.length > 0 || Boolean(selectedDriver);

  useEffect(() => {
    if (!showRoute || routeStops.length < 2) {
      setRouteGeometry([]);
      setRouteMetrics(null);
      return undefined;
    }

    const abortController = new AbortController();

    const loadRouteGeometry = async () => {
      const uniqueStops = routeStops.filter((stop, index, allStops) => index === 0 || String(stop.position) !== String(allStops[index - 1]?.position));
      const coordinates = uniqueStops.map(stop => `${stop.position[1]},${stop.position[0]}`).join(';');
      if (!coordinates) return;

      try {
        const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinates)}`, {
          signal: abortController.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('Routing service unavailable');
        const payload = await response.json();
        const geometry = Array.isArray(payload?.geometry) ? payload.geometry : [];
        if (geometry.length < 2) throw new Error('No drivable route found');
        setRouteGeometry(geometry);
        setRouteMetrics({
          distanceMiles: Number.isFinite(payload?.distanceMiles) ? payload.distanceMiles : null,
          durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null,
          isFallback: Boolean(payload?.isFallback)
        });
      } catch {
        if (abortController.signal.aborted) return;
        setRouteGeometry(uniqueStops.map(stop => stop.position));
        setRouteMetrics(null);
      }
    };

    loadRouteGeometry();

    return () => {
      abortController.abort();
    };
  }, [routeStops, showRoute]);

  return <div style={{ height: '100vh', padding: 12, background: '#0f172a' }}>
      <div className="h-100 rounded-4 overflow-hidden" style={{ border: '1px solid rgba(148, 163, 184, 0.18)', boxShadow: '0 24px 80px rgba(2, 6, 23, 0.45)' }}>
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap px-3 py-2" style={{ background: 'linear-gradient(90deg, #0b1220 0%, #122033 100%)', borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
          <div className="d-flex align-items-center gap-2 flex-wrap text-white">
            <strong>Map Screen</strong>
            <Badge bg="info">{source === 'dashboard' ? 'Trip Dashboard' : 'Dispatcher'}</Badge>
            <Badge bg="secondary">{trips.length} trips</Badge>
            <Badge bg="secondary">{drivers.length} drivers</Badge>
            <Badge bg={liveDrivers > 0 ? 'success' : 'dark'}>{liveDrivers} live</Badge>
            {routeMetrics?.distanceMiles != null ? <Badge bg="light" text="dark">Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null}
            {routeMetrics?.durationMinutes != null ? <Badge bg="light" text="dark">{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null}
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Button variant="outline-light" size="sm" onClick={() => setShowRoute(current => !current)}>{showRoute ? 'Hide Route' : 'Show Route'}</Button>
            <Button variant="outline-light" size="sm" onClick={() => setShowInfo(current => !current)}>{showInfo ? 'Hide Info' : 'Show Info'}</Button>
            <Button variant="outline-light" size="sm" onClick={() => setMapLocked(current => !current)}>{mapLocked ? 'Unlock' : 'Lock'}</Button>
            <Button variant="light" size="sm" onClick={() => router.push(backHref)}>Back To {source === 'dashboard' ? 'Dashboard' : 'Dispatcher'}</Button>
            <Button variant="secondary" size="sm" onClick={() => window.close()}>Close Window</Button>
          </div>
        </div>

        <div className="position-relative" style={{ height: 'calc(100% - 56px)' }}>
          {showInfo ? <div className="position-absolute top-0 start-0 m-3 rounded-4 px-3 py-2" style={{ zIndex: 500, minWidth: 280, backgroundColor: 'rgba(15, 19, 32, 0.92)', border: '1px solid rgba(255,255,255,0.12)', color: '#f8fafc' }}>
              <div className="small text-uppercase" style={{ color: '#94a3b8' }}>{selectedRoute?.name || (selectedDriver ? `Driver ${selectedDriver.name}` : 'Current selection')}</div>
              <div className="fw-semibold">{activeInfoTrip?.rider || 'Select trips, route, or driver in the main screen'}</div>
              <div className="small mt-1">{activeInfoTrip ? `${activeInfoTrip.pickup} • ${activeInfoTrip.address || 'No pickup address'}` : 'This screen follows the same local dispatch state.'}</div>
              <div className="small mt-1" style={{ color: '#cbd5e1' }}>{activeInfoTrip ? `${activeInfoTrip.dropoff} • ${activeInfoTrip.destination || 'No dropoff address'}` : 'Open this on another monitor and keep working in Dispatcher or Trip Dashboard.'}</div>
              <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                <Badge bg="info">{selectedTrips.length || routeTrips.length} active trips</Badge>
                {selectedDriver ? <Badge bg={selectedDriver.live === 'Online' ? 'success' : 'dark'}>{selectedDriver.name}</Badge> : null}
              </div>
            </div> : null}

          {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <div className="position-absolute bottom-0 start-0 m-3 bg-dark text-white border rounded shadow-sm p-3" style={{ zIndex: 500, minWidth: 260, borderColor: '#2a3144' }}>
              <div className="small text-uppercase text-secondary">Driver ETA</div>
              <div className="fw-semibold">{selectedDriver.name}</div>
              <div className="small mt-1">Heading to {selectedDriverActiveTrip.rideId || selectedDriverActiveTrip.id} • {selectedDriverActiveTrip.rider}</div>
              <div className="small text-secondary">{selectedDriverActiveTrip.pickup} • {selectedDriverActiveTrip.address}</div>
              <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                <Badge bg="info">{selectedDriverEta?.label || 'ETA unavailable'}</Badge>
                <Badge bg="secondary">{selectedDriverEta?.miles != null ? `${selectedDriverEta.miles.toFixed(1)} mi` : 'No distance'}</Badge>
              </div>
            </div> : null}

          {!hasMapSelection ? <div className="position-absolute top-50 start-50 translate-middle rounded-4 px-4 py-3 text-center" style={{ zIndex: 550, width: 'min(92vw, 420px)', backgroundColor: 'rgba(15, 19, 32, 0.9)', border: '1px solid rgba(255,255,255,0.12)', color: '#f8fafc' }}>
              <div className="fw-semibold">Map ready for second screen</div>
              <div className="small mt-2" style={{ color: '#cbd5e1' }}>Select trips, a route, or a driver in the main workspace and this window will follow the same local state automatically.</div>
            </div> : null}

          <MapContainer center={mapCenter} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
            <ZoomControl position="bottomleft" />
            {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#2563eb', weight: 4 }} /> : null}
            {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
            {drivers.filter(driver => Array.isArray(driver.position) && driver.position.length === 2).map(driver => <Marker key={driver.id} position={driver.position} icon={createDriverMapIcon({ isSelected: driver.id === selectedDriverId, isOnline: driver.live === 'Online' })}>
                <Popup>
                  <div className="fw-semibold">{driver.name}</div>
                  <div>{driver.vehicle || 'Vehicle pending'}</div>
                  <div>{driver.live}</div>
                </Popup>
              </Marker>)}
            {routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                <Popup>
                  <div className="fw-semibold">{stop.title}</div>
                  <div>{stop.detail}</div>
                </Popup>
              </Marker>)}
            {selectedTrips.map(trip => <CircleMarker key={trip.id} center={trip.position} radius={10} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9 }} eventHandlers={{
            click: () => toggleTripSelection(trip.id)
          }}>
                <Popup>{`${trip.rideId || trip.brokerTripId || trip.id} | ${trip.rider} | ${trip.pickup}`}</Popup>
              </CircleMarker>)}
          </MapContainer>
        </div>
      </div>
    </div>;
};

export default StandaloneDispatchMapScreen;