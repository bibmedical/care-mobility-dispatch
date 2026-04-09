'use client';

import { useLayoutContext } from '@/context/useLayoutContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { getDriverColor, withDriverAlpha } from '@/helpers/nemt-driver-colors';
import { formatDispatchTime, formatTripDateLabel, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { USER_SEED } from '@/helpers/system-users';
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

const toTitleCase = value => String(value || '')
  .split(/[-_\s]+/)
  .filter(Boolean)
  .map(token => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
  .join(' ')
  .trim();

const normalizeLookupValue = value => String(value || '').trim().toLowerCase();

const normalizeDriverNameKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const getSystemUserFullName = userRecord => [userRecord?.firstName, userRecord?.lastName].map(part => String(part || '').trim()).filter(Boolean).join(' ').trim();

const findSystemUserByDriverId = driverId => {
  const normalizedDriverId = normalizeLookupValue(driverId);
  if (!normalizedDriverId) return null;

  const byUserSuffix = normalizedDriverId.match(/-user-(\d+)$/i);
  if (byUserSuffix?.[1]) {
    const userId = `user-${byUserSuffix[1]}`;
    const foundById = USER_SEED.find(user => normalizeLookupValue(user?.id) === userId);
    if (foundById) return foundById;
  }

  const usernameToken = normalizedDriverId.replace(/^drv-/i, '').replace(/-user-\d+$/i, '').replace(/^driver[-_]?/i, '').trim();
  if (!usernameToken) return null;
  return USER_SEED.find(user => normalizeLookupValue(user?.username) === usernameToken || normalizeLookupValue(user?.firstName) === usernameToken) || null;
};

const humanizeDriverId = driverId => {
  const raw = String(driverId || '').trim();
  if (!raw) return 'Driver';
  const compact = raw.toLowerCase();
  if (!compact.includes('drv-') && !compact.includes('-user-')) return toTitleCase(raw) || raw;
  const withoutPrefix = raw.replace(/^drv-/i, '');
  const withoutSuffix = withoutPrefix.replace(/-user-\d+$/i, '');
  const cleaned = toTitleCase(withoutSuffix.replace(/^driver[-_]?/i, ''));
  return cleaned || raw;
};

const resolveDriverDisplayLabel = (driverId, archive, fallbackLabel = '') => {
  const fromArchive = getDriverLabel(driverId, archive);
  if (fromArchive && fromArchive !== driverId) return fromArchive;
  const fromSystemUser = getSystemUserFullName(findSystemUserByDriverId(driverId));
  if (fromSystemUser) return fromSystemUser;
  const fallback = String(fallbackLabel || '').trim();
  if (fallback && !/^drv-/i.test(fallback) && !/-user-\d+$/i.test(fallback)) return fallback;
  return humanizeDriverId(driverId || fallback);
};

const getRouteLabel = routePlan => String(routePlan?.name || routePlan?.routeName || routePlan?.driverName || routePlan?.id || 'Route').trim() || 'Route';

const getTripPickupAddress = trip => String(trip?.address || trip?.fromAddress || trip?.pickupAddress || '').trim() || '--';

const getTripDropoffAddress = trip => String(trip?.destination || trip?.toAddress || trip?.dropoffAddress || '').trim() || '--';

const getTripLateMinutes = trip => {
  const candidates = [trip?.lateMinutes, trip?.delayMinutes, trip?.delay, trip?.driverWorkflow?.lateMinutes];
  for (const candidate of candidates) {
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  }
  return 0;
};

const getTripPunctualityLabel = trip => {
  const lateMinutes = getTripLateMinutes(trip);
  if (lateMinutes > 0) return `Late ${lateMinutes} min`;
  const statusLabel = String(trip?.onTimeStatus || '').trim();
  return statusLabel || 'On time';
};

const getStatusBadge = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'completed') return 'success';
  if (normalizedStatus === 'cancelled') return 'danger';
  if (normalizedStatus === 'in progress') return 'warning';
  if (normalizedStatus === 'assigned') return 'primary';
  return 'secondary';
};

const normalizeDriverId = value => String(value || '').trim();

const buildDriverSelectionKey = driverId => {
  const normalizedDriverId = normalizeDriverId(driverId);
  if (!normalizedDriverId) return '';
  if (normalizedDriverId.startsWith('id:') || normalizedDriverId.startsWith('name:')) return normalizedDriverId;
  return `id:${normalizedDriverId}`;
};

const extractDriverIdFromSelection = selectionKey => {
  const normalized = normalizeDriverId(selectionKey);
  if (!normalized) return '';
  if (normalized.startsWith('id:')) return normalizeDriverId(normalized.slice(3));
  if (normalized.startsWith('name:')) return '';
  return normalized;
};

const isTripOwnedByDriver = (trip, driverId) => {
  const selectionKey = normalizeDriverId(driverId);
  if (!selectionKey) return false;

  if (selectionKey.startsWith('name:')) {
    const selectedName = normalizeDriverNameKey(selectionKey.slice(5));
    if (!selectedName) return false;
    return [trip?.driverName, trip?.secondaryDriverName, trip?.completedByDriverName, trip?.canceledByDriverName].some(name => normalizeDriverNameKey(name) === selectedName);
  }

  const normalizedDriverId = extractDriverIdFromSelection(selectionKey);
  if (!normalizedDriverId) return false;
  return normalizeDriverId(trip?.driverId) === normalizedDriverId || normalizeDriverId(trip?.secondaryDriverId) === normalizedDriverId || normalizeDriverId(trip?.canceledByDriverId) === normalizedDriverId;
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
    const sortedRouteTrips = [...routeTripList].sort((left, right) => String(left?.scheduledPickup || left?.actualPickup || '').localeCompare(String(right?.scheduledPickup || right?.actualPickup || '')));
    const firstTrip = sortedRouteTrips[0] || null;
    const lastTrip = sortedRouteTrips[sortedRouteTrips.length - 1] || firstTrip;
    const distinctDrivers = Array.from(new Set(routeTripList.map(trip => String(trip?.driverName || trip?.driverId || '').trim()).filter(Boolean)));
    return {
      id: routePlan?.id,
      label: getRouteLabel(routePlan),
      driverId: String(routePlan?.driverId || routePlan?.secondaryDriverId || '').trim(),
      driverName: String(routePlan?.driverName || distinctDrivers.join(' + ') || 'Unassigned').trim(),
      tripCount: routeTripList.length,
      firstPickup: sortedRouteTrips.map(trip => String(trip?.scheduledPickup || trip?.actualPickup || '').trim()).find(Boolean) || '--',
      lastDropoff: [...sortedRouteTrips].reverse().map(trip => String(trip?.scheduledDropoff || trip?.actualDropoff || '').trim()).find(Boolean) || '--',
      startAddress: firstTrip ? getTripPickupAddress(firstTrip) : '--',
      endAddress: lastTrip ? getTripDropoffAddress(lastTrip) : '--',
      lateTripCount: sortedRouteTrips.filter(trip => getTripLateMinutes(trip) > 0).length,
      trips: routeTripList
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
};

const DispatcherHistoryWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const isLight = themeMode === 'light';
  const { showNotification } = useNotificationContext();
  const [loading, setLoading] = useState(true);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [archive, setArchive] = useState(null);
  const [backfillStatus, setBackfillStatus] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [tripFilterMode, setTripFilterMode] = useState('all');
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const fetchHistory = async (nextDate, nextDriverId = selectedDriverId) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '180');
      if (nextDate) params.set('date', nextDate);
      const nextDriverQueryId = extractDriverIdFromSelection(nextDriverId);
      if (nextDriverQueryId) params.set('driverId', nextDriverQueryId);
      const query = `?${params.toString()}`;
      const response = await fetch(`/api/nemt/dispatch-history${query}`, { cache: 'no-store' });
      const rawResponse = await response.text();
      let payload = null;
      try {
        payload = rawResponse ? JSON.parse(rawResponse) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload?.error || `Unable to load dispatcher history (${response.status})`);
      }
      if (!payload || typeof payload !== 'object') {
        throw new Error('Dispatcher history returned an invalid response');
      }
      setAvailableDates(Array.isArray(payload?.availableDates) ? payload.availableDates : []);
      setAvailableDrivers(Array.isArray(payload?.availableDrivers) ? payload.availableDrivers : []);
      setSelectedDate(String(payload?.selectedDateKey || nextDate || ''));
      const serverDriverId = buildDriverSelectionKey(payload?.selectedDriverId || '');
      const localDriverId = buildDriverSelectionKey(nextDriverId || '');
      if (serverDriverId) {
        setSelectedDriverId(serverDriverId);
      } else if (localDriverId) {
        setSelectedDriverId(localDriverId);
      }
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
      return;
    }
    if (selectedDriverId) return;
    const candidateDriverIds = new Set();
    (Array.isArray(archive?.trips) ? archive.trips : []).forEach(trip => {
      if (normalizeDriverId(trip?.driverId)) candidateDriverIds.add(normalizeDriverId(trip.driverId));
      if (normalizeDriverId(trip?.secondaryDriverId)) candidateDriverIds.add(normalizeDriverId(trip.secondaryDriverId));
    });
    (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).forEach(thread => {
      if (normalizeDriverId(thread?.driverId)) candidateDriverIds.add(normalizeDriverId(thread.driverId));
    });
    const firstDriverId = Array.from(candidateDriverIds.values())[0] || '';
    if (firstDriverId) setSelectedDriverId(buildDriverSelectionKey(firstDriverId));
  }, [archive, selectedDriverId]);

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
      await fetchHistory(selectedDate || '', selectedDriverId);
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

  const archiveDriverOptions = useMemo(() => {
    const optionMap = new Map();
    const routeList = buildRouteTripMap(archive?.routePlans, archive?.trips);
    (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).forEach(thread => {
      const driverId = normalizeDriverId(thread?.driverId);
      if (!driverId) return;
      const entryKey = buildDriverSelectionKey(driverId);
      const previousEntry = optionMap.get(entryKey) || {
        driverId: entryKey,
        rawDriverId: driverId,
        label: getDriverLabel(driverId, archive),
        routeCount: 0,
        tripCount: 0,
        messageCount: 0
      };
      optionMap.set(entryKey, {
        ...previousEntry,
        messageCount: previousEntry.messageCount + (Array.isArray(thread?.messages) ? thread.messages.length : 0)
      });
    });
    (Array.isArray(archive?.trips) ? archive.trips : []).forEach(trip => {
      [trip?.driverId, trip?.secondaryDriverId, trip?.canceledByDriverId].forEach(driverIdValue => {
        const driverId = normalizeDriverId(driverIdValue);
        if (driverId) {
          const entryKey = buildDriverSelectionKey(driverId);
          const previousEntry = optionMap.get(entryKey) || {
            driverId: entryKey,
            rawDriverId: driverId,
            label: getDriverLabel(driverId, archive),
            routeCount: 0,
            tripCount: 0,
            messageCount: 0
          };
          optionMap.set(entryKey, {
            ...previousEntry,
            tripCount: previousEntry.tripCount + 1
          });
          return;
        }

        const tripDriverName = String(trip?.driverName || '').trim();
        if (!tripDriverName) return;
        const nameKey = `name:${normalizeDriverNameKey(tripDriverName)}`;
        const previousEntry = optionMap.get(nameKey) || {
          driverId: nameKey,
          rawDriverId: '',
          label: tripDriverName,
          routeCount: 0,
          tripCount: 0,
          messageCount: 0
        };
        optionMap.set(nameKey, {
          ...previousEntry,
          tripCount: previousEntry.tripCount + 1
        });
      });
    });
    routeList.forEach(route => {
      const driverId = normalizeDriverId(route?.driverId) || normalizeDriverId((Array.isArray(route?.trips) ? route.trips[0]?.driverId : ''));
      if (driverId) {
        const entryKey = buildDriverSelectionKey(driverId);
        const previousEntry = optionMap.get(entryKey) || {
          driverId: entryKey,
          rawDriverId: driverId,
          label: getDriverLabel(driverId, archive),
          routeCount: 0,
          tripCount: 0,
          messageCount: 0
        };
        optionMap.set(entryKey, {
          ...previousEntry,
          routeCount: previousEntry.routeCount + 1
        });
      }

      if (!driverId) {
        const routeDriverName = String(route?.driverName || '').trim();
        if (!routeDriverName) return;
        const nameKey = `name:${normalizeDriverNameKey(routeDriverName)}`;
        const previousEntry = optionMap.get(nameKey) || {
          driverId: nameKey,
          rawDriverId: '',
          label: routeDriverName,
          routeCount: 0,
          tripCount: 0,
          messageCount: 0
        };
        optionMap.set(nameKey, {
          ...previousEntry,
          routeCount: previousEntry.routeCount + 1
        });
      }
    });
    return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [archive]);

  const mergedDriverOptions = useMemo(() => {
    const byDay = new Map(archiveDriverOptions.map(option => [option.driverId, option]));
    const merged = new Map();

    (availableDrivers.length > 0 ? availableDrivers : archiveDriverOptions).forEach(option => {
      const rawDriverId = normalizeDriverId(option?.driverId);
      const driverId = buildDriverSelectionKey(rawDriverId);
      if (!driverId && !rawDriverId) return;
      const mergedKey = driverId || rawDriverId;
      const dayOption = byDay.get(driverId) || {};
      merged.set(mergedKey, {
        ...option,
        driverId: mergedKey,
        rawDriverId: rawDriverId || option?.rawDriverId || '',
        label: resolveDriverDisplayLabel(rawDriverId || option?.rawDriverId || mergedKey, archive, option?.label),
        dayTripCount: Number(dayOption?.tripCount || 0),
        dayRouteCount: Number(dayOption?.routeCount || 0),
        archivedDayCount: Number(option?.archivedDayCount || 0),
        tripCount: Number(option?.tripCount || 0),
        routeCount: Number(option?.routeCount || 0)
      });
    });

    archiveDriverOptions.forEach(option => {
      const driverId = normalizeDriverId(option?.driverId);
      if (!driverId) return;
      const previous = merged.get(driverId);
      merged.set(driverId, {
        ...(previous || {}),
        ...option,
        driverId,
        rawDriverId: option?.rawDriverId || previous?.rawDriverId || '',
        label: resolveDriverDisplayLabel(option?.rawDriverId || previous?.rawDriverId || driverId, archive, previous?.label || option?.label),
        dayTripCount: Number(option?.tripCount || 0),
        dayRouteCount: Number(option?.routeCount || 0),
        archivedDayCount: Number(previous?.archivedDayCount || option?.archivedDayCount || 0),
        tripCount: Number(previous?.tripCount || option?.tripCount || 0),
        routeCount: Number(previous?.routeCount || option?.routeCount || 0)
      });
    });

    return Array.from(merged.values()).sort((left, right) => String(left?.label || left?.driverId).localeCompare(String(right?.label || right?.driverId)));
  }, [archive, archiveDriverOptions, availableDrivers]);

  const filteredDriverOptions = useMemo(() => {
    const term = driverSearch.trim().toLowerCase();
    if (!term) return mergedDriverOptions;
    return mergedDriverOptions.filter(option => [option?.label, option?.driverId].some(value => String(value || '').toLowerCase().includes(term)));
  }, [mergedDriverOptions, driverSearch]);

  useEffect(() => {
    if (filteredDriverOptions.length === 0) return;
    if (filteredDriverOptions.some(option => option.driverId === selectedDriverId)) return;
    setSelectedDriverId(filteredDriverOptions[0].driverId);
  }, [filteredDriverOptions, selectedDriverId]);

  const selectedDriverArchiveDays = useMemo(() => {
    const selectedRawDriverId = extractDriverIdFromSelection(selectedDriverId);
    const matchingDriver = availableDrivers.find(option => normalizeDriverId(option?.driverId) === selectedRawDriverId);
    return Array.isArray(matchingDriver?.days) ? matchingDriver.days : [];
  }, [availableDrivers, selectedDriverId]);

  const filteredTrips = useMemo(() => {
    if (!selectedDriverId) return [];
    return (Array.isArray(archive?.trips) ? archive.trips : []).filter(trip => isTripOwnedByDriver(trip, selectedDriverId));
  }, [archive, selectedDriverId]);

  const routeRows = useMemo(() => {
    const routeList = buildRouteTripMap(archive?.routePlans, archive?.trips);
    if (!selectedDriverId) return [];
    const selectedRawDriverId = extractDriverIdFromSelection(selectedDriverId);
    const selectedNameKey = selectedDriverId.startsWith('name:') ? normalizeDriverNameKey(selectedDriverId.slice(5)) : '';
    return routeList.filter(route => {
      const routeDriverId = normalizeDriverId(route?.driverId);
      const routeDriverName = normalizeDriverNameKey(route?.driverName);
      return route.trips.some(trip => isTripOwnedByDriver(trip, selectedDriverId)) || (selectedRawDriverId && routeDriverId === selectedRawDriverId) || (selectedNameKey && routeDriverName === selectedNameKey);
    });
  }, [archive, selectedDriverId]);

  const threadRows = useMemo(() => {
    const selectedRawDriverId = extractDriverIdFromSelection(selectedDriverId);
    return (Array.isArray(archive?.dispatchThreads) ? archive.dispatchThreads : []).filter(thread => !selectedDriverId || normalizeDriverId(thread?.driverId) === selectedRawDriverId).map(thread => ({
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

  const visibleTripRows = useMemo(() => tripFilterMode === 'late' ? tripRows.filter(trip => getTripLateMinutes(trip) > 0) : tripRows, [tripFilterMode, tripRows]);

  const auditRows = useMemo(() => [...(Array.isArray(archive?.auditLog) ? archive.auditLog : [])].filter(item => {
    if (!selectedDriverId) return false;
    const selectedRawDriverId = extractDriverIdFromSelection(selectedDriverId);
    const selectedNameKey = selectedDriverId.startsWith('name:') ? normalizeDriverNameKey(selectedDriverId.slice(5)) : '';
    const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    return normalizeDriverId(metadata?.driverId) === selectedRawDriverId
      || normalizeDriverId(item?.entityId) === selectedRawDriverId
      || (selectedNameKey && normalizeDriverNameKey(item?.summary) .includes(selectedNameKey));
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
    tripCount: visibleTripRows.length,
    routeCount: routeRows.length,
    threadCount: threadRows.length,
    messageCount: threadRows.reduce((sum, thread) => sum + (Array.isArray(thread?.messages) ? thread.messages.length : 0), 0),
    auditCount: auditRows.length
  };

  const selectedDriverSummary = mergedDriverOptions.find(option => option.driverId === selectedDriverId) || null;
  const selectedDriverLabel = selectedDriverSummary?.label || (selectedDriverId ? resolveDriverDisplayLabel(extractDriverIdFromSelection(selectedDriverId) || selectedDriverId.replace(/^name:/, ''), archive, '') : '');
  const selectedDriverColor = getDriverColor(selectedDriverSummary?.driverId || selectedDriverId || selectedDriverLabel);
  const selectedDaySummary = availableDates.find(item => item.dateKey === selectedDate) || null;

  const archiveStats = archive?.summary || {
    tripCount: 0,
    routeCount: 0,
    threadCount: 0,
    messageCount: 0,
    auditCount: 0
  };

  return <div className={`${styles.pageRoot} ${isLight ? styles.pageRootLight : ''}`}>
      <Card className={styles.heroCard}>
        <CardBody className="p-4 p-lg-5">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-end">
            <div>
              <div className="text-uppercase small fw-semibold text-secondary mb-2">Dispatcher</div>
              <h1 className={styles.heroTitle}>History</h1>
              <p className={styles.heroText}>Cada día archivado queda guardado aquí con sus rutas, viajes, mensajes y actividad. A medianoche se mueve fuera del tablero activo para que Dispatcher no se siga llenando.</p>
            </div>
            <div className={styles.heroSummaryGrid}>
              <div className={styles.heroSummaryCard}>
                <span className={styles.heroSummaryLabel}>Active day</span>
                <strong>{archive?.dateKey ? formatTripDateLabel(archive.dateKey) : 'No day selected'}</strong>
              </div>
              <div className={styles.heroSummaryCard}>
                <span className={styles.heroSummaryLabel}>Driver</span>
                <strong>{selectedDriverLabel || 'Pick a driver'}</strong>
              </div>
              <div className={styles.heroSummaryCard}>
                <span className={styles.heroSummaryLabel}>Archive totals</span>
                <strong>{archiveStats.tripCount} trips</strong>
              </div>
            </div>
          </div>
          {backfillStatus ? <div className="mt-3">
              <span className={styles.statusPill}>{backfillStatus}</span>
            </div> : null}
        </CardBody>
      </Card>

      <div className={styles.historyShell}>
        <aside className={styles.sidebarColumn}>
          <Card className={styles.sidebarCard}>
            <CardBody className="p-3">
              <div className={styles.sectionTitle}>Browse history</div>
              <div className={styles.sectionMeta}>Elige día y chofer desde el panel izquierdo como en Trip Dashboard.</div>
              <div className={styles.sidebarFormStack}>
                <Form.Group>
                  <Form.Label className="small text-secondary mb-1">Select day</Form.Label>
                  <Form.Control size="sm" type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
                </Form.Group>
                <div className={styles.sidebarButtonRow}>
                  <Button size="sm" variant="dark" onClick={() => fetchHistory(selectedDate, selectedDriverId)} disabled={loading || !selectedDate}>Load day</Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => fetchHistory('', selectedDriverId)} disabled={loading}>Latest</Button>
                </div>
                <Button size="sm" variant="outline-success" onClick={handleBackfill} disabled={loading || backfillRunning}>{backfillRunning ? 'Backfilling...' : 'Backfill old days'}</Button>
              </div>
            </CardBody>
          </Card>

          <Card className={styles.sidebarCard}>
            <CardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                <div>
                  <div className={styles.sectionTitle}>Drivers</div>
                  <div className={styles.sectionMeta}>Haz clic en un chofer para ver su ruta del dia a la derecha.</div>
                </div>
                <Badge bg="dark">{mergedDriverOptions.length}</Badge>
              </div>
              <Form.Control size="sm" className="mb-3" placeholder="Search driver" value={driverSearch} onChange={event => setDriverSearch(event.target.value)} />
              <div className={styles.sidebarList}>
                {filteredDriverOptions.length > 0 ? filteredDriverOptions.map(option => <button key={option.driverId} type="button" className={`${styles.sidebarItem} ${option.driverId === selectedDriverId ? styles.sidebarItemActive : ''}`} style={option.driverId === selectedDriverId ? { borderColor: getDriverColor(option.driverId), boxShadow: `0 0 0 1px ${withDriverAlpha(getDriverColor(option.driverId), 0.28)}` } : undefined} onClick={() => fetchHistory(selectedDate, option.driverId)}>
                    <div>
                      <div className={styles.sidebarItemTitle}><span className={styles.driverDot} style={{ backgroundColor: getDriverColor(option.driverId) }} />{option.label}</div>
                      <div className={styles.sidebarItemMeta}>{option.dayRouteCount} routes today · {option.dayTripCount} trips today · {option.archivedDayCount} days</div>
                    </div>
                    <span className={styles.sidebarItemPill}>{option.dayTripCount}</span>
                  </button>) : <div className={styles.emptyState}>No drivers match that search.</div>}
              </div>
            </CardBody>
          </Card>

          <Card className={styles.sidebarCard}>
            <CardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                <div>
                  <div className={styles.sectionTitle}>Days</div>
                  <div className={styles.sectionMeta}>Selecciona el dia para filtrar el historial y rutas.</div>
                </div>
                <Badge bg="dark">{availableDates.length}</Badge>
              </div>
              <div className={styles.sidebarList}>
                {availableDates.map(item => <button key={item.dateKey} type="button" className={`${styles.sidebarItem} ${item.dateKey === selectedDate ? styles.sidebarItemActive : ''}`} onClick={() => fetchHistory(item.dateKey, selectedDriverId)}>
                    <div>
                      <div className={styles.sidebarItemTitle}>{item.isLive ? '🟢 Today (live)' : formatTripDateLabel(item.dateKey)}</div>
                      <div className={styles.sidebarItemMeta}>{item.routeCount} routes · {item.tripCount} trips · {item.messageCount} messages</div>
                    </div>
                    <span className={styles.sidebarItemPill}>{item.isLive ? item.tripCount : item.auditCount}</span>
                  </button>)}
              </div>
            </CardBody>
          </Card>

          <Card className={styles.sidebarCard}>
            <CardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                <div>
                  <div className={styles.sectionTitle}>Driver days</div>
                  <div className={styles.sectionMeta}>Aquí están los días archivados del chofer seleccionado.</div>
                </div>
                <Badge bg="dark">{selectedDriverArchiveDays.length}</Badge>
              </div>
              <div className={styles.sidebarList}>
                {selectedDriverArchiveDays.length > 0 ? selectedDriverArchiveDays.map(day => <button key={`${selectedDriverId}-${day.dateKey}`} type="button" className={`${styles.sidebarItem} ${day.dateKey === selectedDate ? styles.sidebarItemActive : ''}`} onClick={() => fetchHistory(day.dateKey, selectedDriverId)}>
                    <div>
                      <div className={styles.sidebarItemTitle}>{formatTripDateLabel(day.dateKey)}</div>
                      <div className={styles.sidebarItemMeta}>{day.routeCount} routes · {day.tripCount} trips · {day.messageCount} messages</div>
                    </div>
                    <span className={styles.sidebarItemPill}>{day.tripCount}</span>
                  </button>) : <div className={styles.emptyState}>Select a driver to list archived work days.</div>}
              </div>
            </CardBody>
          </Card>
        </aside>

        <div className={styles.contentColumn}>
          {archive ? <Card className={styles.sectionCard}>
              <CardBody className="p-3 p-lg-4">
                <div className={styles.detailHeader}>
                  <div>
                    <div className={styles.sectionTitle}>{selectedDriverLabel || 'Select a driver'} · {archive?.dateKey ? formatTripDateLabel(archive.dateKey) : 'No day'}{archive?.isLive ? ' 🟢 Live' : ''}</div>
                    <div className={styles.sectionMeta}>{archive?.isLive ? 'Datos en vivo del día de hoy — viajes, choferes y rutas activas.' : 'Aquí ves la ruta completa del día, las personas tarde, los mensajes y la actividad grabada en history.'}</div>
                  </div>
                  <div className={styles.detailBadgeRow}>
                    {selectedDriverLabel ? <span className={styles.detailBadge} style={{ backgroundColor: withDriverAlpha(selectedDriverColor, 0.12), borderColor: withDriverAlpha(selectedDriverColor, 0.28), color: selectedDriverColor }}><span className={styles.driverDot} style={{ backgroundColor: selectedDriverColor }} />{selectedDriverLabel}</span> : null}
                    {selectedDaySummary ? <span className={styles.detailBadge}>Day total: {selectedDaySummary.tripCount} trips</span> : null}
                    {selectedDriverSummary ? <span className={styles.detailBadge}>Driver total: {selectedDriverSummary.tripCount} trips</span> : null}
                    <span className={styles.detailBadge}>Messages: {stats.messageCount}</span>
                  </div>
                </div>
              </CardBody>
            </Card> : null}

          <div className={styles.statsGrid}>
            <div className={styles.statCard} style={selectedDriverId ? { borderColor: withDriverAlpha(selectedDriverColor, 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.14)} 0%, rgba(13, 19, 31, 0.98) 100%)` } : undefined}>
              <div className={styles.statLabel}>Routes</div>
              <div className={styles.statValue}>{stats.routeCount}</div>
            </div>
            <div className={styles.statCard} style={selectedDriverId ? { borderColor: withDriverAlpha(selectedDriverColor, 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.14)} 0%, rgba(13, 19, 31, 0.98) 100%)` } : undefined}>
              <div className={styles.statLabel}>Trips</div>
              <div className={styles.statValue}>{stats.tripCount}</div>
            </div>
            <div className={styles.statCard} style={selectedDriverId ? { borderColor: withDriverAlpha(selectedDriverColor, 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.14)} 0%, rgba(13, 19, 31, 0.98) 100%)` } : undefined}>
              <div className={styles.statLabel}>Threads</div>
              <div className={styles.statValue}>{stats.threadCount}</div>
            </div>
            <div className={styles.statCard} style={selectedDriverId ? { borderColor: withDriverAlpha(selectedDriverColor, 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.14)} 0%, rgba(13, 19, 31, 0.98) 100%)` } : undefined}>
              <div className={styles.statLabel}>Messages</div>
              <div className={styles.statValue}>{stats.messageCount}</div>
            </div>
            <div className={styles.statCard} style={selectedDriverId ? { borderColor: withDriverAlpha(selectedDriverColor, 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.14)} 0%, rgba(13, 19, 31, 0.98) 100%)` } : undefined}>
              <div className={styles.statLabel}>Late Trips</div>
              <div className={styles.statValue}>{tripRows.filter(trip => getTripLateMinutes(trip) > 0).length}</div>
            </div>
          </div>

          {archive ? <div className="small text-secondary">{archive?.isLive ? '🟢 Live —' : `Archive: ${formatTripDateLabel(archive.dateKey)} ·`} {archiveStats.routeCount} routes, {archiveStats.tripCount} trips, {archiveStats.messageCount} messages. Showing only {selectedDriverLabel || 'selected driver'}.</div> : null}

          {loading ? <Card className={styles.sectionCard}>
          <CardBody className="p-4 d-flex align-items-center gap-3">
            <Spinner animation="border" size="sm" />
            <span>Loading dispatcher day...</span>
          </CardBody>
        </Card> : !archive ? <Card className={styles.sectionCard}>
          <CardBody className="p-4">
            <div className={styles.emptyState}>No trips found for the selected date. Try selecting a different day.</div>
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
                  <div className={styles.sectionTitle}>{selectedDriverLabel} · Routes for {formatTripDateLabel(archive.dateKey)}{archive?.isLive ? ' 🟢' : ''}</div>
                  <div className={styles.sectionMeta}>{archive?.isLive ? 'Datos en vivo del día de hoy' : `Archived ${new Date(archive.archivedAt).toLocaleString()}`} · Full route and trip window for the selected driver</div>
                </div>
              </div>
              <div className="table-responsive">
                <Table hover className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Trips</th>
                      <th>Window</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeRows.length > 0 ? routeRows.map(route => <tr key={route.id || route.label}>
                        <td>
                          <div className="fw-semibold d-flex align-items-center gap-2"><span className={styles.driverDot} style={{ backgroundColor: selectedDriverColor }} />{route.label}</div>
                          <div className="small text-secondary">{route.driverName || '--'}</div>
                        </td>
                        <td>{route.tripCount}</td>
                        <td>{route.firstPickup} to {route.lastDropoff}</td>
                        <td className={styles.locationCell}>{route.startAddress}</td>
                        <td className={styles.locationCell}>{route.endAddress}</td>
                        <td>{route.lateTripCount > 0 ? <Badge bg="warning" text="dark">{`${route.lateTripCount} late`}</Badge> : <Badge style={{ backgroundColor: selectedDriverColor }}>On time</Badge>}</td>
                      </tr>) : <tr>
                        <td colSpan={6}><div className={styles.emptyState}>No routes were archived for this day.</div></td>
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
                <div className="d-flex gap-2 align-items-center flex-wrap">
                  <Button size="sm" variant={tripFilterMode === 'all' ? 'dark' : 'outline-dark'} onClick={() => setTripFilterMode('all')}>All trips</Button>
                  <Button size="sm" variant={tripFilterMode === 'late' ? 'warning' : 'outline-warning'} onClick={() => setTripFilterMode('late')}>Late only</Button>
                  <Badge bg="dark">{visibleTripRows.length} trips</Badge>
                </div>
              </div>
              <div className="table-responsive">
                <Table hover className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Trip</th>
                      <th>Rider</th>
                      <th>Status</th>
                      <th>Route</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Window</th>
                      <th>Late</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTripRows.length > 0 ? visibleTripRows.map(trip => <tr key={trip.id}>
                        <td>
                          <div className="fw-semibold">{trip.rideId || trip.id}</div>
                          <div className="small text-secondary">{trip.id}</div>
                        </td>
                        <td>{trip.rider || '--'}</td>
                        <td><Badge bg={getStatusBadge(trip.status)}>{trip.status || 'Unknown'}</Badge></td>
                        <td>{trip.routeLabel}</td>
                        <td className={styles.locationCell}>{getTripPickupAddress(trip)}</td>
                        <td className={styles.locationCell}>{getTripDropoffAddress(trip)}</td>
                        <td>
                          <div>{trip.scheduledPickup || '--'} to {trip.scheduledDropoff || '--'}</div>
                          <div className="small text-secondary">Actual {trip.actualPickup || '--'} to {trip.actualDropoff || '--'}</div>
                        </td>
                        <td><Badge bg={getTripLateMinutes(trip) > 0 ? 'warning' : 'success'} text={getTripLateMinutes(trip) > 0 ? 'dark' : undefined}>{getTripPunctualityLabel(trip)}</Badge></td>
                        <td className={styles.notesCell}>{String(trip?.notes || trip?.additionalNotes || '').trim() || '--'}</td>
                      </tr>) : <tr>
                        <td colSpan={9}><div className={styles.emptyState}>No trips were archived for this day.</div></td>
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
                {photoGroups.length > 0 ? photoGroups.map(group => <div key={group.key} className={styles.patientGroup} style={group.trip ? { borderColor: withDriverAlpha(selectedDriverColor, 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.11)} 0%, rgba(17, 24, 39, 0.94) 100%)` } : undefined}>
                    <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
                      <div>
                        <div className="fw-semibold">{group.title}</div>
                        <div className="small text-secondary">{group.trip ? `${group.trip.scheduledPickup || '--'} to ${group.trip.scheduledDropoff || '--'} · Trip ${group.trip.rideId || group.trip.id}` : 'Could not match to a patient trip exactly'}</div>
                      </div>
                      {group.trip ? <Badge style={{ backgroundColor: selectedDriverColor }}>{group.photos.length} photo(s)</Badge> : <Badge bg="secondary">{group.photos.length} photo(s)</Badge>}
                    </div>
                    <div className={styles.photoGrid}>
                      {group.photos.map(photo => <div key={photo.id} className={styles.photoCard} style={group.trip ? { borderColor: withDriverAlpha(selectedDriverColor, 0.22) } : undefined}>
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
                      {threadRows.map(thread => <div key={thread.driverId} className={styles.threadCard} style={{ borderColor: withDriverAlpha(getDriverColor(thread.driverId), 0.24), background: `linear-gradient(180deg, ${withDriverAlpha(getDriverColor(thread.driverId), 0.12)} 0%, rgba(15, 22, 35, 0.98) 100%)` }}>
                          <div className={styles.threadHeader}>
                            <div>
                              <div className="fw-semibold d-flex align-items-center gap-2"><span className={styles.driverDot} style={{ backgroundColor: getDriverColor(thread.driverId) }} />{thread.driverLabel}</div>
                              <div className="small text-secondary">{thread.driverId}</div>
                            </div>
                            <Badge style={{ backgroundColor: getDriverColor(thread.driverId) }}>{thread.messages.length}</Badge>
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
                    {auditRows.length > 0 ? auditRows.map(item => <div key={item.id} className={styles.threadCard} style={{ borderColor: withDriverAlpha(selectedDriverColor, 0.2), background: `linear-gradient(180deg, ${withDriverAlpha(selectedDriverColor, 0.1)} 0%, rgba(15, 22, 35, 0.98) 100%)` }}>
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
        </div>
      </div>
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