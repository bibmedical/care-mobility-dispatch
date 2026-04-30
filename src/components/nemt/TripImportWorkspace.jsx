'use client';

import PageTitle from '@/components/PageTitle';
import { useNemtContext } from '@/context/useNemtContext';
import { getTripLateMinutes, getTripPunctualityLabel, getTripServiceDateKey } from '@/helpers/nemt-dispatch-state';
import { analyzeImportedTrips, parseTripImportFile } from '@/helpers/nemt-trip-import';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';
import * as XLSX from 'xlsx';

const COLUMN_ALIASES = {
  id: ['rideid', 'trip id', 'tripid', 'id', 'trip'],
  brokerTripId: ['tripid'],
  rider: ['rider', 'member', 'passenger', 'patient', 'name'],
  pickup: ['pickup', 'pu', 'pickup time', 'appointment time'],
  dropoff: ['dropoff', 'do', 'drop off', 'return time'],
  address: ['address', 'pickup address', 'pu address', 'origin address', 'pickup location'],
  destination: ['destination', 'dropoff address', 'do address', 'destination address', 'dropoff location'],
  lat: ['lat', 'latitude', 'pickup lat'],
  lng: ['lng', 'lon', 'long', 'longitude', 'pickup lng'],
  fromAddress: ['fromaddress'],
  toAddress: ['toaddress'],
  fromZipcode: ['fromzipcode'],
  toZipcode: ['tozipcode'],
  pickupTime: ['pickuptime'],
  appointmentTime: ['appointmenttime'],
  fromLatitude: ['fromlatitude'],
  fromLongitude: ['fromlongitude'],
  toLatitude: ['tolatitude'],
  toLongitude: ['tologitude', 'tolongitude'],
  patientFirstName: ['patientfirstname'],
  patientLastName: ['patientlastname'],
  patientPhoneNumber: ['patientphonenumber'],
  alternativePhoneNumber: ['alternativephonenumber', 'alternative phone number', 'alternative phone', 'alt phone', 'altphonenumber'],
  assistanceNeeds: ['assistanceneeds'],
  status: ['status'],
  confirmationStatus: ['confirmationstatus'],
  serviceDate: ['servicedate', 'service date', 'dateofservice', 'date of service', 'dos', 'date', 'tripdate', 'trip date', 'appointmentdate', 'appointment date'],
  vehicleType: ['requestedvehicletype', 'vehicletype'],
  miles: ['distance'],
  notes: ['additionalnotes', 'otherdetails'],
  tripType: ['triptype'],
  driverName: ['drivername'],
  onTimeStatus: ['ontimestatus', 'on time status', 'punctuality', 'punctuality status'],
  delay: ['delay', 'delayminutes', 'delay minutes', 'late', 'late minutes', 'lateminutes'],
  avgDelay: ['avgdelay', 'average delay', 'average delay minutes'],
  lateMinutes: ['lateminutes', 'late minutes', 'minutes late'],
  scheduledPickup: ['scheduledpickup', 'scheduled pickup', 'scheduled pu'],
  actualPickup: ['actualpickup', 'actual pickup', 'actual pu'],
  scheduledDropoff: ['scheduleddropoff', 'scheduled dropoff', 'scheduled do'],
  actualDropoff: ['actualdropoff', 'actual dropoff', 'actual do'],
  lateFlag: ['lateflag', 'islate', 'late flag'],
  delayedFlag: ['delayed', 'delay flag', 'isdelayed']
};

const DEFAULT_CENTER = [28.5383, -81.3792];

const toRadians = value => value * (Math.PI / 180);

const getDistanceMiles = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return '';
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const miles = earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.isFinite(miles) ? miles.toFixed(1) : '';
};

const getParsedDate = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 1) {
    const parsedDate = XLSX.SSF.parse_date_code(numericValue);
    if (parsedDate) {
      return new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d, parsedDate.H, parsedDate.M, Math.round(parsedDate.S || 0));
    }
  }

  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const parsedDate = new Date(normalized);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeHeader = value => String(value ?? '').trim().toLowerCase();

const getValueByAliases = (row, aliases) => {
  const entries = Object.entries(row ?? {});
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeader(key) === alias);
    if (match && String(match[1] ?? '').trim()) {
      return String(match[1]).trim();
    }
  }
  return '';
};

const getCoordinate = (row, key, index) => {
  const aliases = key === 'lat' ? [...COLUMN_ALIASES.fromLatitude, ...COLUMN_ALIASES.lat] : [...COLUMN_ALIASES.fromLongitude, ...COLUMN_ALIASES.lng];
  const rawValue = getValueByAliases(row, aliases);
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;
  const offset = (index % 10) * 0.01;
  return key === 'lat' ? DEFAULT_CENTER[0] + offset : DEFAULT_CENTER[1] - offset;
};

const getDestinationCoordinate = (row, key, index) => {
  const aliases = key === 'lat' ? COLUMN_ALIASES.toLatitude : COLUMN_ALIASES.toLongitude;
  const rawValue = getValueByAliases(row, aliases);
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = getCoordinate(row, key, index);
  return key === 'lat' ? fallback + 0.01 : fallback + 0.01;
};

const getRiderName = (row, index) => {
  const firstName = getValueByAliases(row, COLUMN_ALIASES.patientFirstName);
  const lastName = getValueByAliases(row, COLUMN_ALIASES.patientLastName);
  const combinedName = `${firstName} ${lastName}`.trim();
  return combinedName || getValueByAliases(row, COLUMN_ALIASES.rider) || `Rider ${index + 1}`;
};

const formatSafeRideTime = value => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'TBD';
  const date = getParsedDate(value);
  if (!date) return normalized;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getTimeValue = value => {
  const date = getParsedDate(value);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const buildImportedTripId = ({
  rideId,
  tripId,
  rawPickupTime,
  rawDropoffTime,
  address,
  destination,
  rider
}, index) => {
  const stableId = [rideId, tripId, rawPickupTime, rawDropoffTime, address, destination, rider]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('|');
  return stableId || `trip-row-${index + 1}`;
};

const toLocalDateKey = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getImportedServiceDate = (row, rawPickupTime, rawDropoffTime) => {
  const explicitServiceDate = getValueByAliases(row, COLUMN_ALIASES.serviceDate);
  const parsedExplicitDate = getParsedDate(explicitServiceDate);
  if (parsedExplicitDate) {
    return toLocalDateKey(parsedExplicitDate);
  }

  const parsedPickupDate = getParsedDate(rawPickupTime);
  if (parsedPickupDate) {
    return toLocalDateKey(parsedPickupDate);
  }

  const parsedDropoffDate = getParsedDate(rawDropoffTime);
  if (parsedDropoffDate) {
    return toLocalDateKey(parsedDropoffDate);
  }

  return '';
};

const getImportedTripStatus = (statusValue, confirmationStatusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();
  const normalizedConfirmation = String(confirmationStatusValue || '').trim().toLowerCase();

  if (['cancelled', 'canceled'].includes(normalizedStatus) || ['cancelled', 'canceled', 'disconnected'].includes(normalizedConfirmation)) {
    return 'Cancelled';
  }

  if (normalizedStatus.includes('rehab') || normalizedStatus.includes('hospital')) {
    return 'Rehab';
  }

  if (['confirmed', 'confirm'].includes(normalizedConfirmation)) {
    return 'Confirmed';
  }

  return 'Pending Confirmation';
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildTripMatchKey = trip => {
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return `ride:${rideId}`;

  const brokerTripId = String(trip?.brokerTripId || '').trim();
  const rider = String(trip?.rider || '').trim().toLowerCase();
  const pickup = String(trip?.pickup || '').trim().toLowerCase();
  const address = String(trip?.address || '').trim().toLowerCase();
  const destination = String(trip?.destination || '').trim().toLowerCase();
  const serviceDate = String(getTripServiceDateKey(trip) || '').trim();
  const composite = [brokerTripId, serviceDate, rider, pickup, address, destination].filter(Boolean).join('|');
  return composite ? `composite:${composite}` : '';
};

const buildImportFingerprint = trip => [
  String(trip?.brokerTripId || '').trim().toLowerCase(),
  String(trip?.rideId || '').trim().toLowerCase(),
  String(getTripServiceDateKey(trip) || '').trim(),
  String(trip?.rider || '').trim().toLowerCase(),
  String(trip?.pickup || '').trim().toLowerCase(),
  String(trip?.address || '').trim().toLowerCase(),
  String(trip?.destination || '').trim().toLowerCase()
].filter(Boolean).join('|');

const buildPendingTripRowKey = (trip, index) => [
  String(trip?.rideId || trip?.id || '').trim(),
  String(trip?.brokerTripId || '').trim(),
  String(trip?.rawPickupTime || trip?.pickup || '').trim(),
  String(trip?.rawDropoffTime || trip?.dropoff || '').trim(),
  String(trip?.address || '').trim(),
  String(trip?.destination || '').trim(),
  String(trip?.rider || '').trim(),
  String(index)
].filter(Boolean).join('|') || `trip-row-${index + 1}`;

const normalizePendingTrips = trips => (Array.isArray(trips) ? trips : []).map((trip, index) => {
  const previewRowKey = String(trip?.previewRowKey || '').trim() || buildPendingTripRowKey(trip, index);
  return {
    ...trip,
    id: previewRowKey,
    previewRowKey
  };
});

const invertTripDirection = trip => {
  const nextTrip = {
    ...trip,
    address: trip?.destination || '',
    destination: trip?.address || '',
    fromZipcode: trip?.toZipcode || '',
    toZipcode: trip?.fromZipcode || '',
    position: Array.isArray(trip?.destinationPosition) ? [...trip.destinationPosition] : trip?.destinationPosition,
    destinationPosition: Array.isArray(trip?.position) ? [...trip.position] : trip?.position,
    manuallyInverted: true
  };
  nextTrip.importFingerprint = buildImportFingerprint(nextTrip);
  return nextTrip;
};

const annotateSafeRideTrips = trips => {
  const groupedTrips = trips.reduce((accumulator, trip) => {
    const groupKey = trip.brokerTripId || trip.id;
    accumulator.set(groupKey, [...(accumulator.get(groupKey) ?? []), trip]);
    return accumulator;
  }, new Map());

  return Array.from(groupedTrips.entries()).flatMap(([groupKey, groupTrips]) => {
    const sortedTrips = [...groupTrips].sort((leftTrip, rightTrip) => leftTrip.pickupSortValue - rightTrip.pickupSortValue || leftTrip.id.localeCompare(rightTrip.id));

    if (sortedTrips.length === 1) {
      return sortedTrips.map(trip => ({
        ...trip,
        groupedTripKey: groupKey,
        legLabel: trip.tripType?.toLowerCase() === 'one way' ? 'One Way' : 'Single Ride',
        legVariant: 'secondary'
      }));
    }

    return sortedTrips.map((trip, index) => ({
      ...trip,
      groupedTripKey: groupKey,
      legLabel: index === 0 ? 'Outbound' : index === 1 ? 'Return' : `Leg ${index + 1}`,
      legVariant: index === 0 ? 'success' : index === 1 ? 'warning' : 'info'
    }));
  });
};

const mapRowToTrip = (row, index) => {
  const rawPickupTime = getValueByAliases(row, COLUMN_ALIASES.pickupTime) || getValueByAliases(row, COLUMN_ALIASES.pickup);
  const rawDropoffTime = getValueByAliases(row, COLUMN_ALIASES.appointmentTime) || getValueByAliases(row, COLUMN_ALIASES.dropoff);
  const rider = getRiderName(row, index);
  const pickup = formatSafeRideTime(rawPickupTime);
  const dropoff = formatSafeRideTime(rawDropoffTime);
  const address = getValueByAliases(row, COLUMN_ALIASES.fromAddress) || getValueByAliases(row, COLUMN_ALIASES.address) || 'Address pending';
  const destination = getValueByAliases(row, COLUMN_ALIASES.toAddress) || getValueByAliases(row, COLUMN_ALIASES.destination) || '';
  const rideId = getValueByAliases(row, COLUMN_ALIASES.id) || `RIDE-${Date.now()}-${index + 1}`;
  const tripId = getValueByAliases(row, COLUMN_ALIASES.brokerTripId);
  const status = getValueByAliases(row, COLUMN_ALIASES.status) || 'Scheduled';
  const confirmationStatus = getValueByAliases(row, COLUMN_ALIASES.confirmationStatus) || 'confirmed';
  const serviceDate = getImportedServiceDate(row, rawPickupTime, rawDropoffTime);
  const tripStatus = getImportedTripStatus(status, confirmationStatus);
  const position = [getCoordinate(row, 'lat', index), getCoordinate(row, 'lng', index)];
  const destinationPosition = [getDestinationCoordinate(row, 'lat', index), getDestinationCoordinate(row, 'lng', index)];
  const providedMiles = getValueByAliases(row, COLUMN_ALIASES.miles);
  const scheduledPickup = getValueByAliases(row, COLUMN_ALIASES.scheduledPickup) || rawPickupTime;
  const actualPickup = getValueByAliases(row, COLUMN_ALIASES.actualPickup);
  const scheduledDropoff = getValueByAliases(row, COLUMN_ALIASES.scheduledDropoff) || rawDropoffTime;
  const actualDropoff = getValueByAliases(row, COLUMN_ALIASES.actualDropoff);
  const importedDelay = getValueByAliases(row, COLUMN_ALIASES.delay) || getValueByAliases(row, COLUMN_ALIASES.lateMinutes);
  const avgDelay = getValueByAliases(row, COLUMN_ALIASES.avgDelay);

  const tripDraft = {
    scheduledPickup,
    actualPickup,
    scheduledDropoff,
    actualDropoff,
    delay: importedDelay,
    avgDelay,
    onTimeStatus: getValueByAliases(row, COLUMN_ALIASES.onTimeStatus),
    late: getValueByAliases(row, COLUMN_ALIASES.lateFlag),
    delayed: getValueByAliases(row, COLUMN_ALIASES.delayedFlag)
  };
  const lateMinutes = getTripLateMinutes(tripDraft);
  const onTimeStatus = tripDraft.onTimeStatus || getTripPunctualityLabel({
    ...tripDraft,
    lateMinutes
  });
  const uniqueTripId = buildImportedTripId({
    rideId,
    tripId,
    rawPickupTime,
    rawDropoffTime,
    address,
    destination,
    rider
  }, index);
  const importFingerprint = [
    String(tripId || '').trim().toLowerCase(),
    String(rideId || '').trim().toLowerCase(),
    String(serviceDate || '').trim(),
    String(rider || '').trim().toLowerCase(),
    String(pickup || '').trim().toLowerCase(),
    String(address || '').trim().toLowerCase(),
    String(destination || '').trim().toLowerCase()
  ].filter(Boolean).join('|');

  return {
    id: uniqueTripId,
    rideId,
    brokerTripId: tripId,
    importFingerprint,
    rider,
    pickup,
    dropoff,
    address,
    destination,
    fromZipcode: getValueByAliases(row, COLUMN_ALIASES.fromZipcode),
    toZipcode: getValueByAliases(row, COLUMN_ALIASES.toZipcode),
    patientPhoneNumber: getValueByAliases(row, COLUMN_ALIASES.patientPhoneNumber),
    alternativePhoneNumber: getValueByAliases(row, COLUMN_ALIASES.alternativePhoneNumber),
    assistanceNeeds: getValueByAliases(row, COLUMN_ALIASES.assistanceNeeds),
    notes: getValueByAliases(row, COLUMN_ALIASES.notes),
    vehicleType: getValueByAliases(row, COLUMN_ALIASES.vehicleType),
    tripType: getValueByAliases(row, COLUMN_ALIASES.tripType),
    miles: providedMiles || getDistanceMiles(position, destinationPosition),
    safeRideStatus: status,
    confirmationStatus,
    source: 'SafeRide',
    status: tripStatus,
    serviceDate,
    driverId: null,
    routeId: null,
    importedDriverName: getValueByAliases(row, COLUMN_ALIASES.driverName),
    scheduledPickup,
    actualPickup,
    scheduledDropoff,
    actualDropoff,
    delay: importedDelay,
    avgDelay,
    lateMinutes,
    onTimeStatus,
    late: String(tripDraft.late || '').trim(),
    delayed: String(tripDraft.delayed || '').trim(),
    rawPickupTime,
    rawDropoffTime,
    pickupSortValue: getTimeValue(rawPickupTime),
    position,
    destinationPosition
  };
};

const TripImportWorkspace = () => {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const {
    trips,
    upsertImportedTrips,
    previewImportedTripRoutingChanges,
    clearTripsByServiceDates,
    clearTrips
  } = useNemtContext();
  const [message, setMessage] = useState('Importa un Excel o CSV de SafeRide. El archivo actualiza solo los dias que contiene para evitar mezclar fechas y se guarda tambien en el servidor.');
  const [pendingTrips, setPendingTrips] = useState([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedTemplateLabel, setSelectedTemplateLabel] = useState('Safe Ride Default');
  const [sourceColumns, setSourceColumns] = useState([]);
  const [sourcePreviewRows, setSourcePreviewRows] = useState([]);
  const [sourceRowCount, setSourceRowCount] = useState(0);
  const [importedSourceColumns, setImportedSourceColumns] = useState([]);
  const [extraSourceColumns, setExtraSourceColumns] = useState([]);
  const [orderedSourceColumns, setOrderedSourceColumns] = useState([]);
  const [draggingSourceColumn, setDraggingSourceColumn] = useState('');
  const [leftPanelWidth, setLeftPanelWidth] = useState(42);
  const [storedLeftPanelWidth, setStoredLeftPanelWidth] = useState(42);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [reviewPanelHeight, setReviewPanelHeight] = useState(32);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [dragMode, setDragMode] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [selectedAuditDate, setSelectedAuditDate] = useState(() => toLocalDateKey(new Date()));
  const [importScan, setImportScan] = useState(null);
  const [previewSearch, setPreviewSearch] = useState('');
  const [showScanGuide, setShowScanGuide] = useState(false);
  const layoutContainerRef = useRef(null);
  const reviewPanelRef = useRef(null);
  const tripRowRefs = useRef(new Map());

  const requireTypedDeleteConfirmation = warningLabel => {
    const typedValue = String(window.prompt(`Safety check: type BORRAR to continue.\n\n${warningLabel}`) || '').trim();
    if (typedValue !== 'BORRAR') {
      setMessage('Operacion cancelada. Debes escribir BORRAR exactamente para confirmar borrado.');
      return false;
    }
    return true;
  };

  const importedServiceDateKeys = useMemo(() => Array.from(new Set(pendingTrips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))).sort(), [pendingTrips]);

  const importReconciliation = useMemo(() => {
    if (pendingTrips.length === 0 || importedServiceDateKeys.length === 0) {
      return {
        sourceRows: 0,
        existingRows: 0,
        matchedRows: 0,
        newRows: 0,
        missingFromSafeRide: 0
      };
    }

    const targetServiceDates = new Set(importedServiceDateKeys);
    const currentSameDayTrips = trips.filter(trip => targetServiceDates.has(getTripServiceDateKey(trip)));
    const importedKeySet = new Set(pendingTrips.map(buildTripMatchKey).filter(Boolean));
    const currentKeySet = new Set(currentSameDayTrips.map(buildTripMatchKey).filter(Boolean));

    let matchedRows = 0;
    importedKeySet.forEach(key => {
      if (currentKeySet.has(key)) matchedRows += 1;
    });

    let missingFromSafeRide = 0;
    currentKeySet.forEach(key => {
      if (!importedKeySet.has(key)) missingFromSafeRide += 1;
    });

    return {
      sourceRows: pendingTrips.length,
      existingRows: currentSameDayTrips.length,
      matchedRows,
      newRows: Math.max(pendingTrips.length - matchedRows, 0),
      missingFromSafeRide
    };
  }, [importedServiceDateKeys, pendingTrips, trips]);

  const changedToCancelledTrips = useMemo(() => {
    if (pendingTrips.length === 0 || importedServiceDateKeys.length === 0) return [];

    const targetServiceDates = new Set(importedServiceDateKeys);
    const currentSameDayTrips = trips.filter(trip => targetServiceDates.has(getTripServiceDateKey(trip)));
    const currentByKey = new Map();

    currentSameDayTrips.forEach(trip => {
      const key = buildTripMatchKey(trip);
      if (!key || currentByKey.has(key)) return;
      currentByKey.set(key, trip);
    });

    return pendingTrips.map(nextTrip => {
      const key = buildTripMatchKey(nextTrip);
      if (!key) return null;
      const previousTrip = currentByKey.get(key);
      if (!previousTrip) return null;

      const previousCancelled = String(previousTrip?.status || '').trim().toLowerCase() === 'cancelled';
      const nextCancelled = String(nextTrip?.status || '').trim().toLowerCase() === 'cancelled';
      if (previousCancelled || !nextCancelled) return null;

      return {
        rideId: nextTrip.rideId || '-',
        tripId: nextTrip.brokerTripId || '-',
        rider: nextTrip.rider || '-'
      };
    }).filter(Boolean);
  }, [importedServiceDateKeys, pendingTrips, trips]);

  const selectedDateSummary = useMemo(() => {
    const selectedDayTrips = trips.filter(trip => getTripServiceDateKey(trip) === selectedAuditDate);
    const cancelledCount = selectedDayTrips.filter(trip => {
      const normalizedStatus = String(trip?.status || trip?.safeRideStatus || '').trim().toLowerCase();
      return normalizedStatus === 'cancelled' || normalizedStatus === 'canceled';
    }).length;

    return {
      total: selectedDayTrips.length,
      cancelled: cancelledCount
    };
  }, [selectedAuditDate, trips]);

  const stats = useMemo(() => [{
    label: 'Trips en sistema',
    value: String(trips.length)
  }, {
    label: 'Filas en vista previa',
    value: String(pendingTrips.length)
  }, {
    label: 'Plantilla detectada',
    value: selectedTemplateLabel
  }, {
    label: 'Modo',
    value: 'Reemplazar dias coincidentes'
  }], [pendingTrips.length, selectedTemplateLabel, trips.length]);

  const filteredPendingTrips = useMemo(() => {
    const normalizedSearch = String(previewSearch || '').trim().toLowerCase();
    if (!normalizedSearch) return pendingTrips;

    return pendingTrips.filter(trip => [
      trip.id,
      trip.rideId,
      trip.brokerTripId,
      trip.rider,
      trip.address,
      trip.destination,
      trip.fromZipcode,
      trip.toZipcode,
      trip.patientPhoneNumber,
      trip.vehicleType,
      trip.pickup,
      trip.dropoff
    ].some(value => String(value || '').toLowerCase().includes(normalizedSearch)));
  }, [pendingTrips, previewSearch]);

  const tripIssueMap = useMemo(() => {
    const issuesByTripId = new Map();
    (importScan?.findings || []).forEach(finding => {
      (finding.tripIds || []).forEach(tripId => {
        const currentIssues = issuesByTripId.get(tripId) || [];
        currentIssues.push(finding);
        issuesByTripId.set(tripId, currentIssues);
      });
    });
    return issuesByTripId;
  }, [importScan]);

  const groupedTripCounts = useMemo(() => pendingTrips.reduce((accumulator, trip) => {
    const groupKey = String(trip?.groupedTripKey || '').trim();
    if (!groupKey) return accumulator;
    accumulator.set(groupKey, (accumulator.get(groupKey) || 0) + 1);
    return accumulator;
  }, new Map()), [pendingTrips]);

  const autoFixableSameDirectionFindings = useMemo(() => (importScan?.findings || []).filter(finding => {
    if (finding.code !== 'same-direction-repeated') return false;
    if (!Array.isArray(finding.tripIds) || finding.tripIds.length !== 2) return false;
    const groupKey = String(finding.groupKey || '').trim();
    if (!groupKey) return false;
    return (groupedTripCounts.get(groupKey) || 0) === 2;
  }), [groupedTripCounts, importScan]);

  const attentionTripGroups = useMemo(() => {
    const groups = new Map();
    pendingTrips.forEach(trip => {
      const issues = tripIssueMap.get(trip.id) || [];
      if (issues.length === 0) return;
      const riderKey = String(trip?.rider || trip?.id || 'Sin nombre').trim();
      const currentGroup = groups.get(riderKey) || {
        rider: riderKey,
        tripId: trip.id,
        count: 0,
        severity: 'warning'
      };
      currentGroup.count += 1;
      if (issues.some(issue => issue.severity === 'blocking')) {
        currentGroup.severity = 'blocking';
      }
      groups.set(riderKey, currentGroup);
    });
    return Array.from(groups.values()).sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === 'blocking' ? -1 : 1;
      return left.rider.localeCompare(right.rider);
    });
  }, [pendingTrips, tripIssueMap]);

  const getTripSeverity = tripId => {
    const issues = tripIssueMap.get(tripId) || [];
    if (issues.some(issue => issue.severity === 'blocking')) return 'blocking';
    if (issues.some(issue => issue.severity === 'warning')) return 'warning';
    return '';
  };

  const getTripRowStyle = trip => {
    if (selectedTripId === trip?.id) {
      return {
        backgroundColor: 'rgba(13, 110, 253, 0.12)'
      };
    }

    const severity = getTripSeverity(trip?.id);
    if (severity === 'blocking') {
      return {
        backgroundColor: 'rgba(220, 53, 69, 0.10)',
        boxShadow: 'inset 4px 0 0 #dc3545'
      };
    }

    if (severity === 'warning') {
      return {
        backgroundColor: 'rgba(255, 193, 7, 0.14)',
        boxShadow: 'inset 4px 0 0 #ffc107'
      };
    }

    if (String(trip?.legLabel || '').trim().toLowerCase() === 'return') {
      return {
        backgroundColor: 'rgba(25, 135, 84, 0.10)',
        boxShadow: 'inset 4px 0 0 #198754'
      };
    }

    return undefined;
  };

  useEffect(() => {
    if (selectedTripId && !pendingTrips.some(trip => trip.id === selectedTripId)) {
      setSelectedTripId('');
    }
  }, [pendingTrips, selectedTripId]);

  useEffect(() => {
    if (pendingTrips.length === 0) return;
    const normalizedTrips = normalizePendingTrips(pendingTrips);
    const hasChanged = normalizedTrips.some((trip, index) => trip.id !== pendingTrips[index]?.id || trip.previewRowKey !== pendingTrips[index]?.previewRowKey);
    if (hasChanged) {
      setPendingTrips(normalizedTrips);
      setImportScan(analyzeImportedTrips(normalizedTrips));
    }
  }, [pendingTrips]);

  useEffect(() => {
    const handleMouseMove = event => {
      const container = layoutContainerRef.current;
      if (dragMode === 'columns' && container && !leftPanelCollapsed) {
        const bounds = container.getBoundingClientRect();
        const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
        setLeftPanelWidth(clamp(nextWidth, 28, 62));
        setStoredLeftPanelWidth(clamp(nextWidth, 28, 62));
      }

      const reviewPanel = reviewPanelRef.current;
      if (dragMode === 'rows' && reviewPanel) {
        const bounds = reviewPanel.getBoundingClientRect();
        const nextHeight = ((event.clientY - bounds.top) / bounds.height) * 100;
        setReviewPanelHeight(clamp(nextHeight, 22, 68));
      }
    };

    const clearDragState = () => setDragMode('');

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', clearDragState);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', clearDragState);
    };
  }, [dragMode]);

  const applyPendingTripChanges = (nextTrips, nextMessage = '') => {
    const normalizedTrips = normalizePendingTrips(nextTrips);
    setPendingTrips(normalizedTrips);
    setImportScan(analyzeImportedTrips(normalizedTrips));
    if (nextMessage) setMessage(nextMessage);
  };

  const handleDeletePendingTrip = tripId => {
    const tripToDelete = pendingTrips.find(trip => trip.id === tripId);
    if (!tripToDelete) return;
    const nextTrips = pendingTrips.filter(trip => trip.id !== tripId);
    applyPendingTripChanges(nextTrips, `Se elimino ${tripToDelete.rider || tripToDelete.id} del preview antes de importar.`);
  };

  const handlePendingTripFieldChange = (field, value) => {
    if (!selectedTripId) return;
    const nextTrips = pendingTrips.map(trip => {
      if (trip.id !== selectedTripId) return trip;
      const nextTrip = { ...trip, [field]: value };
      if (field === 'pickup') nextTrip.rawPickupTime = value;
      if (field === 'dropoff') nextTrip.rawDropoffTime = value;
      if (field === 'safeRideStatus') nextTrip.status = getImportedTripStatus(value, nextTrip.confirmationStatus);
      if (field === 'confirmationStatus') nextTrip.status = getImportedTripStatus(nextTrip.safeRideStatus, value);
      return nextTrip;
    });
    applyPendingTripChanges(nextTrips);
  };

  const handleInvertPendingTrip = tripId => {
    const tripToInvert = pendingTrips.find(trip => trip.id === tripId);
    if (!tripToInvert) return;
    const nextTrips = pendingTrips.map(trip => trip.id === tripId ? invertTripDirection(trip) : trip);
    applyPendingTripChanges(nextTrips, `Se invirtio la ruta de ${tripToInvert.rider || tripToInvert.id}.`);
  };

  const handleInvertPendingTripGroup = tripId => {
    const tripToInvert = pendingTrips.find(trip => trip.id === tripId);
    const groupKey = String(tripToInvert?.groupedTripKey || '').trim();
    if (!tripToInvert || !groupKey) return;
    const groupCount = groupedTripCounts.get(groupKey) || 0;
    const nextTrips = pendingTrips.map(trip => trip.groupedTripKey === groupKey ? invertTripDirection(trip) : trip);
    applyPendingTripChanges(nextTrips, `Se invirtio el grupo completo de ${tripToInvert.rider || tripToInvert.id} (${groupCount} viaje${groupCount === 1 ? '' : 's'}).`);
  };

  const handleAutoFixSameDirectionTrips = () => {
    if (autoFixableSameDirectionFindings.length === 0) return;

    const tripIdsToInvert = new Set();
    autoFixableSameDirectionFindings.forEach(finding => {
      finding.tripIds.slice(1).forEach(tripId => tripIdsToInvert.add(tripId));
    });

    if (tripIdsToInvert.size === 0) return;

    const nextTrips = pendingTrips.map(trip => tripIdsToInvert.has(trip.id) ? invertTripDirection(trip) : trip);
    applyPendingTripChanges(nextTrips, `Se corrigieron automaticamente ${tripIdsToInvert.size} viaje${tripIdsToInvert.size === 1 ? '' : 's'} con ida repetida.`);
  };

  const handleStartEditingTrip = tripId => {
    setSelectedTripId(tripId);
  };

  const handleStopEditingTrip = () => {
    setSelectedTripId('');
  };

  const handleFocusTrip = tripId => {
    setSelectedTripId(tripId);
    const rowElement = tripRowRefs.current.get(tripId);
    if (rowElement) {
      rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const renderEditableTripCell = (trip, field, options = {}) => {
    const {
      type = 'text',
      placeholder = '',
      className = '',
      value = trip?.[field] || ''
    } = options;

    if (selectedTripId !== trip.id) {
      return <span className={className}>{value || '-'}</span>;
    }

    return <Form.Control
        size="sm"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => handlePendingTripFieldChange(field, event.target.value)}
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            handleStopEditingTrip();
          }
        }}
      />;
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      ['rideId', 'tripId', 'fromAddress', 'fromZipcode', 'toAddress', 'toZipcode', 'pickupTime', 'appointmentTime', 'scheduledPickup', 'actualPickup', 'scheduledDropoff', 'actualDropoff', 'delayMinutes', 'onTimeStatus', 'fromLatitude', 'fromLongitude', 'toLatitude', 'toLogitude', 'patientFirstName', 'patientLastName', 'patientPhoneNumber', 'requestedVehicleType', 'additionalNotes', 'status', 'confirmationStatus', 'tripType', 'driverName'],
      ['37418742', '20590287', '6037 Scotchwood Glen, Orlando, FL', '32822', '401 S Chickasaw Trail, Orlando, FL', '32825', '03/28/2026 10:33', '03/28/2026 11:00', '10:33 AM', '10:41 AM', '11:00 AM', '11:06 AM', '8', 'Late', '28.514180', '-81.302910', '28.538208', '-81.274046', 'KENNETH', 'PENA', '3213484257', 'AMB', 'Need assistance', 'Scheduled', 'confirmed', 'Multi Leg', 'Unassigned']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Trips');
    XLSX.writeFile(workbook, 'trip-import-template.xlsx');
    setMessage('Plantilla SafeRide descargada. Llena el archivo con el formato oficial y luego importalo.');
  };

  const handleClearTrips = () => {
    if (!requireTypedDeleteConfirmation('This will delete all current trips and routes.')) return;
    clearTrips();
    setPendingTrips([]);
    setSelectedFileName('');
    setSelectedTemplateLabel('Safe Ride Default');
    setSourceColumns([]);
    setSourcePreviewRows([]);
    setSourceRowCount(0);
    setImportedSourceColumns([]);
    setExtraSourceColumns([]);
    setOrderedSourceColumns([]);
    setDraggingSourceColumn('');
    setImportScan(null);
    setPreviewSearch('');
    setMessage('Todos los viajes y rutas guardadas fueron eliminados.');
  };

  const handleFileChange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setSelectedFileName(file.name);

    try {
      const parsedImport = await parseTripImportFile(file);
      const detectedTemplateLabel = parsedImport?.template?.label || 'Safe Ride Default';
      setSelectedTemplateLabel(detectedTemplateLabel);
      setSourceColumns(Array.isArray(parsedImport?.filePreview?.columns) ? parsedImport.filePreview.columns : []);
      setSourcePreviewRows(Array.isArray(parsedImport?.filePreview?.previewRows) ? parsedImport.filePreview.previewRows : []);
      setSourceRowCount(Number(parsedImport?.filePreview?.totalRows || 0));
      setImportedSourceColumns(Array.isArray(parsedImport?.importMapping?.importedColumns) ? parsedImport.importMapping.importedColumns : []);
      setExtraSourceColumns(Array.isArray(parsedImport?.importMapping?.extraColumns) ? parsedImport.importMapping.extraColumns : []);
      setOrderedSourceColumns(Array.isArray(parsedImport?.importMapping?.importedColumns) ? parsedImport.importMapping.importedColumns.map(item => item.sourceColumn) : []);

      if (!Array.isArray(parsedImport?.trips) || parsedImport.trips.length === 0) {
        setPendingTrips([]);
        setImportScan(null);
        setPreviewSearch('');
        setMessage(`El archivo no tiene filas para importar. Plantilla detectada: ${detectedTemplateLabel}.`);
        return;
      }

      const importedTrips = normalizePendingTrips(Array.isArray(parsedImport?.trips) ? parsedImport.trips : []);
      const nextImportScan = analyzeImportedTrips(importedTrips);
      setPendingTrips(importedTrips);
      setSelectedTripId('');
      setImportScan(nextImportScan);
      setPreviewSearch('');
      const dayCount = Array.isArray(parsedImport?.serviceDateKeys) && parsedImport.serviceDateKeys.length > 0
        ? parsedImport.serviceDateKeys.length
        : Array.from(new Set(importedTrips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))).length;
      const scanSuffix = nextImportScan.findingCount > 0 ? ` Scanner: ${nextImportScan.blockingCount} bloqueo(s), ${nextImportScan.warningCount} advertencia(s).` : ' Scanner: no se detectaron problemas obvios.';
      setMessage(`${importedTrips.length} viajes listos para importar con la plantilla ${detectedTemplateLabel}. Se actualizaran ${dayCount} dia${dayCount === 1 ? '' : 's'} segun el archivo.${scanSuffix}`);
    } catch {
      setPendingTrips([]);
      setSelectedTemplateLabel('No reconocida');
      setSourceColumns([]);
      setSourcePreviewRows([]);
      setSourceRowCount(0);
      setImportedSourceColumns([]);
      setExtraSourceColumns([]);
      setOrderedSourceColumns([]);
      setDraggingSourceColumn('');
      setSelectedTripId('');
      setImportScan(null);
      setPreviewSearch('');
      setMessage('No se pudo leer el archivo. Usa Excel .xlsx, .xls o CSV con encabezados.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImportTrips = () => {
    if (pendingTrips.length === 0) {
      setMessage('Primero selecciona un archivo valido.');
      return;
    }

    const routingChanges = previewImportedTripRoutingChanges(pendingTrips);
    let applyRoutingChanges = true;
    if (routingChanges.length > 0) {
      const previewLines = routingChanges.slice(0, 5).map(change => `${change.rider || change.rideId || change.brokerTripId || change.id}: ${change.currentAddress || '-'} -> ${change.importedAddress || '-'} | ${change.currentDestination || '-'} -> ${change.importedDestination || '-'}`).join('\n');
      applyRoutingChanges = window.confirm(`SafeRide cambio la direccion en ${routingChanges.length} viaje(s).\n\nPresiona OK para aplicar la direccion nueva.\nPresiona Cancel para mantener la direccion actual del sistema y guardar lo demas.\n\n${previewLines}${routingChanges.length > 5 ? '\n...' : ''}`);
    }

    upsertImportedTrips(pendingTrips, {
      applyRoutingChanges
    });
    setMessage(routingChanges.length > 0
      ? applyRoutingChanges
        ? `${pendingTrips.length} viajes procesados y guardados. Se aplicaron ${routingChanges.length} cambio(s) nuevos de direccion.`
        : `${pendingTrips.length} viajes procesados y guardados. Se detectaron ${routingChanges.length} cambio(s) de direccion y se mantuvo la direccion actual del sistema.`
      : `${pendingTrips.length} viajes procesados y guardados. Solo se actualizaron los dias presentes en el archivo.`);
  };

  const handleClearImportedDays = () => {
    if (importedServiceDateKeys.length === 0) {
      setMessage('Primero carga un archivo para detectar los dias a borrar.');
      return;
    }

    const confirmationMessage = `Vas a borrar ${importedServiceDateKeys.length} dia${importedServiceDateKeys.length === 1 ? '' : 's'} (${importedServiceDateKeys.join(', ')}). Esta accion no se puede deshacer. Deseas continuar?`;
    if (!window.confirm(confirmationMessage)) {
      setMessage('Borrado cancelado.');
      return;
    }

    if (!requireTypedDeleteConfirmation(`Dias a borrar: ${importedServiceDateKeys.join(', ')}`)) return;

    clearTripsByServiceDates(importedServiceDateKeys);
    setMessage(`Se borraron los viajes de ${importedServiceDateKeys.length} dia${importedServiceDateKeys.length === 1 ? '' : 's'}: ${importedServiceDateKeys.join(', ')}.`);
  };

  const visibleSourcePreviewColumns = useMemo(() => {
    if (orderedSourceColumns.length > 0) {
      return orderedSourceColumns;
    }
    if (importedSourceColumns.length > 0) {
      return importedSourceColumns.map(item => item.sourceColumn);
    }
    return sourceColumns;
  }, [importedSourceColumns, orderedSourceColumns, sourceColumns]);

  const handleSortSourceColumnsAlphabetically = () => {
    setOrderedSourceColumns(current => [...current].sort((left, right) => left.localeCompare(right)));
  };

  const handleResetSourceColumnOrder = () => {
    setOrderedSourceColumns(importedSourceColumns.map(item => item.sourceColumn));
  };

  const handleDropSourceColumn = targetColumn => {
    if (!draggingSourceColumn || draggingSourceColumn === targetColumn) return;
    setOrderedSourceColumns(current => {
      const nextColumns = [...current];
      const fromIndex = nextColumns.indexOf(draggingSourceColumn);
      const toIndex = nextColumns.indexOf(targetColumn);
      if (fromIndex === -1 || toIndex === -1) return current;
      nextColumns.splice(fromIndex, 1);
      nextColumns.splice(toIndex, 0, draggingSourceColumn);
      return nextColumns;
    });
    setDraggingSourceColumn('');
  };

  const toggleLeftPanelCollapsed = () => {
    if (leftPanelCollapsed) {
      setLeftPanelCollapsed(false);
      setLeftPanelWidth(storedLeftPanelWidth || 42);
      return;
    }

    setStoredLeftPanelWidth(leftPanelWidth);
    setLeftPanelCollapsed(true);
    setDragMode('');
  };

  return <>
      <PageTitle title="Importar viajes" subName="Cargador Excel" />
      <Row className="g-3 mb-3">
        {stats.map(stat => <Col md={6} xl={3} key={stat.label}>
            <Card className="h-100">
              <CardBody>
                <p className="text-muted mb-2">{stat.label}</p>
                <h4 className="mb-0">{stat.value}</h4>
              </CardBody>
            </Card>
          </Col>)}
      </Row>

      <div className="d-none d-xl-flex flex-column gap-3">
        <Card>
          <CardBody>
              <h5 className="mb-2">Importar plantillas de viajes</h5>
              <p className="text-muted mb-3">Este modulo actualiza solo los dias presentes en el archivo para evitar mezclar viajes de fechas distintas. Ahora el parser ya detecta la plantilla usada y esta preparado para soportar mas de un formato. El formato actual sigue siendo SafeRide oficial, y el siguiente template se puede agregar cuando me pases el Excel pequeno nuevo.</p>
              <Alert variant="info" className="small">Plantilla actual: Safe Ride Default. Encabezados clave: rideId, tripId, fromAddress, fromZipcode, toAddress, toZipcode, pickupTime, appointmentTime, fromLatitude, fromLongitude, patientFirstName y patientLastName. Tambien acepta columnas opcionales de puntualidad como scheduledPickup, actualPickup, scheduledDropoff, actualDropoff, delayMinutes y onTimeStatus.</Alert>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button variant="success" onClick={() => fileInputRef.current?.click()} disabled={isParsing}>{isParsing ? 'Leyendo archivo...' : 'Seleccionar Excel o CSV'}</Button>
                <Button variant="outline-primary" onClick={handleDownloadTemplate}>Descargar plantilla SafeRide</Button>
                <Button variant="outline-warning" onClick={handleClearImportedDays} disabled={importedServiceDateKeys.length === 0}>Borrar dias del archivo</Button>
                <Button variant="outline-danger" onClick={handleClearTrips}>Borrar viajes actuales</Button>
              </div>
              <Form.Control ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
              <div className="small text-muted mb-3">{selectedFileName ? `Archivo seleccionado: ${selectedFileName}` : 'No hay archivo seleccionado.'}</div>
              <div className="small text-muted mb-2">{`Plantilla detectada: ${selectedTemplateLabel}`}</div>
              <div className="small text-muted mb-2">{importedServiceDateKeys.length > 0 ? `Dias detectados en archivo: ${importedServiceDateKeys.join(', ')}` : 'Dias detectados en archivo: -'}</div>
              <div className="small text-muted mb-3">{message}</div>
            </CardBody>
          </Card>

          <Row className="g-3">
            <Col xl={5}>
              <Card className="h-100">
                <CardBody>
                  <h5 className="mb-2">Estado del archivo</h5>
                  <Alert variant="secondary" className="small mb-3">
                    <div className="fw-semibold mb-2">Resumen diario de cancelados</div>
                    <div className="d-flex flex-wrap align-items-end gap-3">
                      <Form.Group>
                        <Form.Label className="mb-1">Selecciona fecha</Form.Label>
                        <Form.Control
                          type="date"
                          value={selectedAuditDate}
                          onChange={event => setSelectedAuditDate(event.target.value)}
                        />
                      </Form.Group>
                      <div>
                        <div className="text-muted">Viajes del dia</div>
                        <div className="fw-semibold">{selectedDateSummary.total}</div>
                      </div>
                      <div>
                        <div className="text-muted">Cancelados del dia</div>
                        <div className="fw-semibold text-danger">{selectedDateSummary.cancelled}</div>
                      </div>
                    </div>
                  </Alert>
                  {pendingTrips.length > 0 ? <Alert variant="light" className="small mb-3">
                      <div className="fw-semibold mb-1">Comparacion SafeRide (mismo dia)</div>
                      <div>Filas en SafeRide: {importReconciliation.sourceRows}</div>
                      <div>Filas en sistema (mismo dia): {importReconciliation.existingRows}</div>
                      <div>Filas coincidentes: {importReconciliation.matchedRows}</div>
                      <div>Filas nuevas desde SafeRide: {importReconciliation.newRows}</div>
                      <div>Filas que faltan en el archivo SafeRide: {importReconciliation.missingFromSafeRide}</div>
                    </Alert> : null}
                  {changedToCancelledTrips.length > 0 ? <Alert variant="warning" className="small mb-3">
                      <div className="fw-semibold mb-2">Cambiados a cancelado en este archivo: {changedToCancelledTrips.length}</div>
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0 align-middle">
                          <thead>
                            <tr>
                              <th>Ride ID</th>
                              <th>Trip ID</th>
                              <th>Rider</th>
                            </tr>
                          </thead>
                          <tbody>
                            {changedToCancelledTrips.slice(0, 25).map(item => <tr key={`${item.rideId}-${item.tripId}`}>
                                <td>{item.rideId}</td>
                                <td>{item.tripId}</td>
                                <td>{item.rider}</td>
                              </tr>)}
                          </tbody>
                        </Table>
                      </div>
                      {changedToCancelledTrips.length > 25 ? <div className="mt-2">Mostrando las primeras 25 filas.</div> : null}
                    </Alert> : null}
                  {pendingTrips.length > 0 ? <Alert variant="success" className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-0">
                      <div>
                        <div className="fw-semibold">Archivo listo para importar</div>
                        <div className="small mb-0">Se encontraron {pendingTrips.length} viajes en preview. Presiona el boton verde para actualizar solamente los dias incluidos en este archivo.</div>
                      </div>
                      <Button variant="success" size="lg" onClick={handleImportTrips}>Importar {pendingTrips.length} viajes ahora</Button>
                    </Alert> : null}
                </CardBody>
              </Card>
            </Col>

            <Col xl={7}>
              <Card className="h-100">
                <CardBody>
                  <h5 className="mb-2">Escaner del archivo</h5>
                  {importScan?.findingCount > 0 ? <Alert variant={importScan.blockingCount > 0 ? 'danger' : 'warning'} className="small mb-0">
                      <div className="fw-semibold mb-1">Escaner del archivo</div>
                      <div className="mb-2">Se detectaron {importScan.findingCount} hallazgo(s): {importScan.blockingCount} bloqueo(s) y {importScan.warningCount} advertencia(s).</div>
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0 align-middle">
                          <thead>
                            <tr>
                              <th>Severidad</th>
                              <th>Trip ID</th>
                              <th>Problema</th>
                              <th>Detalle</th>
                              <th>Ruta detectada</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importScan.findings.slice(0, 8).map(finding => <tr key={finding.id}>
                                <td><Badge bg={finding.severity === 'blocking' ? 'danger' : 'warning'}>{finding.severity === 'blocking' ? 'Bloqueo' : 'Advertencia'}</Badge></td>
                                <td>{finding.brokerTripIds.join(', ') || '-'}</td>
                                <td>{finding.title}</td>
                                <td>{finding.detail}</td>
                                <td>
                                  <div className="small fw-semibold">{finding.riderNames.join(', ') || finding.tripIds.join(', ')}</div>
                                  <div className="small text-muted d-flex flex-column gap-1 mt-1">
                                    {finding.routes.slice(0, 3).map((route, routeIndex) => <div key={`${finding.id}-route-${routeIndex}`}>
                                        {route.brokerTripId || route.rideId || 'Trip'}: {route.fromAddress || '-'} {'->'} {route.toAddress || '-'}
                                      </div>)}
                                  </div>
                                </td>
                              </tr>)}
                          </tbody>
                        </Table>
                      </div>
                      {importScan.findings.length > 8 ? <div className="mt-2">Mostrando los primeros 8 hallazgos.</div> : null}
                    </Alert> : <Alert variant="success" className="small mb-0">No se detectaron problemas obvios en el archivo.</Alert>}
                </CardBody>
              </Card>
            </Col>
          </Row>

          <div ref={reviewPanelRef} className="d-flex flex-column gap-3" style={{ minWidth: 0 }}>
          <div className="d-flex flex-column gap-3" style={{ maxHeight: `${reviewPanelHeight}%`, minHeight: 180, overflow: 'hidden' }}>
            <Card>
              <CardBody className="p-0">
                <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-info-subtle">
                  <div>
                    <strong>Inspector del archivo</strong>
                    <div className="small text-muted">Resumen de columnas detectadas antes de importar.</div>
                  </div>
                  <div className="d-flex gap-2 flex-wrap justify-content-end">
                    <Badge bg="dark">{sourceColumns.length || 0} columna(s)</Badge>
                    <Badge bg="success">{importedSourceColumns.length || 0} importadas</Badge>
                    <Badge bg="secondary">{extraSourceColumns.length || 0} extra</Badge>
                  </div>
                </div>
                <div className="p-3 border-bottom">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                    <div className="small fw-semibold">Columnas que si se importan al sistema</div>
                    <div className="d-flex gap-2">
                      <Button variant="outline-secondary" size="sm" onClick={handleSortSourceColumnsAlphabetically} disabled={visibleSourcePreviewColumns.length < 2}>A-Z</Button>
                      <Button variant="outline-secondary" size="sm" onClick={handleResetSourceColumnOrder} disabled={importedSourceColumns.length === 0}>Original</Button>
                    </div>
                  </div>
                  <div className="small text-muted mb-2">Puedes arrastrar estas columnas para cambiar el orden del preview.</div>
                  <div className="d-flex flex-wrap gap-2">
                    {visibleSourcePreviewColumns.length > 0 ? visibleSourcePreviewColumns.map(column => {
                      const mapping = importedSourceColumns.find(item => item.sourceColumn === column);
                      return <button
                          type="button"
                          key={`${column}-${mapping?.fieldKey || 'column'}`}
                          draggable
                          onDragStart={() => setDraggingSourceColumn(column)}
                          onDragOver={event => event.preventDefault()}
                          onDrop={() => handleDropSourceColumn(column)}
                          onDragEnd={() => setDraggingSourceColumn('')}
                          className={`btn btn-sm ${draggingSourceColumn === column ? 'btn-dark' : 'btn-success'}`}
                        >
                          {column}
                        </button>;
                    }) : <span className="text-muted small">Carga un archivo para ver las columnas importadas.</span>}
                  </div>
                </div>
                {extraSourceColumns.length > 0 ? <div className="p-3 border-bottom bg-light-subtle">
                    <div className="small fw-semibold mb-2">Columnas extra del archivo que no se meten al sistema</div>
                    <div className="d-flex flex-wrap gap-2">
                      {extraSourceColumns.map(column => <Badge bg="secondary" key={`extra-${column}`}>{column}</Badge>)}
                    </div>
                  </div> : null}
                <div className="p-3 small text-muted">
                  {sourceColumns.length > 0 ? `El archivo trae ${sourceColumns.length} columna(s) y ${sourceRowCount || 0} fila(s). El preview crudo de columnas fue ocultado para dejar mas espacio al editor de viajes.` : 'Carga un archivo para ver el resumen de columnas.'}
                </div>
              </CardBody>
            </Card>
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            onMouseDown={event => {
              event.preventDefault();
              setDragMode('rows');
            }}
            style={{ height: 10, cursor: 'row-resize', borderRadius: 999, background: 'linear-gradient(90deg, rgba(15,118,110,0.15) 0%, rgba(15,118,110,0.55) 50%, rgba(15,118,110,0.15) 100%)' }}
          />

          <Card className="flex-grow-1">
              <CardBody className="p-0">
                <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark">
                  <div className="d-flex flex-column gap-2" style={{ minWidth: 0 }}>
                    <strong>Preview de viajes importados</strong>
                    {attentionTripGroups.length > 0 ? <div className="d-flex flex-wrap gap-2">
                        {attentionTripGroups.map(group => <Button
                            key={`${group.rider}-${group.tripId}`}
                            variant={group.severity === 'blocking' ? 'danger' : 'warning'}
                            size="sm"
                            onClick={() => handleFocusTrip(group.tripId)}
                          >
                            {group.rider}{group.count > 1 ? ` (${group.count})` : ''}
                          </Button>)}
                      </div> : <div className="small text-light-emphasis">No hay nombres con alertas pendientes.</div>}
                  </div>
                  <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                    <Button variant="light" size="sm" onClick={() => setShowScanGuide(current => !current)}>
                      {showScanGuide ? 'Ocultar scanner' : 'Que escanea'}
                    </Button>
                    <Button variant="light" size="sm" onClick={handleAutoFixSameDirectionTrips} disabled={autoFixableSameDirectionFindings.length === 0} title="Solo corrige automaticamente grupos simples de 2 patas. Los grupos largos se corrigen manualmente.">Auto corregir ida repetida</Button>
                    <Form.Control
                      size="sm"
                      value={previewSearch}
                      onChange={event => setPreviewSearch(event.target.value)}
                      placeholder="Buscar ride, trip, pasajero o direccion"
                      style={{ width: 280, maxWidth: '100%' }}
                    />
                    <Badge bg="light" text="dark">{filteredPendingTrips.length}{previewSearch ? `/${pendingTrips.length}` : ''}</Badge>
                    <Button variant="light" size="sm" onClick={handleImportTrips} disabled={pendingTrips.length === 0}>Importar</Button>
                  </div>
                </div>
                {showScanGuide ? <Alert variant="info" className="small rounded-0 border-0 border-bottom mb-0">
                    <div className="fw-semibold mb-2">Que esta escaneando este preview</div>
                    <div>Busca direcciones repetidas por error, por ejemplo cuando una pata vuelve a salir en la misma direccion en vez de regresar invertida.</div>
                    <div>Tambien revisa grupos raros de muchas patas, rutas que no regresan limpio, pickup y destino iguales, y cambios sospechosos entre una pata y otra.</div>
                    <div className="mt-2"><strong>Importante:</strong> cuando corriges aqui con editar, invertir o borrar, eso mismo es lo que se guarda al importar. El sistema no vuelve a poner el error viejo; importa exactamente el preview corregido que tienes delante.</div>
                  </Alert> : null}
                <div className="table-responsive" style={{ maxHeight: 520 }}>
                  <Table hover className="align-middle mb-0">
                    <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                      <tr>
                        <th>Ride ID</th>
                        <th>Trip ID</th>
                        <th>Tramo</th>
                        <th>Alertas</th>
                        <th>Pasajero</th>
                        <th>Estado</th>
                        <th>Millas</th>
                        <th>Telefono</th>
                        <th>PU</th>
                        <th>DO</th>
                        <th>PU Address</th>
                        <th>DO Address</th>
                        <th>PU Zip</th>
                        <th>DO Zip</th>
                        <th>Vehiculo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPendingTrips.length > 0 ? filteredPendingTrips.map(trip => <tr
                          key={trip.id}
                          ref={element => {
                            if (element) tripRowRefs.current.set(trip.id, element);
                            else tripRowRefs.current.delete(trip.id);
                          }}
                          onDoubleClick={() => handleStartEditingTrip(trip.id)}
                          style={{
                            cursor: 'pointer',
                            ...(getTripRowStyle(trip) || {})
                          }}
                        >
                          <td className="fw-semibold">{renderEditableTripCell(trip, 'rideId', { value: trip.rideId || trip.id, className: 'fw-semibold' })}</td>
                          <td>{trip.brokerTripId || '-'}</td>
                          <td><Badge bg={trip.legVariant || 'secondary'}>{trip.legLabel || 'Viaje'}</Badge></td>
                          <td>
                            <div className="d-flex flex-column gap-1">
                              {(tripIssueMap.get(trip.id) || []).length > 0 ? (tripIssueMap.get(trip.id) || []).slice(0, 2).map(issue => <Badge key={`${trip.id}-${issue.id}`} bg={issue.severity === 'blocking' ? 'danger' : 'warning'} text={issue.severity === 'blocking' ? undefined : 'dark'}>
                                  {issue.code === 'same-direction-repeated' ? 'Ida repetida' : issue.code === 'multi-leg-group' ? 'Grupo raro' : issue.code === 'route-mismatch' ? 'Ruta mal' : issue.code === 'chained-route' ? 'Ruta encadenada' : issue.code === 'near-match-address-change' ? 'Direccion cambio' : issue.title}
                                </Badge>) : <span className="text-muted small">-</span>}
                              {(tripIssueMap.get(trip.id) || []).length > 2 ? <span className="small text-muted">+{(tripIssueMap.get(trip.id) || []).length - 2}</span> : null}
                            </div>
                          </td>
                          <td>{renderEditableTripCell(trip, 'rider')}</td>
                          <td>{selectedTripId === trip.id ? renderEditableTripCell(trip, 'safeRideStatus') : <Badge bg="secondary">{trip.safeRideStatus || '-'}</Badge>}</td>
                          <td>{renderEditableTripCell(trip, 'miles')}</td>
                          <td>{renderEditableTripCell(trip, 'patientPhoneNumber')}</td>
                          <td>{renderEditableTripCell(trip, 'pickup')}</td>
                          <td>{renderEditableTripCell(trip, 'dropoff')}</td>
                          <td>{renderEditableTripCell(trip, 'address')}</td>
                          <td>{renderEditableTripCell(trip, 'destination')}</td>
                          <td>{renderEditableTripCell(trip, 'fromZipcode')}</td>
                          <td>{renderEditableTripCell(trip, 'toZipcode')}</td>
                          <td>{renderEditableTripCell(trip, 'vehicleType')}</td>
                          <td>
                            <div className="d-flex gap-2 flex-wrap">
                              <Button
                                variant={selectedTripId === trip.id ? 'dark' : 'outline-dark'}
                                size="sm"
                                onClick={event => {
                                  event.stopPropagation();
                                  if (selectedTripId === trip.id) {
                                    handleStopEditingTrip();
                                    return;
                                  }
                                  handleStartEditingTrip(trip.id);
                                }}
                              >
                                {selectedTripId === trip.id ? 'Cerrar' : 'Editar'}
                              </Button>
                              <Button variant="outline-primary" size="sm" onClick={event => {
                                event.stopPropagation();
                                handleInvertPendingTrip(trip.id);
                              }}>Invertir</Button>
                              {groupedTripCounts.get(String(trip?.groupedTripKey || '').trim()) > 1 ? <Button variant="outline-primary" size="sm" onClick={event => {
                                event.stopPropagation();
                                handleInvertPendingTripGroup(trip.id);
                              }}>Invertir grupo</Button> : null}
                              <Button variant="outline-danger" size="sm" onClick={event => {
                                event.stopPropagation();
                                handleDeletePendingTrip(trip.id);
                              }}>Borrar</Button>
                            </div>
                          </td>
                        </tr>) : <tr>
                          <td colSpan={16} className="text-center text-muted py-5">{pendingTrips.length > 0 ? 'No hay viajes que coincidan con la busqueda.' : 'Carga la plantilla Safe Ride Default para ver el preview.'}</td>
                        </tr>}
                    </tbody>
                  </Table>
                </div>
                <div className="p-3 border-top d-flex flex-wrap gap-2">
                  <Button variant="success" onClick={handleImportTrips} disabled={pendingTrips.length === 0}>Importar y actualizar dias</Button>
                  <Button variant="outline-secondary" onClick={() => router.push('/dispatcher')}>Abrir Dispatcher</Button>
                  <Button variant="outline-secondary" onClick={() => router.push('/trip-dashboard')}>Abrir Trip Dashboard</Button>
                </div>
              </CardBody>
            </Card>
          </div>
      </div>

      <Row className="g-3 d-xl-none">
        <Col xs={12}>
          <Alert variant="info" className="small mb-0">La version movil mantiene el editor, el scanner y el preview. Para redimensionar paneles usa la vista de escritorio.</Alert>
        </Col>
      </Row>
    </>;
};

export default TripImportWorkspace;