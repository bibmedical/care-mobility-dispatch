'use client';

import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Form, Spinner } from 'react-bootstrap';
import { CircleMarker, MapContainer, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';

const DEFAULT_CENTER = [28.5383, -81.3792];
const DEFAULT_ZOOM = 10;
const RESULT_ZOOM = 16;

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

const MapScreenWorkspace = () => {
  const [originQuery, setOriginQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [originResult, setOriginResult] = useState(null);
  const [destinationResult, setDestinationResult] = useState(null);
  const [mapProviderPreference, setMapProviderPreference] = useState('auto');

  const mapTileConfig = useMemo(() => getMapTileConfig(mapProviderPreference), [mapProviderPreference]);
  const mapPoints = useMemo(() => [originResult?.coordinates, destinationResult?.coordinates].filter(Boolean), [destinationResult?.coordinates, originResult?.coordinates]);

  const handleSearch = async event => {
    event.preventDefault();
    const trimmedOriginQuery = String(originQuery || '').trim();
    const trimmedDestinationQuery = String(destinationQuery || '').trim();

    if (!trimmedOriginQuery && !trimmedDestinationQuery) {
      setErrorMessage('Enter at least one address in origin or destination.');
      setOriginResult(null);
      setDestinationResult(null);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const [nextOriginResult, nextDestinationResult] = await Promise.all([
        trimmedOriginQuery ? searchAddress(trimmedOriginQuery) : Promise.resolve(null),
        trimmedDestinationQuery ? searchAddress(trimmedDestinationQuery) : Promise.resolve(null)
      ]);

      setOriginResult(nextOriginResult);
      setDestinationResult(nextDestinationResult);
    } catch (error) {
      setOriginResult(null);
      setDestinationResult(null);
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
    setErrorMessage('');
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
          <Form onSubmit={handleSearch} className="d-flex flex-column gap-3">
            <div>
              <div className="fw-semibold mb-1">Address search</div>
              <div className="small text-muted">Use two address fields for origin and destination, or fill only one if you just need a single location.</div>
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
                <option value="mapbox" disabled={!hasMapboxConfigured}>Map: Mapbox</option>
              </Form.Select>
              {originResult ? <Badge bg="success">Origin: {originResult.provider}</Badge> : null}
              {destinationResult ? <Badge bg="primary">Destination: {destinationResult.provider}</Badge> : null}
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
              </div> : null}
          </Form>
        </div>

        {!originResult && !destinationResult ? <div style={emptyHintStyle}>
            <div className="fw-semibold mb-1">Ready for second monitor</div>
            <div className="small">Search an address from dispatch and keep this map open as a dedicated location screen.</div>
          </div> : null}

        <div style={mapSurfaceStyle}>
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} scrollWheelZoom dragging doubleClickZoom touchZoom boxZoom keyboard preferCanvas style={{ height: '100%', width: '100%' }}>
            <ViewportController coordinatesList={mapPoints} zoom={mapPoints.length > 0 ? RESULT_ZOOM : DEFAULT_ZOOM} />
            <ZoomControl position="bottomright" />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} updateWhenZooming={false} />
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
            {originResult && destinationResult ? <Polyline positions={[originResult.coordinates, destinationResult.coordinates]} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.7, dashArray: '8 8' }} /> : null}
          </MapContainer>
        </div>
      </div>
    </div>;
};

export default MapScreenWorkspace;