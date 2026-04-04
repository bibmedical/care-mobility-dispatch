'use client';

import { useNotificationContext } from '@/context/useNotificationContext';
import { formatDispatchTime, formatTripDateLabel } from '@/helpers/nemt-dispatch-state';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import styles from './DispatcherHistoryWorkspace.module.scss';

const getDriverLabel = (driverId, archive) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return 'No driver';

  const threadTrip = (Array.isArray(archive?.trips) ? archive.trips : []).find(trip => String(trip?.driverId || '').trim() === normalizedDriverId || String(trip?.secondaryDriverId || '').trim() === normalizedDriverId);
  if (threadTrip?.driverName) return threadTrip.driverName;
  const routeDriver = (Array.isArray(archive?.routePlans) ? archive.routePlans : []).find(routePlan => String(routePlan?.driverId || '').trim() === normalizedDriverId || String(routePlan?.secondaryDriverId || '').trim() === normalizedDriverId);
  if (routeDriver?.driverName) return routeDriver.driverName;
  const dailyDriver = (Array.isArray(archive?.dailyDrivers) ? archive.dailyDrivers : []).find(driver => String(driver?.id || '').trim() === normalizedDriverId);
  if (dailyDriver) {
    return [dailyDriver.firstName, dailyDriver.lastNameOrOrg].filter(Boolean).join(' ').trim() || normalizedDriverId;
  }

  return normalizedDriverId;
};

const getRouteLabel = routePlan => String(routePlan?.name || routePlan?.routeName || routePlan?.driverName || routePlan?.id || 'Route').trim() || 'Route';

const getStatusBadge = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'completed') return 'success';
  if (normalizedStatus === 'cancelled') return 'danger';
  if (normalizedStatus === 'in progress') return 'warning';
  if (normalizedStatus === 'assigned') return 'primary';
  return 'secondary';
};

const buildRouteTripMap = (routePlans, trips) => {
  const tripMap = new Map((Array.isArray(trips) ? trips : []).map(trip => [String(trip?.id || '').trim(), trip]));
  return (Array.isArray(routePlans) ? routePlans : []).map(routePlan => {
    const routeTripList = (Array.isArray(routePlan?.tripIds) ? routePlan.tripIds : []).map(tripId => tripMap.get(String(tripId || '').trim())).filter(Boolean);
    const distinctDrivers = Array.from(new Set(routeTripList.map(trip => String(trip?.driverName || trip?.driverId || '').trim()).filter(Boolean)));
    return {
      id: routePlan?.id,
      label: getRouteLabel(routePlan),
      driverName: String(routePlan?.driverName || distinctDrivers.join(' + ') || 'Unassigned').trim(),
      tripCount: routeTripList.length,
      firstPickup: routeTripList.map(trip => String(trip?.scheduledPickup || '').trim()).find(Boolean) || '--',
      lastDropoff: [...routeTripList].reverse().map(trip => String(trip?.scheduledDropoff || '').trim()).find(Boolean) || '--',
      trips: routeTripList
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
};

const DispatcherHistoryWorkspace = () => {
  const { showNotification } = useNotificationContext();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [archive, setArchive] = useState(null);

  const fetchHistory = async nextDate => {
    setLoading(true);
    try {
      const query = nextDate ? `?date=${encodeURIComponent(nextDate)}&limit=180` : '?limit=180';
      const response = await fetch(`/api/nemt/dispatch-history${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load dispatcher history');
      }
      setAvailableDates(Array.isArray(payload?.availableDates) ? payload.availableDates : []);
      setSelectedDate(String(payload?.selectedDateKey || nextDate || ''));
      setArchive(payload?.archive || null);
    } catch (error) {
      setArchive(null);
      showNotification({
        message: error?.message || 'Unable to load dispatcher history',
        variant: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory('');
  }, []);

  const routeRows = useMemo(() => buildRouteTripMap(archive?.routePlans, archive?.trips), [archive]);

  const threadRows = useMemo(() => {
    return (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).map(thread => ({
      ...thread,
      driverLabel: getDriverLabel(thread.driverId, archive)
    })).sort((left, right) => left.driverLabel.localeCompare(right.driverLabel));
  }, [archive]);

  const tripRows = useMemo(() => {
    const routeLabelMap = new Map((Array.isArray(routeRows) ? routeRows : []).flatMap(route => route.trips.map(trip => [String(trip?.id || '').trim(), route.label])));
    return [...(Array.isArray(archive?.trips) ? archive.trips : [])].map(trip => ({
      ...trip,
      routeLabel: routeLabelMap.get(String(trip?.id || '').trim()) || '--'
    })).sort((left, right) => {
      const leftTime = String(left?.scheduledPickup || left?.actualPickup || '');
      const rightTime = String(right?.scheduledPickup || right?.actualPickup || '');
      return leftTime.localeCompare(rightTime);
    });
  }, [archive, routeRows]);

  const auditRows = useMemo(() => [...(Array.isArray(archive?.auditLog) ? archive.auditLog : [])].sort((left, right) => String(right?.timestamp || '').localeCompare(String(left?.timestamp || ''))), [archive]);

  const stats = archive?.summary || {
    tripCount: 0,
    routeCount: 0,
    threadCount: 0,
    messageCount: 0,
    auditCount: 0
  };

  return <div className={styles.pageRoot}>
      <Card className={styles.heroCard}>
        <CardBody className="p-4 p-lg-5">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end">
            <div>
              <div className="text-uppercase small fw-semibold text-secondary mb-2">Dispatcher</div>
              <h1 className={styles.heroTitle}>History</h1>
              <p className={styles.heroText}>Cada día archivado queda guardado aquí con sus rutas, viajes, mensajes y actividad. A medianoche se mueve fuera del tablero activo para que Dispatcher no se siga llenando.</p>
            </div>
            <div className="d-flex flex-column flex-sm-row gap-2 align-items-sm-end">
              <Form.Group>
                <Form.Label className="small text-secondary">Select day</Form.Label>
                <Form.Control type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
              </Form.Group>
              <Button variant="dark" onClick={() => fetchHistory(selectedDate)} disabled={loading || !selectedDate}>Load</Button>
              <Button variant="outline-secondary" onClick={() => fetchHistory('')} disabled={loading}>Latest</Button>
            </div>
          </div>
          <div className="mt-3 d-flex flex-wrap gap-2 align-items-center">
            <span className="small text-secondary">Archived days:</span>
            <div className={styles.dateList}>
              {availableDates.slice(0, 14).map(item => <Button key={item.dateKey} size="sm" variant={item.dateKey === selectedDate ? 'dark' : 'outline-dark'} className={styles.dateChip} onClick={() => fetchHistory(item.dateKey)}>
                  {formatTripDateLabel(item.dateKey)}
                </Button>)}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Routes</div>
          <div className={styles.statValue}>{stats.routeCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Trips</div>
          <div className={styles.statValue}>{stats.tripCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Threads</div>
          <div className={styles.statValue}>{stats.threadCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Messages</div>
          <div className={styles.statValue}>{stats.messageCount}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Recorded Events</div>
          <div className={styles.statValue}>{stats.auditCount}</div>
        </div>
      </div>

      {loading ? <Card className={styles.sectionCard}>
          <CardBody className="p-4 d-flex align-items-center gap-3">
            <Spinner animation="border" size="sm" />
            <span>Loading archived dispatcher day...</span>
          </CardBody>
        </Card> : !archive ? <Card className={styles.sectionCard}>
          <CardBody className="p-4">
            <div className={styles.emptyState}>No archived dispatcher day was found for the selected date.</div>
          </CardBody>
        </Card> : <>
          <Card className={styles.sectionCard}>
            <CardBody className="p-4">
              <div className="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
                <div>
                  <div className={styles.sectionTitle}>Routes for {formatTripDateLabel(archive.dateKey)}</div>
                  <div className={styles.sectionMeta}>Archived {new Date(archive.archivedAt).toLocaleString()}</div>
                </div>
              </div>
              <div className="table-responsive">
                <Table hover className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Driver</th>
                      <th>Trips</th>
                      <th>First PU</th>
                      <th>Last DO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeRows.length > 0 ? routeRows.map(route => <tr key={route.id || route.label}>
                        <td className="fw-semibold">{route.label}</td>
                        <td>{route.driverName || '--'}</td>
                        <td>{route.tripCount}</td>
                        <td>{route.firstPickup}</td>
                        <td>{route.lastDropoff}</td>
                      </tr>) : <tr>
                        <td colSpan={5}><div className={styles.emptyState}>No routes were archived for this day.</div></td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>

          <Card className={styles.sectionCard}>
            <CardBody className="p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <div className={styles.sectionTitle}>Trips</div>
                  <div className={styles.sectionMeta}>All archived trip records for the selected day.</div>
                </div>
                <Badge bg="dark">{tripRows.length} trips</Badge>
              </div>
              <div className="table-responsive">
                <Table hover className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Trip</th>
                      <th>Rider</th>
                      <th>Driver</th>
                      <th>Status</th>
                      <th>Route</th>
                      <th>PU</th>
                      <th>DO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripRows.length > 0 ? tripRows.map(trip => <tr key={trip.id}>
                        <td>
                          <div className="fw-semibold">{trip.rideId || trip.id}</div>
                          <div className="small text-secondary">{trip.id}</div>
                        </td>
                        <td>{trip.rider || '--'}</td>
                        <td>{trip.driverName || trip.driverId || '--'}</td>
                        <td><Badge bg={getStatusBadge(trip.status)}>{trip.status || 'Unknown'}</Badge></td>
                        <td>{trip.routeLabel}</td>
                        <td>
                          <div>{trip.scheduledPickup || '--'}</div>
                          <div className="small text-secondary">Actual {trip.actualPickup || '--'}</div>
                        </td>
                        <td>
                          <div>{trip.scheduledDropoff || '--'}</div>
                          <div className="small text-secondary">Actual {trip.actualDropoff || '--'}</div>
                        </td>
                      </tr>) : <tr>
                        <td colSpan={7}><div className={styles.emptyState}>No trips were archived for this day.</div></td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>

          <Row className="g-3">
            <Col xl={8}>
              <Card className={styles.sectionCard}>
                <CardBody className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <div className={styles.sectionTitle}>Driver Messages</div>
                      <div className={styles.sectionMeta}>Every message that was removed from the live dispatcher board now stays here.</div>
                    </div>
                    <Badge bg="dark">{stats.messageCount} messages</Badge>
                  </div>
                  {threadRows.length > 0 ? <div className={styles.threadGrid}>
                      {threadRows.map(thread => <div key={thread.driverId} className={styles.threadCard}>
                          <div className={styles.threadHeader}>
                            <div>
                              <div className="fw-semibold">{thread.driverLabel}</div>
                              <div className="small text-secondary">{thread.driverId}</div>
                            </div>
                            <Badge bg="secondary">{thread.messages.length}</Badge>
                          </div>
                          <div className={styles.messageList}>
                            {thread.messages.map(message => <div key={message.id} className={`${styles.messageBubble} ${message.direction === 'outgoing' ? styles.messageOutgoing : styles.messageIncoming}`}>
                                <div>{message.text || 'Attachment only'}</div>
                                <div className={styles.messageMeta}>{formatDispatchTime(message.timestamp, archive?.uiPreferences?.timeZone)} | {message.direction} | {message.status}{message.attachments?.length ? ` | ${message.attachments.length} attachment(s)` : ''}</div>
                              </div>)}
                          </div>
                        </div>)}
                    </div> : <div className={styles.emptyState}>No archived dispatcher messages for this day.</div>}
                </CardBody>
              </Card>
            </Col>
            <Col xl={4}>
              <Card className={styles.sectionCard}>
                <CardBody className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <div className={styles.sectionTitle}>Recorded Activity</div>
                      <div className={styles.sectionMeta}>Audit entries captured before the day was archived.</div>
                    </div>
                    <Badge bg="dark">{auditRows.length}</Badge>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {auditRows.length > 0 ? auditRows.map(item => <div key={item.id} className={styles.threadCard}>
                        <div className="d-flex justify-content-between gap-2 align-items-start">
                          <div>
                            <div className="fw-semibold">{item.summary || item.action}</div>
                            <div className="small text-secondary">{item.actorName || item.source || 'System'}</div>
                          </div>
                          <span className="small text-secondary">{formatDispatchTime(item.timestamp, archive?.uiPreferences?.timeZone)}</span>
                        </div>
                        <div className="small text-secondary mt-2">{item.entityType} {item.entityId ? `• ${item.entityId}` : ''}</div>
                      </div>) : <div className={styles.emptyState}>No audit activity archived for this day.</div>}
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </>}
    </div>;
};

export default DispatcherHistoryWorkspace;