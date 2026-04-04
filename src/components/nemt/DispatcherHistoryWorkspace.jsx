'use client';

import { useNotificationContext } from '@/context/useNotificationContext';
import { formatDispatchTime, formatTripDateLabel, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
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

const normalizeDriverId = value => String(value || '').trim();

const isTripOwnedByDriver = (trip, driverId) => {
  const normalizedDriverId = normalizeDriverId(driverId);
  if (!normalizedDriverId) return false;
  return normalizeDriverId(trip?.driverId) === normalizedDriverId || normalizeDriverId(trip?.secondaryDriverId) === normalizedDriverId;
};

const getTimestampMinutes = (timestamp, timeZone) => {
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hours = Number(parts.find(part => part.type === 'hour')?.value);
  const minutes = Number(parts.find(part => part.type === 'minute')?.value);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const getTripWindow = (trip, timeZone) => {
  const pickupMinutes = parseTripClockMinutes(trip?.actualPickup) ?? parseTripClockMinutes(trip?.scheduledPickup) ?? getTimestampMinutes(trip?.arrivedAt || trip?.driverWorkflow?.arrivedAt, timeZone);
  const dropoffMinutes = parseTripClockMinutes(trip?.actualDropoff) ?? parseTripClockMinutes(trip?.scheduledDropoff) ?? getTimestampMinutes(trip?.completedAt || trip?.driverWorkflow?.completedAt, timeZone);
  const enRouteMinutes = getTimestampMinutes(trip?.enRouteAt || trip?.driverWorkflow?.enRouteAt, timeZone);
  const startMinutes = enRouteMinutes ?? (pickupMinutes != null ? Math.max(0, pickupMinutes - 20) : null);
  const endMinutes = dropoffMinutes != null ? Math.min(24 * 60, dropoffMinutes + 20) : pickupMinutes != null ? Math.min(24 * 60, pickupMinutes + 90) : null;
  return {
    startMinutes,
    endMinutes
  };
};

const matchPhotoToTrip = (tripRows, messageTimestamp, timeZone) => {
  const targetMinutes = getTimestampMinutes(messageTimestamp, timeZone);
  if (targetMinutes == null) return null;

  const candidates = tripRows.map(trip => {
    const window = getTripWindow(trip, timeZone);
    if (window.startMinutes == null || window.endMinutes == null) return null;
    const inWindow = targetMinutes >= window.startMinutes && targetMinutes <= window.endMinutes;
    const midpoint = (window.startMinutes + window.endMinutes) / 2;
    return {
      trip,
      inWindow,
      distance: Math.abs(targetMinutes - midpoint)
    };
  }).filter(Boolean);

  const bestWindow = candidates.filter(item => item.inWindow).sort((left, right) => left.distance - right.distance)[0];
  if (bestWindow) return bestWindow.trip;
  return candidates.sort((left, right) => left.distance - right.distance)[0]?.trip || null;
};

const isPhotoAttachment = attachment => attachment?.kind === 'photo' || String(attachment?.mimeType || '').toLowerCase().startsWith('image/');

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
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [archive, setArchive] = useState(null);
  const [backfillStatus, setBackfillStatus] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState(null);

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

  useEffect(() => {
    if (!archive) {
      setSelectedDriverId('');
      return;
    }
    const candidateDriverIds = new Set();
    (Array.isArray(archive?.trips) ? archive.trips : []).forEach(trip => {
      if (normalizeDriverId(trip?.driverId)) candidateDriverIds.add(normalizeDriverId(trip.driverId));
      if (normalizeDriverId(trip?.secondaryDriverId)) candidateDriverIds.add(normalizeDriverId(trip.secondaryDriverId));
    });
    (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).forEach(thread => {
      if (normalizeDriverId(thread?.driverId)) candidateDriverIds.add(normalizeDriverId(thread.driverId));
    });
    const firstDriverId = Array.from(candidateDriverIds.values())[0] || '';
    setSelectedDriverId(current => current && candidateDriverIds.has(current) ? current : firstDriverId);
  }, [archive]);

  const handleBackfill = async () => {
    setBackfillRunning(true);
    setBackfillStatus('');
    try {
      const response = await fetch('/api/nemt/dispatch-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to backfill dispatcher history');
      }
      const archiveDates = Array.isArray(payload?.archiveDates) ? payload.archiveDates : [];
      const message = archiveDates.length > 0
        ? `Backfill complete. ${archiveDates.length} archived day(s) refreshed from ${payload?.processedSnapshots || 0} snapshots.`
        : `Backfill checked ${payload?.processedSnapshots || 0} snapshots. No missing archived days were found.`;
      setBackfillStatus(message);
      showNotification({
        message,
        variant: 'success'
      });
      await fetchHistory(selectedDate || '');
    } catch (error) {
      const message = error?.message || 'Unable to backfill dispatcher history';
      setBackfillStatus('');
      showNotification({
        message,
        variant: 'danger'
      });
    } finally {
      setBackfillRunning(false);
    }
  };

  const driverOptions = useMemo(() => {
    const optionMap = new Map();
    (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).forEach(thread => {
      const driverId = normalizeDriverId(thread?.driverId);
      if (!driverId) return;
      optionMap.set(driverId, {
        driverId,
        label: getDriverLabel(driverId, archive)
      });
    });
    (Array.isArray(archive?.trips) ? archive.trips : []).forEach(trip => {
      [trip?.driverId, trip?.secondaryDriverId].forEach(driverIdValue => {
        const driverId = normalizeDriverId(driverIdValue);
        if (!driverId) return;
        optionMap.set(driverId, {
          driverId,
          label: getDriverLabel(driverId, archive)
        });
      });
    });
    return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [archive]);

  const filteredTrips = useMemo(() => {
    if (!selectedDriverId) return [];
    return (Array.isArray(archive?.trips) ? archive.trips : []).filter(trip => isTripOwnedByDriver(trip, selectedDriverId));
  }, [archive, selectedDriverId]);

  const routeRows = useMemo(() => {
    const routeList = buildRouteTripMap(archive?.routePlans, archive?.trips);
    if (!selectedDriverId) return [];
    return routeList.filter(route => route.trips.some(trip => isTripOwnedByDriver(trip, selectedDriverId)) || normalizeDriverId(route?.driverId) === selectedDriverId || String(route?.driverName || '').trim() === getDriverLabel(selectedDriverId, archive));
  }, [archive, selectedDriverId]);

  const threadRows = useMemo(() => {
    return (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).filter(thread => !selectedDriverId || normalizeDriverId(thread?.driverId) === selectedDriverId).map(thread => ({
      ...thread,
      driverLabel: getDriverLabel(thread.driverId, archive)
    })).sort((left, right) => left.driverLabel.localeCompare(right.driverLabel));
  }, [archive, selectedDriverId]);

  const tripRows = useMemo(() => {
    const routeLabelMap = new Map((Array.isArray(routeRows) ? routeRows : []).flatMap(route => route.trips.map(trip => [String(trip?.id || '').trim(), route.label])));
    return [...filteredTrips].map(trip => ({
      ...trip,
      routeLabel: routeLabelMap.get(String(trip?.id || '').trim()) || '--'
    })).sort((left, right) => {
      const leftTime = String(left?.scheduledPickup || left?.actualPickup || '');
      const rightTime = String(right?.scheduledPickup || right?.actualPickup || '');
      return leftTime.localeCompare(rightTime);
    });
  }, [filteredTrips, routeRows]);

  const auditRows = useMemo(() => [...(Array.isArray(archive?.auditLog) ? archive.auditLog : [])].filter(item => {
    if (!selectedDriverId) return false;
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    return normalizeDriverId(metadata?.driverId) === selectedDriverId || normalizeDriverId(item?.entityId) === selectedDriverId || String(item?.summary || '').toLowerCase().includes(getDriverLabel(selectedDriverId, archive).toLowerCase());
  }).sort((left, right) => String(right?.timestamp || '').localeCompare(String(left?.timestamp || ''))), [archive, selectedDriverId]);

  const photoGroups = useMemo(() => {
    const timeZone = archive?.uiPreferences?.timeZone;
    const groups = new Map();
    threadRows.forEach(thread => {
      (Array.isArray(thread?.messages) ? thread.messages : []).forEach(message => {
        (Array.isArray(message?.attachments) ? message.attachments : []).filter(isPhotoAttachment).forEach(attachment => {
          const matchedTrip = matchPhotoToTrip(tripRows, message.timestamp, timeZone);
          const groupKey = matchedTrip ? String(matchedTrip?.id || '').trim() : 'unassigned';
          const currentGroup = groups.get(groupKey) || {
            key: groupKey,
            title: matchedTrip ? (matchedTrip.rider || 'Unknown patient') : 'Unassigned photos',
            trip: matchedTrip,
            photos: []
          };
          currentGroup.photos.push({
            id: `${message.id}-${attachment.id}`,
            dataUrl: attachment.dataUrl,
            name: attachment.name || 'Photo',
            timestamp: message.timestamp,
            direction: message.direction,
            status: message.status,
            threadLabel: thread.driverLabel,
            trip: matchedTrip
          });
          groups.set(groupKey, currentGroup);
        });
      });
    });
    return Array.from(groups.values()).map(group => ({
      ...group,
      photos: group.photos.sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')))
    })).sort((left, right) => left.title.localeCompare(right.title));
  }, [archive, threadRows, tripRows]);

  const stats = {
    tripCount: tripRows.length,
    routeCount: routeRows.length,
    threadCount: threadRows.length,
    messageCount: threadRows.reduce((sum, thread) => sum + (Array.isArray(thread?.messages) ? thread.messages.length : 0), 0),
    auditCount: auditRows.length
  };

  const selectedDriverLabel = selectedDriverId ? getDriverLabel(selectedDriverId, archive) : '';

  const archiveStats = archive?.summary || {
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
            <div className={styles.toolbarActions}>
              <Form.Group>
                <Form.Label className="small text-secondary">Select day</Form.Label>
                <Form.Control type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
              </Form.Group>
              <Button variant="dark" onClick={() => fetchHistory(selectedDate)} disabled={loading || !selectedDate}>Load</Button>
              <Button variant="outline-secondary" onClick={() => fetchHistory('')} disabled={loading}>Latest</Button>
              <Button variant="outline-success" onClick={handleBackfill} disabled={loading || backfillRunning}>{backfillRunning ? 'Backfilling...' : 'Backfill old days'}</Button>
            </div>
          </div>
          {backfillStatus ? <div className="mt-3">
              <span className={styles.statusPill}>{backfillStatus}</span>
            </div> : null}
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

      <Card className={styles.driverPickerCard}>
        <CardBody className="p-3 p-lg-4">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end">
            <div>
              <div className={styles.sectionTitle}>Driver Filter</div>
              <div className={styles.sectionMeta}>Primero elige el chofer para no enseñar todos los mensajes del día mezclados.</div>
            </div>
            <div className={styles.toolbarActions}>
              <Form.Group>
                <Form.Label className="small text-secondary">Driver name</Form.Label>
                <Form.Select value={selectedDriverId} onChange={event => setSelectedDriverId(event.target.value)}>
                  {driverOptions.length > 0 ? driverOptions.map(option => <option key={option.driverId} value={option.driverId}>{option.label}</option>) : <option value="">No drivers found</option>}
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <div className="mt-3 d-flex flex-wrap gap-2 align-items-center">
            <span className="small text-secondary">Drivers in archive:</span>
            <div className={styles.driverChipList}>
              {driverOptions.map(option => <Button key={option.driverId} size="sm" variant={option.driverId === selectedDriverId ? 'dark' : 'outline-dark'} className={styles.dateChip} onClick={() => setSelectedDriverId(option.driverId)}>
                  {option.label}
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

      {archive ? <div className="small text-secondary">Archive total for {formatTripDateLabel(archive.dateKey)}: {archiveStats.routeCount} routes, {archiveStats.tripCount} trips, {archiveStats.messageCount} messages. Showing only {selectedDriverLabel || 'selected driver'}.</div> : null}

      {loading ? <Card className={styles.sectionCard}>
          <CardBody className="p-4 d-flex align-items-center gap-3">
            <Spinner animation="border" size="sm" />
            <span>Loading archived dispatcher day...</span>
          </CardBody>
        </Card> : !archive ? <Card className={styles.sectionCard}>
          <CardBody className="p-4">
            <div className={styles.emptyState}>No archived dispatcher day was found for the selected date.</div>
          </CardBody>
        </Card> : !selectedDriverId ? <Card className={styles.sectionCard}>
          <CardBody className="p-4">
            <div className={styles.emptyState}>Select a driver name to view route, trips, messages, and patient photos for that day.</div>
          </CardBody>
        </Card> : <>
          <Card className={styles.sectionCard}>
            <CardBody className="p-4">
              <div className="d-flex flex-column flex-lg-row justify-content-between gap-2 mb-3">
                <div>
                  <div className={styles.sectionTitle}>{selectedDriverLabel} · Routes for {formatTripDateLabel(archive.dateKey)}</div>
                  <div className={styles.sectionMeta}>Archived {new Date(archive.archivedAt).toLocaleString()} · Full route and trip window for the selected driver</div>
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

          <Card className={styles.sectionCard}>
            <CardBody className="p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <div className={styles.sectionTitle}>Patient Photos</div>
                  <div className={styles.sectionMeta}>Photos are grouped by patient using the message time against the selected driver's trip timeline.</div>
                </div>
                <Badge bg="dark">{photoGroups.reduce((sum, group) => sum + group.photos.length, 0)} photos</Badge>
              </div>
              <div className="d-flex flex-column gap-3">
                {photoGroups.length > 0 ? photoGroups.map(group => <div key={group.key} className={styles.patientGroup}>
                    <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
                      <div>
                        <div className="fw-semibold">{group.title}</div>
                        <div className="small text-secondary">{group.trip ? `${group.trip.scheduledPickup || '--'} to ${group.trip.scheduledDropoff || '--'} · Trip ${group.trip.rideId || group.trip.id}` : 'Could not match to a patient trip exactly'}</div>
                      </div>
                      <Badge bg={group.trip ? 'primary' : 'secondary'}>{group.photos.length} photo(s)</Badge>
                    </div>
                    <div className={styles.photoGrid}>
                      {group.photos.map(photo => <div key={photo.id} className={styles.photoCard}>
                          <button type="button" className={styles.photoButton} onClick={() => setPreviewPhoto(photo)}>
                            <img src={photo.dataUrl} alt={photo.name || group.title} className={styles.photoImage} />
                          </button>
                          <div className={styles.photoBody}>
                            <div className="fw-semibold">{group.title}</div>
                            <div className={styles.photoMeta}>{formatDispatchTime(photo.timestamp, archive?.uiPreferences?.timeZone)} · {photo.direction} · {photo.status || 'sent'}</div>
                          </div>
                        </div>)}
                    </div>
                  </div>) : <div className={styles.emptyState}>No patient photos were found for this driver on the selected day.</div>}
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
                                {Array.isArray(message.attachments) && message.attachments.length > 0 ? <div className="mt-2 d-flex flex-wrap gap-2">
                                    {message.attachments.filter(isPhotoAttachment).map(attachment => <button key={attachment.id} type="button" className={styles.photoButton} style={{ width: 92 }} onClick={() => setPreviewPhoto({
                                  id: `${message.id}-${attachment.id}`,
                                  dataUrl: attachment.dataUrl,
                                  name: attachment.name,
                                  timestamp: message.timestamp,
                                  direction: message.direction,
                                  status: message.status
                                })}>
                                        <img src={attachment.dataUrl} alt={attachment.name || 'Driver photo'} style={{ width: 92, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }} />
                                      </button>)}
                                  </div> : null}
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
      <Modal show={Boolean(previewPhoto)} onHide={() => setPreviewPhoto(null)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{previewPhoto?.name || 'Photo preview'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {previewPhoto?.dataUrl ? <img src={previewPhoto.dataUrl} alt={previewPhoto.name || 'Photo preview'} style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 12 }} /> : null}
          {previewPhoto ? <div className="small text-secondary mt-3">{formatDispatchTime(previewPhoto.timestamp, archive?.uiPreferences?.timeZone)} | {previewPhoto.direction} | {previewPhoto.status || 'sent'}</div> : null}
        </Modal.Body>
      </Modal>
    </div>;
};

export default DispatcherHistoryWorkspace;