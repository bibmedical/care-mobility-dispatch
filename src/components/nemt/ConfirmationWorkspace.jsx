'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { useNemtContext } from '@/context/useNemtContext';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

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

const STATUS_VARIANTS = {
  Confirmed: 'success',
  Cancelled: 'danger',
  'Needs Call': 'warning',
  Pending: 'primary',
  'Not Sent': 'secondary',
  'Opted Out': 'dark'
};

const getTripTypeLabel = trip => {
  const source = `${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'STR';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};
const getTripLegFilterKey = trip => {
  const legLabel = String(trip?.legLabel || '').trim().toLowerCase();
  if (!legLabel) return 'AL';
  if (legLabel.includes('outbound') || legLabel.includes('appointment') || legLabel.includes('appt')) return 'AL';
  if (legLabel.includes('return') || legLabel.includes('home') || legLabel.includes('house') || legLabel.includes('back')) return 'BL';
  if (legLabel.includes('3') || legLabel.includes('third') || legLabel.includes('connector') || legLabel.includes('cross')) return 'CL';
  return 'CL';
};

const ConfirmationWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const router = useRouter();
  const { trips, refreshDispatchState } = useNemtContext();
  const { data: smsData, saveData: saveSmsData } = useSmsIntegrationApi();
  const { data: blacklistData, saveData: saveBlacklistData } = useBlacklistApi();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [customMessage, setCustomMessage] = useState('');
  const [customSending, setCustomSending] = useState(false);
  const [customStatus, setCustomStatus] = useState('');
  const [legFilter, setLegFilter] = useState('all');
  const [rideTypeFilter, setRideTypeFilter] = useState('all');
  const [confirmationSending, setConfirmationSending] = useState(false);

  const optOutList = Array.isArray(smsData?.sms?.optOutList) ? smsData.sms.optOutList : [];
  const blacklistEntries = Array.isArray(blacklistData?.entries) ? blacklistData.entries : [];
  const groupTemplates = smsData?.sms?.groupTemplates || {};
  const tripBlockingMap = useMemo(() => new Map(trips.map(trip => [trip.id, getTripBlockingState({
    trip,
    optOutList,
    blacklistEntries,
    defaultCountryCode: smsData?.sms?.defaultCountryCode
  })])), [blacklistEntries, optOutList, smsData?.sms?.defaultCountryCode, trips]);
  const activeGroupTemplate = useMemo(() => {
    if (legFilter !== 'all' && groupTemplates[legFilter]) return groupTemplates[legFilter];
    if (rideTypeFilter !== 'all' && groupTemplates[rideTypeFilter]) return groupTemplates[rideTypeFilter];
    return '';
  }, [groupTemplates, legFilter, rideTypeFilter]);

  const summary = useMemo(() => ({
    total: trips.length,
    pending: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Pending').length,
    confirmed: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Confirmed').length,
    cancelled: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Cancelled').length,
    needsCall: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Needs Call').length,
    notSent: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Not Sent').length,
    optedOut: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Opted Out').length
  }), [tripBlockingMap, trips]);

  const filteredTrips = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return trips.filter(trip => {
      const confirmationStatus = getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id));
      if (statusFilter !== 'all' && confirmationStatus !== statusFilter) return false;
      if (legFilter !== 'all' && getTripLegFilterKey(trip) !== legFilter) return false;
      if (rideTypeFilter !== 'all' && getTripTypeLabel(trip) !== rideTypeFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [trip.id, trip.rider, trip.patientPhoneNumber, trip.address, trip.destination, trip.confirmation?.lastResponseText].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [legFilter, rideTypeFilter, search, statusFilter, tripBlockingMap, trips]);

  const visibleTripIds = useMemo(() => filteredTrips.map(trip => trip.id), [filteredTrips]);

  const toggleTripSelection = tripId => {
    setSelectedTripIds(current => current.includes(tripId) ? current.filter(id => id !== tripId) : [...current, tripId]);
  };

  const handleToggleOptOut = async trip => {
    const blockingState = tripBlockingMap.get(trip.id) || getTripBlockingState({
      trip,
      optOutList,
      blacklistEntries,
      defaultCountryCode: smsData?.sms?.defaultCountryCode
    });

    if (blockingState.optOutEntry || blockingState.blacklistEntry) {
      const requests = [];

      if (blockingState.optOutEntry) {
        requests.push(saveSmsData({
          sms: {
            ...(smsData?.sms || {}),
            optOutList: optOutList.filter(entry => entry.id !== blockingState.optOutEntry.id)
          }
        }));
      }

      if (blockingState.blacklistEntry) {
        requests.push(saveBlacklistData({
          version: blacklistData?.version ?? 1,
          entries: blacklistEntries.map(entry => entry.id === blockingState.blacklistEntry.id ? {
            ...entry,
            status: 'Resolved',
            updatedAt: new Date().toISOString()
          } : entry)
        }));
      }

      await Promise.all(requests);
      setCustomStatus('Paciente removido del bloqueo automatico.');
      return;
    }

    const normalizedTripPhone = String(trip.patientPhoneNumber || '').replace(/\D/g, '');
    const normalizedRider = String(trip.rider || '').trim().toLowerCase();
    const nextOptOutList = [{
      id: `${normalizedTripPhone || normalizedRider.replace(/\s+/g, '-')}-${Date.now()}`,
      name: trip.rider || '',
      phone: trip.patientPhoneNumber || '',
      reason: 'No automatic confirmation',
      createdAt: new Date().toISOString()
    }, ...optOutList];

    await saveSmsData({
      sms: {
        ...(smsData?.sms || {}),
        optOutList: nextOptOutList
      }
    });
    setCustomStatus('Patient added to Do Not Confirm. Will be blocked every day until removed.');
  };

  const handleSendCustomMessage = async () => {
    if (selectedTripIds.length === 0) {
      setCustomStatus('Select at least one trip to send a Custom SMS.');
      return;
    }
    if (!customMessage.trim()) {
      setCustomStatus('Escribe el mensaje custom antes de enviarlo.');
      return;
    }
    setCustomSending(true);
    try {
      const response = await fetch('/api/integrations/sms/send-custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tripIds: selectedTripIds,
          message: customMessage
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send custom SMS');
      await refreshDispatchState({ forceServer: true });
      setCustomStatus(`Custom SMS enviados: ${payload.sentCount}. Fallidos: ${payload.failedCount}.`);
      setCustomMessage('');
    } catch (error) {
      setCustomStatus(error.message || 'No se pudo mandar el Custom SMS.');
    } finally {
      setCustomSending(false);
    }
  };

  const handleSelectVisible = () => {
    setSelectedTripIds(visibleTripIds);
    setCustomStatus(`${visibleTripIds.length} trip(s) seleccionados del grupo visible.`);
  };

  const handleClearSelection = () => {
    setSelectedTripIds([]);
    setCustomStatus('Seleccion limpia.');
  };

  const handleSendGroupConfirmation = async () => {
    if (selectedTripIds.length === 0) {
      setCustomStatus('Select at least one trip to send a confirmation.');
      return;
    }
    setConfirmationSending(true);
    try {
      const response = await fetch('/api/integrations/sms/send-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tripIds: selectedTripIds
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send confirmation SMS');
      await refreshDispatchState({ forceServer: true });
      setCustomStatus(`Confirmaciones enviadas: ${payload.sentCount}. Saltadas: ${payload.skippedCount || 0}. Fallidas: ${payload.failedCount}.`);
    } catch (error) {
      setCustomStatus(error.message || 'No se pudo mandar la confirmacion por grupo.');
    } finally {
      setConfirmationSending(false);
    }
  };

  const handleLoadGroupTemplate = () => {
    if (!activeGroupTemplate) {
      setCustomStatus('Ese grupo no tiene mensaje predeterminado guardado todavia.');
      return;
    }
    setCustomMessage(activeGroupTemplate);
    setCustomStatus('Mensaje predeterminado del grupo cargado en Custom SMS.');
  };

  return <>
      <PageTitle title="Confirmation" subName="Operations" />

      <Row className="g-3 mb-3">
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Trips</div><h4 className="mb-0">{summary.total}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Pending</div><h4 className="mb-0">{summary.pending}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Confirmed</div><h4 className="mb-0">{summary.confirmed}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Cancelled</div><h4 className="mb-0">{summary.cancelled}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Needs Call</div><h4 className="mb-0">{summary.needsCall}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Not Sent</div><h4 className="mb-0">{summary.notSent}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={surfaceStyles.card} className="h-100 border"><CardBody><div className="text-secondary small mb-1">Opted Out</div><h4 className="mb-0">{summary.optedOut}</h4></CardBody></Card>
        </Col>
      </Row>

      <Card style={surfaceStyles.card} className="border mb-3">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 align-items-start align-items-xl-center">
            <div>
              <h5 className="mb-1">Trip Confirmation Center</h5>
              <div className="text-secondary small">Aqui puedes ver que viajes ya recibieron SMS, cuales fueron confirmados, cuales pidieron llamada y cuales se cancelaron por respuesta del paciente.</div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => router.push('/dispatcher')}>Open Dispatcher</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => router.push('/integrations/sms')}>Open SMS Integration</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card style={surfaceStyles.card} className="border">
        <CardBody>
          <div className="border rounded-3 p-3 mb-3" style={surfaceStyles.input}>
            <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-3">
              <div>
                <div className="fw-semibold">Custom SMS</div>
                <div className="small text-secondary">Selecciona trips y manda un mensaje manual. Esto no depende del flujo de confirmacion automatica.</div>
              </div>
              <div className="small text-secondary">{selectedTripIds.length} selected</div>
            </div>
            <div className="d-flex flex-column flex-xl-row gap-2">
              <Form.Control as="textarea" rows={2} value={customMessage} onChange={event => setCustomMessage(event.target.value)} placeholder="Write a custom SMS for selected patients" style={{ ...surfaceStyles.input, minHeight: 72 }} />
              <Button style={{ ...surfaceStyles.button, minWidth: 170 }} onClick={handleLoadGroupTemplate}>Load Group Template</Button>
              <Button style={{ ...surfaceStyles.button, minWidth: 170 }} onClick={handleSendCustomMessage} disabled={customSending}>{customSending ? 'Sending...' : 'Send Custom SMS'}</Button>
            </div>
            {customStatus ? <div className="small mt-2 text-secondary">{customStatus}</div> : null}
          </div>

          <div className="d-flex flex-column flex-xl-row gap-2 justify-content-between mb-3">
            <div className="d-flex gap-2 flex-wrap">
              <Form.Select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 220 }}>
                <option value="all">All statuses</option>
                <option value="Not Sent">Not Sent</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Needs Call">Needs Call</option>
                <option value="Opted Out">Opted Out</option>
              </Form.Select>
              <Form.Select value={legFilter} onChange={event => setLegFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }}>
                <option value="all">All legs</option>
                <option value="AL">AL</option>
                <option value="BL">BL</option>
                <option value="CL">CL</option>
              </Form.Select>
              <Form.Select value={rideTypeFilter} onChange={event => setRideTypeFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }}>
                <option value="all">All types</option>
                <option value="A">A</option>
                <option value="W">W</option>
                <option value="STR">STR</option>
              </Form.Select>
              <Button style={surfaceStyles.button} onClick={handleSelectVisible}>Select Visible</Button>
              <Button style={surfaceStyles.button} onClick={handleClearSelection}>Clear</Button>
              <Button style={surfaceStyles.button} onClick={handleSendGroupConfirmation} disabled={confirmationSending}>{confirmationSending ? 'Sending...' : 'Send Confirmation'}</Button>
            </div>
            <Form.Control value={search} onChange={event => setSearch(event.target.value)} placeholder="Search trip, rider, phone or reply" style={{ ...surfaceStyles.input, width: 320, maxWidth: '100%' }} />
          </div>

          <div className="table-responsive">
            <Table hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
              <thead className="table-light">
                <tr>
                  <th style={{ width: 48 }} />
                  <th>Trip ID</th>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Leg</th>
                  <th>Type</th>
                  <th>Do Not Confirm</th>
                  <th>Confirmation</th>
                  <th>Dispatch Status</th>
                  <th>Reply</th>
                  <th>Sent</th>
                  <th>Responded</th>
                  <th style={{ width: 140 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length > 0 ? filteredTrips.map(trip => {
                  const blockingState = tripBlockingMap.get(trip.id) || { isBlocked: false };
                  const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
                  const isOptedOut = blockingState.isBlocked;
                  return <tr key={trip.id}>
                      <td><Form.Check checked={selectedTripIds.includes(trip.id)} onChange={() => toggleTripSelection(trip.id)} /></td>
                      <td className="fw-semibold">{trip.id}</td>
                      <td>{trip.rider}</td>
                      <td>{trip.patientPhoneNumber || '-'}</td>
                      <td>{getTripLegFilterKey(trip)}</td>
                      <td>{getTripTypeLabel(trip)}</td>
                      <td>{isOptedOut ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>Blocked</Badge> : <Badge bg="success">Allowed</Badge>}</td>
                      <td>{confirmationStatus === 'Opted Out' ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>{confirmationStatus}</Badge> : <Badge bg={STATUS_VARIANTS[confirmationStatus] || 'secondary'}>{confirmationStatus}</Badge>}</td>
                      <td>{trip.safeRideStatus || trip.status || '-'}</td>
                      <td style={{ maxWidth: 240, whiteSpace: 'normal' }}>{trip.confirmation?.lastResponseText || '-'}</td>
                      <td>{trip.confirmation?.sentAt ? new Date(trip.confirmation.sentAt).toLocaleString() : '-'}</td>
                      <td>{trip.confirmation?.respondedAt ? new Date(trip.confirmation.respondedAt).toLocaleString() : '-'}</td>
                      <td><Button size="sm" style={{ backgroundColor: '#000000', borderColor: '#000000', color: '#ffffff', minWidth: 118 }} onClick={() => handleToggleOptOut(trip)}>{isOptedOut ? 'Allow Confirm' : 'Do Not Confirm'}</Button></td>
                    </tr>;
                }) : <tr>
                    <td colSpan={13} className="text-center text-muted py-4">No confirmation records match the current filter.</td>
                  </tr>}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </>;
};

export default ConfirmationWorkspace;