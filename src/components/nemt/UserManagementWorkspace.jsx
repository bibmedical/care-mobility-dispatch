'use client';

import { buildPasswordForUser, getUserManagementRows, normalizePhoneDigits } from '@/helpers/system-users';
import useSystemUsersApi from '@/hooks/useSystemUsersApi';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardBody, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';

const userShellStyles = {
  windowHeader: {
    backgroundColor: '#23324a'
  },
  body: {
    backgroundColor: '#171b27'
  },
  button: {
    backgroundColor: '#101521',
    borderColor: '#2a3144',
    color: '#e6ecff'
  },
  search: {
    width: 220,
    paddingLeft: 38,
    backgroundColor: '#101521',
    borderColor: '#2a3144',
    color: '#e6ecff'
  },
  deleteButton: {
    backgroundColor: '#ff4d4f',
    borderColor: '#ff4d4f',
    color: '#fff'
  },
  tableShell: {
    borderColor: '#2a3144',
    backgroundColor: '#171b27'
  },
  tableHead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: '#24c78b',
    color: '#08131a'
  },
  tableHeadCell: {
    backgroundColor: '#24c78b',
    color: '#08131a',
    borderColor: 'rgba(8,19,26,0.14)'
  },
  pageBadge: {
    backgroundColor: '#101521',
    borderColor: '#2a3144',
    color: '#e6ecff'
  },
  modalContent: {
    backgroundColor: '#171b27',
    color: '#e6ecff',
    borderColor: '#2a3144'
  },
  modalHeader: {
    backgroundColor: '#23324a',
    borderColor: '#2a3144'
  },
  modalInput: {
    backgroundColor: '#0c111b',
    borderColor: '#2a3144',
    color: '#e6ecff'
  }
};

const formLabelClassName = 'text-uppercase small fw-semibold text-secondary mb-2';

const tableColumns = ['First Name', 'Middle Initial', 'Last Name', 'Email', 'Phone', 'Role', 'Username', 'Password', 'Web Access', 'Android Access', 'Sync Status', 'Last Event Time', 'Event Type'];

const createBlankUser = () => ({
  id: `user-${Date.now()}`,
  firstName: '',
  middleInitial: '',
  lastName: '',
  isCompany: false,
  companyName: '',
  taxId: '',
  email: '',
  phone: '',
  role: 'DBSS Admin(Full...)',
  username: '',
  password: '',
  webAccess: true,
  androidAccess: true,
  lastEventTime: '',
  eventType: '',
  isProtected: false
});

const UserManagementWorkspace = () => {
  const { data, loading, saving, error, refresh, saveData } = useSystemUsersApi();
  const [search, setSearch] = useState('');
  const [syncFilter, setSyncFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [message, setMessage] = useState('Add, Edit, Delete, doble click y seleccion multiple ya estan conectados a autenticacion y al roster de choferes.');
  const [showEditor, setShowEditor] = useState(false);
  const [draftUser, setDraftUser] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const pageSize = 20;

  const users = useMemo(() => data?.users ?? [], [data]);
  const protectedUserIds = useMemo(() => data?.protectedUserIds ?? [], [data]);
  const rows = useMemo(() => getUserManagementRows(users, protectedUserIds), [users, protectedUserIds]);
  const syncFilterOptions = useMemo(() => Array.from(new Set(rows.map(row => row.syncStatus))), [rows]);
  const accessFilterOptions = useMemo(() => Array.from(new Set(rows.map(row => row.accessSummary))), [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesSearch = !term || Object.values(row).some(value => String(value).toLowerCase().includes(term));
      const matchesSync = syncFilter === 'all' || row.syncStatus === syncFilter;
      const matchesAccess = accessFilter === 'all' || row.accessSummary === accessFilter;
      return matchesSearch && matchesSync && matchesAccess;
    });
  }, [rows, search, syncFilter, accessFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const visibleRows = filteredRows.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize);
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selectedRowIds.includes(row.id));
  const selectedUsers = users.filter(user => selectedRowIds.includes(user.id));
  const selectedProtectedUsers = selectedUsers.filter(user => user.isProtected);

  useEffect(() => {
    setSelectedRowIds(current => current.filter(id => rows.some(row => row.id === id)));
  }, [rows]);

  const toggleRow = userId => {
    setSelectedRowIds(current => current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]);
  };

  const toggleAllVisible = checked => {
    if (checked) {
      setSelectedRowIds(current => Array.from(new Set([...current, ...visibleRows.map(row => row.id)])));
      return;
    }
    setSelectedRowIds(current => current.filter(id => !visibleRows.some(row => row.id === id)));
  };

  const openEditor = user => {
    setDraftUser(user ? {
      ...user,
      password: user.password || buildPasswordForUser(user),
      webAccess: typeof user.webAccess === 'boolean' ? user.webAccess : !user.role.includes('Driver'),
      androidAccess: typeof user.androidAccess === 'boolean' ? user.androidAccess : true
    } : {
      ...createBlankUser(),
      password: buildPasswordForUser(createBlankUser())
    });
    setValidationErrors([]);
    setShowEditor(true);
  };

  const openEditorForRow = userId => {
    const selectedUser = users.find(user => user.id === userId);
    if (!selectedUser) return;
    setSelectedRowIds([userId]);
    openEditor(selectedUser);
  };

  const validateUser = user => {
    const errors = [];
    if (!user.firstName.trim()) errors.push('First Name is required.');
    if (!user.lastName.trim()) errors.push('Last Name is required.');
    if (!user.username.trim()) errors.push('Username is required.');
    if (!String(user.password ?? '').trim()) errors.push('Password is required.');
    if (normalizePhoneDigits(user.phone).length < 10) errors.push('Phone must include at least 10 digits.');
    if (user.isCompany && !String(user.companyName ?? '').trim()) errors.push('Company name is required when Company is enabled.');
    if (user.isCompany && !String(user.taxId ?? '').trim()) errors.push('Tax ID is required when Company is enabled.');
    if (!user.webAccess && !user.androidAccess) errors.push('Enable at least one access type: Web or Android.');
    if (user.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.push('Email format is invalid.');
    if (users.some(existingUser => existingUser.id !== user.id && existingUser.username.toLowerCase() === user.username.toLowerCase())) errors.push('Username must be unique.');
    return errors;
  };

  const handleSave = async () => {
    if (!draftUser) return;
    const errors = validateUser(draftUser);
    setValidationErrors(errors);
    if (errors.length > 0) {
      setMessage(errors[0]);
      return;
    }

    const nextUsers = users.some(user => user.id === draftUser.id) ? users.map(user => user.id === draftUser.id ? draftUser : user) : [draftUser, ...users];
    const nextProtectedUserIds = draftUser.isProtected ? Array.from(new Set([...protectedUserIds, draftUser.id])) : protectedUserIds.filter(id => id !== draftUser.id);
    try {
      await saveData({
        version: data?.version ?? 4,
        protectedUserIds: nextProtectedUserIds,
        users: nextUsers.map(user => ({
          ...user,
          password: String(user.password || buildPasswordForUser(user))
        }))
      });
      setSelectedRowIds([draftUser.id]);
      setShowEditor(false);
      setDraftUser(null);
      setMessage(`Usuario ${draftUser.firstName} ${draftUser.lastName} guardado y sincronizado.`);
    } catch {
      return;
    }
  };

  const handleDelete = async () => {
    if (selectedRowIds.length === 0) {
      setMessage('Selecciona uno o mas usuarios para borrar.');
      return;
    }
    try {
      await saveData({
        version: data?.version ?? 4,
        protectedUserIds,
        users: users.filter(user => !selectedRowIds.includes(user.id))
      });
      setSelectedRowIds([]);
      setMessage('Usuarios eliminados y choferes sincronizados.');
    } catch {
      return;
    }
  };

  return <Card className="border-0 shadow-sm overflow-hidden">
      <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={userShellStyles.windowHeader}>
        <strong>Users</strong>
        <button type="button" className="btn btn-link text-white p-0 text-decoration-none">
          <IconifyIcon icon="iconoir:xmark" className="fs-18" />
        </button>
      </div>
      <CardBody className="p-2" style={userShellStyles.body}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-2">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Button className="rounded-pill" style={userShellStyles.button} onClick={refresh} disabled={loading || saving}>
              <IconifyIcon icon="iconoir:refresh-double" />
            </Button>
            <div className="vr text-secondary" />
            <Button className="rounded-pill" style={userShellStyles.button} onClick={() => openEditor(null)}>
              <IconifyIcon icon="iconoir:plus" className="me-2" />Add
            </Button>
            <Button className="rounded-pill" style={userShellStyles.button} onClick={() => {
            if (selectedUsers.length !== 1) {
              setMessage('Selecciona exactamente un usuario para editar.');
              return;
            }
            openEditor(selectedUsers[0]);
          }}>
              <IconifyIcon icon="iconoir:edit-pencil" className="me-2" />Edit
            </Button>
          </div>
          <div className="d-flex align-items-center gap-2 ms-auto">
            <div className="position-relative">
              <IconifyIcon icon="iconoir:search" className="position-absolute top-50 start-0 translate-middle-y ms-3 text-success" />
              <Form.Control value={search} onChange={event => {
              setSearch(event.target.value);
              setPageIndex(0);
            }} placeholder="Search" className="rounded-pill" style={userShellStyles.search} />
            </div>
            <Form.Select value={syncFilter} onChange={event => {
            setSyncFilter(event.target.value);
            setPageIndex(0);
          }} className="rounded-pill" style={{
            ...userShellStyles.modalInput,
            width: 180
          }}>
              <option value="all">All sync</option>
              {syncFilterOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </Form.Select>
            <Form.Select value={accessFilter} onChange={event => {
            setAccessFilter(event.target.value);
            setPageIndex(0);
          }} className="rounded-pill" style={{
            ...userShellStyles.modalInput,
            width: 180
          }}>
              <option value="all">All access</option>
              {accessFilterOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </Form.Select>
            <Button className="rounded-pill" style={userShellStyles.deleteButton} onClick={handleDelete} disabled={saving}>
              <IconifyIcon icon="iconoir:trash" className="me-2" />Delete
            </Button>
          </div>
        </div>

        <div className="small text-secondary mb-3">
          {saving ? 'Guardando cambios y sincronizando con Drivers...' : message}
        </div>
        <div className="small text-secondary mb-3">Todos los usuarios de esta lista ya existen en autenticacion. Password por defecto: username con inicial mayuscula + @ + ultimos 2 digitos del telefono, pero ahora tambien lo puedes cambiar manualmente. Tambien puedes marcar si el usuario es company y guardar su Tax ID. Doble click en una fila para editar.</div>
        {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}

        <div className="border overflow-hidden rounded-2" style={userShellStyles.tableShell}>
          <div className="table-responsive" style={{ maxHeight: 680 }}>
            <Table className="align-middle mb-0 text-white">
              <thead style={userShellStyles.tableHead}>
                <tr>
                  <th style={{ width: 34 }}><Form.Check checked={allVisibleSelected} onChange={event => toggleAllVisible(event.target.checked)} /></th>
                  {tableColumns.map(column => <th key={column} className="fw-normal" style={userShellStyles.tableHeadCell}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={14} className="text-center py-5 text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading users...</td></tr> : visibleRows.length ? visibleRows.map(row => {
                const isSelected = selectedRowIds.includes(row.id);
                return <tr key={row.id} onClick={() => toggleRow(row.id)} onDoubleClick={() => openEditorForRow(row.id)} style={{ cursor: 'pointer', backgroundColor: isSelected ? '#202c42' : '#171b27', color: '#e6ecff' }}>
                      <td onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}><Form.Check checked={isSelected} onChange={() => toggleRow(row.id)} /></td>
                      <td>{row.firstName}</td>
                      <td>{row.middleInitial}</td>
                      <td>{row.lastName}</td>
                      <td>{row.email}</td>
                      <td>{row.phone}</td>
                      <td>{row.role}</td>
                      <td>{row.username}{row.isProtected ? <span className="badge ms-2" style={{ backgroundColor: '#2fc98f', color: '#08131a' }}>Primary</span> : null}</td>
                      <td>{row.passwordRule}</td>
                      <td>{row.webAccess}</td>
                      <td>{row.androidAccess}</td>
                      <td>{row.syncStatus}</td>
                      <td>{row.lastEventTime}</td>
                      <td>{row.eventType}</td>
                    </tr>;
              }) : <tr><td colSpan={14} className="text-center py-5 text-secondary">No users found.</td></tr>}
              </tbody>
            </Table>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 mt-3">
          <Button className="rounded-pill" style={userShellStyles.button} disabled={safePageIndex === 0} onClick={() => setPageIndex(current => Math.max(0, current - 1))}>
            <IconifyIcon icon="iconoir:nav-arrow-left" />
          </Button>
          <div className="px-3 py-2 rounded-pill border" style={userShellStyles.pageBadge}>{safePageIndex + 1} of {totalPages}</div>
          <Button className="rounded-pill" style={userShellStyles.button} disabled={safePageIndex >= totalPages - 1} onClick={() => setPageIndex(current => Math.min(totalPages - 1, current + 1))}>
            <IconifyIcon icon="iconoir:nav-arrow-right" />
          </Button>
        </div>
      </CardBody>

      <Modal show={showEditor} onHide={() => setShowEditor(false)} centered>
        <Modal.Header closeButton style={userShellStyles.modalHeader} className="text-white">
          <Modal.Title>{draftUser?.id && users.some(user => user.id === draftUser.id) ? 'Edit User' : 'Add User'}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={userShellStyles.modalContent}>
          {validationErrors.length > 0 ? <Alert variant="danger"><ul className="mb-0">{validationErrors.map(item => <li key={item}>{item}</li>)}</ul></Alert> : null}
          {draftUser ? <Row className="g-3">
              <Col md={4}><Form.Label className={formLabelClassName}>First Name</Form.Label><Form.Control value={draftUser.firstName} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, firstName: event.target.value }))} /></Col>
              <Col md={2}><Form.Label className={formLabelClassName}>MI</Form.Label><Form.Control value={draftUser.middleInitial} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, middleInitial: event.target.value }))} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Last Name</Form.Label><Form.Control value={draftUser.lastName} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, lastName: event.target.value }))} /></Col>
              <Col md={6}><Form.Check type="switch" id="company-user-switch" label="Company account" checked={Boolean(draftUser.isCompany)} onChange={event => setDraftUser(current => ({
                ...current,
                isCompany: event.target.checked,
                companyName: event.target.checked ? current.companyName : '',
                taxId: event.target.checked ? current.taxId : ''
              }))} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Company Name</Form.Label><Form.Control value={draftUser.companyName} style={userShellStyles.modalInput} disabled={!draftUser.isCompany} onChange={event => setDraftUser(current => ({ ...current, companyName: event.target.value }))} placeholder={draftUser.isCompany ? 'Enter company name' : 'Enable Company account first'} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Tax ID</Form.Label><Form.Control value={draftUser.taxId} style={userShellStyles.modalInput} disabled={!draftUser.isCompany} onChange={event => setDraftUser(current => ({ ...current, taxId: event.target.value }))} placeholder={draftUser.isCompany ? 'Enter tax ID / EIN' : 'Enable Company account first'} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Email</Form.Label><Form.Control value={draftUser.email} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, email: event.target.value }))} /></Col>
              <Col md={3}><Form.Label className={formLabelClassName}>Phone</Form.Label><Form.Control value={draftUser.phone} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, phone: event.target.value }))} /></Col>
              <Col md={3}><Form.Label className={formLabelClassName}>Username</Form.Label><Form.Control value={draftUser.username} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, username: event.target.value }))} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Role</Form.Label><Form.Select value={draftUser.role} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, role: event.target.value }))}><option>DBSS Admin(Full...)</option><option>Driver(Driver)</option><option>Dispatcher</option><option>Billing</option></Form.Select></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Password</Form.Label><Form.Control value={draftUser.password} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, password: event.target.value }))} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Last Event Time</Form.Label><Form.Control value={draftUser.lastEventTime} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, lastEventTime: event.target.value }))} /></Col>
              <Col md={6}><Form.Label className={formLabelClassName}>Event Type</Form.Label><Form.Control value={draftUser.eventType} style={userShellStyles.modalInput} onChange={event => setDraftUser(current => ({ ...current, eventType: event.target.value }))} /></Col>
              <Col md={6}><Form.Check type="switch" id="web-access-switch" label="Web access" checked={Boolean(draftUser.webAccess)} onChange={event => setDraftUser(current => ({ ...current, webAccess: event.target.checked }))} /></Col>
              <Col md={6}><Form.Check type="switch" id="android-access-switch" label="Android app access" checked={Boolean(draftUser.androidAccess)} onChange={event => setDraftUser(current => ({ ...current, androidAccess: event.target.checked }))} /></Col>
              <Col md={12}><Form.Check type="switch" id="protect-user-switch" label="Primary system admin: block delete from User Management" checked={Boolean(draftUser.isProtected)} onChange={event => setDraftUser(current => ({ ...current, isProtected: event.target.checked }))} /></Col>
              <Col md={12}><div className="small text-secondary border rounded-3 p-3" style={{ borderColor: '#2a3144' }}>Password actual: <strong>{draftUser.password || buildPasswordForUser(draftUser)}</strong><br />Password sugerido: <strong>{buildPasswordForUser(draftUser)}</strong><br />Acceso: {!draftUser.webAccess && !draftUser.androidAccess ? 'No access' : draftUser.webAccess && draftUser.androidAccess ? 'Web + Android' : draftUser.webAccess ? 'Web only' : 'Android only'}<br />Cuenta company: {draftUser.isCompany ? `${draftUser.companyName || 'Company'}${draftUser.taxId ? ` | Tax ID: ${draftUser.taxId}` : ''}` : 'No'}<br />Si cambias nombre, telefono, username o rol, se sincroniza con autenticacion y con Drivers.</div></Col>
            </Row> : null}
        </Modal.Body>
        <Modal.Footer style={userShellStyles.modalHeader}>
          <Button className="rounded-pill" style={userShellStyles.button} onClick={() => setShowEditor(false)}>Cancel</Button>
          <Button className="rounded-pill" style={userShellStyles.button} onClick={handleSave} disabled={saving}>Save</Button>
        </Modal.Footer>
      </Modal>
    </Card>;
};

export default UserManagementWorkspace;