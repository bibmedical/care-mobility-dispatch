'use client';

import { latLngBounds } from 'leaflet';
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, Form } from 'react-bootstrap';
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';

const ORLANDO_CENTER = [28.5383, -81.3792];

const formatMs = value => Number.isFinite(value) ? `${Math.round(value)} ms` : '-';

const MapViewportController = ({ points = [], route = [] }) => {
  const map = useMap();

  useEffect(() => {
    const allPoints = [
      ...(Array.isArray(points) ? points : []),
      ...(Array.isArray(route) ? route : [])
    ].filter(point => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));

    if (allPoints.length === 0) return;
    if (allPoints.length === 1) {
      map.setView(allPoints[0], 14, { animate: false });
      return;
    }

    map.fitBounds(latLngBounds(allPoints), { padding: [30, 30], animate: false });
  }, [map, points, route]);

  return null;
};

const geocodeAddress = async query => {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: 'GET'
  });
  if (!response.ok) {
    throw new Error(`Geocode failed (${response.status})`);
  }

  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) return null;

  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    position: [latitude, longitude],
    label: String(first.display_name || '').trim() || query
  };
};

const readRoute = async (from, to) => {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, {
    method: 'GET'
  });
  if (!response.ok) {
    throw new Error(`Route failed (${response.status})`);
  }

  const payload = await response.json();
  const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
  const coordinates = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates : [];
  const geometry = coordinates.map(item => [Number(item[1]), Number(item[0])]).filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));

  return {
    provider: 'osrm-public',
    geometry,
    distanceMiles: Number.isFinite(route?.distance) ? Number(route.distance) / 1609.344 : null,
    durationMinutes: Number.isFinite(route?.duration) ? Number(route.duration) / 60 : null
  };
};

const MapLabWorkspace = () => {
  const [origin, setOrigin] = useState('4413 Ring Neck Rd, Orlando, FL');
  const [destination, setDestination] = useState('4307 East Colonial Drive, Orlando, FL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originPoint, setOriginPoint] = useState(null);
  const [destinationPoint, setDestinationPoint] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [metrics, setMetrics] = useState({
    geocodeMs: null,
    routeMs: null,
    totalMs: null,
    provider: '-'
  });

  const mapPoints = useMemo(() => [originPoint?.position, destinationPoint?.position].filter(Boolean), [originPoint, destinationPoint]);

  const handleSearch = async () => {
    const cleanOrigin = String(origin || '').trim();
    const cleanDestination = String(destination || '').trim();

    if (!cleanOrigin) {
      setError('Write at least an origin address.');
      return;
    }

    setLoading(true);
    setError('');
    setRoutePath([]);
    setMetrics({ geocodeMs: null, routeMs: null, totalMs: null, provider: '-' });

    const totalStart = performance.now();
    try {
      const geocodeStart = performance.now();
      const foundOrigin = await geocodeAddress(cleanOrigin);
      const foundDestination = cleanDestination ? await geocodeAddress(cleanDestination) : null;
      const geocodeMs = performance.now() - geocodeStart;

      if (!foundOrigin) {
        setOriginPoint(null);
        setDestinationPoint(null);
        setMetrics({ geocodeMs, routeMs: null, totalMs: performance.now() - totalStart, provider: '-' });
        setError('Origin address was not found.');
        return;
      }

      setOriginPoint(foundOrigin);
      setDestinationPoint(foundDestination);

      if (!foundDestination) {
        setMetrics({
          geocodeMs,
          routeMs: null,
          totalMs: performance.now() - totalStart,
          provider: 'geocode-only'
        });
        return;
      }

      const routeStart = performance.now();
      const routeResult = await readRoute(foundOrigin.position, foundDestination.position);
      const routeMs = performance.now() - routeStart;

      setRoutePath(routeResult.geometry.length > 1 ? routeResult.geometry : []);
      setMetrics({
        geocodeMs,
        routeMs,
        totalMs: performance.now() - totalStart,
        provider: routeResult.provider,
        distanceMiles: routeResult.distanceMiles,
        durationMinutes: routeResult.durationMinutes
      });
    } catch (requestError) {
      setRoutePath([]);
      setError(String(requestError?.message || requestError));
      setMetrics(current => ({
        ...current,
        totalMs: performance.now() - totalStart
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3" style={{ height: '100dvh', backgroundColor: '#f3f4f6' }}>
      <Card className="h-100" style={{ borderRadius: 12 }}>
        <CardBody className="d-flex flex-column gap-3" style={{ minHeight: 0 }}>
          <div>
            <div className="fw-bold" style={{ fontSize: '1.05rem' }}>Map Speed Lab (isolated)</div>
            <div className="text-muted small">Standalone map test using public geocode and route providers.</div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <Form.Control value={origin} onChange={event => setOrigin(event.target.value)} placeholder="Origin address" style={{ maxWidth: 420 }} />
            <Form.Control value={destination} onChange={event => setDestination(event.target.value)} placeholder="Destination address (optional)" style={{ maxWidth: 420 }} />
            <Button onClick={handleSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
          </div>

          <div className="d-flex gap-3 flex-wrap small">
            <span>Geocode: <strong>{formatMs(metrics.geocodeMs)}</strong></span>
            <span>Route: <strong>{formatMs(metrics.routeMs)}</strong></span>
            <span>Total: <strong>{formatMs(metrics.totalMs)}</strong></span>
            <span>Provider: <strong>{metrics.provider || '-'}</strong></span>
            <span>Miles: <strong>{Number.isFinite(metrics.distanceMiles) ? metrics.distanceMiles.toFixed(1) : '-'}</strong></span>
            <span>ETA: <strong>{Number.isFinite(metrics.durationMinutes) ? `${Math.round(metrics.durationMinutes)} min` : '-'}</strong></span>
          </div>

          {error ? <div className="small" style={{ color: '#b91c1c' }}>{error}</div> : null}

          <div style={{ flex: 1, minHeight: 320, borderRadius: 10, overflow: 'hidden', border: '1px solid #d1d5db' }}>
            <MapContainer center={ORLANDO_CENTER} zoom={10} style={{ height: '100%', width: '100%' }}>
              <MapViewportController points={mapPoints} route={routePath} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              {routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: '#2563eb', weight: 4 }} /> : null}
              {originPoint?.position ? <CircleMarker center={originPoint.position} radius={8} pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.9 }} /> : null}
              {destinationPoint?.position ? <CircleMarker center={destinationPoint.position} radius={8} pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9 }} /> : null}
            </MapContainer>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default MapLabWorkspace;
