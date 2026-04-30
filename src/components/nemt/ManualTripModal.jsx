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
  vehicleType: '',
  tripType: '',
  notes: '',
  miles: '',
  durationMinutes: '',
  position: null,
  destinationPosition: null,
  tripCount: 1,
  t1FromAddress: '',
  t1FromZip: '',
  t1ToAddress: '',
  t1ToZip: '',
  t2FromAddress: '',
  t2FromZip: '',
  t2ToAddress: '',
  t2ToZip: '',
  t3FromAddress: '',
  t3FromZip: '',
  t3ToAddress: '',
  t3ToZip: ''
});

const buildTripSegments = draft => {
  const base = {
    serviceDate: draft.serviceDate,
    rider: String(draft.rider || '').trim() || 'Manual Trip',
    patientPhoneNumber: String(draft.patientPhoneNumber || '').trim(),
    vehicleType: String(draft.vehicleType || '').trim(),
    tripType: String(draft.tripType || '').trim(),
    notes: String(draft.notes || '').trim()
  };

  const rows = [
    { from: draft.t1FromAddress, fromZip: draft.t1FromZip, to: draft.t1ToAddress, toZip: draft.t1ToZip }
  ];
  if (draft.tripCount >= 2) rows.push({ from: draft.t2FromAddress, fromZip: draft.t2FromZip, to: draft.t2ToAddress, toZip: draft.t2ToZip });
  if (draft.tripCount >= 3) rows.push({ from: draft.t3FromAddress, fromZip: draft.t3FromZip, to: draft.t3ToAddress, toZip: draft.t3ToZip });

  return rows.map((row, index) => ({
    ...base,
    address: String(row.from || '').trim(),
    fromZipcode: String(row.fromZip || '').trim(),
    destination: String(row.to || '').trim(),
    toZipcode: String(row.toZip || '').trim(),
    pickup: index === 0 ? String(draft.pickup || '').trim() : '',
    dropoff: index === 0 ? String(draft.dropoff || '').trim() : '',
    position: index === 0 ? (Array.isArray(draft.position) ? draft.position : null) : null,
    destinationPosition: index === 0 ? (Array.isArray(draft.destinationPosition) ? draft.destinationPosition : null) : null,
    miles: index === 0 ? String(draft.miles || '').trim() : '',
    durationMinutes: index === 0 ? String(draft.durationMinutes || '').trim() : ''
  }));
};

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

  const addTripRow = () => {
    setDraft(current => {
      const next = current.tripCount + 1;
      if (next > 3) return current;
      if (next === 2) {
        return {
          ...current,
          tripCount: 2,
          t2FromAddress: String(current.t1ToAddress || '').trim(),
          t2FromZip: String(current.t1ToZip || '').trim()
        };
      }
      if (next === 3) {
        return {
          ...current,
          tripCount: 3,
          t3FromAddress: String(current.t2ToAddress || '').trim(),
          t3FromZip: String(current.t2ToZip || '').trim()
        };
      }
      return current;
    });
  };

  const removeTripRow = tripNumber => {
    setDraft(current => {
      if (tripNumber === 3) {
        return { ...current, tripCount: 2, t3FromAddress: '', t3FromZip: '', t3ToAddress: '', t3ToZip: '' };
      }
      if (tripNumber === 2) {
        return { ...current, tripCount: 1, t2FromAddress: '', t2FromZip: '', t2ToAddress: '', t2ToZip: '', t3FromAddress: '', t3FromZip: '', t3ToAddress: '', t3ToZip: '' };
      }
      return current;
    });
  };

  useEffect(() => {
    if (!show) return;

    const pickupAddress = [draft.t1FromAddress, draft.t1FromZip].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    const dropoffAddress = [draft.t1ToAddress, draft.t1ToZip].map(value => String(value || '').trim()).filter(Boolean).join(' ');

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
  }, [draft.t1FromAddress, draft.t1ToAddress, draft.t1FromZip, draft.t1ToZip, show]);

  const handleFieldChange = (field, value) => {
    setDraft(current => ({
      ...current,
      [field]: value,
      ...(field === 'vehicleType' && !String(current.tripType || '').trim() ? { tripType: value } : {})
    }));
  };

  const handleSave = async () => {
    const normalizedDraft = {
      serviceDate: String(draft.serviceDate || '').trim(),
      rider: String(draft.rider || '').trim(),
      patientPhoneNumber: String(draft.patientPhoneNumber || '').trim(),
      pickup: String(draft.pickup || '').trim(),
      dropoff: String(draft.dropoff || '').trim(),
      vehicleType: String(draft.vehicleType || '').trim(),
      tripType: String(draft.tripType || '').trim(),
      notes: String(draft.notes || '').trim(),
      miles: String(draft.miles || '').trim(),
      durationMinutes: String(draft.durationMinutes || '').trim(),
      position: Array.isArray(draft.position) ? draft.position : null,
      destinationPosition: Array.isArray(draft.destinationPosition) ? draft.destinationPosition : null,
      tripCount: draft.tripCount,
      t1FromAddress: String(draft.t1FromAddress || '').trim(),
      t1FromZip: String(draft.t1FromZip || '').trim(),
      t1ToAddress: String(draft.t1ToAddress || '').trim(),
      t1ToZip: String(draft.t1ToZip || '').trim(),
      t2FromAddress: String(draft.t2FromAddress || '').trim(),
      t2FromZip: String(draft.t2FromZip || '').trim(),
      t2ToAddress: String(draft.t2ToAddress || '').trim(),
      t2ToZip: String(draft.t2ToZip || '').trim(),
      t3FromAddress: String(draft.t3FromAddress || '').trim(),
      t3FromZip: String(draft.t3FromZip || '').trim(),
      t3ToAddress: String(draft.t3ToAddress || '').trim(),
      t3ToZip: String(draft.t3ToZip || '').trim()
    };

    if (!normalizedDraft.serviceDate) {
      setError('Service date is required.');
      return;
    }
    if (!normalizedDraft.t1FromAddress) {
      setError('Trip 1 pickup address is required.');
      return;
    }
    if (!normalizedDraft.t1ToAddress) {
      setError('Trip 1 dropoff address is required.');
      return;
    }
    if (normalizedDraft.tripCount >= 2 && !normalizedDraft.t2ToAddress) {
      setError('Trip 2 destination address is required.');
      return;
    }
    if (normalizedDraft.tripCount >= 3 && !normalizedDraft.t3ToAddress) {
      setError('Trip 3 destination address is required.');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      const segments = buildTripSegments(normalizedDraft);
      if (normalizedDraft.tripCount === 1) {
        await onSave?.(segments[0]);
      } else {
        await onSave?.({ ...segments[0], segments, isRoundTripBatch: true });
      }
    } catch (saveError) {
      setError(saveError?.message || 'Could not create the manual trip.');
      setIsSaving(false);
    }
  };

  return <Modal show={show} onHide={isSaving ? undefined : onHide} size="md" centered dialogClassName="manual-trip-modal-compact">
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
              <Form.Control value={draft.rider || ''} onChange={event => handleFieldChange('rider', event.target.value)} placeholder="Patient or rider name" disabled={isSaving} />
            </Col>
            <Col md={4}>
              <Form.Label>Phone</Form.Label>
              <Form.Control value={draft.patientPhoneNumber || ''} onChange={event => handleFieldChange('patientPhoneNumber', event.target.value)} placeholder="(407) 555-0000" disabled={isSaving} />
            </Col>
          </Row>
        </div>

        <div className="border rounded p-3 mb-3">
          <div className="fw-semibold mb-3">Route</div>

          {/* Trip 1 — always visible */}
          <div className="mb-3">
            <div className="small fw-semibold text-muted mb-2">Trip 1</div>
            <Row className="g-2">
              <Col md={6}>
                <div className="border rounded p-2 bg-light">
                  <div className="small text-muted mb-1">FROM</div>
                  <Form.Control className="mb-2" value={draft.t1FromAddress || ''} onChange={event => handleFieldChange('t1FromAddress', event.target.value)} placeholder="Pickup address" disabled={isSaving} />
                  <Form.Control size="sm" value={draft.t1FromZip || ''} onChange={event => handleFieldChange('t1FromZip', event.target.value)} placeholder="ZIP" disabled={isSaving} />
                </div>
              </Col>
              <Col md={6}>
                <div className="border rounded p-2">
                  <div className="small text-muted mb-1">TO</div>
                  <Form.Control className="mb-2" value={draft.t1ToAddress || ''} onChange={event => handleFieldChange('t1ToAddress', event.target.value)} placeholder="Dropoff address" disabled={isSaving} />
                  <Form.Control size="sm" value={draft.t1ToZip || ''} onChange={event => handleFieldChange('t1ToZip', event.target.value)} placeholder="ZIP" disabled={isSaving} />
                </div>
              </Col>
            </Row>
          </div>

          {/* Trip 2 */}
          {draft.tripCount >= 2 ? <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="small fw-semibold text-muted">Trip 2</div>
              {draft.tripCount === 2 ? <Button size="sm" variant="outline-danger" onClick={() => removeTripRow(2)} disabled={isSaving}>Remove</Button> : null}
            </div>
            <Row className="g-2">
              <Col md={6}>
                <div className="border rounded p-2 bg-light">
                  <div className="small text-muted mb-1">FROM</div>
                  <Form.Control className="mb-2" value={draft.t2FromAddress || ''} onChange={event => handleFieldChange('t2FromAddress', event.target.value)} placeholder="From address" disabled={isSaving} />
                  <Form.Control size="sm" value={draft.t2FromZip || ''} onChange={event => handleFieldChange('t2FromZip', event.target.value)} placeholder="ZIP" disabled={isSaving} />
                </div>
              </Col>
              <Col md={6}>
                <div className="border rounded p-2">
                  <div className="small text-muted mb-1">TO</div>
                  <Form.Control className="mb-2" value={draft.t2ToAddress || ''} onChange={event => handleFieldChange('t2ToAddress', event.target.value)} placeholder="To address" disabled={isSaving} />
                  <Form.Control size="sm" value={draft.t2ToZip || ''} onChange={event => handleFieldChange('t2ToZip', event.target.value)} placeholder="ZIP" disabled={isSaving} />
                </div>
              </Col>
            </Row>
          </div> : null}

          {/* Trip 3 */}
          {draft.tripCount >= 3 ? <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="small fw-semibold text-muted">Trip 3</div>
              <Button size="sm" variant="outline-danger" onClick={() => removeTripRow(3)} disabled={isSaving}>Remove</Button>
            </div>
            <Row className="g-2">
              <Col md={6}>
                <div className="border rounded p-2 bg-light">
                  <div className="small text-muted mb-1">FROM</div>
                  <Form.Control className="mb-2" value={draft.t3FromAddress || ''} onChange={event => handleFieldChange('t3FromAddress', event.target.value)} placeholder="From address" disabled={isSaving} />
                  <Form.Control size="sm" value={draft.t3FromZip || ''} onChange={event => handleFieldChange('t3FromZip', event.target.value)} placeholder="ZIP" disabled={isSaving} />
                </div>
              </Col>
              <Col md={6}>
                <div className="border rounded p-2">
                  <div className="small text-muted mb-1">TO</div>
                  <Form.Control className="mb-2" value={draft.t3ToAddress || ''} onChange={event => handleFieldChange('t3ToAddress', event.target.value)} placeholder="To address" disabled={isSaving} />
                  <Form.Control size="sm" value={draft.t3ToZip || ''} onChange={event => handleFieldChange('t3ToZip', event.target.value)} placeholder="ZIP" disabled={isSaving} />
                </div>
              </Col>
            </Row>
          </div> : null}

          {/* Add trip button */}
          {draft.tripCount < 3 ? <div className="mb-3">
            <Button size="sm" variant="outline-primary" onClick={addTripRow} disabled={isSaving}>+ Add Trip {draft.tripCount + 1}</Button>
          </div> : null}

          <Row className="g-2">
            <Col md={6}>
              <Form.Label>Calculated miles</Form.Label>
              <Form.Control value={isCalculatingRoute ? 'Calculating...' : (draft.miles || '')} placeholder="Auto" readOnly />
            </Col>
            <Col md={6}>
              <Form.Label>Estimated minutes</Form.Label>
              <Form.Control value={isCalculatingRoute ? 'Calculating...' : (draft.durationMinutes || '')} placeholder="Auto" readOnly />
            </Col>
          </Row>
          {routeError ? <div className="small text-warning mt-2">{routeError} The trip can still be saved with address-only routing.</div> : null}
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
      <style jsx global>{`
        .manual-trip-modal-compact {
          max-width: 760px;
        }
      `}</style>
    </Modal>;
};

export default ManualTripModal;