'use client';

import PageTitle from '@/components/PageTitle';
import VehicleIconSelector from '@/components/VehicleIconSelector';
import { getFullName } from '@/helpers/nemt-admin-model';
import { isDriverRole } from '@/helpers/system-users';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Row, Spinner } from 'react-bootstrap';

const DEFAULT_GLOBAL_VEHICLE_ICON_PATH = '/assets/gpscars/car-01.svg';

const DEFAULT_GPS_SETTINGS = {
  mapRadiusMeters: 800,
  fgTimeIntervalMs: 5000,
  fgDistanceIntervalMeters: 8,
  bgTimeIntervalMs: 15000,
  bgDistanceIntervalMeters: 12,
  vehicleIconScalePercent: 100,
  vehicleIconSvgPath: ''
};

const clamp = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
};

const normalizeGpsSettings = value => {
  const settings = value && typeof value === 'object' ? value : {};
  const rawVehicleIconSvgPath = String(settings.vehicleIconSvgPath || '').trim();
  const normalizedVehicleIconSvgPath = rawVehicleIconSvgPath ? `/${rawVehicleIconSvgPath.replace(/^\/+/, '')}` : '';
  return {
    mapRadiusMeters: clamp(settings.mapRadiusMeters ?? DEFAULT_GPS_SETTINGS.mapRadiusMeters, 100, 5000),
    fgTimeIntervalMs: clamp(settings.fgTimeIntervalMs ?? DEFAULT_GPS_SETTINGS.fgTimeIntervalMs, 2000, 30000),
    fgDistanceIntervalMeters: clamp(settings.fgDistanceIntervalMeters ?? DEFAULT_GPS_SETTINGS.fgDistanceIntervalMeters, 3, 100),
    bgTimeIntervalMs: clamp(settings.bgTimeIntervalMs ?? DEFAULT_GPS_SETTINGS.bgTimeIntervalMs, 5000, 120000),
    bgDistanceIntervalMeters: clamp(settings.bgDistanceIntervalMeters ?? DEFAULT_GPS_SETTINGS.bgDistanceIntervalMeters, 5, 200),
    vehicleIconScalePercent: clamp(settings.vehicleIconScalePercent ?? DEFAULT_GPS_SETTINGS.vehicleIconScalePercent, 70, 200),
    vehicleIconSvgPath: normalizedVehicleIconSvgPath
  };
};

const GpsSettingsWorkspace = () => {
  const { data, loading, saving, error, refresh, saveData } = useNemtAdminApi();
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [gpsDrafts, setGpsDrafts] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [globalVehicleIconPath, setGlobalVehicleIconPath] = useState(DEFAULT_GLOBAL_VEHICLE_ICON_PATH);
  const [applyingGlobalIcon, setApplyingGlobalIcon] = useState(false);

  const drivers = useMemo(() => {
    const source = Array.isArray(data?.drivers) ? data.drivers : [];
    return source
      .filter(driver => isDriverRole(driver?.role))
      .map(driver => ({
        ...driver,
        displayName: getFullName(driver) || String(driver?.username || driver?.id || 'Driver').trim()
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [data?.drivers]);

  useEffect(() => {
    if (drivers.length === 0) {
      setSelectedDriverId('');
      setGpsDrafts({});
      return;
    }

    const nextDrafts = {};
    drivers.forEach(driver => {
      nextDrafts[driver.id] = normalizeGpsSettings(driver.gpsSettings);
    });
    setGpsDrafts(nextDrafts);

    if (!selectedDriverId || !drivers.some(driver => driver.id === selectedDriverId)) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [drivers, selectedDriverId]);

  const selectedDriver = drivers.find(driver => driver.id === selectedDriverId) || null;
  const selectedGpsSettings = selectedDriver ? gpsDrafts[selectedDriver.id] || normalizeGpsSettings(selectedDriver.gpsSettings) : normalizeGpsSettings({});

  useEffect(() => {
    const driverIconPaths = drivers
      .map(driver => normalizeGpsSettings(driver.gpsSettings).vehicleIconSvgPath)
      .filter(Boolean);

    if (driverIconPaths.length === 0) {
      setGlobalVehicleIconPath(DEFAULT_GLOBAL_VEHICLE_ICON_PATH);
      return;
    }

    const firstIconPath = driverIconPaths[0];
    setGlobalVehicleIconPath(driverIconPaths.every(iconPath => iconPath === firstIconPath) ? firstIconPath : DEFAULT_GLOBAL_VEHICLE_ICON_PATH);
  }, [drivers]);

  const updateNumericDraft = (field, value) => {
    if (!selectedDriver) return;
    setGpsDrafts(current => ({
      ...current,
      [selectedDriver.id]: {
        ...normalizeGpsSettings(current[selectedDriver.id]),
        [field]: Number(value)
      }
    }));
  };

  const updateTextDraft = (field, value) => {
    if (!selectedDriver) return;
    setGpsDrafts(current => ({
      ...current,
      [selectedDriver.id]: {
        ...normalizeGpsSettings(current[selectedDriver.id]),
        [field]: String(value || '')
      }
    }));
  };

  const handleSaveDriverSettings = async () => {
    if (!selectedDriver || !data) return;

    const nextGpsSettings = normalizeGpsSettings(gpsDrafts[selectedDriver.id]);
    const nextDrivers = (Array.isArray(data.drivers) ? data.drivers : []).map(driver => {
      if (driver.id !== selectedDriver.id) return driver;
      return {
        ...driver,
        gpsSettings: nextGpsSettings
      };
    });

    try {
      await saveData({
        ...data,
        drivers: nextDrivers
      });
      setStatusMessage(`GPS settings saved for ${selectedDriver.displayName}.`);
    } catch {
      setStatusMessage('Unable to save GPS settings.');
    }
  };

  const handleApplyVehicleIconToAllDrivers = async vehicleIconSvgPath => {
    if (!data) return;

    const normalizedPath = normalizeGpsSettings({ vehicleIconSvgPath }).vehicleIconSvgPath || DEFAULT_GLOBAL_VEHICLE_ICON_PATH;
    const nextDrivers = (Array.isArray(data.drivers) ? data.drivers : []).map(driver => {
      if (!isDriverRole(driver?.role)) return driver;
      return {
        ...driver,
        gpsSettings: {
          ...normalizeGpsSettings(driver.gpsSettings),
          vehicleIconSvgPath: normalizedPath
        }
      };
    });

    try {
      setApplyingGlobalIcon(true);
      await saveData({
        ...data,
        drivers: nextDrivers
      });
      setGlobalVehicleIconPath(normalizedPath);
      setGpsDrafts(current => {
        const nextDrafts = { ...current };
        nextDrivers.forEach(driver => {
          if (isDriverRole(driver?.role)) {
            nextDrafts[driver.id] = normalizeGpsSettings(driver.gpsSettings);
          }
        });
        return nextDrafts;
      });
      setStatusMessage('Vehicle icon applied to all drivers.');
    } catch {
      setStatusMessage('Unable to apply vehicle icon to all drivers.');
    } finally {
      setApplyingGlobalIcon(false);
    }
  };

  return (
    <>
      <PageTitle title="GPS Settings" subName="Settings" />

      <Row className="g-3">
        <Col lg={4} xl={3}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="mb-0">Drivers</h5>
                <Badge bg="dark">{drivers.length}</Badge>
              </div>
              <div className="small text-secondary mb-3">Select a driver and configure their GPS behavior.</div>

              {loading ? (
                <div className="py-4 text-secondary text-center"><Spinner animation="border" size="sm" className="me-2" />Loading drivers...</div>
              ) : (
                <div className="d-flex flex-column gap-2" style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {drivers.map(driver => (
                    <button
                      key={driver.id}
                      type="button"
                      className={`btn text-start ${driver.id === selectedDriverId ? 'btn-dark' : 'btn-outline-secondary'}`}
                      onClick={() => setSelectedDriverId(driver.id)}
                    >
                      <div className="fw-semibold">{driver.displayName}</div>
                      <div className="small opacity-75">{driver.username || driver.id}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col lg={8} xl={9}>
          <Card className="mb-3">
            <CardBody>
              <VehicleIconSelector
                value={globalVehicleIconPath}
                onChange={setGlobalVehicleIconPath}
                onApplyToAll={handleApplyVehicleIconToAllDrivers}
                applying={applyingGlobalIcon || saving}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                  <h5 className="mb-1">{selectedDriver ? selectedDriver.displayName : 'Choose a driver'}</h5>
                  <div className="small text-secondary">Configure map area and GPS sync speed per driver.</div>
                </div>
                <div className="d-flex gap-2">
                  <Button variant="outline-secondary" onClick={refresh} disabled={loading || saving}>Refresh</Button>
                  <Button variant="dark" onClick={handleSaveDriverSettings} disabled={!selectedDriver || saving}>{saving ? 'Saving...' : 'Save driver GPS settings'}</Button>
                </div>
              </div>

              {error ? <div className="alert alert-danger py-2">{error}</div> : null}
              {statusMessage ? <div className="alert alert-success py-2">{statusMessage}</div> : null}

              {!selectedDriver ? (
                <div className="text-secondary">No driver selected.</div>
              ) : (
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Label>GPS Area Radius (meters)</Form.Label>
                    <Form.Control
                      type="number"
                      min={100}
                      max={5000}
                      value={selectedGpsSettings.mapRadiusMeters}
                      onChange={event => updateNumericDraft('mapRadiusMeters', event.target.value)}
                    />
                    <div className="small text-secondary mt-1">Visible area around this driver on dispatch map.</div>
                  </Col>

                  <Col md={6}>
                    <Form.Label>Foreground GPS Time (ms)</Form.Label>
                    <Form.Control
                      type="number"
                      min={2000}
                      max={30000}
                      step={500}
                      value={selectedGpsSettings.fgTimeIntervalMs}
                      onChange={event => updateNumericDraft('fgTimeIntervalMs', event.target.value)}
                    />
                    <div className="small text-secondary mt-1">How often the app sends GPS while open.</div>
                  </Col>

                  <Col md={6}>
                    <Form.Label>Foreground GPS Distance (meters)</Form.Label>
                    <Form.Control
                      type="number"
                      min={3}
                      max={100}
                      value={selectedGpsSettings.fgDistanceIntervalMeters}
                      onChange={event => updateNumericDraft('fgDistanceIntervalMeters', event.target.value)}
                    />
                    <div className="small text-secondary mt-1">Minimum movement before sending next GPS update.</div>
                  </Col>

                  <Col md={6}>
                    <Form.Label>Background GPS Time (ms)</Form.Label>
                    <Form.Control
                      type="number"
                      min={5000}
                      max={120000}
                      step={1000}
                      value={selectedGpsSettings.bgTimeIntervalMs}
                      onChange={event => updateNumericDraft('bgTimeIntervalMs', event.target.value)}
                    />
                    <div className="small text-secondary mt-1">How often GPS sync runs with app in background.</div>
                  </Col>

                  <Col md={6}>
                    <Form.Label>Background GPS Distance (meters)</Form.Label>
                    <Form.Control
                      type="number"
                      min={5}
                      max={200}
                      value={selectedGpsSettings.bgDistanceIntervalMeters}
                      onChange={event => updateNumericDraft('bgDistanceIntervalMeters', event.target.value)}
                    />
                    <div className="small text-secondary mt-1">Minimum movement required in background mode.</div>
                  </Col>

                  <Col md={6}>
                    <Form.Label>Vehicle Icon Size (%)</Form.Label>
                    <Form.Control
                      type="number"
                      min={70}
                      max={200}
                      step={5}
                      value={selectedGpsSettings.vehicleIconScalePercent}
                      onChange={event => updateNumericDraft('vehicleIconScalePercent', event.target.value)}
                    />
                    <div className="small text-secondary mt-1">Per-driver map car size. 100 = default.</div>
                  </Col>

                  <Col md={12}>
                    <VehicleIconSelector
                      value={selectedGpsSettings.vehicleIconSvgPath || DEFAULT_GLOBAL_VEHICLE_ICON_PATH}
                      onChange={vehicleIconSvgPath => updateTextDraft('vehicleIconSvgPath', vehicleIconSvgPath)}
                      showApplyButton={false}
                    />
                  </Col>
                </Row>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default GpsSettingsWorkspace;
