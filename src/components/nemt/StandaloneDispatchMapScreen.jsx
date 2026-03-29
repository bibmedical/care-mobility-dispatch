'use client';

import { useNemtContext } from '@/context/useNemtContext';
import { getMapTileConfig } from '@/utils/map-tiles';
import { divIcon } from 'leaflet';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';

const DEFAULT_CENTER = [28.5383, -81.3792];

const formatDriveMinutes = minutes => {
  if (!Number.isFinite(minutes)) return 'Time unavailable';
  const roundedMinutes = Math.max(1, Math.round(minutes));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const createRouteStopIcon = label => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:32px;height:32px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#0f766e;border:2px solid #ffffff;box-shadow:0 8px 20px rgba(15,23,42,0.24);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

const MapViewportController = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(points) || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 11, {
        animate: true
      });
      return;
    }
    map.fitBounds(points, {
      animate: true,
      padding: [48, 48]
    });
  }, [map, points]);

  return null;
};

const findLocation = async query => {
  const response = await fetch(`/api/maps/search?q=${encodeURIComponent(query)}`, {
    cache: 'no-store'
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Location not found.');
  }
  return payload;
};

const findRoute = async coordinates => {
  const coordinateQuery = coordinates.map(([latitude, longitude]) => `${latitude},${longitude}`).join(';');
  const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinateQuery)}`, {
    cache: 'no-store'
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to calculate route.');
  }
  return payload;
};

const StandaloneDispatchMapScreen = () => {
  const { uiPreferences } = useNemtContext();
  const [originQuery, setOriginQuery] = useState('32808');
  const [destinationQuery, setDestinationQuery] = useState('32822');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [originResult, setOriginResult] = useState(null);
  const [destinationResult, setDestinationResult] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);

  const mapPoints = useMemo(() => {
    const points = [];
    if (originResult?.coordinates) points.push(originResult.coordinates);
    if (destinationResult?.coordinates) points.push(destinationResult.coordinates);
    return points.length > 0 ? points : [DEFAULT_CENTER];
  }, [destinationResult, originResult]);

  const handleLookupRoute = async event => {
    event?.preventDefault();
    const originValue = originQuery.trim();
    const destinationValue = destinationQuery.trim();

    if (!originValue || !destinationValue) {
      setErrorMessage('Write the origin and destination first.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const [nextOrigin, nextDestination] = await Promise.all([findLocation(originValue), findLocation(destinationValue)]);
      const nextRoute = await findRoute([nextOrigin.coordinates, nextDestination.coordinates]);
      setOriginResult(nextOrigin);
      setDestinationResult(nextDestination);
      setRouteGeometry(Array.isArray(nextRoute?.geometry) ? nextRoute.geometry : []);
      setRouteMetrics({
        distanceMiles: Number.isFinite(nextRoute?.distanceMiles) ? nextRoute.distanceMiles : null,
        durationMinutes: Number.isFinite(nextRoute?.durationMinutes) ? nextRoute.durationMinutes : null,
        isFallback: Boolean(nextRoute?.isFallback)
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to calculate route.');
      setRouteGeometry([]);
      setRouteMetrics(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setOriginQuery('');
    setDestinationQuery('');
    setOriginResult(null);
    setDestinationResult(null);
    setRouteGeometry([]);
    setRouteMetrics(null);
    setErrorMessage('');
  };

  return <div style={{ height: '100vh', padding: 0, background: '#eff3ea' }}>
      <div className="h-100" style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)' }}>
        <aside className="d-flex flex-column" style={{ background: 'linear-gradient(180deg, #f7f3ec 0%, #f1eee6 100%)', borderRight: '1px solid rgba(15, 23, 42, 0.08)', padding: 24, gap: 18 }}>
          <div>
            <div className="text-uppercase fw-semibold small" style={{ color: '#0f766e', letterSpacing: '0.12em' }}>Route Finder</div>
            <h1 className="h3 mt-2 mb-2" style={{ color: '#18212f' }}>ZIP code, city or full address</h1>
            <p className="mb-0" style={{ color: '#5b6677', lineHeight: 1.6 }}>Write where you start and where you are going. The map will show the route, miles and estimated driving time.</p>
          </div>

          <Form onSubmit={handleLookupRoute} className="d-flex flex-column gap-3">
            <Form.Group>
              <Form.Label className="fw-semibold" style={{ color: '#18212f' }}>From</Form.Label>
              <Form.Control value={originQuery} onChange={event => setOriginQuery(event.target.value)} placeholder="Example: 32808 or Orlando, FL" style={{ borderRadius: 16, padding: '14px 16px', borderColor: 'rgba(15, 23, 42, 0.14)' }} />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold" style={{ color: '#18212f' }}>To</Form.Label>
              <Form.Control value={destinationQuery} onChange={event => setDestinationQuery(event.target.value)} placeholder="Example: 32822 or Kissimmee, FL" style={{ borderRadius: 16, padding: '14px 16px', borderColor: 'rgba(15, 23, 42, 0.14)' }} />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" disabled={isLoading} style={{ flex: 1, borderRadius: 16, border: 'none', background: '#0f766e', padding: '12px 16px' }}>
                {isLoading ? <span className="d-inline-flex align-items-center gap-2"><Spinner size="sm" /> Calculating...</span> : 'Calculate Route'}
              </Button>
              <Button type="button" variant="light" onClick={handleClear} style={{ borderRadius: 16, padding: '12px 16px', borderColor: 'rgba(15, 23, 42, 0.12)' }}>Clear</Button>
            </div>
          </Form>

          {errorMessage ? <Alert variant="danger" className="mb-0" style={{ borderRadius: 16 }}>{errorMessage}</Alert> : null}

          <div className="d-flex flex-column gap-3" style={{ marginTop: 4 }}>
            <div className="rounded-4" style={{ background: '#ffffff', padding: 18, border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div className="small text-uppercase fw-semibold" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Estimated Drive Time</div>
              <div className="mt-2 fw-bold" style={{ fontSize: 32, color: '#18212f', lineHeight: 1.1 }}>{routeMetrics ? formatDriveMinutes(routeMetrics.durationMinutes) : '--'}</div>
              <div className="small mt-2" style={{ color: '#667085' }}>{routeMetrics?.isFallback ? 'Showing a direct line because no driving route was available.' : 'Live route based on the current map provider.'}</div>
            </div>
            <div className="rounded-4" style={{ background: '#ffffff', padding: 18, border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div className="small text-uppercase fw-semibold" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Distance</div>
              <div className="mt-2 fw-bold" style={{ fontSize: 28, color: '#18212f', lineHeight: 1.1 }}>{routeMetrics?.distanceMiles != null ? `${routeMetrics.distanceMiles.toFixed(1)} mi` : '--'}</div>
            </div>
            <div className="rounded-4" style={{ background: '#ffffff', padding: 18, border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div className="small text-uppercase fw-semibold" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Points</div>
              <div className="mt-3 small" style={{ color: '#18212f', lineHeight: 1.6 }}>
                <div><strong>A:</strong> {originResult?.label || 'Waiting for origin'}</div>
                <div className="mt-2"><strong>B:</strong> {destinationResult?.label || 'Waiting for destination'}</div>
              </div>
            </div>
          </div>
        </aside>

        <div style={{ position: 'relative', minWidth: 0 }}>
          <MapContainer center={DEFAULT_CENTER} zoom={10} zoomControl={false} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <MapViewportController points={mapPoints} />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
            <ZoomControl position="bottomright" />
            {routeGeometry.length > 1 ? <Polyline positions={routeGeometry} pathOptions={{ color: '#0f766e', weight: 5 }} /> : null}
            {originResult?.coordinates ? <Marker position={originResult.coordinates} icon={createRouteStopIcon('A')} /> : null}
            {destinationResult?.coordinates ? <Marker position={destinationResult.coordinates} icon={createRouteStopIcon('B')} /> : null}
          </MapContainer>
        </div>
      </div>
    </div>;
};

export default StandaloneDispatchMapScreen;