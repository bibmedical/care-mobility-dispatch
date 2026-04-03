'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, ListGroup, Row, Spinner } from 'react-bootstrap';

const formatTimestamp = value => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getStatusVariant = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus.includes('completed')) return 'success';
  if (normalizedStatus.includes('arrived')) return 'info';
  if (normalizedStatus.includes('progress') || normalizedStatus.includes('route')) return 'warning';
  if (normalizedStatus.includes('willcall')) return 'secondary';
  return 'dark';
};

const documentLabels = {
  profilePhoto: 'Profile photo',
  licenseFront: 'License front',
  licenseBack: 'License back',
  insuranceCertificate: 'Insurance certificate',
  w9Document: 'W-9',
  trainingCertificate: 'Training certificate'
};

export default function DriverPortalWorkspace() {
  const [portalData, setPortalData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [tripActionKey, setTripActionKey] = useState('');

  const loadPortal = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/driver-portal/me', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to load your driver portal.');
      }
      setPortalData(payload);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load your driver portal.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, []);

  const handleTripAction = async (tripId, action) => {
    setTripActionKey(`${tripId}:${action}`);
    setErrorMessage('');
    try {
      const response = await fetch('/api/driver-portal/me/trips/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tripId, action })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to update trip status.');
      }
      await loadPortal();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to update trip status.');
    } finally {
      setTripActionKey('');
    }
  };

  const handleSendMessage = async event => {
    event.preventDefault();
    const nextMessage = messageDraft.trim();
    if (!nextMessage) return;

    setIsSendingMessage(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/driver-portal/me/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: nextMessage })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to send message.');
      }
      setMessageDraft('');
      await loadPortal();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (isLoading) {
    return <div className="py-5 text-center text-muted">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading your driver portal...
      </div>;
  }

  const driver = portalData?.driver || null;
  const trips = Array.isArray(portalData?.trips) ? portalData.trips : [];
  const messages = Array.isArray(portalData?.messages) ? portalData.messages : [];
  const documents = driver?.documents && typeof driver.documents === 'object' ? driver.documents : {};

  return <div className="py-4">
      <Row className="g-4">
        <Col xs={12}>
          <Card className="border-0 shadow-sm overflow-hidden">
            <Card.Body className="p-4">
              <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-3">
                  {driver?.profilePhotoUrl ? <img src={driver.profilePhotoUrl} alt={driver?.name || 'Driver'} width={72} height={72} className="rounded-circle border object-fit-cover" /> : <div className="rounded-circle border d-flex align-items-center justify-content-center bg-light text-dark fw-bold" style={{ width: 72, height: 72 }}>
                      {(driver?.name || 'D').slice(0, 1).toUpperCase()}
                    </div>}
                  <div>
                    <div className="text-uppercase text-muted small">Driver portal</div>
                    <h2 className="h4 mb-1">{driver?.name || 'Driver'}</h2>
                    <div className="d-flex flex-wrap gap-2">
                      <Badge bg="dark">{driver?.live || 'Offline'}</Badge>
                      {driver?.vehicleLabel ? <Badge bg="secondary">{driver.vehicleLabel}</Badge> : null}
                      {driver?.checkpoint ? <Badge bg="light" text="dark">{driver.checkpoint}</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="text-lg-end">
                  <div className="text-muted small">Last refresh</div>
                  <div className="fw-semibold">{formatTimestamp(portalData?.updatedAt)}</div>
                  <Button variant="outline-dark" size="sm" className="mt-2" onClick={loadPortal}>Refresh</Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {errorMessage ? <Col xs={12}>
            <Alert variant="danger" className="mb-0">{errorMessage}</Alert>
          </Col> : null}

        <Col lg={8}>
          <Row className="g-4">
            <Col xs={12}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div>
                      <h3 className="h5 mb-1">Assigned trips</h3>
                      <div className="text-muted small">Only your trips appear here.</div>
                    </div>
                    <Badge bg="dark">{trips.length}</Badge>
                  </div>
                  {trips.length ? <div className="d-flex flex-column gap-3">
                      {trips.map(trip => {
                        const baseActionKey = String(trip.id || '');
                        return <Card key={trip.id} className="border bg-light-subtle">
                            <Card.Body>
                              <div className="d-flex flex-column flex-xl-row justify-content-between gap-3">
                                <div>
                                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                                    <h4 className="h6 mb-0">{trip.rider || 'Rider'}</h4>
                                    <Badge bg={getStatusVariant(trip.status)}>{trip.status || 'Unassigned'}</Badge>
                                    {trip.punctualityLabel ? <Badge bg="light" text="dark">{trip.punctualityLabel}</Badge> : null}
                                  </div>
                                  <div className="small text-muted mb-1">Pickup</div>
                                  <div className="fw-semibold">{trip.address || 'No pickup address'}</div>
                                  <div className="text-muted small mb-2">{trip.scheduledPickup || trip.pickup || 'Time pending'}</div>
                                  <div className="small text-muted mb-1">Dropoff</div>
                                  <div className="fw-semibold">{trip.destination || 'No destination'}</div>
                                  <div className="text-muted small">{trip.scheduledDropoff || trip.dropoff || 'Time pending'}</div>
                                  {trip.notes ? <div className="mt-2 small"><span className="fw-semibold">Notes:</span> {trip.notes}</div> : null}
                                </div>
                                <div className="d-flex flex-column gap-2 align-items-xl-end">
                                  <div className="small text-muted text-xl-end">Ride ID: {trip.rideId || trip.id}</div>
                                  <div className="small text-muted text-xl-end">Service date: {trip.serviceDate || 'Today'}</div>
                                  <div className="d-flex flex-wrap gap-2 justify-content-xl-end">
                                    <Button variant="outline-warning" size="sm" disabled={tripActionKey === `${baseActionKey}:en-route`} onClick={() => handleTripAction(trip.id, 'en-route')}>
                                      {tripActionKey === `${baseActionKey}:en-route` ? 'Saving...' : 'En Route'}
                                    </Button>
                                    <Button variant="outline-info" size="sm" disabled={tripActionKey === `${baseActionKey}:arrived`} onClick={() => handleTripAction(trip.id, 'arrived')}>
                                      {tripActionKey === `${baseActionKey}:arrived` ? 'Saving...' : 'Arrived'}
                                    </Button>
                                    <Button variant="outline-success" size="sm" disabled={tripActionKey === `${baseActionKey}:complete`} onClick={() => handleTripAction(trip.id, 'complete')}>
                                      {tripActionKey === `${baseActionKey}:complete` ? 'Saving...' : 'Complete'}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </Card.Body>
                          </Card>;
                      })}
                    </div> : <Alert variant="light" className="mb-0">No active trips assigned right now.</Alert>}
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div>
                      <h3 className="h5 mb-1">Messages</h3>
                      <div className="text-muted small">Talk to dispatch from here.</div>
                    </div>
                  </div>
                  <Form onSubmit={handleSendMessage} className="mb-3">
                    <Form.Group className="mb-2">
                      <Form.Control as="textarea" rows={3} placeholder="Type a message to dispatch" value={messageDraft} onChange={event => setMessageDraft(event.target.value)} />
                    </Form.Group>
                    <Button type="submit" variant="dark" disabled={isSendingMessage || !messageDraft.trim()}>
                      {isSendingMessage ? 'Sending...' : 'Send message'}
                    </Button>
                  </Form>
                  {messages.length ? <ListGroup variant="flush">
                      {messages.map(message => <ListGroup.Item key={message.id} className="px-0">
                          <div className="d-flex justify-content-between gap-3">
                            <div>
                              <div className="fw-semibold">{message.subject || 'Dispatch message'}</div>
                              <div className="small text-muted">{message.body || 'No content'}</div>
                            </div>
                            <div className="small text-muted text-end">{formatTimestamp(message.createdAt)}</div>
                          </div>
                        </ListGroup.Item>)}
                    </ListGroup> : <Alert variant="light" className="mb-0">No messages yet.</Alert>}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Col>

        <Col lg={4}>
          <Row className="g-4">
            <Col xs={12}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body className="p-4">
                  <h3 className="h5 mb-3">My profile</h3>
                  <div className="small text-muted">Phone</div>
                  <div className="mb-2 fw-semibold">{driver?.phone || 'Not available'}</div>
                  <div className="small text-muted">Email</div>
                  <div className="mb-2 fw-semibold">{driver?.email || 'Not available'}</div>
                  <div className="small text-muted">Username</div>
                  <div className="fw-semibold">{driver?.username || 'Not available'}</div>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12}>
              <Card className="border-0 shadow-sm h-100">
                <Card.Body className="p-4">
                  <h3 className="h5 mb-3">My documents</h3>
                  <ListGroup variant="flush">
                    {Object.entries(documentLabels).map(([key, label]) => {
                      const documentValue = documents[key];
                      const documentUrl = typeof documentValue === 'string' ? documentValue : documentValue?.dataUrl || documentValue?.url || documentValue?.path || '';
                      return <ListGroup.Item key={key} className="px-0 d-flex align-items-center justify-content-between">
                          <span>{label}</span>
                          {documentUrl ? <a href={documentUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-dark">Open</a> : <Badge bg="light" text="dark">Missing</Badge>}
                        </ListGroup.Item>;
                    })}
                  </ListGroup>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>;
}