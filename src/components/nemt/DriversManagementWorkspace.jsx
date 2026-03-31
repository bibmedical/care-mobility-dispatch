'use client';

import { buildAttendantsRows, buildDriversRows, buildGroupingRows, buildVehiclesRows, createBlankAttendant, createBlankDriver, createBlankGrouping, createBlankVehicle, getDocumentAlerts, getFullName, validateAttendant, validateDriver, validateGrouping, validateVehicle } from '@/helpers/nemt-admin-model';
import { formatMinutesAsHours, getTripServiceMinutes } from '@/helpers/nemt-billing';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import { useNemtContext } from '@/context/useNemtContext';
import { useLayoutContext } from '@/context/useLayoutContext';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';

const buildShellStyles = isLight => ({
  windowHeader: { backgroundColor: isLight ? '#2b3f60' : '#23324a' },
  body: { backgroundColor: isLight ? '#ffffff' : '#171b27' },
  toolbarButton: { backgroundColor: isLight ? '#f3f7fc' : '#101521', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#e6ecff' },
  activeTab: { backgroundColor: '#8dc63f', borderColor: '#8dc63f', color: '#08131a' },
  inactiveTab: { backgroundColor: isLight ? '#f3f7fc' : '#101521', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#d7deef' },
  search: { width: 230, paddingLeft: 38, backgroundColor: isLight ? '#f8fbff' : '#101521', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#e6ecff' },
  dangerButton: { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' },
  tableShell: { borderColor: isLight ? '#d5deea' : '#2a3144', backgroundColor: isLight ? '#ffffff' : '#171b27' },
  tableHead: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#8dc63f', color: '#08131a' },
  tableHeadCell: { backgroundColor: '#8dc63f', color: '#08131a', borderColor: 'rgba(8,19,26,0.14)' },
  pageBadge: { backgroundColor: isLight ? '#f3f7fc' : '#101521', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#e6ecff' },
  modalContent: { backgroundColor: isLight ? '#ffffff' : '#171b27', color: isLight ? '#0f172a' : '#e6ecff', borderColor: isLight ? '#c8d4e6' : '#2a3144' },
  modalHeader: { backgroundColor: isLight ? '#2b3f60' : '#23324a', borderColor: isLight ? '#c8d4e6' : '#2a3144' },
  modalSection: { backgroundColor: isLight ? '#f8fbff' : '#101521', border: `1px solid ${isLight ? '#c8d4e6' : '#2a3144'}`, borderRadius: 12, padding: 16 },
  modalInput: { backgroundColor: isLight ? '#f8fbff' : '#0c111b', borderColor: isLight ? '#c8d4e6' : '#2a3144', color: isLight ? '#0f172a' : '#e6ecff' },
  rowBackground: {
    selected: isLight ? '#e8f2ff' : '#202c42',
    default: isLight ? '#ffffff' : '#171b27'
  },
  rowTextColor: isLight ? '#0f172a' : '#e6ecff'
});

const TABS = [{ key: 'drivers', label: 'Drivers', href: '/drivers' }, { key: 'attendants', label: 'Attendants', href: '/drivers/attendants' }, { key: 'vehicles', label: 'Vehicles', href: '/drivers/vehicles' }, { key: 'grouping', label: 'Grouping', href: '/drivers/grouping' }];
const DRIVER_EDITOR_TABS = [{ key: 'profile', label: 'Profile' }, { key: 'credentials', label: 'Credentials' }, { key: 'license', label: 'License' }, { key: 'compliance', label: 'Compliance' }, { key: 'documents', label: 'Documents' }];
const formLabelClassName = 'text-uppercase small fw-semibold text-secondary mb-2';

const getCollectionKey = activeTab => (activeTab === 'grouping' ? 'groupings' : activeTab);

const defaultState = {
  drivers: [],
  attendants: [],
  vehicles: [],
  groupings: []
};

const readFileAsDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const toLocalFileProxyUrl = rawPath => {
  const normalized = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized ? `/api/files/local?path=${encodeURIComponent(normalized)}` : null;
};

const resolveDocumentAsset = value => {
  if (!value) return null;

  if (typeof value === 'string') {
    const normalized = value.replace(/\\/g, '/');
    const isDataUrl = normalized.startsWith('data:');
    const name = normalized.split('/').pop() || 'uploaded-file';

    return {
      name,
      type: '',
      dataUrl: isDataUrl ? normalized : toLocalFileProxyUrl(normalized),
      source: 'path'
    };
  }

  if (typeof value === 'object') {
    const name = value.name || value.fileName || 'uploaded-file';
    const dataUrl = value.dataUrl || value.url || (typeof value.path === 'string' ? toLocalFileProxyUrl(value.path) : null);
    return dataUrl ? {
      ...value,
      name,
      dataUrl,
      source: value.source || 'object'
    } : null;
  }

  return null;
};

const isImageAsset = asset => Boolean(asset?.dataUrl) && !String(asset.dataUrl).toLowerCase().endsWith('.pdf');

const DriversManagementWorkspace = ({ activeTab = 'drivers' }) => {
  const { themeMode } = useLayoutContext();
  const shellStyles = useMemo(() => buildShellStyles(themeMode === 'light'), [themeMode]);
  const pathname = usePathname();
  const { data, loading, saving, error, refresh, saveData } = useNemtAdminApi();
  const { trips } = useNemtContext();
  const [search, setSearch] = useState('');
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTab, setEditorTab] = useState('profile');
  const [draftEntity, setDraftEntity] = useState(null);
  const [message, setMessage] = useState('Manage drivers, vehicles, attendants and groupings from the persistent system API.');
  const [validationErrors, setValidationErrors] = useState([]);

  const state = useMemo(() => ({
    drivers: data?.drivers ?? defaultState.drivers,
    attendants: data?.attendants ?? defaultState.attendants,
    vehicles: data?.vehicles ?? defaultState.vehicles,
    groupings: data?.groupings ?? defaultState.groupings
  }), [data]);

  const config = useMemo(() => {
    if (activeTab === 'drivers') return { rows: buildDriversRows(state), pageSize: 14, columns: ['№', 'Ctrl', 'Info', 'Vehicle Assignment', 'Hours', 'Trips', 'Notes'], title: 'Users' };
    if (activeTab === 'attendants') return { rows: buildAttendantsRows(state), pageSize: 12, columns: ['№', 'Ctrl', 'Attendant', 'Phone', 'Certification', 'Assigned Drivers', 'Notes'], title: 'VDR Change' };
    if (activeTab === 'vehicles') return { rows: buildVehiclesRows(state), pageSize: 12, columns: ['№', 'Ctrl', 'Info', 'Capacity', 'Driver Assignment', 'Notes'], title: 'VDR Change' };
    return { rows: buildGroupingRows(state), pageSize: 12, columns: ['№', 'Ctrl', 'Group', 'Drivers', 'Vehicles', 'Notes'], title: 'VDR Change' };
  }, [activeTab, state]);

  const driverTripMetrics = useMemo(() => new Map(state.drivers.map(driver => {
    const driverTrips = trips.filter(trip => trip.driverId === driver.id);
    const serviceMinutes = driverTrips.reduce((sum, trip) => sum + getTripServiceMinutes(trip), 0);
    const activeTrips = driverTrips.filter(trip => ['assigned', 'in progress'].includes(String(trip.status || '').toLowerCase())).length;
    return [driver.id, {
      serviceMinutes,
      totalTrips: driverTrips.length,
      activeTrips
    }];
  })), [state.drivers, trips]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return config.rows;
    return config.rows.filter(row => Object.values(row).some(value => String(typeof value === 'object' ? JSON.stringify(value) : value).toLowerCase().includes(term)));
  }, [config.rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / config.pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const visibleRows = filteredRows.slice(safePageIndex * config.pageSize, safePageIndex * config.pageSize + config.pageSize);

  useEffect(() => {
    setPageIndex(0);
    setSelectedRowId(null);
    setShowEditor(false);
    setValidationErrors([]);
  }, [activeTab]);

  useEffect(() => {
    if (selectedRowId && filteredRows.some(row => row.id === selectedRowId)) return;
    setSelectedRowId(filteredRows[0]?.id ?? null);
  }, [filteredRows, selectedRowId]);

  const collectionKey = getCollectionKey(activeTab);
  const selectedEntity = state[collectionKey].find(entity => entity.id === selectedRowId) ?? null;
  const driverAlerts = activeTab === 'drivers' && draftEntity ? getDocumentAlerts(draftEntity) : [];
  const profilePhotoAsset = resolveDocumentAsset(draftEntity?.documents?.profilePhoto);
  const licenseFrontAsset = resolveDocumentAsset(draftEntity?.documents?.licenseFront);
  const primaryPhotoAsset = profilePhotoAsset || licenseFrontAsset;

  const openEditor = entity => {
    const nextDraft = entity ? JSON.parse(JSON.stringify(entity)) : activeTab === 'drivers' ? createBlankDriver() : activeTab === 'attendants' ? createBlankAttendant() : activeTab === 'vehicles' ? createBlankVehicle() : createBlankGrouping();
    setDraftEntity(nextDraft);
    setEditorTab('profile');
    setValidationErrors([]);
    setShowEditor(true);
  };

  const updateDraftField = (field, value) => {
    setDraftEntity(current => ({ ...current, [field]: value }));
  };

  const updateDraftDocument = async (field, file) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraftEntity(current => ({
      ...current,
      documents: {
        ...current.documents,
        [field]: { name: file.name, type: file.type, dataUrl }
      }
    }));
  };

  const persistNextState = async nextState => {
    await saveData(nextState);
    await refresh();
  };

  const buildNormalizedEntity = entity => {
    if (activeTab === 'drivers') {
      const fallbackUsername = [entity.firstName, entity.lastName].filter(Boolean).join('.').toLowerCase().replace(/\s+/g, '.');
      return {
        ...entity,
        displayName: getFullName(entity),
        username: entity.username || entity.portalUsername || fallbackUsername,
        portalUsername: entity.portalUsername || entity.username || fallbackUsername,
        portalEmail: entity.portalEmail || entity.email,
        checkpoint: entity.checkpoint || (entity.vehicleId ? 'Vehicle ready' : 'Needs assignment')
      };
    }
    return entity;
  };

  const getValidationErrors = entity => {
    if (activeTab === 'drivers') return validateDriver(entity, state);
    if (activeTab === 'attendants') return validateAttendant(entity);
    if (activeTab === 'vehicles') return validateVehicle(entity);
    return validateGrouping(entity);
  };

  const handleSave = async () => {
    if (!draftEntity) return;
    const normalizedEntity = buildNormalizedEntity(draftEntity);
    const errors = getValidationErrors(normalizedEntity);
    setValidationErrors(errors);
    if (errors.length > 0) {
      setMessage(errors[0]);
      return;
    }

    const nextCollection = state[collectionKey].some(entity => entity.id === normalizedEntity.id) ? state[collectionKey].map(entity => entity.id === normalizedEntity.id ? normalizedEntity : entity) : [normalizedEntity, ...state[collectionKey]];
    const nextState = { ...state, [collectionKey]: nextCollection };
    await persistNextState(nextState);
    setSelectedRowId(normalizedEntity.id);
    setShowEditor(false);
    setDraftEntity(null);
    setMessage(`${activeTab.slice(0, 1).toUpperCase()}${activeTab.slice(1)} record saved.`);
  };

  const handleDelete = async () => {
    if (!selectedEntity) {
      setMessage('Selecciona un registro para borrar.');
      return;
    }

    let nextState = { ...state };

    if (activeTab === 'drivers') {
      nextState.drivers = state.drivers.filter(driver => driver.id !== selectedEntity.id);
    }

    if (activeTab === 'attendants') {
      nextState.attendants = state.attendants.filter(attendant => attendant.id !== selectedEntity.id);
      nextState.drivers = state.drivers.map(driver => driver.attendantId === selectedEntity.id ? { ...driver, attendantId: '' } : driver);
    }

    if (activeTab === 'vehicles') {
      nextState.vehicles = state.vehicles.filter(vehicle => vehicle.id !== selectedEntity.id);
      nextState.drivers = state.drivers.map(driver => driver.vehicleId === selectedEntity.id ? { ...driver, vehicleId: '', checkpoint: 'Needs assignment' } : driver);
    }

    if (activeTab === 'grouping') {
      nextState.groupings = state.groupings.filter(grouping => grouping.id !== selectedEntity.id);
      nextState.drivers = state.drivers.map(driver => driver.groupingId === selectedEntity.id ? { ...driver, groupingId: '' } : driver);
    }

    await persistNextState(nextState);
    setSelectedRowId(null);
    setMessage('Registro eliminado y dependencias actualizadas.');
  };

  const renderRowCells = row => {
    if (activeTab === 'drivers') {
      const metrics = driverTripMetrics.get(row.raw.id) ?? {
        serviceMinutes: 0,
        totalTrips: 0,
        activeTrips: 0
      };
      return [<td key="number">{row.order}</td>, <td key="ctrl">
            <button type="button" className="btn btn-link p-0 text-info" onClick={event => {
              event.stopPropagation();
              openEditor(row.raw);
            }}>
              <IconifyIcon icon="iconoir:edit-pencil" />
            </button>
          </td>, <td key="info">
            <div>{row.info}</div>
            <div className="small text-secondary">Username: {row.raw.username}</div>
          </td>, <td key="assignment">{row.assignment}</td>, <td key="hours">{formatMinutesAsHours(metrics.serviceMinutes)}</td>, <td key="trips"><div>{metrics.totalTrips} total</div><div className="small text-secondary">{metrics.activeTrips} active</div></td>, <td key="notes"><div className="d-flex align-items-center gap-2 flex-wrap"><span>{row.notes}</span>{row.alertCount > 0 ? <Badge bg="warning" text="dark">{row.alertCount} alerts</Badge> : null}</div></td>];
    }

    if (activeTab === 'attendants') {
      return [<td key="number">{row.order}</td>, <td key="ctrl"><button type="button" className="btn btn-link p-0 text-info" onClick={event => {
            event.stopPropagation();
            openEditor(row.raw);
          }}><IconifyIcon icon="iconoir:edit-pencil" /></button></td>, <td key="name">{row.name}</td>, <td key="phone">{row.phone}</td>, <td key="cert">{row.certification}</td>, <td key="assigned">{row.assignedDrivers}</td>, <td key="notes">{row.notes}</td>];
    }

    if (activeTab === 'vehicles') {
      return [<td key="number">{row.order}</td>, <td key="ctrl"><button type="button" className="btn btn-link p-0 text-info" onClick={event => {
            event.stopPropagation();
            openEditor(row.raw);
          }}><IconifyIcon icon="iconoir:edit-pencil" /></button></td>, <td key="info"><div>{row.info.split('\n')[0]}</div><div className="small text-secondary">{row.info.split('\n')[1]}</div></td>, <td key="capacity"><div>Type: {row.capacity.type}</div><div className="d-flex gap-3 small mt-1"><span><IconifyIcon icon="iconoir:user" /> {row.capacity.ambulatory}</span><span><IconifyIcon icon="healthicons:wheelchair-outline" /> {row.capacity.wheelchair}</span><span><IconifyIcon icon="iconoir:hospital" /> {row.capacity.stretcher}</span></div></td>, <td key="assignment">{row.assignment}</td>, <td key="notes">{row.notes}</td>];
    }

    return [<td key="number">{row.order}</td>, <td key="ctrl"><button type="button" className="btn btn-link p-0 text-info" onClick={event => {
          event.stopPropagation();
          openEditor(row.raw);
        }}><IconifyIcon icon="iconoir:edit-pencil" /></button></td>, <td key="group">{row.group}</td>, <td key="drivers">{row.drivers}</td>, <td key="vehicles">{row.vehicles}</td>, <td key="notes">{row.notes}</td>];
  };

  const renderDriverEditor = () => {
    if (!draftEntity) return null;
    if (editorTab === 'profile') {
      return <Row className="g-3">
          <Col lg={4}>
            <div style={shellStyles.modalSection}>
              <div className={formLabelClassName}>Driver Photo</div>
              <div className="d-flex flex-column align-items-center gap-3">
                <div className="rounded-circle overflow-hidden border" style={{ width: 120, height: 120, borderColor: '#2a3144' }}>
                  {isImageAsset(primaryPhotoAsset) ? <img src={primaryPhotoAsset.dataUrl} alt="Driver profile" style={profilePhotoAsset ? {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                } : {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: '22% 38%',
                  transform: 'scale(1.45)',
                  transformOrigin: '22% 38%'
                }} /> : <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary bg-dark-subtle"><IconifyIcon icon="iconoir:user" className="fs-32" /></div>}
                </div>
                {!profilePhotoAsset && isImageAsset(licenseFrontAsset) ? <div className="small text-warning text-center">Primary photo usando License Front (face zoom).</div> : null}
                <Form.Control type="file" accept="image/*" style={shellStyles.modalInput} onChange={async event => updateDraftDocument('profilePhoto', event.target.files?.[0])} />
              </div>
            </div>
          </Col>
          <Col lg={8}>
            <div style={shellStyles.modalSection}>
              <Row className="g-3">
                <Col md={4}><Form.Label className={formLabelClassName}>First Name</Form.Label><Form.Control value={draftEntity.firstName} style={shellStyles.modalInput} onChange={event => updateDraftField('firstName', event.target.value)} /></Col>
                <Col md={2}><Form.Label className={formLabelClassName}>MI</Form.Label><Form.Control value={draftEntity.middleInitial} style={shellStyles.modalInput} onChange={event => updateDraftField('middleInitial', event.target.value)} /></Col>
                <Col md={6}><Form.Label className={formLabelClassName}>Last Name</Form.Label><Form.Control value={draftEntity.lastName} style={shellStyles.modalInput} onChange={event => updateDraftField('lastName', event.target.value)} /></Col>
                <Col md={4}><Form.Label className={formLabelClassName}>Username</Form.Label><Form.Control value={draftEntity.username} style={shellStyles.modalInput} onChange={event => updateDraftField('username', event.target.value)} /></Col>
                <Col md={4}><Form.Label className={formLabelClassName}>Phone</Form.Label><Form.Control value={draftEntity.phone} style={shellStyles.modalInput} onChange={event => updateDraftField('phone', event.target.value)} /></Col>
                <Col md={4}><Form.Label className={formLabelClassName}>License Number</Form.Label><Form.Control value={draftEntity.licenseNumber} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseNumber', event.target.value)} /></Col>
                <Col md={4}><Form.Label className={formLabelClassName}>Role</Form.Label><Form.Control value={draftEntity.role} style={shellStyles.modalInput} onChange={event => updateDraftField('role', event.target.value)} /></Col>
                <Col md={4}><Form.Label className={formLabelClassName}>License State</Form.Label><Form.Control value={draftEntity.licenseState} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseState', event.target.value)} /></Col>
                <Col md={4}><Form.Label className={formLabelClassName}>License Exp.</Form.Label><Form.Control type="date" value={draftEntity.licenseExpirationDate} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseExpirationDate', event.target.value)} /></Col>
                <Col md={6}><Form.Label className={formLabelClassName}>Email</Form.Label><Form.Control value={draftEntity.email} style={shellStyles.modalInput} onChange={event => updateDraftField('email', event.target.value)} /></Col>
                <Col md={6}><Form.Label className={formLabelClassName}>Vehicle</Form.Label><Form.Select value={draftEntity.vehicleId} style={shellStyles.modalInput} onChange={event => updateDraftField('vehicleId', event.target.value)}><option value="">Select vehicle</option>{state.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</Form.Select></Col>
                <Col md={6}><Form.Label className={formLabelClassName}>Attendant</Form.Label><Form.Select value={draftEntity.attendantId} style={shellStyles.modalInput} onChange={event => updateDraftField('attendantId', event.target.value)}><option value="">No attendant</option>{state.attendants.map(attendant => <option key={attendant.id} value={attendant.id}>{attendant.name}</option>)}</Form.Select></Col>
                <Col md={3}><Form.Label className={formLabelClassName}>Grouping</Form.Label><Form.Select value={draftEntity.groupingId} style={shellStyles.modalInput} onChange={event => updateDraftField('groupingId', event.target.value)}><option value="">No group</option>{state.groupings.map(grouping => <option key={grouping.id} value={grouping.id}>{grouping.name}</option>)}</Form.Select></Col>
                <Col md={3}><Form.Label className={formLabelClassName}>Checkpoint</Form.Label><Form.Control value={draftEntity.checkpoint} style={shellStyles.modalInput} onChange={event => updateDraftField('checkpoint', event.target.value)} /></Col>
                <Col md={12}><Form.Label className={formLabelClassName}>Notes</Form.Label><Form.Control as="textarea" rows={3} value={draftEntity.notes} style={shellStyles.modalInput} onChange={event => updateDraftField('notes', event.target.value)} /></Col>
              </Row>
            </div>
          </Col>
        </Row>;
    }

    if (editorTab === 'credentials') {
      return <div style={shellStyles.modalSection}><Row className="g-3"><Col md={4}><Form.Label className={formLabelClassName}>Portal Username</Form.Label><Form.Control value={draftEntity.portalUsername} style={shellStyles.modalInput} onChange={event => updateDraftField('portalUsername', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Portal Email</Form.Label><Form.Control value={draftEntity.portalEmail} style={shellStyles.modalInput} onChange={event => updateDraftField('portalEmail', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Broker ID</Form.Label><Form.Control value={draftEntity.brokerId} style={shellStyles.modalInput} onChange={event => updateDraftField('brokerId', event.target.value)} /></Col><Col md={3}><Form.Check label="MFA Enabled" checked={draftEntity.mfaEnabled} onChange={event => updateDraftField('mfaEnabled', event.target.checked)} /></Col><Col md={3}><Form.Check label="Password Reset Required" checked={draftEntity.passwordResetRequired} onChange={event => updateDraftField('passwordResetRequired', event.target.checked)} /></Col><Col md={3}><Form.Check label="Background Check Clear" checked={draftEntity.backgroundCheckStatus === 'Clear'} onChange={event => updateDraftField('backgroundCheckStatus', event.target.checked ? 'Clear' : 'Pending')} /></Col><Col md={3}><Form.Check label="Drug Screen Clear" checked={draftEntity.drugScreenStatus === 'Clear'} onChange={event => updateDraftField('drugScreenStatus', event.target.checked ? 'Clear' : 'Pending')} /></Col><Col md={3}><Form.Check label="CPR Certified" checked={draftEntity.cprCertified} onChange={event => updateDraftField('cprCertified', event.target.checked)} /></Col><Col md={3}><Form.Check label="Defensive Driving" checked={draftEntity.defensiveDrivingCertified} onChange={event => updateDraftField('defensiveDrivingCertified', event.target.checked)} /></Col><Col md={3}><Form.Check label="HIPAA Certified" checked={draftEntity.hipaaCertified} onChange={event => updateDraftField('hipaaCertified', event.target.checked)} /></Col><Col md={3}><Form.Check label="NEMT Certified" checked={draftEntity.nemtCertified} onChange={event => updateDraftField('nemtCertified', event.target.checked)} /></Col></Row></div>;
    }

    if (editorTab === 'license') {
      return <div style={shellStyles.modalSection}><Row className="g-3"><Col md={4}><Form.Label className={formLabelClassName}>License Number</Form.Label><Form.Control value={draftEntity.licenseNumber} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseNumber', event.target.value)} /></Col><Col md={2}><Form.Label className={formLabelClassName}>Class</Form.Label><Form.Control value={draftEntity.licenseClass} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseClass', event.target.value)} /></Col><Col md={2}><Form.Label className={formLabelClassName}>State</Form.Label><Form.Control value={draftEntity.licenseState} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseState', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Chauffeur Permit</Form.Label><Form.Control value={draftEntity.chauffeurPermit} style={shellStyles.modalInput} onChange={event => updateDraftField('chauffeurPermit', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Issue Date</Form.Label><Form.Control type="date" value={draftEntity.licenseIssueDate} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseIssueDate', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Expiration Date</Form.Label><Form.Control type="date" value={draftEntity.licenseExpirationDate} style={shellStyles.modalInput} onChange={event => updateDraftField('licenseExpirationDate', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Medical Card Exp.</Form.Label><Form.Control type="date" value={draftEntity.medCardExpirationDate} style={shellStyles.modalInput} onChange={event => updateDraftField('medCardExpirationDate', event.target.value)} /></Col><Col md={4}><Form.Check label="DMV Verified" checked={draftEntity.dmvVerified} onChange={event => updateDraftField('dmvVerified', event.target.checked)} /></Col></Row></div>;
    }

    if (editorTab === 'compliance') {
      return <div style={shellStyles.modalSection}><Row className="g-3"><Col md={4}><Form.Label className={formLabelClassName}>Insurance Carrier</Form.Label><Form.Control value={draftEntity.insuranceCarrier} style={shellStyles.modalInput} onChange={event => updateDraftField('insuranceCarrier', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Policy Number</Form.Label><Form.Control value={draftEntity.insurancePolicyNumber} style={shellStyles.modalInput} onChange={event => updateDraftField('insurancePolicyNumber', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Policy Expiration</Form.Label><Form.Control type="date" value={draftEntity.insuranceExpirationDate} style={shellStyles.modalInput} onChange={event => updateDraftField('insuranceExpirationDate', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Workers Comp Policy</Form.Label><Form.Control value={draftEntity.workersCompPolicyNumber} style={shellStyles.modalInput} onChange={event => updateDraftField('workersCompPolicyNumber', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Workers Comp Exp.</Form.Label><Form.Control type="date" value={draftEntity.workersCompExpirationDate} style={shellStyles.modalInput} onChange={event => updateDraftField('workersCompExpirationDate', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Company Tax ID</Form.Label><Form.Control value={draftEntity.taxId} style={shellStyles.modalInput} onChange={event => updateDraftField('taxId', event.target.value)} /></Col><Col md={3}><Form.Check label="Insurance Accredited" checked={draftEntity.insuranceAccredited} onChange={event => updateDraftField('insuranceAccredited', event.target.checked)} /></Col><Col md={3}><Form.Check label="Tax ID Verified" checked={draftEntity.taxIdVerified} onChange={event => updateDraftField('taxIdVerified', event.target.checked)} /></Col><Col md={3}><Form.Check label="W9 On File" checked={draftEntity.w9OnFile} onChange={event => updateDraftField('w9OnFile', event.target.checked)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Tracking</Form.Label><div className="small text-secondary pt-2">Android only. Web admin cannot mark drivers online manually.</div></Col></Row></div>;
    }

    return <div style={shellStyles.modalSection}><Row className="g-3">{[['profilePhoto', 'Profile Photo', 'image/*'], ['licenseFront', 'License Front', 'image/*,.pdf'], ['licenseBack', 'License Back', 'image/*,.pdf'], ['insuranceCertificate', 'Insurance Certificate', 'image/*,.pdf'], ['w9Document', 'W9 / Tax Document', '.pdf,image/*'], ['trainingCertificate', 'Training Certificate', '.pdf,image/*']].map(([field, label, accept]) => {
      const asset = resolveDocumentAsset(draftEntity.documents[field]);
      const isPdf = String(asset?.name || '').toLowerCase().endsWith('.pdf');
      return <Col md={6} key={field}><Form.Label className={formLabelClassName}>{label}</Form.Label><Form.Control type="file" accept={accept} style={shellStyles.modalInput} onChange={async event => updateDraftDocument(field, event.target.files?.[0])} /><div className="small text-secondary mt-2">{asset?.name ?? 'No file uploaded'}</div>{isImageAsset(asset) ? <div className="mt-2 border rounded overflow-hidden" style={{ borderColor: '#2a3144', height: 140, backgroundColor: '#0c111b' }}><img src={asset.dataUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: field === 'profilePhoto' ? 'cover' : 'contain' }} /></div> : null}{isPdf && asset?.dataUrl ? <div className="small mt-2"><a href={asset.dataUrl} target="_blank" rel="noreferrer">Open PDF</a></div> : null}</Col>;
    })}</Row></div>;
  };

  const renderGenericEditor = () => {
    if (!draftEntity) return null;

    if (activeTab === 'attendants') {
      return <div style={shellStyles.modalSection}><Row className="g-3"><Col md={6}><Form.Label className={formLabelClassName}>Name</Form.Label><Form.Control value={draftEntity.name} style={shellStyles.modalInput} onChange={event => updateDraftField('name', event.target.value)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Phone</Form.Label><Form.Control value={draftEntity.phone} style={shellStyles.modalInput} onChange={event => updateDraftField('phone', event.target.value)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Certification</Form.Label><Form.Select value={draftEntity.certification} style={shellStyles.modalInput} onChange={event => updateDraftField('certification', event.target.value)}><option>Basic</option><option>Wheelchair</option><option>Stretcher</option><option>ALS</option></Form.Select></Col><Col md={4}><Form.Label className={formLabelClassName}>Email</Form.Label><Form.Control value={draftEntity.email} style={shellStyles.modalInput} onChange={event => updateDraftField('email', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Status</Form.Label><Form.Select value={draftEntity.status} style={shellStyles.modalInput} onChange={event => updateDraftField('status', event.target.value)}><option>Active</option><option>Inactive</option><option>On Leave</option></Form.Select></Col><Col md={12}><Form.Label className={formLabelClassName}>Notes</Form.Label><Form.Control as="textarea" rows={3} value={draftEntity.notes} style={shellStyles.modalInput} onChange={event => updateDraftField('notes', event.target.value)} /></Col></Row></div>;
    }

    if (activeTab === 'vehicles') {
      return <div style={shellStyles.modalSection}><Row className="g-3"><Col md={4}><Form.Label className={formLabelClassName}>Vehicle Label</Form.Label><Form.Control value={draftEntity.label} style={shellStyles.modalInput} onChange={event => updateDraftField('label', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>VIN</Form.Label><Form.Control value={draftEntity.vin} style={shellStyles.modalInput} onChange={event => updateDraftField('vin', event.target.value)} /></Col><Col md={4}><Form.Label className={formLabelClassName}>Plate</Form.Label><Form.Control value={draftEntity.plate} style={shellStyles.modalInput} onChange={event => updateDraftField('plate', event.target.value)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Unit Number</Form.Label><Form.Control value={draftEntity.unitNumber} style={shellStyles.modalInput} onChange={event => updateDraftField('unitNumber', event.target.value)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Type</Form.Label><Form.Select value={draftEntity.type} style={shellStyles.modalInput} onChange={event => updateDraftField('type', event.target.value)}><option>Van</option><option>Ambulance</option><option>Sedan</option></Form.Select></Col><Col md={2}><Form.Label className={formLabelClassName}>Amb</Form.Label><Form.Control type="number" value={draftEntity.ambulatoryCapacity} style={shellStyles.modalInput} onChange={event => updateDraftField('ambulatoryCapacity', Number(event.target.value))} /></Col><Col md={2}><Form.Label className={formLabelClassName}>WC</Form.Label><Form.Control type="number" value={draftEntity.wheelchairCapacity} style={shellStyles.modalInput} onChange={event => updateDraftField('wheelchairCapacity', Number(event.target.value))} /></Col><Col md={2}><Form.Label className={formLabelClassName}>Str</Form.Label><Form.Control type="number" value={draftEntity.stretcherCapacity} style={shellStyles.modalInput} onChange={event => updateDraftField('stretcherCapacity', Number(event.target.value))} /></Col><Col md={12}><Form.Label className={formLabelClassName}>Notes</Form.Label><Form.Control as="textarea" rows={3} value={draftEntity.notes} style={shellStyles.modalInput} onChange={event => updateDraftField('notes', event.target.value)} /></Col></Row></div>;
    }

    return <div style={shellStyles.modalSection}><Row className="g-3"><Col md={6}><Form.Label className={formLabelClassName}>Grouping Name</Form.Label><Form.Control value={draftEntity.name} style={shellStyles.modalInput} onChange={event => updateDraftField('name', event.target.value)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Dispatch Tag</Form.Label><Form.Control value={draftEntity.dispatchTag} style={shellStyles.modalInput} onChange={event => updateDraftField('dispatchTag', event.target.value)} /></Col><Col md={3}><Form.Label className={formLabelClassName}>Status</Form.Label><Form.Select value={draftEntity.status} style={shellStyles.modalInput} onChange={event => updateDraftField('status', event.target.value)}><option>Active</option><option>Attention</option><option>Pending</option></Form.Select></Col><Col md={12}><Form.Label className={formLabelClassName}>Description</Form.Label><Form.Control as="textarea" rows={2} value={draftEntity.description} style={shellStyles.modalInput} onChange={event => updateDraftField('description', event.target.value)} /></Col><Col md={12}><Form.Label className={formLabelClassName}>Notes</Form.Label><Form.Control as="textarea" rows={3} value={draftEntity.notes} style={shellStyles.modalInput} onChange={event => updateDraftField('notes', event.target.value)} /></Col></Row></div>;
  };

  return <>
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={shellStyles.windowHeader}>
          <strong>{config.title}</strong>
          <button type="button" className="btn btn-link text-white p-0 text-decoration-none"><IconifyIcon icon="iconoir:xmark" className="fs-18" /></button>
        </div>
        <CardBody className="p-2" style={shellStyles.body}>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-2">
            <div className="d-flex flex-wrap align-items-center gap-2">
              <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={refresh} disabled={loading || saving}><IconifyIcon icon="iconoir:refresh-double" /></Button>
              <div className="vr text-secondary" />
              {TABS.map(tab => <Link key={tab.key} href={tab.href} className="btn rounded-pill" onClick={() => {
                setSearch('');
                setPageIndex(0);
              }} style={pathname === tab.href ? shellStyles.activeTab : shellStyles.inactiveTab}>{tab.label}</Link>)}
              <div className="vr text-secondary" />
              <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={() => openEditor(null)}><IconifyIcon icon="iconoir:plus" className="me-2" />Add</Button>
              <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={() => selectedEntity ? openEditor(selectedEntity) : setMessage('Selecciona un registro para editar.') }><IconifyIcon icon="iconoir:edit-pencil" className="me-2" />Edit</Button>
              <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={() => setMessage('Import real listo para conectar cuando me des el archivo o endpoint.') }><IconifyIcon icon="iconoir:import" className="me-2" />Import</Button>
              <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={() => setMessage('ATMS sync quedo preparado para conectar a tu endpoint real.')}>Get from ATMS</Button>
            </div>
            <div className="d-flex align-items-center gap-2 ms-auto">
              <div className="position-relative">
                <IconifyIcon icon="iconoir:search" className="position-absolute top-50 start-0 translate-middle-y ms-3 text-success" />
                <Form.Control value={search} onChange={event => {
                  setSearch(event.target.value);
                  setPageIndex(0);
                }} placeholder="Search" style={shellStyles.search} className="rounded-pill" />
              </div>
              <Button className="rounded-pill" style={shellStyles.dangerButton} onClick={handleDelete} disabled={saving}><IconifyIcon icon="iconoir:trash" className="me-2" />Delete</Button>
            </div>
          </div>

          <div className="small text-secondary mb-3 d-flex align-items-center gap-2 flex-wrap">{saving ? <><Spinner animation="border" size="sm" /> Saving...</> : message}</div>
          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}

          <div className="border overflow-hidden rounded-2" style={shellStyles.tableShell}>
            <div className="table-responsive" style={{ maxHeight: 680 }}>
              <Table className="align-middle mb-0 text-white">
                <thead style={shellStyles.tableHead}>
                  <tr>
                    <th style={{ width: 34 }}><Form.Check /></th>
                    {config.columns.map(column => <th key={column} className="fw-normal" style={shellStyles.tableHeadCell}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={config.columns.length + 1} className="text-center py-5 text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading records...</td></tr> : visibleRows.length ? visibleRows.map(row => <tr key={row.id} onClick={() => setSelectedRowId(row.id)} style={{ cursor: 'pointer', backgroundColor: selectedRowId === row.id ? shellStyles.rowBackground.selected : shellStyles.rowBackground.default, color: shellStyles.rowTextColor }}><td><Form.Check checked={selectedRowId === row.id} onChange={() => setSelectedRowId(row.id)} /></td>{renderRowCells(row)}</tr>) : <tr><td colSpan={config.columns.length + 1} className="text-center py-5 text-secondary">No records yet. Usa Add para crear el primer expediente.</td></tr>}
                </tbody>
              </Table>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 mt-3">
            <Button className="rounded-pill" style={shellStyles.toolbarButton} disabled={safePageIndex === 0} onClick={() => setPageIndex(current => Math.max(0, current - 1))}><IconifyIcon icon="iconoir:nav-arrow-left" /></Button>
            <div className="px-3 py-2 rounded-pill border" style={shellStyles.pageBadge}>{safePageIndex + 1} of {totalPages}</div>
            <Button className="rounded-pill" style={shellStyles.toolbarButton} disabled={safePageIndex >= totalPages - 1} onClick={() => setPageIndex(current => Math.min(totalPages - 1, current + 1))}><IconifyIcon icon="iconoir:nav-arrow-right" /></Button>
          </div>
        </CardBody>
      </Card>

      <Modal show={showEditor} onHide={() => setShowEditor(false)} size="xl" centered>
        <Modal.Header closeButton style={shellStyles.modalHeader} className="text-white">
          <Modal.Title>{activeTab === 'drivers' ? draftEntity?.displayName || getFullName(draftEntity || {}) || 'New Driver Record' : activeTab === 'attendants' ? draftEntity?.name || 'New Attendant' : activeTab === 'vehicles' ? draftEntity?.label || 'New Vehicle' : draftEntity?.name || 'New Grouping'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={shellStyles.modalContent}>
          {validationErrors.length > 0 ? <Alert variant="danger"><ul className="mb-0">{validationErrors.map(item => <li key={item}>{item}</li>)}</ul></Alert> : null}
          {activeTab === 'drivers' ? <>
              {driverAlerts.length > 0 ? <Alert variant="warning">{driverAlerts.map(alert => <div key={alert.text}>{alert.text}</div>)}</Alert> : null}
              <div className="d-flex flex-wrap gap-2 mb-3">{DRIVER_EDITOR_TABS.map(tab => <Button key={tab.key} className="rounded-pill" style={editorTab === tab.key ? shellStyles.activeTab : shellStyles.toolbarButton} onClick={() => setEditorTab(tab.key)}>{tab.label}</Button>)}</div>
              {renderDriverEditor()}
            </> : renderGenericEditor()}
        </Modal.Body>
        <Modal.Footer style={{ ...shellStyles.modalHeader, justifyContent: 'space-between' }}>
          <div className="small text-secondary">Los cambios se guardan en la API local del proyecto y alimentan Dispatcher.</div>
          <div className="d-flex gap-2">
            <Button className="rounded-pill" style={shellStyles.toolbarButton} onClick={() => setShowEditor(false)}>Cancel</Button>
            <Button className="rounded-pill" style={shellStyles.activeTab} onClick={handleSave} disabled={saving}>Save</Button>
          </div>
        </Modal.Footer>
      </Modal>
    </>;
};

export default DriversManagementWorkspace;