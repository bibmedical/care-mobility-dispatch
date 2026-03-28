'use client';

import { createBlankGrouping, getFullName, validateGrouping } from '@/helpers/nemt-admin-model';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import * as XLSX from 'xlsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';

const shellStyles = {
  windowHeader: { backgroundColor: '#23324a' },
  body: { backgroundColor: '#171b27' },
  toolbarButton: { backgroundColor: '#101521', borderColor: '#2a3144', color: '#e6ecff' },
  primaryButton: { backgroundColor: '#8dc63f', borderColor: '#8dc63f', color: '#08131a' },
  dangerButton: { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' },
  tableShell: { borderColor: '#2a3144', backgroundColor: '#171b27' },
  tableHead: { backgroundColor: '#8dc63f', color: '#08131a' },
  tableHeadCell: { backgroundColor: '#8dc63f', color: '#08131a', borderColor: 'rgba(8,19,26,0.14)' },
  cardShell: { backgroundColor: '#101521', border: '1px solid #2a3144', color: '#e6ecff', borderRadius: 16 },
  input: { backgroundColor: '#0c111b', borderColor: '#2a3144', color: '#e6ecff' },
  modalContent: { backgroundColor: '#171b27', color: '#e6ecff', borderColor: '#2a3144' },
  modalHeader: { backgroundColor: '#23324a', borderColor: '#2a3144' }
};

const defaultState = {
  drivers: [],
  attendants: [],
  vehicles: [],
  groupings: []
};

const statusVariant = {
  Active: 'success',
  Attention: 'warning',
  Pending: 'secondary',
  Inactive: 'dark'
};

const normalizeGrouping = grouping => ({
  ...grouping,
  atd: grouping?.atd || '',
  workHours: grouping?.workHours || '',
  billingCode: grouping?.billingCode || ''
});

const getDriverName = driver => getFullName(driver) || driver?.displayName || driver?.username || 'Unnamed driver';
const slugifyFileName = value => String(value || 'billing-grouping').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'billing-grouping';

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

const BillingGroupingWorkspace = ({ title = 'Billing Grouping' }) => {
  const { data, loading, saving, error, refresh, saveData } = useNemtAdminApi();
  const [selectedGroupingId, setSelectedGroupingId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draftGrouping, setDraftGrouping] = useState(null);
  const [message, setMessage] = useState('Grouping para billing con persistencia en la API local.');
  const [validationErrors, setValidationErrors] = useState([]);
  const [driverToAssign, setDriverToAssign] = useState('');
  const [search, setSearch] = useState('');

  const state = useMemo(() => ({
    drivers: data?.drivers ?? defaultState.drivers,
    attendants: data?.attendants ?? defaultState.attendants,
    vehicles: data?.vehicles ?? defaultState.vehicles,
    groupings: (data?.groupings ?? defaultState.groupings).map(normalizeGrouping)
  }), [data]);

  const groupingRows = useMemo(() => state.groupings.map(grouping => {
    const groupedDrivers = state.drivers.filter(driver => driver.groupingId === grouping.id);
    const groupedVehicles = state.vehicles.filter(vehicle => groupedDrivers.some(driver => driver.vehicleId === vehicle.id));
    return {
      ...grouping,
      driverCount: groupedDrivers.length,
      driversLabel: groupedDrivers.map(getDriverName).join(', ') || 'No drivers',
      vehiclesLabel: groupedVehicles.map(vehicle => vehicle.unitNumber || vehicle.label).join(', ') || 'No vehicles',
      vehicleCount: groupedVehicles.length
    };
  }), [state.drivers, state.groupings, state.vehicles]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groupingRows;
    return groupingRows.filter(row => [row.name, row.atd, row.billingCode, row.driversLabel, row.vehiclesLabel, row.workHours, row.notes, row.status].join(' ').toLowerCase().includes(term));
  }, [groupingRows, search]);

  useEffect(() => {
    if (selectedGroupingId && state.groupings.some(grouping => grouping.id === selectedGroupingId)) return;
    setSelectedGroupingId(state.groupings[0]?.id ?? null);
  }, [selectedGroupingId, state.groupings]);

  const selectedGrouping = state.groupings.find(grouping => grouping.id === selectedGroupingId) ?? null;
  const selectedDrivers = useMemo(() => state.drivers.filter(driver => driver.groupingId === selectedGroupingId), [selectedGroupingId, state.drivers]);
  const availableDrivers = useMemo(() => state.drivers.filter(driver => driver.id !== '' && driver.groupingId !== selectedGroupingId).sort((left, right) => getDriverName(left).localeCompare(getDriverName(right))), [selectedGroupingId, state.drivers]);

  const summary = useMemo(() => ({
    groups: state.groupings.length,
    groupedDrivers: state.drivers.filter(driver => driver.groupingId).length,
    ungroupedDrivers: state.drivers.filter(driver => !driver.groupingId).length,
    vehiclesCovered: new Set(state.drivers.filter(driver => driver.groupingId).map(driver => driver.vehicleId).filter(Boolean)).size
  }), [state.drivers, state.groupings]);

  const exportRows = useMemo(() => {
    const targetGroupings = selectedGrouping ? [selectedGrouping] : state.groupings;

    return targetGroupings.flatMap(grouping => {
      const groupedDrivers = state.drivers.filter(driver => driver.groupingId === grouping.id);
      if (groupedDrivers.length === 0) {
        return [{
          grouping: grouping.name,
          atd: grouping.atd || '',
          workHours: grouping.workHours || '',
          billingCode: grouping.billingCode || '',
          dispatchTag: grouping.dispatchTag || '',
          groupingStatus: grouping.status || '',
          driver: '',
          username: '',
          phone: '',
          vehicle: '',
          unitNumber: '',
          driverStatus: '',
          notes: grouping.notes || grouping.description || ''
        }];
      }

      return groupedDrivers.map(driver => {
        const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
        return {
          grouping: grouping.name,
          atd: grouping.atd || '',
          workHours: grouping.workHours || '',
          billingCode: grouping.billingCode || '',
          dispatchTag: grouping.dispatchTag || '',
          groupingStatus: grouping.status || '',
          driver: getDriverName(driver),
          username: driver.username || '',
          phone: driver.phone || '',
          vehicle: vehicle?.label || '',
          unitNumber: vehicle?.unitNumber || '',
          driverStatus: driver.profileStatus || driver.live || '',
          notes: driver.notes || grouping.notes || grouping.description || ''
        };
      });
    });
  }, [selectedGrouping, state.drivers, state.groupings, state.vehicles]);

  const persistState = async nextState => {
    await saveData(nextState);
    await refresh();
  };

  const openCreate = () => {
    setDraftGrouping(createBlankGrouping());
    setValidationErrors([]);
    setShowEditor(true);
  };

  const openEdit = () => {
    if (!selectedGrouping) {
      setMessage('Selecciona un grouping primero.');
      return;
    }
    setDraftGrouping({ ...selectedGrouping });
    setValidationErrors([]);
    setShowEditor(true);
  };

  const handleSaveGrouping = async () => {
    if (!draftGrouping) return;
    const errors = validateGrouping(draftGrouping);
    setValidationErrors(errors);
    if (errors.length > 0) {
      setMessage(errors[0]);
      return;
    }

    const nextGroupings = state.groupings.some(grouping => grouping.id === draftGrouping.id) ? state.groupings.map(grouping => grouping.id === draftGrouping.id ? draftGrouping : grouping) : [draftGrouping, ...state.groupings];
    await persistState({ ...state, groupings: nextGroupings });
    setSelectedGroupingId(draftGrouping.id);
    setShowEditor(false);
    setDraftGrouping(null);
    setMessage('Grouping de billing guardado.');
  };

  const handleDeleteGrouping = async () => {
    if (!selectedGrouping) {
      setMessage('Selecciona un grouping para borrar.');
      return;
    }

    await persistState({
      ...state,
      groupings: state.groupings.filter(grouping => grouping.id !== selectedGrouping.id),
      drivers: state.drivers.map(driver => driver.groupingId === selectedGrouping.id ? { ...driver, groupingId: '' } : driver)
    });
    setSelectedGroupingId(null);
    setMessage('Grouping eliminado y choferes desagrupados.');
  };

  const handleAssignDriver = async () => {
    if (!selectedGrouping || !driverToAssign) {
      setMessage('Selecciona un grouping y un chofer para agregar.');
      return;
    }

    const targetDriver = state.drivers.find(driver => driver.id === driverToAssign);
    await persistState({
      ...state,
      drivers: state.drivers.map(driver => driver.id === driverToAssign ? { ...driver, groupingId: selectedGrouping.id } : driver)
    });
    setDriverToAssign('');
    setMessage(`${getDriverName(targetDriver)} ahora pertenece a ${selectedGrouping.name}.`);
  };

  const handleUngroupDriver = async driverId => {
    const targetDriver = state.drivers.find(driver => driver.id === driverId);
    await persistState({
      ...state,
      drivers: state.drivers.map(driver => driver.id === driverId ? { ...driver, groupingId: '' } : driver)
    });
    setMessage(`${getDriverName(targetDriver)} fue removido del grouping.`);
  };

  const handleUngroupAll = async () => {
    if (!selectedGrouping) return;
    await persistState({
      ...state,
      drivers: state.drivers.map(driver => driver.groupingId === selectedGrouping.id ? { ...driver, groupingId: '' } : driver)
    });
    setMessage(`Todos los choferes fueron removidos de ${selectedGrouping.name}.`);
  };

  const handleExportCsv = () => {
    if (exportRows.length === 0) {
      setMessage('No hay datos de grouping para exportar.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const fileName = `${slugifyFileName(selectedGrouping?.name || 'all-billing-groups')}.csv`;
    downloadTextFile(fileName, csv, 'text/csv;charset=utf-8;');
    setMessage(selectedGrouping ? `CSV exportado para ${selectedGrouping.name}.` : 'CSV exportado para todos los billing groups.');
  };

  const handleExportExcel = () => {
    if (exportRows.length === 0) {
      setMessage('No hay datos de grouping para exportar.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const summaryRows = (selectedGrouping ? [selectedGrouping] : state.groupings).map(grouping => {
      const groupedDrivers = state.drivers.filter(driver => driver.groupingId === grouping.id);
      const groupedVehicles = new Set(groupedDrivers.map(driver => driver.vehicleId).filter(Boolean));
      return {
        Grouping: grouping.name,
        ATD: grouping.atd || '',
        'Work Hours': grouping.workHours || '',
        'Billing Code': grouping.billingCode || '',
        'Dispatch Tag': grouping.dispatchTag || '',
        Status: grouping.status || '',
        Drivers: groupedDrivers.length,
        Vehicles: groupedVehicles.size,
        Notes: grouping.notes || grouping.description || ''
      };
    });

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Group Summary');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), 'Driver Detail');
    XLSX.writeFile(workbook, `${slugifyFileName(selectedGrouping?.name || 'all-billing-groups')}.xlsx`);
    setMessage(selectedGrouping ? `Excel exportado para ${selectedGrouping.name}.` : 'Excel exportado para todos los billing groups.');
  };

  return <>
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={shellStyles.windowHeader}>
          <strong>{title}</strong>
          <div className="small text-secondary-emphasis">Billing roster</div>
        </div>
        <CardBody className="p-3" style={shellStyles.body}>
          <Row className="g-3 mb-3">
            {[{
              label: 'Groups',
              value: summary.groups,
              icon: 'iconoir:group'
            }, {
              label: 'Grouped drivers',
              value: summary.groupedDrivers,
              icon: 'iconoir:user-badge-check'
            }, {
              label: 'Ungrouped drivers',
              value: summary.ungroupedDrivers,
              icon: 'iconoir:user-xmark'
            }, {
              label: 'Vehicles covered',
              value: summary.vehiclesCovered,
              icon: 'iconoir:truck'
            }].map(card => <Col md={6} xl={3} key={card.label}><div style={shellStyles.cardShell} className="p-3 h-100"><div className="d-flex align-items-center justify-content-between"><div><div className="text-secondary small text-uppercase">{card.label}</div><div className="fs-3 fw-semibold mt-2">{card.value}</div></div><IconifyIcon icon={card.icon} className="fs-1 text-success" /></div></div></Col>)}
          </Row>

          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={refresh} disabled={loading || saving}><IconifyIcon icon="iconoir:refresh-double" /></Button>
            <Button className="rounded-pill" style={shellStyles.primaryButton} onClick={openCreate}><IconifyIcon icon="iconoir:plus" className="me-2" />Add Group</Button>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={openEdit} disabled={!selectedGrouping}><IconifyIcon icon="iconoir:edit-pencil" className="me-2" />Edit</Button>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={handleExportCsv} disabled={loading || saving}><IconifyIcon icon="iconoir:download" className="me-2" />Export CSV</Button>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={handleExportExcel} disabled={loading || saving}><IconifyIcon icon="iconoir:page" className="me-2" />Export Excel</Button>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={handleUngroupAll} disabled={!selectedGrouping || selectedDrivers.length === 0}><IconifyIcon icon="iconoir:minus-circle" className="me-2" />Ungroup All</Button>
            <Button className="rounded-pill" style={shellStyles.dangerButton} onClick={handleDeleteGrouping} disabled={!selectedGrouping || saving}><IconifyIcon icon="iconoir:trash" className="me-2" />Delete</Button>
            <div className="ms-auto" style={{ minWidth: 280 }}>
              <Form.Control value={search} onChange={event => setSearch(event.target.value)} placeholder="Search billing groups" style={shellStyles.input} className="rounded-pill" />
            </div>
          </div>

          <div className="small text-secondary mb-3 d-flex align-items-center gap-2 flex-wrap">{saving ? <><Spinner animation="border" size="sm" /> Saving...</> : message}</div>
          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}

          <Row className="g-3">
            <Col xl={7}>
              <div className="border overflow-hidden rounded-3" style={shellStyles.tableShell}>
                <div className="table-responsive" style={{ maxHeight: 620 }}>
                  <Table className="align-middle mb-0 text-white">
                    <thead style={shellStyles.tableHead}>
                      <tr>
                        {['Group', 'ATD', 'Drivers', 'Vehicles', 'Work Hours', 'Status'].map(column => <th key={column} className="fw-normal" style={shellStyles.tableHeadCell}>{column}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? <tr><td colSpan={6} className="text-center py-5 text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading groupings...</td></tr> : filteredRows.length ? filteredRows.map(row => <tr key={row.id} onClick={() => setSelectedGroupingId(row.id)} style={{ cursor: 'pointer', backgroundColor: selectedGroupingId === row.id ? '#202c42' : '#171b27', color: '#e6ecff' }}><td><div className="fw-semibold">{row.name}</div><div className="small text-secondary">{row.billingCode || 'No billing code'}</div></td><td>{row.atd || 'Not set'}</td><td><div>{row.driverCount}</div><div className="small text-secondary text-truncate" style={{ maxWidth: 220 }}>{row.driversLabel}</div></td><td><div>{row.vehicleCount}</div><div className="small text-secondary text-truncate" style={{ maxWidth: 220 }}>{row.vehiclesLabel}</div></td><td>{row.workHours || 'Not set'}</td><td><Badge bg={statusVariant[row.status] || 'secondary'}>{row.status}</Badge></td></tr>) : <tr><td colSpan={6} className="text-center py-5 text-secondary">No billing groups yet. Usa Add Group para crear el primero.</td></tr>}
                    </tbody>
                  </Table>
                </div>
              </div>
            </Col>

            <Col xl={5}>
              <div style={shellStyles.cardShell} className="p-3 h-100">
                {selectedGrouping ? <>
                    <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                      <div>
                        <div className="text-uppercase small text-secondary">Selected group</div>
                        <div className="fs-4 fw-semibold">{selectedGrouping.name}</div>
                        <div className="small text-secondary mt-1">{selectedGrouping.description || 'No description'}</div>
                      </div>
                      <Badge bg={statusVariant[selectedGrouping.status] || 'secondary'}>{selectedGrouping.status}</Badge>
                    </div>

                    <Row className="g-3 mb-3">
                      <Col sm={6}><div className="small text-secondary text-uppercase">ATD</div><div>{selectedGrouping.atd || 'Not set'}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">Work Hours</div><div>{selectedGrouping.workHours || 'Not set'}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">Billing Code</div><div>{selectedGrouping.billingCode || 'Not set'}</div></Col>
                      <Col sm={6}><div className="small text-secondary text-uppercase">Dispatch Tag</div><div>{selectedGrouping.dispatchTag || 'Not set'}</div></Col>
                    </Row>

                    <div className="border rounded-3 p-3 mb-3" style={{ borderColor: '#2a3144', backgroundColor: '#0c111b' }}>
                      <div className="small text-secondary text-uppercase mb-2">Assign Driver</div>
                      <div className="d-flex gap-2">
                        <Form.Select value={driverToAssign} onChange={event => setDriverToAssign(event.target.value)} style={shellStyles.input}>
                          <option value="">Select driver</option>
                          {availableDrivers.map(driver => {
                            const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
                            const currentGrouping = state.groupings.find(grouping => grouping.id === driver.groupingId);
                            return <option key={driver.id} value={driver.id}>{getDriverName(driver)}{vehicle ? ` | ${vehicle.unitNumber || vehicle.label}` : ''}{currentGrouping ? ` | from ${currentGrouping.name}` : ' | ungrouped'}</option>;
                          })}
                        </Form.Select>
                        <Button style={shellStyles.primaryButton} onClick={handleAssignDriver} disabled={!driverToAssign || saving}>Add</Button>
                      </div>
                    </div>

                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <div className="small text-secondary text-uppercase">Drivers in group</div>
                      <div className="small text-secondary">{selectedDrivers.length} total</div>
                    </div>

                    <div className="border rounded-3 overflow-hidden" style={{ borderColor: '#2a3144' }}>
                      <div className="table-responsive" style={{ maxHeight: 360 }}>
                        <Table className="align-middle mb-0 text-white">
                          <thead>
                            <tr>
                              <th style={{ backgroundColor: '#0c111b', color: '#9bb0d1' }}>Driver</th>
                              <th style={{ backgroundColor: '#0c111b', color: '#9bb0d1' }}>Vehicle</th>
                              <th style={{ backgroundColor: '#0c111b', color: '#9bb0d1' }}>Phone</th>
                              <th style={{ backgroundColor: '#0c111b', color: '#9bb0d1' }}>Ctrl</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedDrivers.length ? selectedDrivers.map(driver => {
                              const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
                              return <tr key={driver.id}><td><div>{getDriverName(driver)}</div><div className="small text-secondary">{driver.username || driver.email || 'No login'}</div></td><td>{vehicle?.unitNumber || vehicle?.label || 'No vehicle'}</td><td>{driver.phone || 'No phone'}</td><td><Button size="sm" style={shellStyles.toolbarButton} onClick={() => handleUngroupDriver(driver.id)}>Ungroup</Button></td></tr>;
                            }) : <tr><td colSpan={4} className="text-center py-4 text-secondary">This billing group has no drivers yet.</td></tr>}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  </> : <div className="h-100 d-flex flex-column justify-content-center align-items-center text-center text-secondary"><IconifyIcon icon="iconoir:group" className="fs-1 mb-3 text-success" /><div className="fw-semibold text-white mb-2">No grouping selected</div><div>Selecciona un grupo para ver billing code, ATD, work hours y los choferes asignados.</div></div>}
              </div>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Modal show={showEditor} onHide={() => setShowEditor(false)} centered>
        <Modal.Header closeButton style={shellStyles.modalHeader} className="text-white">
          <Modal.Title>{draftGrouping?.name || 'New Billing Group'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={shellStyles.modalContent}>
          {validationErrors.length > 0 ? <Alert variant="danger"><ul className="mb-0">{validationErrors.map(item => <li key={item}>{item}</li>)}</ul></Alert> : null}
          <Row className="g-3">
            <Col md={8}><Form.Label className="small text-uppercase text-secondary">Grouping Name</Form.Label><Form.Control value={draftGrouping?.name || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, name: event.target.value }))} /></Col>
            <Col md={4}><Form.Label className="small text-uppercase text-secondary">Status</Form.Label><Form.Select value={draftGrouping?.status || 'Active'} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, status: event.target.value }))}><option>Active</option><option>Attention</option><option>Pending</option><option>Inactive</option></Form.Select></Col>
            <Col md={4}><Form.Label className="small text-uppercase text-secondary">ATD</Form.Label><Form.Control value={draftGrouping?.atd || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, atd: event.target.value }))} /></Col>
            <Col md={4}><Form.Label className="small text-uppercase text-secondary">Work Hours</Form.Label><Form.Control value={draftGrouping?.workHours || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, workHours: event.target.value }))} /></Col>
            <Col md={4}><Form.Label className="small text-uppercase text-secondary">Billing Code</Form.Label><Form.Control value={draftGrouping?.billingCode || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, billingCode: event.target.value }))} /></Col>
            <Col md={6}><Form.Label className="small text-uppercase text-secondary">Dispatch Tag</Form.Label><Form.Control value={draftGrouping?.dispatchTag || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, dispatchTag: event.target.value }))} /></Col>
            <Col md={6}><Form.Label className="small text-uppercase text-secondary">Notes</Form.Label><Form.Control value={draftGrouping?.notes || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, notes: event.target.value }))} /></Col>
            <Col md={12}><Form.Label className="small text-uppercase text-secondary">Description</Form.Label><Form.Control as="textarea" rows={3} value={draftGrouping?.description || ''} style={shellStyles.input} onChange={event => setDraftGrouping(current => ({ ...current, description: event.target.value }))} /></Col>
          </Row>
        </Modal.Body>
        <Modal.Footer style={shellStyles.modalHeader}>
          <Button style={shellStyles.toolbarButton} onClick={() => setShowEditor(false)}>Cancel</Button>
          <Button style={shellStyles.primaryButton} onClick={handleSaveGrouping} disabled={saving}>Save</Button>
        </Modal.Footer>
      </Modal>
    </>;
};

export default BillingGroupingWorkspace;