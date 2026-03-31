'use client';

import { getCurrentRosterWeekKey, getDocumentAlerts, getFullName, getUpcomingDocumentExpirations, isDriverOnActiveRoster, normalizeRouteRoster } from '@/helpers/nemt-admin-model';
import { isDriverRole } from '@/helpers/system-users';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import { useLayoutContext } from '@/context/useLayoutContext';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import * as XLSX from 'xlsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';

const buildShellStyles = isLight => ({
  windowHeader: { backgroundColor: isLight ? '#2b3f60' : '#23324a' },
  body: { backgroundColor: isLight ? '#ffffff' : '#171b27' },
  toolbarButton: { backgroundColor: isLight ? '#f3f7fc' : '#101521', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#e6ecff' },
  primaryButton: { backgroundColor: '#8dc63f', borderColor: '#8dc63f', color: '#08131a' },
  activePill: { backgroundColor: '#1565c0', borderColor: '#1565c0', color: '#ffffff' },
  dangerButton: { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' },
  tableShell: { borderColor: isLight ? '#d5deea' : '#2a3144', backgroundColor: isLight ? '#ffffff' : '#171b27' },
  tableHead: { backgroundColor: '#8dc63f', color: '#08131a' },
  tableHeadCell: { backgroundColor: '#8dc63f', color: '#08131a', borderColor: 'rgba(8,19,26,0.14)' },
  cardShell: { backgroundColor: isLight ? '#f8fbff' : '#101521', border: `1px solid ${isLight ? '#c8d4e6' : '#2a3144'}`, color: isLight ? '#0f172a' : '#e6ecff', borderRadius: 16 },
  input: { backgroundColor: isLight ? '#f8fbff' : '#0c111b', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#e6ecff' },
  modalContent: { backgroundColor: isLight ? '#ffffff' : '#171b27', color: isLight ? '#0f172a' : '#e6ecff', borderColor: isLight ? '#c8d4e6' : '#2a3144' },
  modalHeader: { backgroundColor: isLight ? '#2b3f60' : '#23324a', borderColor: isLight ? '#c8d4e6' : '#2a3144' },
  rowBackground: {
    selected: isLight ? '#e8f2ff' : '#202c42',
    default: isLight ? '#ffffff' : '#171b27'
  },
  rowTextColor: isLight ? '#0f172a' : '#e6ecff'
});

const defaultState = {
  drivers: [],
  attendants: [],
  vehicles: [],
  groupings: []
};

const getDriverName = driver => getFullName(driver) || driver?.displayName || driver?.username || 'Unnamed driver';
const slugifyFileName = value => String(value || 'driver-grouping').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'driver-grouping';

const downloadTextFile = (fileName, contents, mimeType) => {
  const blob = new Blob([contents], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const downloadBinaryFile = (fileName, contents, mimeType) => {
  const blob = new Blob([contents], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const getRosterLabel = mode => {
  if (mode === 'permanent') return 'Permanent';
  if (mode === 'weekly') return 'Weekly';
  return 'Off';
};

const toInputTimeValue = value => {
  const normalizedValue = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(normalizedValue)) return normalizedValue;
  const match = normalizedValue.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '00:00';
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'AM') {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }
  return `${String(hours).padStart(2, '0')}:${minutes}`;
};

const fromInputTimeValue = value => {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return value;
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${meridiem}`;
};

const BillingGroupingWorkspace = ({ title = 'Driver Grouping' }) => {
  const { themeMode } = useLayoutContext();
  const shellStyles = useMemo(() => buildShellStyles(themeMode === 'light'), [themeMode]);
  const { data, loading, saving, error, refresh, saveData } = useNemtAdminApi();
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [driverToAssign, setDriverToAssign] = useState('');
  const [search, setSearch] = useState('');
  const [rosterView, setRosterView] = useState('today');
  const [message, setMessage] = useState('Configura aqui el roster semanal o permanente que aparece activo en Dispatcher y Trip Dashboard.');
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const currentWeekKey = getCurrentRosterWeekKey();
  const currentDateLabel = new Date().toLocaleDateString('en-US');

  const state = useMemo(() => ({
    drivers: data?.drivers ?? defaultState.drivers,
    attendants: data?.attendants ?? defaultState.attendants,
    vehicles: data?.vehicles ?? defaultState.vehicles,
    groupings: data?.groupings ?? defaultState.groupings
  }), [data]);

  const rosterDrivers = useMemo(() => state.drivers.filter(driver => isDriverRole(driver.role)), [state.drivers]);
  const atdOptions = useMemo(() => ['none', ...new Set(state.groupings.map(grouping => grouping.atd).filter(Boolean))], [state.groupings]);
  const activeRosterDrivers = useMemo(() => rosterDrivers.filter(driver => isDriverOnActiveRoster(driver)), [rosterDrivers]);
  const upcomingExpirations = useMemo(() => getUpcomingDocumentExpirations(activeRosterDrivers, 7), [activeRosterDrivers]);

  const filteredRosterDrivers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rosterDrivers.filter(driver => {
      const routeRoster = normalizeRouteRoster(driver.routeRoster, driver);
      const matchesView = rosterView === 'today' ? isDriverOnActiveRoster(driver) : rosterView === 'all' ? routeRoster.mode !== 'off' : rosterView === 'weekly' ? routeRoster.mode === 'permanent' || routeRoster.mode === 'weekly' && routeRoster.weekKey === currentWeekKey : routeRoster.mode === rosterView && (routeRoster.mode !== 'weekly' || routeRoster.weekKey === currentWeekKey);
      if (!matchesView) return false;
      if (!term) return true;
      const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
      return [getDriverName(driver), driver.username, driver.phone, vehicle?.label, vehicle?.unitNumber, routeRoster.atd].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [currentWeekKey, rosterDrivers, rosterView, search, state.vehicles]);

  const availableDrivers = useMemo(() => rosterDrivers.filter(driver => !isDriverOnActiveRoster(driver)).sort((left, right) => getDriverName(left).localeCompare(getDriverName(right))), [rosterDrivers]);

  const selectedDriver = useMemo(() => rosterDrivers.find(driver => driver.id === selectedDriverId) ?? filteredRosterDrivers[0] ?? null, [filteredRosterDrivers, rosterDrivers, selectedDriverId]);

  const summary = useMemo(() => ({
    weeklyDrivers: rosterDrivers.filter(driver => {
      const routeRoster = normalizeRouteRoster(driver.routeRoster, driver);
      return routeRoster.mode === 'weekly' && routeRoster.weekKey === currentWeekKey;
    }).length,
    permanentDrivers: rosterDrivers.filter(driver => normalizeRouteRoster(driver.routeRoster, driver).mode === 'permanent').length,
    expiringLicenses: upcomingExpirations.length,
    vehiclesCovered: new Set(activeRosterDrivers.map(driver => driver.vehicleId).filter(Boolean)).size
  }), [activeRosterDrivers, currentWeekKey, rosterDrivers, upcomingExpirations.length]);

  const exportRows = useMemo(() => filteredRosterDrivers.map((driver, index) => {
    const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
    const routeRoster = normalizeRouteRoster(driver.routeRoster, driver);
    return {
      '#': index + 1,
      Mode: getRosterLabel(routeRoster.mode),
      Week: routeRoster.mode === 'weekly' ? routeRoster.weekKey : 'Permanent',
      Driver: getDriverName(driver),
      Username: driver.username || '',
      Phone: driver.phone || '',
      Vehicle: vehicle?.label || 'No vehicle',
      VID: vehicle?.unitNumber || '',
      'Work Start': routeRoster.workStart,
      'Work End': routeRoster.workEnd,
      ATD: routeRoster.atd,
      License: driver.licenseNumber || '',
      'License Expiration': driver.licenseExpirationDate || ''
    };
  }), [filteredRosterDrivers, state.vehicles]);

  useEffect(() => {
    if (!selectedDriverId || filteredRosterDrivers.some(driver => driver.id === selectedDriverId)) return;
    setSelectedDriverId(filteredRosterDrivers[0]?.id ?? null);
  }, [filteredRosterDrivers, selectedDriverId]);

  useEffect(() => {
    if (upcomingExpirations.length > 0) {
      setShowExpiryModal(true);
    }
  }, [upcomingExpirations.length]);

  const persistDrivers = async (driverUpdater, nextMessage) => {
    const nextState = {
      ...state,
      drivers: state.drivers.map(driver => driverUpdater(driver))
    };
    await saveData(nextState);
    await refresh();
    setMessage(nextMessage);
  };

  const handleAssignDriver = async mode => {
    if (!driverToAssign) {
      setMessage('Selecciona un chofer para agregar al roster.');
      return;
    }

    const targetDriver = rosterDrivers.find(driver => driver.id === driverToAssign);
    if (!targetDriver) return;

    await persistDrivers(driver => driver.id === driverToAssign ? {
      ...driver,
      routeRoster: normalizeRouteRoster({
        ...driver.routeRoster,
        mode,
        weekKey: currentWeekKey
      }, driver)
    } : driver, `${getDriverName(targetDriver)} agregado como ${mode === 'permanent' ? 'permanente' : 'semanal'} al roster.`);
    setSelectedDriverId(driverToAssign);
    setDriverToAssign('');
  };

  const handleRosterChange = async (driverId, patch, successMessage) => {
    await persistDrivers(driver => driver.id === driverId ? {
      ...driver,
      routeRoster: normalizeRouteRoster({
        ...normalizeRouteRoster(driver.routeRoster, driver),
        ...patch
      }, driver)
    } : driver, successMessage);
  };

  const handleRemoveFromRoster = async driverId => {
    const targetDriver = rosterDrivers.find(driver => driver.id === driverId);
    await persistDrivers(driver => driver.id === driverId ? {
      ...driver,
      routeRoster: normalizeRouteRoster({ mode: 'off' }, driver)
    } : driver, `${getDriverName(targetDriver)} removido del roster activo.`);
  };

  const handleExportCsv = () => {
    if (exportRows.length === 0) {
      setMessage('No hay roster activo para exportar.');
      return;
    }
    try {
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      downloadTextFile(`${slugifyFileName(`route-roster-${rosterView}`)}.csv`, csv, 'text/csv;charset=utf-8;');
      setMessage('CSV del roster exportado.');
    } catch {
      setMessage('No se pudo exportar el CSV del roster.');
    }
  };

  const handleExportExcel = () => {
    if (exportRows.length === 0) {
      setMessage('No hay roster activo para exportar.');
      return;
    }
    try {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), 'Route Roster');
      const fileContents = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      downloadBinaryFile(`${slugifyFileName(`route-roster-${rosterView}`)}.xlsx`, fileContents, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setMessage('Excel del roster exportado.');
    } catch {
      setMessage('No se pudo exportar el Excel del roster.');
    }
  };

  return <>
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={shellStyles.windowHeader}>
          <strong>{title}</strong>
          <div className="small text-secondary-emphasis">Route roster</div>
        </div>
        <CardBody className="p-3" style={shellStyles.body}>
          <Row className="g-3 mb-3">
            {[{
              label: 'Weekly drivers',
              value: summary.weeklyDrivers,
              icon: 'iconoir:calendar'
            }, {
              label: 'Permanent drivers',
              value: summary.permanentDrivers,
              icon: 'iconoir:user-badge-check'
            }, {
              label: 'Licenses expiring',
              value: summary.expiringLicenses,
              icon: 'iconoir:warning-triangle'
            }, {
              label: 'Vehicles covered',
              value: summary.vehiclesCovered,
              icon: 'iconoir:truck'
            }].map(card => <Col md={6} xl={3} key={card.label}><div style={shellStyles.cardShell} className="p-3 h-100"><div className="d-flex align-items-center justify-content-between"><div><div className="text-secondary small text-uppercase">{card.label}</div><div className="fs-3 fw-semibold mt-2">{card.value}</div></div><IconifyIcon icon={card.icon} className="fs-1 text-success" /></div></div></Col>)}
          </Row>

          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={refresh} disabled={loading || saving}><IconifyIcon icon="iconoir:refresh-double" /></Button>
            <Button className="rounded-pill" style={rosterView === 'today' ? shellStyles.activePill : shellStyles.toolbarButton} onClick={() => setRosterView('today')}>Current Day - {currentDateLabel}</Button>
            <Button className="rounded-pill" style={rosterView === 'weekly' ? shellStyles.activePill : shellStyles.toolbarButton} onClick={() => setRosterView('weekly')}>Weekly</Button>
            <Button className="rounded-pill" style={rosterView === 'permanent' ? shellStyles.activePill : shellStyles.toolbarButton} onClick={() => setRosterView('permanent')}>Permanent</Button>
            <Button className="rounded-pill" style={rosterView === 'all' ? shellStyles.activePill : shellStyles.toolbarButton} onClick={() => setRosterView('all')}>All Active</Button>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={handleExportCsv} disabled={loading || saving}><IconifyIcon icon="iconoir:download" className="me-2" />Export CSV</Button>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={handleExportExcel} disabled={loading || saving}><IconifyIcon icon="iconoir:page" className="me-2" />Export Excel</Button>
            <div className="ms-auto d-flex gap-2 flex-wrap" style={{ minWidth: 320 }}>
              <Form.Select value={driverToAssign} onChange={event => setDriverToAssign(event.target.value)} style={shellStyles.input}>
                <option value="">Select driver</option>
                {availableDrivers.map(driver => {
                  const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
                  return <option key={driver.id} value={driver.id}>{getDriverName(driver)}{vehicle ? ` | ${vehicle.unitNumber || vehicle.label}` : ''}</option>;
                })}
              </Form.Select>
              <Button style={shellStyles.primaryButton} onClick={() => handleAssignDriver('weekly')} disabled={!driverToAssign || saving}>Add Weekly</Button>
              <Button style={shellStyles.toolbarButton} onClick={() => handleAssignDriver('permanent')} disabled={!driverToAssign || saving}>Make Permanent</Button>
            </div>
          </div>

          <div className="small text-secondary mb-3 d-flex align-items-center gap-2 flex-wrap">{saving ? <><Spinner animation="border" size="sm" /> Saving...</> : message}</div>
          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}

          <Row className="g-3">
            <Col xl={8}>
              <div className="border overflow-hidden rounded-3" style={shellStyles.tableShell}>
                <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom" style={{ borderColor: '#2a3144', backgroundColor: '#101521' }}>
                  <div className="small text-uppercase text-secondary">Active route roster</div>
                  <Form.Control value={search} onChange={event => setSearch(event.target.value)} placeholder="Search" style={{ ...shellStyles.input, maxWidth: 220 }} className="rounded-pill" />
                </div>
                <div className="table-responsive" style={{ maxHeight: 640 }}>
                  <Table className="align-middle mb-0 text-white">
                    <thead style={shellStyles.tableHead}>
                      <tr>
                        {['#', 'Driver Info', 'Vehicle Info', 'Work Hours', 'ATD', 'Roster', 'Ctrl'].map(column => <th key={column} className="fw-normal" style={shellStyles.tableHeadCell}>{column}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? <tr><td colSpan={7} className="text-center py-5 text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading route roster...</td></tr> : filteredRosterDrivers.length ? filteredRosterDrivers.map((driver, index) => {
                        const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
                        const routeRoster = normalizeRouteRoster(driver.routeRoster, driver);
                        const driverAlerts = getDocumentAlerts(driver);
                        const licenseAlert = driverAlerts.find(alert => alert.text.toLowerCase().includes('driver license'));
                        return <tr key={driver.id} onClick={() => setSelectedDriverId(driver.id)} style={{ cursor: 'pointer', backgroundColor: selectedDriver?.id === driver.id ? shellStyles.rowBackground.selected : shellStyles.rowBackground.default, color: shellStyles.rowTextColor }}>
                              <td>{index + 1}</td>
                              <td>
                                <div className="fw-semibold">{getDriverName(driver)}</div>
                                <div className="small text-secondary">Username: {driver.username || 'No username'}</div>
                                <div className="small text-secondary">DL: {driver.licenseNumber || 'No license'}</div>
                                {licenseAlert ? <div className="small text-warning mt-1">{licenseAlert.text}</div> : null}
                              </td>
                              <td>
                                <div>{vehicle?.label || 'No vehicle'}</div>
                                <div className="small text-secondary">VID: {vehicle?.unitNumber || '--'}</div>
                                <div className="small text-secondary">Type: {vehicle?.type || '--'}</div>
                              </td>
                              <td>
                                <div className="d-flex gap-2 align-items-center mb-2">
                                  <span className="small text-secondary">Start:</span>
                                  <Form.Control type="time" size="sm" value={toInputTimeValue(routeRoster.workStart)} onChange={event => handleRosterChange(driver.id, { workStart: fromInputTimeValue(event.target.value) }, 'Horario inicial actualizado.')} style={{ ...shellStyles.input, width: 120 }} />
                                </div>
                                <div className="d-flex gap-2 align-items-center">
                                  <span className="small text-secondary">End:</span>
                                  <Form.Control type="time" size="sm" value={toInputTimeValue(routeRoster.workEnd)} onChange={event => handleRosterChange(driver.id, { workEnd: fromInputTimeValue(event.target.value) }, 'Horario final actualizado.')} style={{ ...shellStyles.input, width: 120 }} />
                                </div>
                              </td>
                              <td>
                                <Form.Select size="sm" value={routeRoster.atd} onChange={event => handleRosterChange(driver.id, { atd: event.target.value }, 'ATD actualizado.')} style={shellStyles.input}>
                                  {atdOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                </Form.Select>
                              </td>
                              <td>
                                <Form.Select size="sm" value={routeRoster.mode} onChange={event => handleRosterChange(driver.id, { mode: event.target.value, weekKey: currentWeekKey }, 'Tipo de roster actualizado.')} style={shellStyles.input}>
                                  <option value="weekly">Weekly</option>
                                  <option value="permanent">Permanent</option>
                                </Form.Select>
                                <div className="small text-secondary mt-1">{routeRoster.mode === 'weekly' ? routeRoster.weekKey : 'Never remove'}</div>
                              </td>
                              <td>
                                <Button size="sm" style={shellStyles.dangerButton} onClick={event => {
                              event.stopPropagation();
                              handleRemoveFromRoster(driver.id);
                            }}>Ungroup</Button>
                              </td>
                            </tr>;
                      }) : <tr><td colSpan={7} className="text-center py-5 text-secondary">No hay choferes en este roster. Agrega Weekly o Permanent para que aparezcan activos en dispatch.</td></tr>}
                    </tbody>
                  </Table>
                </div>
              </div>
            </Col>

            <Col xl={4}>
              <div style={shellStyles.cardShell} className="p-3 h-100">
                {selectedDriver ? <>
                    <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                      <div>
                        <div className="text-uppercase small text-secondary">Selected driver</div>
                        <div className="fs-4 fw-semibold">{getDriverName(selectedDriver)}</div>
                        <div className="small text-secondary mt-1">{selectedDriver.username || selectedDriver.email || 'No login'}</div>
                      </div>
                      <Badge bg={normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).mode === 'permanent' ? 'primary' : 'success'}>{getRosterLabel(normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).mode)}</Badge>
                    </div>

                    <Row className="g-3 mb-3">
                      <Col sm={6}><div className="small text-secondary text-uppercase">Phone</div><div>{selectedDriver.phone || 'Not set'}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">License Exp.</div><div>{selectedDriver.licenseExpirationDate || 'Not set'}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">Work Start</div><div>{normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).workStart}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">Work End</div><div>{normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).workEnd}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">ATD</div><div>{normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).atd}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">Week</div><div>{normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).mode === 'weekly' ? normalizeRouteRoster(selectedDriver.routeRoster, selectedDriver).weekKey : 'Permanent'}</div></Col>
                    </Row>

                    <div className="border rounded-3 p-3" style={{ borderColor: '#2a3144', backgroundColor: '#0c111b' }}>
                      <div className="small text-secondary text-uppercase mb-2">Compliance alerts</div>
                      <div className="d-flex flex-column gap-2">
                        {getDocumentAlerts(selectedDriver).length > 0 ? getDocumentAlerts(selectedDriver).slice(0, 5).map(alert => <div key={alert.text} className="small d-flex align-items-start gap-2"><Badge bg={alert.severity === 'danger' ? 'danger' : 'warning'}>{alert.severity}</Badge><span>{alert.text}</span></div>) : <div className="small text-secondary">No compliance alerts for this driver.</div>}
                      </div>
                    </div>
                  </> : <div className="h-100 d-flex flex-column justify-content-center align-items-center text-center text-secondary"><IconifyIcon icon="iconoir:user-badge-check" className="fs-1 mb-3 text-success" /><div className="fw-semibold text-white mb-2">No driver selected</div><div>Selecciona un chofer del roster para ver horarios, ATD y alertas de licencia.</div></div>}
              </div>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Modal show={showExpiryModal && upcomingExpirations.length > 0} onHide={() => setShowExpiryModal(false)} centered>
        <Modal.Header closeButton style={shellStyles.modalHeader} className="text-white">
          <Modal.Title>Important Notifications</Modal.Title>
        </Modal.Header>
        <Modal.Body style={shellStyles.modalContent}>
          <div className="fw-semibold fs-5 mb-3" style={{ color: '#ffb84d' }}>Upcoming Expirations (Next 7 Days)</div>
          <div className="fw-semibold mb-2">Documents ({upcomingExpirations.length}):</div>
          <ul className="mb-0">
            {upcomingExpirations.map(item => <li key={`${item.driverId}-${item.documentLabel}`}>{item.documentLabel}: {item.driverName} (DL: {item.licenseNumber}) - Expires {item.expirationDate}</li>)}
          </ul>
          <div className="mt-4 small text-secondary border-top pt-3" style={{ borderColor: '#2a3144' }}>You can update these records by navigating to Drivers or Vehicles menu.</div>
        </Modal.Body>
        <Modal.Footer style={shellStyles.modalHeader}>
          <Button style={shellStyles.activePill} onClick={() => setShowExpiryModal(false)}>Ok</Button>
        </Modal.Footer>
      </Modal>
    </>;
};

export default BillingGroupingWorkspace;