'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import React, { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Spinner, Table } from 'react-bootstrap';

const buildSurfaceStyles = isLight => ({
  card: {
    backgroundColor: isLight ? '#ffffff' : '#171b27',
    borderColor: isLight ? '#d5deea' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  input: {
    backgroundColor: isLight ? '#f8fbff' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  button: {
    backgroundColor: isLight ? '#f3f7fc' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  }
});

const CATEGORY_OPTIONS = ['Do Not Schedule', 'Deceased', 'This Week Only', 'Legal / Claim', 'Safety Risk', 'Other'];
const STATUS_OPTIONS = ['Active', 'Resolved'];

const createEmptyEntry = () => ({
  name: '',
  phone: '',
  category: 'Do Not Schedule',
  status: 'Active',
  holdUntil: '',
  notes: '',
  source: 'Dispatcher'
});

const getCategoryVariant = category => {
  if (category === 'Deceased') return 'dark';
  if (category === 'Legal / Claim') return 'danger';
  if (category === 'This Week Only') return 'warning';
  if (category === 'Safety Risk') return 'danger';
  return 'secondary';
};

const BlacklistWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const { data, loading, saving, error, saveData, refresh } = useBlacklistApi();
  const [draft, setDraft] = useState(createEmptyEntry());
  const [message, setMessage] = useState('Administra personas que no deben viajar con nosotros o que deben pausarse temporalmente. Las entradas activas bloquean confirmaciones automaticamente cada dia hasta que las resuelvas.');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return entries.filter(entry => {
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [entry.name, entry.phone, entry.category, entry.notes, entry.source].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [categoryFilter, entries, search, statusFilter]);

  const stats = useMemo(() => ({
    total: entries.length,
    active: entries.filter(entry => entry.status === 'Active').length,
    deceased: entries.filter(entry => entry.category === 'Deceased' && entry.status === 'Active').length,
    temporary: entries.filter(entry => entry.category === 'This Week Only' && entry.status === 'Active').length,
    legal: entries.filter(entry => entry.category === 'Legal / Claim' && entry.status === 'Active').length,
    resolved: entries.filter(entry => entry.status === 'Resolved').length
  }), [entries]);

  const handleAddEntry = async () => {
    if (!draft.name.trim() && !draft.phone.trim()) {
      setMessage('Escribe nombre o telefono para agregar a Black List.');
      return;
    }
    const nextEntry = {
      id: `blacklist-${Date.now()}`,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      category: draft.category,
      status: draft.status,
      holdUntil: draft.holdUntil,
      notes: draft.notes.trim(),
      source: draft.source.trim() || 'Dispatcher',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await saveData({
        version: data?.version ?? 1,
        entries: [nextEntry, ...entries]
      });
      setDraft(createEmptyEntry());
      setMessage('Persona agregada a Black List.');
    } catch {
      return;
    }
  };

  const handleStatusToggle = async entry => {
    try {
      await saveData({
        version: data?.version ?? 1,
        entries: entries.map(item => item.id === entry.id ? {
          ...item,
          status: item.status === 'Active' ? 'Resolved' : 'Active',
          updatedAt: new Date().toISOString()
        } : item)
      });
      setMessage(`Estado actualizado para ${entry.name || entry.phone || 'registro'}.`);
    } catch {
      return;
    }
  };

  const handleDeleteEntry = async entryId => {
    try {
      await saveData({
        version: data?.version ?? 1,
        entries: entries.filter(entry => entry.id !== entryId)
      });
      setMessage('Registro removido de Black List.');
    } catch {
      return;
    }
  };

  return <>
      <PageTitle title="Black List" subName="Operations" />

      <Row className="g-3 mb-3">
        <Col md={6} xl={2}><Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Total</div><h4 className="mb-0">{stats.total}</h4></CardBody></Card></Col>
        <Col md={6} xl={2}><Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Active</div><h4 className="mb-0">{stats.active}</h4></CardBody></Card></Col>
        <Col md={6} xl={2}><Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Deceased</div><h4 className="mb-0">{stats.deceased}</h4></CardBody></Card></Col>
        <Col md={6} xl={2}><Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">This Week Only</div><h4 className="mb-0">{stats.temporary}</h4></CardBody></Card></Col>
        <Col md={6} xl={2}><Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Legal / Claim</div><h4 className="mb-0">{stats.legal}</h4></CardBody></Card></Col>
        <Col md={6} xl={2}><Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Resolved</div><h4 className="mb-0">{stats.resolved}</h4></CardBody></Card></Col>
      </Row>

      <Card style={surfaceStyles.card} className="border mb-3">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-3">
            <div>
              <h5 className="mb-1">Add Person To Black List</h5>
              <div className="small text-secondary">Use this page to block passengers who refuse transport, have passed away, need a temporary pause, or require legal case handling. Every active entry will be automatically applied to daily trips until removed or resolved.</div>
              <div className="small text-secondary mt-2">{saving ? 'Saving Black List...' : message}</div>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <Button style={surfaceStyles.button} onClick={refresh} disabled={loading || saving}>Refresh</Button>
              <Button style={surfaceStyles.button} onClick={handleAddEntry} disabled={saving}>Add</Button>
            </div>
          </div>

          {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}
          {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading Black List...</div> : <Row className="g-3">
              <Col md={4}><Form.Label className="small text-uppercase text-secondary fw-semibold">Name</Form.Label><Form.Control value={draft.name} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></Col>
              <Col md={3}><Form.Label className="small text-uppercase text-secondary fw-semibold">Phone</Form.Label><Form.Control value={draft.phone} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, phone: event.target.value }))} /></Col>
              <Col md={3}><Form.Label className="small text-uppercase text-secondary fw-semibold">Category</Form.Label><Form.Select value={draft.category} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))}>{CATEGORY_OPTIONS.map(option => <option key={option}>{option}</option>)}</Form.Select></Col>
              <Col md={2}><Form.Label className="small text-uppercase text-secondary fw-semibold">Status</Form.Label><Form.Select value={draft.status} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))}>{STATUS_OPTIONS.map(option => <option key={option}>{option}</option>)}</Form.Select></Col>
              <Col md={3}><Form.Label className="small text-uppercase text-secondary fw-semibold">Hold Until</Form.Label><Form.Control type="date" value={draft.holdUntil} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, holdUntil: event.target.value }))} /></Col>
              <Col md={3}><Form.Label className="small text-uppercase text-secondary fw-semibold">Source</Form.Label><Form.Control value={draft.source} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, source: event.target.value }))} /></Col>
              <Col md={6}><Form.Label className="small text-uppercase text-secondary fw-semibold">Notes</Form.Label><Form.Control as="textarea" rows={3} value={draft.notes} style={surfaceStyles.input} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></Col>
            </Row>}
        </CardBody>
      </Card>

      <Card style={surfaceStyles.card} className="border">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row gap-2 justify-content-between mb-3">
            <div className="d-flex gap-2 flex-wrap">
              <Form.Select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 220 }}>
                <option value="all">All categories</option>
                {CATEGORY_OPTIONS.map(option => <option key={option}>{option}</option>)}
              </Form.Select>
              <Form.Select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }}>
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map(option => <option key={option}>{option}</option>)}
              </Form.Select>
            </div>
            <Form.Control value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, phone, notes or source" style={{ ...surfaceStyles.input, width: 320, maxWidth: '100%' }} />
          </div>

          <div className="table-responsive">
            <Table hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Hold Until</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th>Created</th>
                  <th style={{ width: 180 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length > 0 ? filteredEntries.map(entry => <tr key={entry.id}>
                    <td className="fw-semibold">{entry.name || '-'}</td>
                    <td>{entry.phone || '-'}</td>
                    <td><Badge bg={getCategoryVariant(entry.category)}>{entry.category}</Badge></td>
                    <td><Badge bg={entry.status === 'Active' ? 'danger' : 'secondary'}>{entry.status}</Badge></td>
                    <td>{entry.holdUntil || '-'}</td>
                    <td>{entry.source || '-'}</td>
                    <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{entry.notes || '-'}</td>
                    <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}</td>
                    <td><div className="d-flex gap-2"><Button variant="outline-light" size="sm" onClick={() => handleStatusToggle(entry)}>{entry.status === 'Active' ? 'Resolve' : 'Reopen'}</Button><Button variant="outline-danger" size="sm" onClick={() => handleDeleteEntry(entry.id)}>Delete</Button></div></td>
                  </tr>) : <tr>
                    <td colSpan={9} className="text-center text-muted py-4">No Black List entries match the current filter.</td>
                  </tr>}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </>;
};

export default BlacklistWorkspace;