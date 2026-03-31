'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { useNemtContext } from '@/context/useNemtContext';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';

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
  const { trips, refreshDispatchState, updateTripRecord } = useNemtContext();
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
  
  // New states for date, time, and manual confirmation
  const [confirmationDate, setConfirmationDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [timeFromFilter, setTimeFromFilter] = useState('02:00');
  const [timeToFilter, setTimeToFilter] = useState('08:00');
  const [manualConfirmations, setManualConfirmations] = useState({});
  const [cancelNoteModal, setCancelNoteModal] = useState(null);
  const [cancelNoteDraft, setCancelNoteDraft] = useState('');
  
  // Hospital/Rehab states
  const [hospitalRehabModal, setHospitalRehabModal] = useState(null);
  const [hospitalRehabType, setHospitalRehabType] = useState('Hospital');
  const [hospitalRehabStartDate, setHospitalRehabStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hospitalRehabEndDate, setHospitalRehabEndDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  });
  const [hospitalRehabNotes, setHospitalRehabNotes] = useState('');
  
  // Confirmation method modal
  const [confirmationMethodModal, setConfirmationMethodModal] = useState(null);
  const [confirmationMethod, setConfirmationMethod] = useState('whatsapp');
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false);

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
    const today = new Date().toISOString().slice(0, 10);
    
    return trips.filter(trip => {
      // Check if trip is in hospital/rehab (should be excluded from normal confirmation)
      const isInHospitalRehab = trip.hospitalStatus && trip.hospitalStatus.startDate <= today && today <= trip.hospitalStatus.endDate;
      
      const confirmationStatus = getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id));
      if (statusFilter !== 'all' && confirmationStatus !== statusFilter) return false;
      if (legFilter !== 'all' && getTripLegFilterKey(trip) !== legFilter) return false;
      if (rideTypeFilter !== 'all' && getTripTypeLabel(trip) !== rideTypeFilter) return false;
      
      // Optionally hide trips in active hospital/rehab status from normal confirmation view
      // Uncomment below if you want to hide them automatically:
      // if (isInHospitalRehab) return false;
      
      // Filter by date
      const tripDate = trip.serviceDate || trip.dateOfService || trip.pickupDate || trip.appointmentDate || trip.tripDate;
      if (tripDate && confirmationDate !== 'all') {
        const tripDateStr = new Date(tripDate).toISOString().slice(0, 10);
        if (tripDateStr !== confirmationDate) return false;
      }
      
      // Filter by time range
      const tripTime = trip.scheduledPickup || trip.pickupTime || trip.appointmentTime || trip.startTime || '';
      if (tripTime && timeFromFilter && timeToFilter) {
        const [hours, minutes] = tripTime.match(/\d+/g) || ['00', '00'];
        const tripTimeStr = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
        if (tripTimeStr < timeFromFilter || tripTimeStr > timeToFilter) return false;
      }
      
      if (!normalizedSearch) return true;
      const haystack = [trip.id, trip.rider, trip.patientPhoneNumber, trip.address, trip.destination, trip.confirmation?.lastResponseText].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [confirmationDate, legFilter, rideTypeFilter, search, statusFilter, timeFromFilter, timeToFilter, tripBlockingMap, trips]);

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

  const handleSendGroupConfirmation = () => {
    if (selectedTripIds.length === 0) {
      setCustomStatus('Select at least one trip to send a confirmation.');
      return;
    }
    
    // Get the actual trip objects
    const tripsToConfirm = filteredTrips.filter(trip => selectedTripIds.includes(trip.id));
    if (tripsToConfirm.length === 0) {
      setCustomStatus('No matching trips found for selected IDs.');
      return;
    }
    
    // Open confirmation method modal
    handleOpenConfirmationMethod(tripsToConfirm);
  };

  const handleLoadGroupTemplate = () => {
    if (!activeGroupTemplate) {
      setCustomStatus('Ese grupo no tiene mensaje predeterminado guardado todavia.');
      return;
    }
    setCustomMessage(activeGroupTemplate);
    setCustomStatus('Mensaje predeterminado del grupo cargado en Custom SMS.');
  };

  const handleManualConfirm = (tripId, trip) => {
    // Open confirmation method modal if trip info available
    if (trip) {
      handleOpenConfirmationMethod([trip]);
    } else {
      // Local manual confirmation
      setManualConfirmations(current => ({
        ...current,
        [tripId]: {
          status: 'Confirmed',
          method: 'M',
          timestamp: new Date().toISOString()
        }
      }));
      setCustomStatus(`Trip ${tripId} marcado manualmente como Confirmado.`);
    }
  };

  const handleCancelWithNote = trip => {
    setCancelNoteModal(trip);
    setCancelNoteDraft('');
  };

  const handleSaveCancelNote = () => {
    if (!cancelNoteModal) return;
    updateTripRecord(cancelNoteModal.id, {
      notes: (cancelNoteModal.notes || '') + (cancelNoteModal.notes ? '\n' : '') + `[CANCELADO] ${new Date().toLocaleString()}: ${cancelNoteDraft}`
    });
    setManualConfirmations(current => ({
      ...current,
      [cancelNoteModal.id]: {
        status: 'Cancelled',
        method: 'MANUAL',
        timestamp: new Date().toISOString(),
        note: cancelNoteDraft
      }
    }));
    setCancelNoteModal(null);
    setCancelNoteDraft('');
    setCustomStatus(`Trip ${cancelNoteModal.id} cancelado con nota.`);
  };

  const exportToPDF = () => {
    if (filteredTrips.length === 0) {
      setCustomStatus('No hay viajes para exportar con el filtro actual.');
      return;
    }

    let htmlContent = '<h1>Confirmation Report</h1>';
    htmlContent += `<p><strong>Date:</strong> ${confirmationDate}</p>`;
    htmlContent += `<p><strong>Time Range:</strong> ${timeFromFilter} - ${timeToFilter}</p>`;
    htmlContent += '<table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse;">';
    htmlContent += '<tr style="background-color:#f0f0f0;"><th>Trip ID</th><th>Rider</th><th>Phone</th><th>Leg</th><th>Type</th><th>Status</th><th>Confirmation</th></tr>';

    filteredTrips.forEach(trip => {
      const blockingState = tripBlockingMap.get(trip.id) || { isBlocked: false };
      const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
      htmlContent += `<tr>
        <td>${trip.id}</td>
        <td>${trip.rider}</td>
        <td>${trip.patientPhoneNumber || '-'}</td>
        <td>${getTripLegFilterKey(trip)}</td>
        <td>${getTripTypeLabel(trip)}</td>
        <td>${confirmationStatus}</td>
        <td>${trip.confirmation?.sentAt ? new Date(trip.confirmation.sentAt).toLocaleString() : '-'}</td>
      </tr>`;
    });

    htmlContent += '</table>';
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
    setCustomStatus(`Exportando ${filteredTrips.length} viajes a PDF.`);
  };

  const handleOpenHospitalRehabModal = trip => {
    setHospitalRehabModal(trip);
    if (trip.hospitalStatus) {
      setHospitalRehabType(trip.hospitalStatus.type || 'Hospital');
      setHospitalRehabStartDate(trip.hospitalStatus.startDate);
      setHospitalRehabEndDate(trip.hospitalStatus.endDate);
      setHospitalRehabNotes(trip.hospitalStatus.notes || '');
    } else {
      setHospitalRehabType('Hospital');
      setHospitalRehabStartDate(new Date().toISOString().slice(0, 10));
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setHospitalRehabEndDate(endDate.toISOString().slice(0, 10));
      setHospitalRehabNotes('');
    }
  };

  const handleSaveHospitalRehab = () => {
    if (!hospitalRehabModal) return;
    
    updateTripRecord(hospitalRehabModal.id, {
      hospitalStatus: {
        type: hospitalRehabType,
        startDate: hospitalRehabStartDate,
        endDate: hospitalRehabEndDate,
        notes: hospitalRehabNotes,
        createdAt: new Date().toISOString()
      }
    });
    
    setCustomStatus(`Trip ${hospitalRehabModal.id} marcado como ${hospitalRehabType} hasta ${hospitalRehabEndDate}. Será excluido de confirmaciones hasta esa fecha.`);
    setHospitalRehabModal(null);
  };

  const handleRemoveHospitalRehab = trip => {
    updateTripRecord(trip.id, {
      hospitalStatus: null
    });
    setCustomStatus(`Hospital/Rehab status removido para trip ${trip.id}.`);
  };

  const isHospitalRehabActive = trip => {
    if (!trip.hospitalStatus) return false;
    const today = new Date().toISOString().slice(0, 10);
    return trip.hospitalStatus.startDate <= today && today <= trip.hospitalStatus.endDate;
  };

  const handleOpenConfirmationMethod = trips => {
    setConfirmationMethodModal(trips);
    setConfirmationMethod('whatsapp');
  };

  const handleSendConfirmation = async () => {
    if (!confirmationMethodModal || confirmationMethodModal.length === 0) {
      setCustomStatus('No trips selected for confirmation.');
      return;
    }

    setIsSendingConfirmation(true);
    try {
      if (confirmationMethod === 'whatsapp') {
        // Open WhatsApp Web for each trip (or show list)
        const tripsInfo = confirmationMethodModal.map(trip => 
          `${trip.id} - ${trip.rider} (${trip.patientPhoneNumber})`
        ).join('\n');
        
        const message = `CONFIRMATION REQUEST\n\nTrips to confirm:\n${tripsInfo}\n\nPlease confirm receipt.`;
        const encodedMessage = encodeURIComponent(message);
        
        // Open WhatsApp Web (generic for all)
        window.open(`https://web.whatsapp.com/send?text=${encodedMessage}`, '_blank');
        
        // Also send via API for each trip
        for (const trip of confirmationMethodModal) {
          if (trip.patientPhoneNumber) {
            await fetch('/api/extensions/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'whatsapp',
                phoneNumber: trip.patientPhoneNumber,
                message: `Hi ${trip.rider}, this is a confirmation for trip ${trip.id}. Aguarda nuestra confirmacion.`
              })
            });
          }
        }
        
        setCustomStatus(`WhatsApp confirmations sent to ${confirmationMethodModal.length} trips.`);
      } else if (confirmationMethod === 'sms') {
        // Send SMS in batch
        const response = await fetch('/api/integrations/sms/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripIds: confirmationMethodModal.map(t => t.id)
          })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to send SMS');
        
        setCustomStatus(`SMS confirmations sent: ${result.sentCount}. Failed: ${result.failedCount || 0}. Skipped: ${result.skippedCount || 0}.`);
      }
      
      await refreshDispatchState({ forceServer: true });
      setConfirmationMethodModal(null);
    } catch (error) {
      setCustomStatus(`Error sending confirmation: ${error.message}`);
    } finally {
      setIsSendingConfirmation(false);
    }
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
              <Form.Control type="date" value={confirmationDate} onChange={event => setConfirmationDate(event.target.value)} style={{ ...surfaceStyles.input, width: 140 }} title="Confirmation date" />
              <Form.Control type="time" value={timeFromFilter} onChange={event => setTimeFromFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 120 }} title="Start time" />
              <Form.Control type="time" value={timeToFilter} onChange={event => setTimeToFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 120 }} title="End time" />
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
              <Button style={surfaceStyles.button} onClick={exportToPDF} title="Export visible trips to PDF/Print">Export PDF</Button>
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
                  <th>Hospital/Rehab</th>
                  <th>Confirmation</th>
                  <th>Dispatch Status</th>
                  <th>Reply</th>
                  <th>Sent</th>
                  <th>Responded</th>
                  <th style={{ width: 160 }}>Action</th>
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
                      <td>
                        {trip.hospitalStatus ? (
                          <div>
                            <Badge bg={isHospitalRehabActive(trip) ? 'warning' : 'secondary'}>
                              {trip.hospitalStatus.type}: {trip.hospitalStatus.endDate}
                            </Badge>
                            {isHospitalRehabActive(trip) ? (
                              <div className="small text-muted mt-1">Active until {trip.hospitalStatus.endDate}</div>
                            ) : (
                              <div className="small text-muted mt-1">Expired</div>
                            )}
                          </div>
                        ) : (
                          <Button size="sm" variant="outline-secondary" onClick={() => handleOpenHospitalRehabModal(trip)} style={{ minWidth: 100 }}>
                            + Rehab Hospital
                          </Button>
                        )}
                      </td>
                      <td>{confirmationStatus === 'Opted Out' ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>{confirmationStatus}</Badge> : <Badge bg={STATUS_VARIANTS[confirmationStatus] || 'secondary'}>{confirmationStatus}</Badge>}</td>
                      <td>{trip.safeRideStatus || trip.status || '-'}</td>
                      <td style={{ maxWidth: 240, whiteSpace: 'normal' }}>{trip.confirmation?.lastResponseText || '-'}</td>
                      <td>{trip.confirmation?.sentAt ? new Date(trip.confirmation.sentAt).toLocaleString() : '-'}</td>
                      <td>{trip.confirmation?.respondedAt ? new Date(trip.confirmation.respondedAt).toLocaleString() : '-'}</td>
                      <td>
                        <div className="d-flex gap-1 flex-column">
                          <Button size="sm" variant={manualConfirmations[trip.id]?.status === 'Confirmed' ? 'success' : 'outline-success'} onClick={() => handleManualConfirm(trip.id, trip)} title="Confirm via SMS/WhatsApp" style={{ minWidth: 80 }}>
                            {manualConfirmations[trip.id]?.method || 'Confirm'}
                          </Button>
                          <Button size="sm" variant="outline-danger" onClick={() => handleCancelWithNote(trip)} title="Cancel with note" style={{ minWidth: 80 }}>
                            Cancel
                          </Button>
                          <Button size="sm" style={{ backgroundColor: '#000000', borderColor: '#000000', color: '#ffffff', minWidth: 80 }} onClick={() => handleToggleOptOut(trip)}>{isOptedOut ? 'Allow' : 'Block'}</Button>
                          {trip.hospitalStatus && (
                            <Button size="sm" variant="outline-warning" onClick={() => handleRemoveHospitalRehab(trip)} title="Remove hospital/rehab status" style={{ minWidth: 80 }}>
                              Remove RH
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>;
                }) : <tr>
                    <td colSpan={13} className="text-center text-muted py-4">No confirmation records match the current filter.</td>
                  </tr>}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <Modal show={Boolean(cancelNoteModal)} onHide={() => setCancelNoteModal(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Cancel Trip - Add Note</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-2">Trip: {cancelNoteModal?.id}</div>
          <div className="small text-muted mb-2">Rider: {cancelNoteModal?.rider}</div>
          <Form.Label className="small text-uppercase text-muted fw-semibold">Cancel Reason / Note</Form.Label>
          <Form.Control as="textarea" rows={4} value={cancelNoteDraft} onChange={event => setCancelNoteDraft(event.target.value)} placeholder="Write the cancellation reason or note for the dispatcher..." />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setCancelNoteModal(null)}>Close</Button>
          <Button variant="danger" onClick={handleSaveCancelNote}>Cancel Trip</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(confirmationMethodModal)} onHide={() => setConfirmationMethodModal(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Send Confirmation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3 pb-2 border-bottom">
            <strong>{confirmationMethodModal?.length || 0} trip(s) selected</strong>
            {confirmationMethodModal?.length > 0 && (
              <div className="small mt-2">
                {confirmationMethodModal.slice(0, 5).map(trip => (
                  <div key={trip.id}>{trip.id} - {trip.rider}</div>
                ))}
                {confirmationMethodModal.length > 5 && <div className="text-muted">+ {confirmationMethodModal.length - 5} more</div>}
              </div>
            )}
          </div>

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Send Via</Form.Label>
          <div className="d-flex gap-3 mb-3">
            <Form.Check
              type="radio"
              label="WhatsApp"
              name="confirmationMethod"
              value="whatsapp"
              checked={confirmationMethod === 'whatsapp'}
              onChange={event => setConfirmationMethod(event.target.value)}
            />
            <Form.Check
              type="radio"
              label="SMS"
              name="confirmationMethod"
              value="sms"
              checked={confirmationMethod === 'sms'}
              onChange={event => setConfirmationMethod(event.target.value)}
            />
          </div>

          {confirmationMethod === 'whatsapp' && (
            <div className="alert alert-info small mb-0">
              WhatsApp Web will open. Messages will also be sent via API to each patient's WhatsApp.
            </div>
          )}
          {confirmationMethod === 'sms' && (
            <div className="alert alert-info small mb-0">
              SMS messages will be sent in batch to all {confirmationMethodModal?.length || 0} trips.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmationMethodModal(null)} disabled={isSendingConfirmation}>Close</Button>
          <Button variant="primary" onClick={handleSendConfirmation} disabled={isSendingConfirmation}>
            {isSendingConfirmation ? 'Sending...' : `Send via ${confirmationMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(hospitalRehabModal)} onHide={() => setHospitalRehabModal(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Hospital / Rehab Status</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">Trip: {hospitalRehabModal?.id} | Rider: {hospitalRehabModal?.rider}</div>
          
          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Type</Form.Label>
          <Form.Select value={hospitalRehabType} onChange={event => setHospitalRehabType(event.target.value)} className="mb-3">
            <option value="Hospital">Hospital</option>
            <option value="Rehab">Rehabilitation Center</option>
            <option value="Other">Other Medical Facility</option>
          </Form.Select>

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Start Date</Form.Label>
          <Form.Control type="date" value={hospitalRehabStartDate} onChange={event => setHospitalRehabStartDate(event.target.value)} className="mb-3" />

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">End Date (Trip excluded until this date)</Form.Label>
          <Form.Control type="date" value={hospitalRehabEndDate} onChange={event => setHospitalRehabEndDate(event.target.value)} className="mb-3" />

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Notes</Form.Label>
          <Form.Control as="textarea" rows={3} value={hospitalRehabNotes} onChange={event => setHospitalRehabNotes(event.target.value)} placeholder="Recovery notes, facility name, contact info, etc..." />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setHospitalRehabModal(null)}>Close</Button>
          <Button variant="primary" onClick={handleSaveHospitalRehab}>Save Hospital/Rehab Status</Button>
        </Modal.Footer>
      </Modal>
    </>;
};

export default ConfirmationWorkspace;