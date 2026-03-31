'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { useNemtContext } from '@/context/useNemtContext';
import { getTripServiceDateKey, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
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
  const tripId = String(trip?.id || '').trim();
  if (/-2$/.test(tripId)) return 'BL';
  if (/-1$/.test(tripId)) return 'AL';
  return 'CL';
};

const getTripPairKey = trip => {
  const grouped = String(trip?.groupedTripKey || '').trim();
  if (grouped) return grouped;
  const broker = String(trip?.brokerTripId || '').trim();
  if (broker) return broker;
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const id = String(trip?.id || '').trim();
  if (!id) return '';
  return id.replace(/-\d+$/, '');
};

const getSiblingLegTrips = (targetTrip, allTrips = []) => {
  const pairKey = getTripPairKey(targetTrip);
  if (!pairKey) return [];
  return (Array.isArray(allTrips) ? allTrips : []).filter(item => String(item?.id) !== String(targetTrip?.id) && getTripPairKey(item) === pairKey);
};

const parseMilesValue = value => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const miles = Number(match[0]);
  return Number.isFinite(miles) ? miles : null;
};

const getTripMilesValue = trip => {
  const candidates = [trip?.miles, trip?.distanceMiles, trip?.estimatedMiles, trip?.routeMiles, trip?.tripMiles, trip?.distance];
  for (const candidate of candidates) {
    const parsed = parseMilesValue(candidate);
    if (parsed != null) return parsed;
  }
  return null;
};

const getTripMilesDisplay = trip => {
  const miles = getTripMilesValue(trip);
  if (miles == null) return '-';
  return Number(miles.toFixed(2)).toString();
};

const isTripCompleted = trip => {
  const status = String(trip?.status || '').trim().toLowerCase();
  if (status.includes('complete') || status.includes('completed') || status.includes('done') || status.includes('finished')) return true;
  return Boolean(String(trip?.actualDropoff || '').trim());
};

const isPatientExclusionActiveForDate = (exclusion, dateKey, fallbackDateKey) => {
  if (!exclusion) return false;
  const mode = String(exclusion.mode || '').trim().toLowerCase();
  const targetDate = String(dateKey || fallbackDateKey || '').trim();
  if (mode === 'always') return true;
  if (!targetDate) return false;
  if (mode === 'single-day') return targetDate === String(exclusion.startDate || '').trim();
  if (mode === 'range') {
    const start = String(exclusion.startDate || '').trim();
    const end = String(exclusion.endDate || '').trim();
    if (!start || !end) return false;
    return targetDate >= start && targetDate <= end;
  }
  return false;
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
  const [milesMinFilter, setMilesMinFilter] = useState('0');
  const [milesMaxFilter, setMilesMaxFilter] = useState('25');
  const [milesSortOrder, setMilesSortOrder] = useState('miles-desc');
  const [isMilesMaxManual, setIsMilesMaxManual] = useState(false);
  const [manualConfirmations, setManualConfirmations] = useState({});
  const [cancelNoteModal, setCancelNoteModal] = useState(null);
  const [cancelNoteDraft, setCancelNoteDraft] = useState('');
  const [cancelLegScope, setCancelLegScope] = useState('single');
  
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
  const [confirmationLegScope, setConfirmationLegScope] = useState('single');
  const [confirmationSourceTrip, setConfirmationSourceTrip] = useState(null);
  const [tripUpdateModal, setTripUpdateModal] = useState(null);
  const [tripUpdateConfirmMethod, setTripUpdateConfirmMethod] = useState('call');
  const [tripUpdatePickupTime, setTripUpdatePickupTime] = useState('');
  const [tripUpdateDropoffTime, setTripUpdateDropoffTime] = useState('');
  const [tripUpdateNote, setTripUpdateNote] = useState('');
  const [tripUpdateCompanionNote, setTripUpdateCompanionNote] = useState('');
  const [tripUpdateMobilityNote, setTripUpdateMobilityNote] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientFromDate, setPatientFromDate] = useState('');
  const [patientToDate, setPatientToDate] = useState('');
  const [selectedPatientKey, setSelectedPatientKey] = useState('');
  const [patientStatusModalOpen, setPatientStatusModalOpen] = useState(false);
  const [patientStatusMode, setPatientStatusMode] = useState('always');
  const [patientStatusStartDate, setPatientStatusStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patientStatusEndDate, setPatientStatusEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patientStatusReason, setPatientStatusReason] = useState('Rehab stay');
  const [patientStatusSourceNote, setPatientStatusSourceNote] = useState('');

  const optOutList = Array.isArray(smsData?.sms?.optOutList) ? smsData.sms.optOutList : [];
  const blacklistEntries = Array.isArray(blacklistData?.entries) ? blacklistData.entries : [];
  const groupTemplates = smsData?.sms?.groupTemplates || {};
  const riderProfiles = smsData?.sms?.riderProfiles || {};
  const buildPatientProfileKey = trip => {
    const phoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    if (phoneKey) return `phone:${phoneKey}`;
    const riderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    return riderKey ? `rider:${riderKey}` : '';
  };
  const getPatientProfileForTrip = trip => {
    const key = buildPatientProfileKey(trip);
    if (!key) return null;
    return riderProfiles[key] || null;
  };
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

  const patientHistoryRows = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    const groups = new Map();

    trips.forEach(trip => {
      const rider = String(trip?.rider || '').trim();
      const phone = String(trip?.patientPhoneNumber || '').trim();
      const key = buildPatientProfileKey(trip);
      if (!key || key === '|') return;

      const dateKey = getTripServiceDateKey(trip);
      if (patientFromDate && (!dateKey || dateKey < patientFromDate)) return;
      if (patientToDate && (!dateKey || dateKey > patientToDate)) return;

      if (term) {
        const haystack = [trip.id, rider, phone, trip.address, trip.destination, trip.notes].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return;
      }

      const confirmationStatus = getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id));
      const responseCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
      const status = String(trip?.status || '').trim();
      const notes = String(trip?.notes || '').trim();
      const hospitalType = String(trip?.hospitalStatus?.type || '').trim().toLowerCase();
      const isRehab = hospitalType.includes('rehab');
      const isHospital = Boolean(trip?.hospitalStatus) && !isRehab;
      const exclusion = riderProfiles[key]?.exclusion || null;
      const excludedNow = isPatientExclusionActiveForDate(exclusion, dateKey, new Date().toISOString().slice(0, 10));

      const current = groups.get(key) || {
        key,
        rider,
        phone,
        totalTrips: 0,
        completedTrips: 0,
        confirmedTrips: 0,
        notConfirmedTrips: 0,
        callConfirmedTrips: 0,
        smsConfirmedTrips: 0,
        whatsappConfirmedTrips: 0,
        rehabTrips: 0,
        hospitalTrips: 0,
        excludedTrips: 0,
        hasTravelled: false,
        notes: [],
        trips: []
      };

      current.totalTrips += 1;
      current.hasTravelled = true;
      if (isTripCompleted(trip)) current.completedTrips += 1;
      if (confirmationStatus === 'Confirmed') current.confirmedTrips += 1;
      else current.notConfirmedTrips += 1;
      if (responseCode === 'C') current.callConfirmedTrips += 1;
      if (responseCode === 'S') current.smsConfirmedTrips += 1;
      if (responseCode === 'W') current.whatsappConfirmedTrips += 1;
      if (isRehab) current.rehabTrips += 1;
      if (isHospital) current.hospitalTrips += 1;
      if (excludedNow) current.excludedTrips += 1;
      if (notes) current.notes.push(`[${dateKey || 'No date'}] ${notes}`);
      current.trips.push({
        id: trip.id,
        dateKey,
        pickup: trip.scheduledPickup || trip.pickup || '-',
        dropoff: trip.scheduledDropoff || trip.dropoff || '-',
        status,
        completion: isTripCompleted(trip) ? 'Completed' : 'Open',
        confirmationStatus,
        responseCode,
        excluded: excludedNow ? 'Excluded' : 'Active',
        rehabHospital: trip?.hospitalStatus ? `${trip.hospitalStatus.type || 'Hospital'} until ${trip.hospitalStatus.endDate || '-'}` : '-',
        note: notes || '-'
      });
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.totalTrips - a.totalTrips || a.rider.localeCompare(b.rider));
  }, [patientFromDate, patientSearch, patientToDate, tripBlockingMap, trips]);

  useEffect(() => {
    if (patientHistoryRows.length === 0) {
      if (selectedPatientKey) setSelectedPatientKey('');
      return;
    }
    const exists = patientHistoryRows.some(row => row.key === selectedPatientKey);
    if (!exists && selectedPatientKey) setSelectedPatientKey('');
  }, [patientHistoryRows, selectedPatientKey]);

  const selectedPatientHistory = useMemo(() => {
    if (!selectedPatientKey) return null;
    return patientHistoryRows.find(row => row.key === selectedPatientKey) || null;
  }, [patientHistoryRows, selectedPatientKey]);

  const detectedMaxMilesForWindow = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const fromMinutes = timeFromFilter ? parseTripClockMinutes(timeFromFilter) : null;
    const toMinutes = timeToFilter ? parseTripClockMinutes(timeToFilter) : null;

    const candidateMiles = trips.filter(trip => {
      const confirmationStatus = getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id));
      if (statusFilter !== 'all' && confirmationStatus !== statusFilter) return false;
      if (legFilter !== 'all' && getTripLegFilterKey(trip) !== legFilter) return false;
      if (rideTypeFilter !== 'all' && getTripTypeLabel(trip) !== rideTypeFilter) return false;

      const tripDateKey = getTripServiceDateKey(trip);
      if (confirmationDate !== 'all' && (!tripDateKey || tripDateKey !== confirmationDate)) return false;

      const tripTime = trip.scheduledPickup || trip.pickupTime || trip.appointmentTime || trip.startTime || trip.pickup || '';
      const parsedTripTimeMinutes = parseTripClockMinutes(tripTime);
      const pickupSortTimestamp = Number(trip.pickupSortValue);
      const pickupSortMinutes = Number.isFinite(pickupSortTimestamp) ? (() => {
        const d = new Date(pickupSortTimestamp);
        return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
      })() : null;
      const tripTimeMinutes = parsedTripTimeMinutes != null ? parsedTripTimeMinutes : pickupSortMinutes;
      const hasTimeFilter = fromMinutes != null || toMinutes != null;
      if (hasTimeFilter) {
        if (tripTimeMinutes == null) return false;
        if (fromMinutes != null && tripTimeMinutes < fromMinutes) return false;
        if (toMinutes != null && tripTimeMinutes > toMinutes) return false;
      }

      const isInHospitalRehab = trip.hospitalStatus && trip.hospitalStatus.startDate <= today && today <= trip.hospitalStatus.endDate;
      if (isInHospitalRehab) return false;

      return getTripMilesValue(trip) != null;
    }).map(trip => getTripMilesValue(trip)).filter(value => value != null);

    if (candidateMiles.length === 0) return null;
    return Math.max(...candidateMiles);
  }, [confirmationDate, legFilter, rideTypeFilter, statusFilter, timeFromFilter, timeToFilter, tripBlockingMap, trips]);

  useEffect(() => {
    if (isMilesMaxManual) return;
    if (detectedMaxMilesForWindow == null) {
      setMilesMaxFilter('25');
      return;
    }
    const cappedDefault = Math.min(25, detectedMaxMilesForWindow);
    setMilesMaxFilter(String(Number(cappedDefault.toFixed(2))));
  }, [detectedMaxMilesForWindow, isMilesMaxManual]);

  const filteredTrips = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const fromMinutes = timeFromFilter ? parseTripClockMinutes(timeFromFilter) : null;
    const toMinutes = timeToFilter ? parseTripClockMinutes(timeToFilter) : null;
    const minMiles = milesMinFilter === '' ? null : Number(milesMinFilter);
    const maxMiles = milesMaxFilter === '' ? null : Number(milesMaxFilter);

    const matchedTrips = trips.filter(trip => {
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
      const tripDateKey = getTripServiceDateKey(trip);
      if (confirmationDate !== 'all') {
        if (!tripDateKey || tripDateKey !== confirmationDate) return false;
      }

      const riderProfile = getPatientProfileForTrip(trip);
      if (isPatientExclusionActiveForDate(riderProfile?.exclusion, tripDateKey, confirmationDate !== 'all' ? confirmationDate : today)) return false;
      
      // Filter by time range
      const tripTime = trip.scheduledPickup || trip.pickupTime || trip.appointmentTime || trip.startTime || trip.pickup || '';
      const parsedTripTimeMinutes = parseTripClockMinutes(tripTime);
      const pickupSortTimestamp = Number(trip.pickupSortValue);
      const pickupSortMinutes = Number.isFinite(pickupSortTimestamp) ? (() => {
        const d = new Date(pickupSortTimestamp);
        return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
      })() : null;
      const tripTimeMinutes = parsedTripTimeMinutes != null ? parsedTripTimeMinutes : pickupSortMinutes;
      const hasTimeFilter = fromMinutes != null || toMinutes != null;
      if (hasTimeFilter) {
        if (tripTimeMinutes == null) return false;
        if (fromMinutes != null && tripTimeMinutes < fromMinutes) return false;
        if (toMinutes != null && tripTimeMinutes > toMinutes) return false;
      }

      const tripMiles = getTripMilesValue(trip);
      const hasMilesFilter = minMiles != null || maxMiles != null;
      if (hasMilesFilter) {
        if (tripMiles == null) return false;
        if (minMiles != null && tripMiles < minMiles) return false;
        if (maxMiles != null && tripMiles > maxMiles) return false;
      }
      
      if (!normalizedSearch) return true;
      const haystack = [trip.id, trip.rider, trip.patientPhoneNumber, trip.address, trip.destination, trip.confirmation?.lastResponseText].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    const dedupedTrips = Array.from(new Map(matchedTrips.map(trip => [String(trip.id), trip])).values());

    return [...dedupedTrips].sort((leftTrip, rightTrip) => {
      const leftMiles = getTripMilesValue(leftTrip);
      const rightMiles = getTripMilesValue(rightTrip);
      const leftValue = leftMiles == null ? Number.NEGATIVE_INFINITY : leftMiles;
      const rightValue = rightMiles == null ? Number.NEGATIVE_INFINITY : rightMiles;

      if (milesSortOrder === 'miles-asc') return leftValue - rightValue;
      if (milesSortOrder === 'miles-desc') return rightValue - leftValue;
      if (milesSortOrder === 'rider-asc') return String(leftTrip.rider || '').localeCompare(String(rightTrip.rider || ''));
      if (milesSortOrder === 'rider-desc') return String(rightTrip.rider || '').localeCompare(String(leftTrip.rider || ''));
      if (milesSortOrder === 'trip-asc') return String(leftTrip.id || '').localeCompare(String(rightTrip.id || ''));
      if (milesSortOrder === 'trip-desc') return String(rightTrip.id || '').localeCompare(String(leftTrip.id || ''));
      return rightValue - leftValue;
    });
  }, [confirmationDate, legFilter, milesMaxFilter, milesMinFilter, milesSortOrder, rideTypeFilter, search, statusFilter, timeFromFilter, timeToFilter, tripBlockingMap, trips]);

  const visibleTripIds = useMemo(() => filteredTrips.map(trip => trip.id), [filteredTrips]);
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(tripId => selectedTripIds.includes(tripId));

  const toggleTripSelection = tripId => {
    setSelectedTripIds(current => current.includes(tripId) ? current.filter(id => id !== tripId) : [...current, tripId]);
  };

  const handleToggleAllVisible = checked => {
    if (checked) {
      setSelectedTripIds(current => Array.from(new Set([...current, ...visibleTripIds])));
      return;
    }
    setSelectedTripIds(current => current.filter(id => !visibleTripIds.includes(id)));
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
      setConfirmationSourceTrip(trip);
      setConfirmationLegScope('single');
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
    setCancelLegScope('single');
  };

  const handleSaveCancelNote = () => {
    if (!cancelNoteModal) return;

    const siblingTrips = getSiblingLegTrips(cancelNoteModal, trips);
    const targetTrips = cancelLegScope === 'both' ? [cancelNoteModal, ...siblingTrips] : [cancelNoteModal];

    targetTrips.forEach(targetTrip => {
      updateTripRecord(targetTrip.id, {
        notes: (targetTrip.notes || '') + (targetTrip.notes ? '\n' : '') + `[CANCELADO] ${new Date().toLocaleString()}: ${cancelNoteDraft}`
      });
    });

    setManualConfirmations(current => {
      const next = {
        ...current
      };
      targetTrips.forEach(targetTrip => {
        next[targetTrip.id] = {
          status: 'Cancelled',
          method: 'MANUAL',
          timestamp: new Date().toISOString(),
          note: cancelNoteDraft
        };
      });
      return next;
    });

    setCancelNoteModal(null);
    setCancelNoteDraft('');
    setCustomStatus(`${targetTrips.length} trip(s) cancelado(s) con nota.`);
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

  const getMethodCode = method => {
    if (method === 'whatsapp') return 'W';
    if (method === 'sms') return 'S';
    if (method === 'call') return 'C';
    return 'M';
  };

  const getMethodLabel = method => {
    if (method === 'whatsapp') return 'WhatsApp';
    if (method === 'sms') return 'SMS';
    if (method === 'call') return 'Call';
    return 'Manual';
  };

  const getTripDisplayPickupTime = trip => {
    if (trip?.scheduleChange?.newPickup) return `${trip.scheduleChange.newPickup} (NEW)`;
    return trip?.scheduledPickup || trip?.pickup || '-';
  };

  const getRiderProfileKey = trip => {
    const phoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    if (phoneKey) return `phone:${phoneKey}`;
    const riderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    return riderKey ? `rider:${riderKey}` : '';
  };

  const getRiderProfile = trip => {
    const key = getRiderProfileKey(trip);
    if (!key) return null;
    return riderProfiles[key] || null;
  };

  const handleOpenPatientStatusModal = () => {
    if (!selectedPatientHistory) return;
    const currentExclusion = riderProfiles[selectedPatientHistory.key]?.exclusion;
    setPatientStatusMode(currentExclusion?.mode || 'always');
    setPatientStatusStartDate(currentExclusion?.startDate || new Date().toISOString().slice(0, 10));
    setPatientStatusEndDate(currentExclusion?.endDate || new Date().toISOString().slice(0, 10));
    setPatientStatusReason(currentExclusion?.reason || 'Rehab stay');
    setPatientStatusSourceNote(currentExclusion?.sourceNote || '');
    setPatientStatusModalOpen(true);
  };

  const handleSavePatientStatus = async () => {
    if (!selectedPatientHistory) return;
    const nowIso = new Date().toISOString();
    const existingProfile = riderProfiles[selectedPatientHistory.key] || {};
    const nextExclusion = {
      mode: patientStatusMode,
      startDate: patientStatusStartDate,
      endDate: patientStatusMode === 'range' ? patientStatusEndDate : patientStatusMode === 'single-day' ? patientStatusStartDate : '',
      reason: patientStatusReason,
      sourceNote: patientStatusSourceNote,
      updatedAt: nowIso
    };

    await saveSmsData({
      sms: {
        ...(smsData?.sms || {}),
        riderProfiles: {
          ...riderProfiles,
          [selectedPatientHistory.key]: {
            ...existingProfile,
            exclusion: nextExclusion,
            updatedAt: nowIso
          }
        }
      }
    });

    const matchingTrips = trips.filter(trip => buildPatientProfileKey(trip) === selectedPatientHistory.key);
    matchingTrips.forEach(trip => {
      const noteLine = `[PATIENT EXCLUSION] ${new Date().toLocaleString()}: ${patientStatusReason} (${patientStatusMode}). ${patientStatusSourceNote}`;
      updateTripRecord(trip.id, {
        status: 'Cancelled',
        notes: [String(trip.notes || '').trim(), noteLine].filter(Boolean).join('\n')
      });
    });

    setPatientStatusModalOpen(false);
    setCustomStatus(`Patient rule saved for ${selectedPatientHistory.rider}. Mode: ${patientStatusMode}. Applied to ${matchingTrips.length} trip(s).`);
  };

  const handleClearPatientStatus = async () => {
    if (!selectedPatientHistory) return;
    const existingProfile = riderProfiles[selectedPatientHistory.key] || {};
    const nextProfile = {
      ...existingProfile
    };
    delete nextProfile.exclusion;

    await saveSmsData({
      sms: {
        ...(smsData?.sms || {}),
        riderProfiles: {
          ...riderProfiles,
          [selectedPatientHistory.key]: nextProfile
        }
      }
    });

    setCustomStatus(`Patient rule cleared for ${selectedPatientHistory.rider}.`);
  };

  const handleOpenTripUpdateModal = trip => {
    const profile = getRiderProfile(trip);
    setTripUpdateModal(trip);
    setTripUpdateConfirmMethod('call');
    setTripUpdatePickupTime(String(trip?.scheduledPickup || trip?.pickup || ''));
    setTripUpdateDropoffTime(String(trip?.scheduledDropoff || trip?.dropoff || ''));
    setTripUpdateNote('');
    setTripUpdateCompanionNote(String(profile?.companion || ''));
    setTripUpdateMobilityNote(String(profile?.mobility || ''));
  };

  const handleSaveTripUpdate = async () => {
    if (!tripUpdateModal) return;
    const nowIso = new Date().toISOString();
    const methodLabel = getMethodLabel(tripUpdateConfirmMethod);
    const oldPickup = String(tripUpdateModal.scheduledPickup || tripUpdateModal.pickup || '').trim();
    const oldDropoff = String(tripUpdateModal.scheduledDropoff || tripUpdateModal.dropoff || '').trim();
    const newPickup = String(tripUpdatePickupTime || '').trim();
    const newDropoff = String(tripUpdateDropoffTime || '').trim();
    const pickupChanged = Boolean(newPickup) && newPickup !== oldPickup;
    const dropoffChanged = Boolean(newDropoff) && newDropoff !== oldDropoff;

    const detailLines = [];
    detailLines.push(`[CONFIRMATION] ${new Date().toLocaleString()}: Confirmed via ${methodLabel}.`);
    if (pickupChanged || dropoffChanged) {
      detailLines.push(`[SCHEDULE NEW] Pickup: ${oldPickup || '-'} -> ${newPickup || oldPickup || '-'} | Dropoff: ${oldDropoff || '-'} -> ${newDropoff || oldDropoff || '-'}`);
    }
    if (tripUpdateCompanionNote.trim()) detailLines.push(`[PASSENGER NOTE] ${tripUpdateCompanionNote.trim()}`);
    if (tripUpdateMobilityNote.trim()) detailLines.push(`[MOBILITY NOTE] ${tripUpdateMobilityNote.trim()}`);
    if (tripUpdateNote.trim()) detailLines.push(`[DISPATCH NOTE] ${tripUpdateNote.trim()}`);

    const mergedNotes = [String(tripUpdateModal.notes || '').trim(), detailLines.join('\n')].filter(Boolean).join('\n');

    updateTripRecord(tripUpdateModal.id, {
      scheduledPickup: newPickup || oldPickup,
      scheduledDropoff: newDropoff || oldDropoff,
      notes: mergedNotes,
      confirmation: {
        ...(tripUpdateModal.confirmation || {}),
        status: 'Confirmed',
        provider: tripUpdateConfirmMethod,
        respondedAt: nowIso,
        lastResponseText: `Confirmed via ${methodLabel}`,
        lastResponseCode: getMethodCode(tripUpdateConfirmMethod)
      },
      scheduleChange: pickupChanged || dropoffChanged ? {
        oldPickup,
        newPickup: newPickup || oldPickup,
        oldDropoff,
        newDropoff: newDropoff || oldDropoff,
        changedAt: nowIso,
        marker: 'NEW'
      } : tripUpdateModal.scheduleChange || null,
      passengerProfile: {
        ...(tripUpdateModal.passengerProfile || {}),
        companion: tripUpdateCompanionNote.trim(),
        mobility: tripUpdateMobilityNote.trim(),
        updatedAt: nowIso
      }
    });

    const riderProfileKey = getRiderProfileKey(tripUpdateModal);
    if (riderProfileKey) {
      await saveSmsData({
        sms: {
          ...(smsData?.sms || {}),
          riderProfiles: {
            ...riderProfiles,
            [riderProfileKey]: {
              companion: tripUpdateCompanionNote.trim(),
              mobility: tripUpdateMobilityNote.trim(),
              latestNote: tripUpdateNote.trim(),
              updatedAt: nowIso
            }
          }
        }
      });
    }

    setManualConfirmations(current => ({
      ...current,
      [tripUpdateModal.id]: {
        status: 'Confirmed',
        method: getMethodCode(tripUpdateConfirmMethod),
        timestamp: nowIso
      }
    }));

    setCustomStatus(`Trip ${tripUpdateModal.id} updated. Method: ${methodLabel}${pickupChanged || dropoffChanged ? ' | Schedule marked NEW' : ''}.`);
    setTripUpdateModal(null);
  };

  const handleSendConfirmation = async () => {
    if (!confirmationMethodModal || confirmationMethodModal.length === 0) {
      setCustomStatus('No trips selected for confirmation.');
      return;
    }

    const siblingTrips = confirmationSourceTrip ? getSiblingLegTrips(confirmationSourceTrip, trips) : [];
    const targetTrips = confirmationSourceTrip && confirmationLegScope === 'both' ? Array.from(new Map([confirmationSourceTrip, ...siblingTrips].map(item => [item.id, item])).values()) : confirmationMethodModal;

    setIsSendingConfirmation(true);
    try {
      if (confirmationMethod === 'whatsapp') {
        // Open WhatsApp Web for each trip (or show list)
        const tripsInfo = targetTrips.map(trip => 
          `${trip.id} - ${trip.rider} (${trip.patientPhoneNumber})`
        ).join('\n');
        
        const message = `CONFIRMATION REQUEST\n\nTrips to confirm:\n${tripsInfo}\n\nPlease confirm receipt.`;
        const encodedMessage = encodeURIComponent(message);
        
        // Open WhatsApp Web (generic for all)
        window.open(`https://web.whatsapp.com/send?text=${encodedMessage}`, '_blank');
        
        // Also send via API for each trip
        for (const trip of targetTrips) {
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
          updateTripRecord(trip.id, {
            confirmation: {
              ...(trip.confirmation || {}),
              status: 'Confirmed',
              provider: 'whatsapp',
              respondedAt: new Date().toISOString(),
              lastResponseText: 'Confirmed via WhatsApp',
              lastResponseCode: 'W'
            }
          });
          setManualConfirmations(current => ({
            ...current,
            [trip.id]: {
              status: 'Confirmed',
              method: 'W',
              timestamp: new Date().toISOString()
            }
          }));
        }
        
        setCustomStatus(`WhatsApp confirmations sent to ${targetTrips.length} trip(s).`);
      } else if (confirmationMethod === 'sms') {
        // Send SMS in batch
        const response = await fetch('/api/integrations/sms/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripIds: targetTrips.map(t => t.id)
          })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to send SMS');
        targetTrips.forEach(trip => {
          updateTripRecord(trip.id, {
            confirmation: {
              ...(trip.confirmation || {}),
              status: 'Confirmed',
              provider: 'sms',
              respondedAt: new Date().toISOString(),
              lastResponseText: 'Confirmed via SMS',
              lastResponseCode: 'S'
            }
          });
        });
        setManualConfirmations(current => {
          const next = {
            ...current
          };
          targetTrips.forEach(trip => {
            next[trip.id] = {
              status: 'Confirmed',
              method: 'S',
              timestamp: new Date().toISOString()
            };
          });
          return next;
        });
        
        setCustomStatus(`SMS confirmations sent: ${result.sentCount}. Failed: ${result.failedCount || 0}. Skipped: ${result.skippedCount || 0}.`);
      } else if (confirmationMethod === 'call') {
        targetTrips.forEach(trip => {
          updateTripRecord(trip.id, {
            confirmation: {
              ...(trip.confirmation || {}),
              status: 'Confirmed',
              provider: 'call',
              respondedAt: new Date().toISOString(),
              lastResponseText: 'Confirmed via Call',
              lastResponseCode: 'C'
            }
          });
        });
        setManualConfirmations(current => {
          const next = {
            ...current
          };
          targetTrips.forEach(trip => {
            next[trip.id] = {
              status: 'Confirmed',
              method: 'C',
              timestamp: new Date().toISOString()
            };
          });
          return next;
        });
        setCustomStatus(`Call confirmations saved for ${targetTrips.length} trip(s).`);
      }
      
      await refreshDispatchState({ forceServer: true });
      setConfirmationMethodModal(null);
      setConfirmationSourceTrip(null);
      setConfirmationLegScope('single');
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

      <Card style={surfaceStyles.card} className="border mb-3">
        <CardBody>
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-3">
            <div>
              <h5 className="mb-1">Patient History Search</h5>
              <div className="text-secondary small">Busca por paciente y fecha para ver cuantas veces viajo, confirmaciones, rehab/hospital, notas y resultados de viajes completados.</div>
            </div>
            <div className="small text-secondary">{patientHistoryRows.length} patient(s) found</div>
          </div>

          <div className="d-flex flex-column flex-xl-row gap-2 mb-3">
            <Form.Control value={patientSearch} onChange={event => setPatientSearch(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search patient, phone, trip ID or notes" style={{ ...surfaceStyles.input, minWidth: 260 }} />
            <Form.Control type="date" value={patientFromDate} onChange={event => setPatientFromDate(event.target.value)} style={{ ...surfaceStyles.input, width: 170 }} title="From date" />
            <Form.Control type="date" value={patientToDate} onChange={event => setPatientToDate(event.target.value)} style={{ ...surfaceStyles.input, width: 170 }} title="To date" />
            <Button style={surfaceStyles.button} onClick={() => {
              setPatientSearch('');
              setPatientFromDate('');
              setPatientToDate('');
            }}>
              Clear History Filters
            </Button>
          </div>

          {patientHistoryRows.length > 0 ? <>
              <div className="d-flex flex-column flex-xl-row gap-2 mb-3">
                <Form.Select value={selectedPatientKey} onChange={event => setSelectedPatientKey(event.target.value)} style={{ ...surfaceStyles.input, maxWidth: 520 }}>
                  <option value="">Select patient manually</option>
                  {patientHistoryRows.map(row => <option key={row.key} value={row.key}>{row.rider || 'Unknown'} {row.phone ? `• ${row.phone}` : ''} • {row.totalTrips} trip(s)</option>)}
                </Form.Select>
                <Button style={surfaceStyles.button} onClick={() => setSelectedPatientKey('')}>
                  No Patient Selected
                </Button>
                <Button style={surfaceStyles.button} onClick={handleOpenPatientStatusModal} disabled={!selectedPatientHistory}>
                  Set Patient Rule
                </Button>
                <Button style={surfaceStyles.button} onClick={handleClearPatientStatus} disabled={!selectedPatientHistory}>
                  Clear Rule
                </Button>
              </div>

              {selectedPatientHistory ? <>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <Badge bg="primary">Trips: {selectedPatientHistory.totalTrips}</Badge>
                    <Badge bg="success">Completed: {selectedPatientHistory.completedTrips}</Badge>
                    <Badge bg="info">Confirmed: {selectedPatientHistory.confirmedTrips}</Badge>
                    <Badge bg="secondary">Not Confirmed: {selectedPatientHistory.notConfirmedTrips}</Badge>
                    <Badge bg="warning">Rehab: {selectedPatientHistory.rehabTrips}</Badge>
                    <Badge bg="dark">Hospital: {selectedPatientHistory.hospitalTrips}</Badge>
                    <Badge bg="danger">Excluded: {selectedPatientHistory.excludedTrips}</Badge>
                    <Badge bg="light" text="dark">Call C: {selectedPatientHistory.callConfirmedTrips}</Badge>
                    <Badge bg="light" text="dark">SMS S: {selectedPatientHistory.smsConfirmedTrips}</Badge>
                    <Badge bg="light" text="dark">WhatsApp W: {selectedPatientHistory.whatsappConfirmedTrips}</Badge>
                    <Badge bg={selectedPatientHistory.hasTravelled ? 'success' : 'secondary'}>{selectedPatientHistory.hasTravelled ? 'Has Travelled' : 'No Trips'}</Badge>
                  </div>

                  <div className="mb-3">
                    <div className="fw-semibold mb-2">All Notes</div>
                    <div className="small p-2 rounded-2" style={{ ...surfaceStyles.input, maxHeight: 140, overflowY: 'auto' }}>
                      {selectedPatientHistory.notes.length > 0 ? selectedPatientHistory.notes.map((note, index) => <div key={`patient-note-${index}`} className="mb-1">{note}</div>) : <div className="text-secondary">No notes found for this patient.</div>}
                    </div>
                  </div>

                  <div className="table-responsive">
                    <Table hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
                      <thead className="table-light">
                        <tr>
                          <th>Date</th>
                          <th>Trip ID</th>
                          <th>Pickup</th>
                          <th>Dropoff</th>
                          <th>Status</th>
                          <th>Completed</th>
                          <th>Confirmation</th>
                          <th>Method</th>
                          <th>Excluded</th>
                          <th>Rehab/Hospital</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPatientHistory.trips.sort((a, b) => String(b.dateKey || '').localeCompare(String(a.dateKey || ''))).map(item => <tr key={`patient-trip-${item.id}-${item.dateKey || 'na'}`}>
                            <td>{item.dateKey || '-'}</td>
                            <td>{item.id}</td>
                            <td>{item.pickup}</td>
                            <td>{item.dropoff}</td>
                            <td>{item.status || '-'}</td>
                            <td>{item.completion}</td>
                            <td>{item.confirmationStatus}</td>
                            <td>{item.responseCode || '-'}</td>
                            <td>{item.excluded}</td>
                            <td style={{ color: themeMode === 'light' ? '#0f172a' : '#e6ecff' }}>{item.rehabHospital}</td>
                            <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{item.note}</td>
                          </tr>)}
                      </tbody>
                    </Table>
                  </div>
                </> : null}
            </> : <div className="text-secondary small">No patient history matches those filters yet.</div>}
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
              <Form.Control type="number" min="0" step="0.1" value={milesMinFilter} onChange={event => setMilesMinFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 110 }} placeholder="Min mi" title="Minimum miles" />
              <Form.Control type="number" min="0" step="0.1" value={milesMaxFilter} onChange={event => {
                setMilesMaxFilter(event.target.value);
                setIsMilesMaxManual(true);
              }} style={{ ...surfaceStyles.input, width: 110 }} placeholder="Max mi" title="Maximum miles" />
              <Button style={surfaceStyles.button} onClick={() => {
                setIsMilesMaxManual(false);
              }} title="Auto max miles from loaded trips">
                Auto Max
              </Button>
              <Form.Select value={milesSortOrder} onChange={event => setMilesSortOrder(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }} title="Sort by miles">
                <option value="miles-desc">Miles: High to Low</option>
                <option value="miles-asc">Miles: Low to High</option>
                <option value="rider-asc">Rider: A to Z</option>
                <option value="rider-desc">Rider: Z to A</option>
                <option value="trip-asc">Trip ID: A to Z</option>
                <option value="trip-desc">Trip ID: Z to A</option>
              </Form.Select>
              <Button style={surfaceStyles.button} onClick={() => {
                setTimeFromFilter('');
                setTimeToFilter('');
              }} title="Show all hours">
                All Day
              </Button>
              {detectedMaxMilesForWindow != null ? <Badge bg="info">Detected max {Number(detectedMaxMilesForWindow.toFixed(2))} mi</Badge> : null}
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
            <Form.Control value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search trip, rider, phone or reply" style={{ ...surfaceStyles.input, width: 320, maxWidth: '100%' }} />
          </div>

          <div className="table-responsive">
            <Table hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap' }}>
              <thead className="table-light">
                <tr>
                  <th style={{ width: 48 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={event => handleToggleAllVisible(event.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#22c55e' }}
                      title="Select all visible"
                    />
                  </th>
                  <th>Trip ID</th>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Pickup Time</th>
                  <th>Miles</th>
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
                  const riderProfile = getRiderProfile(trip);
                  return <tr key={trip.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTripIds.includes(trip.id)}
                          onChange={() => toggleTripSelection(trip.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#22c55e' }}
                        />
                      </td>
                      <td className="fw-semibold">{trip.id}</td>
                      <td>
                        <div>{trip.rider}</div>
                        {riderProfile?.companion ? <div className="small text-info">Companion: {riderProfile.companion}</div> : null}
                        {riderProfile?.mobility ? <div className="small text-warning">Mobility: {riderProfile.mobility}</div> : null}
                      </td>
                      <td>{trip.patientPhoneNumber || '-'}</td>
                      <td>{getTripDisplayPickupTime(trip)}</td>
                      <td>{getTripMilesDisplay(trip)}</td>
                      <td>{getTripLegFilterKey(trip)}</td>
                      <td>{getTripTypeLabel(trip)}</td>
                      <td>{isOptedOut ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>Blocked</Badge> : <Badge bg="success">Allowed</Badge>}</td>
                      <td>
                        {trip.hospitalStatus ? (
                          <div>
                            <Badge bg={isHospitalRehabActive(trip) ? 'warning' : 'secondary'} style={{ color: isHospitalRehabActive(trip) ? '#111827' : '#ffffff' }}>
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
                      <td>{confirmationStatus === 'Opted Out' ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>{confirmationStatus}</Badge> : <Badge bg={STATUS_VARIANTS[confirmationStatus] || 'secondary'}>{confirmationStatus}</Badge>}{trip.confirmation?.lastResponseCode ? <Badge bg="light" text="dark" className="ms-1">{trip.confirmation.lastResponseCode}</Badge> : null}</td>
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
                          <Button size="sm" variant="outline-info" onClick={() => handleOpenTripUpdateModal(trip)} title="Update confirmation, schedule and notes" style={{ minWidth: 80 }}>
                            Update
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
                    <td colSpan={15} className="text-center text-muted py-4">No confirmation records match the current filter.</td>
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
          {cancelNoteModal && getSiblingLegTrips(cancelNoteModal, trips).length > 0 ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Cancel Scope</Form.Label>
              <Form.Select className="mb-3" value={cancelLegScope} onChange={event => setCancelLegScope(event.target.value)}>
                <option value="single">Only this leg</option>
                <option value="both">Both legs (A and B)</option>
              </Form.Select>
            </> : null}
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

          {confirmationSourceTrip && getSiblingLegTrips(confirmationSourceTrip, trips).length > 0 ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Leg Scope</Form.Label>
              <Form.Select className="mb-3" value={confirmationLegScope} onChange={event => setConfirmationLegScope(event.target.value)}>
                <option value="single">Only this leg ({confirmationSourceTrip.id})</option>
                <option value="both">Both legs (A and B)</option>
              </Form.Select>
            </> : null}

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
            <Form.Check
              type="radio"
              label="Call"
              name="confirmationMethod"
              value="call"
              checked={confirmationMethod === 'call'}
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
          {confirmationMethod === 'call' && (
            <div className="alert alert-info small mb-0">
              This saves a manual call confirmation even if SMS center is not configured.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmationMethodModal(null)} disabled={isSendingConfirmation}>Close</Button>
          <Button variant="primary" onClick={handleSendConfirmation} disabled={isSendingConfirmation}>
            {isSendingConfirmation ? 'Sending...' : `Send via ${confirmationMethod === 'whatsapp' ? 'WhatsApp' : confirmationMethod === 'sms' ? 'SMS' : 'Call'}`}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(tripUpdateModal)} onHide={() => setTripUpdateModal(null)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Trip Update</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-2">Trip: {tripUpdateModal?.id} | Rider: {tripUpdateModal?.rider}</div>
          <Row className="g-3">
            <Col md={4}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Confirmed Via</Form.Label>
              <Form.Select value={tripUpdateConfirmMethod} onChange={event => setTripUpdateConfirmMethod(event.target.value)}>
                <option value="call">Call</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Pickup Time (New)</Form.Label>
              <Form.Control value={tripUpdatePickupTime} onChange={event => setTripUpdatePickupTime(event.target.value)} placeholder="e.g. 07:30 AM" />
            </Col>
            <Col md={4}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Dropoff Time (New)</Form.Label>
              <Form.Control value={tripUpdateDropoffTime} onChange={event => setTripUpdateDropoffTime(event.target.value)} placeholder="e.g. 08:15 AM" />
            </Col>
            <Col md={12}>
              <div className="small text-muted">Current pickup: {tripUpdateModal?.scheduledPickup || tripUpdateModal?.pickup || '-'} | Current dropoff: {tripUpdateModal?.scheduledDropoff || tripUpdateModal?.dropoff || '-'}</div>
            </Col>
            <Col md={6}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Companion Note</Form.Label>
              <Form.Control value={tripUpdateCompanionNote} onChange={event => setTripUpdateCompanionNote(event.target.value)} placeholder="Patient goes with companion" />
            </Col>
            <Col md={6}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Mobility Note</Form.Label>
              <Form.Control value={tripUpdateMobilityNote} onChange={event => setTripUpdateMobilityNote(event.target.value)} placeholder="Motorized wheelchair / equipment" />
            </Col>
            <Col md={12}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Dispatch Note</Form.Label>
              <Form.Control as="textarea" rows={4} value={tripUpdateNote} onChange={event => setTripUpdateNote(event.target.value)} placeholder="Add new note (shown in Dispatcher and related views)" />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setTripUpdateModal(null)}>Close</Button>
          <Button variant="primary" onClick={handleSaveTripUpdate}>Save Update</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={patientStatusModalOpen} onHide={() => setPatientStatusModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Patient Rule (Cancel/Exclude)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">Patient: {selectedPatientHistory?.rider || '-'} {selectedPatientHistory?.phone ? `• ${selectedPatientHistory.phone}` : ''}</div>
          <Form.Label className="small text-uppercase text-muted fw-semibold">Duration</Form.Label>
          <Form.Select className="mb-3" value={patientStatusMode} onChange={event => setPatientStatusMode(event.target.value)}>
            <option value="single-day">One Day</option>
            <option value="range">Date Range</option>
            <option value="always">Always</option>
          </Form.Select>

          {patientStatusMode !== 'always' ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Start Date</Form.Label>
              <Form.Control className="mb-3" type="date" value={patientStatusStartDate} onChange={event => setPatientStatusStartDate(event.target.value)} />
            </> : null}
          {patientStatusMode === 'range' ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold">End Date</Form.Label>
              <Form.Control className="mb-3" type="date" value={patientStatusEndDate} onChange={event => setPatientStatusEndDate(event.target.value)} />
            </> : null}

          <Form.Label className="small text-uppercase text-muted fw-semibold">Reason</Form.Label>
          <Form.Control className="mb-3" value={patientStatusReason} onChange={event => setPatientStatusReason(event.target.value)} placeholder="Rehab / Hospital / Requested hold" />

          <Form.Label className="small text-uppercase text-muted fw-semibold">Who Notified / Source</Form.Label>
          <Form.Control as="textarea" rows={3} value={patientStatusSourceNote} onChange={event => setPatientStatusSourceNote(event.target.value)} placeholder="Caller name, relation, details" />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setPatientStatusModalOpen(false)}>Close</Button>
          <Button variant="danger" onClick={handleSavePatientStatus}>Save Rule</Button>
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