import { getTripLateMinutes, getTripPunctualityLabel, getTripServiceDateKey } from '@/helpers/nemt-dispatch-state';
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
  assistanceNeeds: ['assistanceneeds'],
  status: ['status'],
  confirmationStatus: ['confirmationstatus'],
  serviceDate: ['servicedate', 'service date', 'dateofservice', 'date of service', 'dos', 'date', 'tripdate', 'trip date', 'appointmentdate', 'appointment date'],
  vehicleType: ['requestedvehicletype', 'vehicletype'],
  miles: ['distance'],
  notes: ['additionalnotes', 'otherdetails'],
  tripType: ['triptype'],
  driverName: ['drivername', 'driver', 'assigneddriver', 'assigned driver', 'driver assigned', 'driver full name', 'driver fullname', 'tripdriver', 'trip driver', 'chauffeur', 'chauffeurname', 'route', 'route name', 'routename'],
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
    if (match && String(match[1] ?? '').trim()) return String(match[1]).trim();
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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getTimeValue = value => {
  const date = getParsedDate(value);
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const buildImportedTripId = ({ rideId, tripId, rawPickupTime, rawDropoffTime, address, destination, rider }, index) => {
  const stableId = String(rideId || '').trim() || [tripId, rawPickupTime, rawDropoffTime, address, destination, rider].map(value => String(value || '').trim()).filter(Boolean).join('|');
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
  if (parsedExplicitDate) return toLocalDateKey(parsedExplicitDate);
  const parsedPickupDate = getParsedDate(rawPickupTime);
  if (parsedPickupDate) return toLocalDateKey(parsedPickupDate);
  const parsedDropoffDate = getParsedDate(rawDropoffTime);
  if (parsedDropoffDate) return toLocalDateKey(parsedDropoffDate);
  return '';
};

const getImportedTripStatus = (statusValue, confirmationStatusValue) => {
  const normalizedStatus = String(statusValue || '').trim().toLowerCase();
  const normalizedConfirmation = String(confirmationStatusValue || '').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(normalizedStatus) || ['cancelled', 'canceled', 'disconnected'].includes(normalizedConfirmation)) return 'Cancelled';
  if (normalizedStatus.includes('rehab') || normalizedStatus.includes('hospital')) return 'Rehab';
  if (['confirmed', 'confirm'].includes(normalizedConfirmation)) return 'Confirmed';
  return 'Pending Confirmation';
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

const normalizeScanText = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const hasSameLocation = (leftValue, rightValue) => {
  const left = normalizeScanText(leftValue);
  const right = normalizeScanText(rightValue);
  return Boolean(left) && Boolean(right) && left === right;
};

const buildTripImportFinding = ({ severity, code, title, detail, trips, groupKey }) => ({
  id: `${code}:${groupKey || trips.map(trip => trip.id).join('|')}`,
  severity,
  code,
  title,
  detail,
  groupKey: groupKey || '',
  tripIds: trips.map(trip => trip.id),
  brokerTripIds: Array.from(new Set(trips.map(trip => String(trip?.brokerTripId || '').trim()).filter(Boolean))),
  riderNames: Array.from(new Set(trips.map(trip => String(trip?.rider || '').trim()).filter(Boolean))),
  serviceDates: Array.from(new Set(trips.map(trip => getTripServiceDateKey(trip)).filter(Boolean)))
});

export const analyzeImportedTrips = trips => {
  if (!Array.isArray(trips) || trips.length === 0) {
    return {
      totalTrips: 0,
      findingCount: 0,
      warningCount: 0,
      blockingCount: 0,
      findings: []
    };
  }

  const findings = [];
  const exactTripGroups = new Map();
  const groupedTrips = new Map();

  trips.forEach(trip => {
    const duplicateKey = [
      getTripServiceDateKey(trip),
      normalizeScanText(trip?.rider),
      normalizeScanText(trip?.pickup),
      normalizeScanText(trip?.address),
      normalizeScanText(trip?.destination)
    ].filter(Boolean).join('|');
    if (duplicateKey) {
      exactTripGroups.set(duplicateKey, [...(exactTripGroups.get(duplicateKey) ?? []), trip]);
    }

    const groupKey = String(trip?.brokerTripId || trip?.id || '').trim();
    groupedTrips.set(groupKey, [...(groupedTrips.get(groupKey) ?? []), trip]);

    if (hasSameLocation(trip?.address, trip?.destination)) {
      findings.push(buildTripImportFinding({
        severity: 'blocking',
        code: 'same-location-leg',
        title: 'Same pickup and destination on one leg',
        detail: `${trip.rider || 'This rider'} has the same pickup and destination address on the same imported leg.`,
        trips: [trip],
        groupKey
      }));
    }

    if (!String(trip?.destination || '').trim()) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'missing-destination',
        title: 'Trip is missing a destination',
        detail: `${trip.rider || 'This rider'} is missing a destination address in the import file.`,
        trips: [trip],
        groupKey
      }));
    }
  });

  exactTripGroups.forEach((groupTrips, groupKey) => {
    if (groupTrips.length < 2) return;
    findings.push(buildTripImportFinding({
      severity: 'warning',
      code: 'duplicate-trip-rows',
      title: 'Possible duplicate trip rows',
      detail: `${groupTrips.length} imported rows share the same rider, pickup time, pickup, and destination.`,
      trips: groupTrips,
      groupKey
    }));
  });

  groupedTrips.forEach((groupTrips, groupKey) => {
    if (groupTrips.length < 2) return;

    const sortedTrips = [...groupTrips].sort((leftTrip, rightTrip) => leftTrip.pickupSortValue - rightTrip.pickupSortValue || leftTrip.id.localeCompare(rightTrip.id));
    const firstTrip = sortedTrips[0];
    const lastTrip = sortedTrips[sortedTrips.length - 1];
    const reverseLooksCorrect = hasSameLocation(firstTrip?.address, lastTrip?.destination) && hasSameLocation(firstTrip?.destination, lastTrip?.address);
    const repeatedPickup = hasSameLocation(firstTrip?.address, lastTrip?.address);
    const repeatedDestination = hasSameLocation(firstTrip?.destination, lastTrip?.destination);

    if (sortedTrips.length > 2) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'multi-leg-group',
        title: 'Trip group has more than two legs',
        detail: `${sortedTrips.length} rows share the same SafeRide trip group and should be reviewed before import.`,
        trips: sortedTrips,
        groupKey
      }));
    }

    if (repeatedPickup || repeatedDestination) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'repeated-route-endpoint',
        title: 'Repeated pickup or destination across linked legs',
        detail: `Linked legs in this SafeRide group repeat ${repeatedPickup ? 'the pickup' : 'the destination'} instead of reversing cleanly.`,
        trips: sortedTrips,
        groupKey
      }));
      return;
    }

    if (!reverseLooksCorrect) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'route-mismatch',
        title: 'Linked legs do not reverse cleanly',
        detail: 'This SafeRide trip group does not look like a clean outbound/return pair and should be reviewed before import.',
        trips: sortedTrips,
        groupKey
      }));
    }
  });

  const severityOrder = { blocking: 0, warning: 1 };
  const orderedFindings = findings.sort((leftFinding, rightFinding) => {
    const severityDifference = (severityOrder[leftFinding.severity] ?? 99) - (severityOrder[rightFinding.severity] ?? 99);
    if (severityDifference !== 0) return severityDifference;
    return leftFinding.title.localeCompare(rightFinding.title);
  });

  return {
    totalTrips: trips.length,
    findingCount: orderedFindings.length,
    warningCount: orderedFindings.filter(finding => finding.severity === 'warning').length,
    blockingCount: orderedFindings.filter(finding => finding.severity === 'blocking').length,
    findings: orderedFindings
  };
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
  const onTimeStatus = tripDraft.onTimeStatus || getTripPunctualityLabel({ ...tripDraft, lateMinutes });
  const uniqueTripId = buildImportedTripId({ rideId, tripId, rawPickupTime, rawDropoffTime, address, destination, rider }, index);
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

export const parseTripImportBuffer = arrayBuffer => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      trips: [],
      serviceDateKeys: [],
      scan: analyzeImportedTrips([])
    };
  }
  const trips = annotateSafeRideTrips(rows.map(mapRowToTrip).filter(trip => trip.id && trip.rider && trip.address));
  return {
    trips,
    serviceDateKeys: Array.from(new Set(trips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))).sort(),
    scan: analyzeImportedTrips(trips)
  };
};

export const parseTripImportFile = async file => {
  const arrayBuffer = await file.arrayBuffer();
  return parseTripImportBuffer(arrayBuffer);
};