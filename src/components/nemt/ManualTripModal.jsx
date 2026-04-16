'use client';

import { GROUPING_SERVICE_TYPE_OPTIONS } from '@/helpers/nemt-admin-model';
import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';

const MANUAL_TRIP_SERVICE_OPTIONS = GROUPING_SERVICE_TYPE_OPTIONS.map(value => ({
  value,
  label: value === 'A'
    ? 'A - Ambulatory'
    : value === 'W'
      ? 'W - Wheelchair'
      : value === 'WXL'
        ? 'WXL - Folding Wheelchair'
        : value === 'EW'
          ? 'EW - Electric Wheelchair'
          : value === 'STR'
            ? 'STR - Stretcher'
            : value === 'Walker'
              ? 'Walker - Walker Assist'
              : value
}));

const buildManualTripDraft = serviceDate => ({
  serviceDate: String(serviceDate || '').trim(),
  pickup: '',
  dropoff: '',
  rider: '',
  patientPhoneNumber: '',
  address: '',
  fromZipcode: '',
  destination: '',
  toZipcode: '',
  position: null,
  destinationPosition: null,
  miles: '',
  durationMinutes: '',
  vehicleType: '',
  tripType: '',
  notes: ''
});

const ManualTripModal = ({
  show,
  onHide,
  onSave,
  initialServiceDate = '',
  sourceLabel = 'Dispatcher'
}) => {
  const [draft, setDraft] = useState(() => buildManualTripDraft(initialServiceDate));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    if (!show) return;
    setDraft(buildManualTripDraft(initialServiceDate));
    setError('');
    setIsSaving(false);
    setIsCalculatingRoute(false);
    setRouteError('');
  }, [initialServiceDate, show]);

  useEffect(() => {
    if (!show) return;

    const pickupAddress = [draft.address, draft.fromZipcode].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    const dropoffAddress = [draft.destination, draft.toZipcode].map(value => String(value || '').trim()).filter(Boolean).join(' ');

    if (pickupAddress.length < 6 || dropoffAddress.length < 6) {
      setIsCalculatingRoute(false);
      setRouteError('');
      setDraft(current => ({
        ...current,
        position: null,
        destinationPosition: null,
        miles: '',
        durationMinutes: ''
      }));
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsCalculatingRoute(true);
        setRouteError('');

        const [pickupResponse, dropoffResponse] = await Promise.all([
          fetch(`/api/maps/search?q=${encodeURIComponent(pickupAddress)}`, { cache: 'no-store' }),
          fetch(`/api/maps/search?q=${encodeURIComponent(dropoffAddress)}`, { cache: 'no-store' })
        ]);

        if (!pickupResponse.ok || !dropoffResponse.ok) {
          throw new Error('Could not locate one of the addresses.');
        }

        const pickupPayload = await pickupResponse.json();
        const dropoffPayload = await dropoffResponse.json();
        const pickupCoordinates = Array.isArray(pickupPayload?.coordinates) ? pickupPayload.coordinates.map(Number) : null;
        const dropoffCoordinates = Array.isArray(dropoffPayload?.coordinates) ? dropoffPayload.coordinates.map(Number) : null;

        if (!pickupCoordinates || pickupCoordinates.length !== 2 || !dropoffCoordinates || dropoffCoordinates.length !== 2) {
          throw new Error('Could not resolve route coordinates.');
        }

        const routeResponse = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(`${pickupCoordinates[0]},${pickupCoordinates[1]};${dropoffCoordinates[0]},${dropoffCoordinates[1]}`)}`, {
          cache: 'no-store'
        });

        if (!routeResponse.ok) {
          throw new Error('Could not calculate miles for this route.');
        }

        const routePayload = await routeResponse.json();
        if (!active) return;

        setDraft(current => ({
          ...current,
          position: pickupCoordinates,
          destinationPosition: dropoffCoordinates,
          miles: routePayload?.distanceMiles != null ? String(Number(routePayload.distanceMiles).toFixed(1)) : '',
          durationMinutes: routePayload?.durationMinutes != null ? String(Math.round(Number(routePayload.durationMinutes))) : ''
        }));
      } catch (routeCalculationError) {
        if (!active) return;
        setRouteError(routeCalculationError?.message || 'Route miles could not be calculated automatically.');
        setDraft(current => ({
          ...current,
          position: null,
          destinationPosition: null,
          miles: '',
          durationMinutes: ''
        }));
      } finally {
        if (active) {
          setIsCalculatingRoute(false);
        }
      }
    }, 700);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [draft.address, draft.destination, draft.fromZipcode, draft.toZipcode, show]);

  const handleFieldChange = (field, value) => {
    setDraft(current => ({
      ...current,
      [field]: value,
      ...(field === 'vehicleType' && !String(current.tripType || '').trim() ? { tripType: value } : {})
    }));
  };

  const handleSave = async () => {
    const normalizedDraft = {
      ...draft,
      serviceDate: String(draft.serviceDate || '').trim(),
      rider: String(draft.rider || '').trim(),
      address: String(draft.address || '').trim(),
      destination: String(draft.destination || '').trim(),
      patientPhoneNumber: String(draft.patientPhoneNumber || '').trim(),
      pickup: String(draft.pickup || '').trim(),
      dropoff: String(draft.dropoff || '').trim(),
      fromZipcode: String(draft.fromZipcode || '').trim(),
      toZipcode: String(draft.toZipcode || '').trim(),
      position: Array.isArray(draft.position) ? draft.position : null,
      destinationPosition: Array.isArray(draft.destinationPosition) ? draft.destinationPosition : null,
      miles: String(draft.miles || '').trim(),
      durationMinutes: String(draft.durationMinutes || '').trim(),
      vehicleType: String(draft.vehicleType || '').trim(),
      tripType: String(draft.tripType || '').trim(),
      notes: String(draft.notes || '').trim()
    };

    if (!normalizedDraft.serviceDate) {
      setError('Service date is required.');
      return;
    }
    if (!normalizedDraft.rider) {
      setError('Rider name is required.');
      return;
    }
    if (!normalizedDraft.address) {
      setError('Pickup address is required.');
      return;
    }
    if (!normalizedDraft.destination) {
      setError('Dropoff address is required.');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await onSave?.(normalizedDraft);
    } catch (saveError) {
      setError(saveError?.message || 'Could not create the manual trip.');
      setIsSaving(false);
    }
  };

  return <Modal show={show} onHide={isSaving ? undefined : onHide} size="lg" centered>
      <Modal.Header closeButton={!isSaving}>
        <Modal.Title>Create Manual Trip</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="small text-muted mb-3">This trip is created from {sourceLabel} and is protected from normal import cleanup.</div>
        {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}

        <div className="border rounded p-3 mb-3">
          <div className="fw-semibold mb-3">Trip</div>
          <Row className="g-3">
            <Col md={4}>
              <Form.Label>Service date</Form.Label>
              <Form.Control type="date" value={draft.serviceDate} onChange={event => handleFieldChange('serviceDate', event.target.value)} disabled={isSaving} />
            </Col>
            <Col md={4}>
              <Form.Label>Pickup time</Form.Label>
              <Form.Control type="time" value={draft.pickup} onChange={event => handleFieldChange('pickup', event.target.value)} disabled={isSaving} />
            </Col>
            <Col md={4}>
              <Form.Label>Dropoff time</Form.Label>
              <Form.Control type="time" value={draft.dropoff} onChange={event => handleFieldChange('dropoff', event.target.value)} disabled={isSaving} />
            </Col>
            <Col md={6}>
              <Form.Label>Vehicle / LOS</Form.Label>
              <Form.Select value={draft.vehicleType} onChange={event => handleFieldChange('vehicleType', event.target.value)} disabled={isSaving}>
                <option value="">Select SafeRide type</option>
                {MANUAL_TRIP_SERVICE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Form.Select>
            </Col>
            <Col md={6}>
              <Form.Label>Trip type / note</Form.Label>
              <Form.Control value={draft.tripType} onChange={event => handleFieldChange('tripType', event.target.value)} placeholder="Routine, dialysis, discharge, or keep the LOS code" disabled={isSaving} />
            </Col>
          </Row>
          <div className="small text-muted mt-2">Use the same mobility/service codes the dispatch system already understands from SafeRide imports. Example: wheelchair = W, stretcher = STR.</div>
        </div>

        <div className="border rounded p-3 mb-3">
          <div className="fw-semibold mb-3">Rider</div>
          <Row className="g-3">
            <Col md={8}>
              <Form.Label>Rider name</Form.Label>
              <Form.Control value={draft.rider} onChange={event => handleFieldChange('rider', event.target.value)} placeholder="Patient or rider name" disabled={isSaving} />
            </Col>
            <Col md={4}>
              <Form.Label>Phone</Form.Label>
              <Form.Control value={draft.patientPhoneNumber} onChange={event => handleFieldChange('patientPhoneNumber', event.target.value)} placeholder="(407) 555-0000" disabled={isSaving} />
            </Col>
          </Row>
        </div>

        <div className="border rounded p-3 mb-3">
          <div className="fw-semibold mb-3">Route</div>
          <Row className="g-3">
            <Col md={9}>
              <Form.Label>Pickup address</Form.Label>
              <Form.Control value={draft.address} onChange={event => handleFieldChange('address', event.target.value)} placeholder="Pickup address" disabled={isSaving} />
            </Col>
            <Col md={3}>
              <Form.Label>Pickup ZIP</Form.Label>
              <Form.Control value={draft.fromZipcode} onChange={event => handleFieldChange('fromZipcode', event.target.value)} placeholder="32822" disabled={isSaving} />
            </Col>
            <Col md={9}>
              <Form.Label>Dropoff address</Form.Label>
              <Form.Control value={draft.destination} onChange={event => handleFieldChange('destination', event.target.value)} placeholder="Dropoff address" disabled={isSaving} />
            </Col>
            <Col md={3}>
              <Form.Label>Dropoff ZIP</Form.Label>
              <Form.Control value={draft.toZipcode} onChange={event => handleFieldChange('toZipcode', event.target.value)} placeholder="32819" disabled={isSaving} />
            </Col>
            <Col md={6}>
              <Form.Label>Calculated miles</Form.Label>
              <Form.Control value={isCalculatingRoute ? 'Calculating...' : draft.miles} placeholder="Auto" readOnly />
            </Col>
            <Col md={6}>
              <Form.Label>Estimated minutes</Form.Label>
              <Form.Control value={isCalculatingRoute ? 'Calculating...' : draft.durationMinutes} placeholder="Auto" readOnly />
            </Col>
          </Row>
          {routeError ? <div className="small text-warning mt-2">{routeError}</div> : null}
        </div>

        <div className="border rounded p-3">
          <div className="fw-semibold mb-3">Comments</div>
          <Form.Control as="textarea" rows={4} value={draft.notes} onChange={event => handleFieldChange('notes', event.target.value)} placeholder="Notes for dispatch, rider, or special instructions" disabled={isSaving} />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={isSaving}>Cancel</Button>
        <Button variant="success" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Trip'}</Button>
      </Modal.Footer>
    </Modal>;
};

export default ManualTripModal;