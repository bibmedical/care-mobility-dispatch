import { getTripLateMinutes, getTripPunctualityLabel, getTripServiceDateKey, splitAddressAndZipcode } from '@/helpers/nemt-dispatch-state';
import * as XLSX from 'xlsx';

const IMPORT_TEMPLATES = {
  saferideOfficial: {
    id: 'saferideOfficial',
    label: 'Safe Ride Default',
    description: 'Formato base de Safe Ride con columnas principales y campos opcionales de puntualidad.',
    requiredFields: ['fromAddress', 'toAddress', 'pickupTime'],
    aliases: {
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
      notes: ['additionalnotes', 'additional note', 'additional notes', 'aditional note', 'aditional notes', 'otherdetails', 'other details'],
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
    }
  }
};

const DEFAULT_IMPORT_TEMPLATE_ID = 'saferideOfficial';

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

const buildLocalDate = ({ year, month, day, hours = 0, minutes = 0, seconds = 0 }) => new Date(
  Number(year),
  Number(month) - 1,
  Number(day),
  Number(hours) || 0,
  Number(minutes) || 0,
  Number(seconds) || 0
);

const parseMeridiemHour = (hours, meridiem) => {
  const normalizedHours = Number(hours) || 0;
  const normalizedMeridiem = String(meridiem || '').trim().toUpperCase();
  if (!normalizedMeridiem) return normalizedHours;
  if (normalizedMeridiem === 'AM') return normalizedHours === 12 ? 0 : normalizedHours;
  if (normalizedMeridiem === 'PM') return normalizedHours === 12 ? 12 : normalizedHours + 12;
  return normalizedHours;
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

  const isoWithoutTimezoneMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?$/);
  if (isoWithoutTimezoneMatch) {
    const [, year, month, day, hours = '0', minutes = '0', seconds = '0'] = isoWithoutTimezoneMatch;
    return buildLocalDate({ year, month, day, hours, minutes, seconds });
  }

  const slashDateMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[T\s](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (slashDateMatch) {
    const [, month, day, rawYear, rawHours = '0', minutes = '0', seconds = '0', meridiem = ''] = slashDateMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return buildLocalDate({
      year,
      month,
      day,
      hours: parseMeridiemHour(rawHours, meridiem),
      minutes,
      seconds
    });
  }

  const parsedDate = new Date(normalized);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeHeader = value => String(value ?? '').trim().toLowerCase();

const getTemplateConfig = templateId => IMPORT_TEMPLATES[templateId] || IMPORT_TEMPLATES[DEFAULT_IMPORT_TEMPLATE_ID];

const getTemplateAliases = (template, key) => template?.aliases?.[key] || [];

const getTemplateImportMapping = (template, columns) => {
  const normalizedColumns = (Array.isArray(columns) ? columns : []).map(column => ({
    original: String(column || '').trim(),
    normalized: normalizeHeader(column)
  }));
  const importedColumns = [];
  const importedNormalizedSet = new Set();

  Object.entries(template?.aliases || {}).forEach(([fieldKey, aliases]) => {
    const matchedColumn = normalizedColumns.find(column => aliases.includes(column.normalized));
    if (!matchedColumn) return;
    importedColumns.push({
      sourceColumn: matchedColumn.original,
      fieldKey
    });
    importedNormalizedSet.add(matchedColumn.normalized);
  });

  const extraColumns = normalizedColumns
    .filter(column => !importedNormalizedSet.has(column.normalized))
    .map(column => column.original);

  return {
    importedColumns,
    extraColumns
  };
};

const buildImportFilePreview = rows => {
  const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  const columns = Object.keys(firstRow ?? {});
  const previewRows = (Array.isArray(rows) ? rows : []).slice(0, 8).map(row => columns.reduce((accumulator, column) => ({
    ...accumulator,
    [column]: String(row?.[column] ?? '').trim()
  }), {}));
  return {
    columns,
    previewRows,
    totalRows: Array.isArray(rows) ? rows.length : 0
  };
};

const detectImportTemplate = rows => {
  const templateEntries = Object.values(IMPORT_TEMPLATES);
  if (!Array.isArray(rows) || rows.length === 0) return getTemplateConfig(DEFAULT_IMPORT_TEMPLATE_ID);

  const rowHeaders = new Set(
    rows.flatMap(row => Object.keys(row ?? {}).map(normalizeHeader)).filter(Boolean)
  );

  const scoredTemplates = templateEntries.map(template => {
    const requiredMatches = template.requiredFields.filter(field => getTemplateAliases(template, field).some(alias => rowHeaders.has(alias))).length;
    const totalMatches = Object.values(template.aliases).reduce((count, aliases) => count + (aliases.some(alias => rowHeaders.has(alias)) ? 1 : 0), 0);
    return {
      template,
      requiredMatches,
      totalMatches
    };
  });

  const bestTemplate = scoredTemplates.sort((left, right) => {
    if (right.requiredMatches !== left.requiredMatches) return right.requiredMatches - left.requiredMatches;
    return right.totalMatches - left.totalMatches;
  })[0];

  if (!bestTemplate || bestTemplate.requiredMatches === 0) return getTemplateConfig(DEFAULT_IMPORT_TEMPLATE_ID);
  return bestTemplate.template;
};

export const getTripImportTemplates = () => Object.values(IMPORT_TEMPLATES).map(template => ({
  id: template.id,
  label: template.label,
  description: template.description,
  requiredFields: [...template.requiredFields]
}));

const getValueByAliases = (row, aliases) => {
  const entries = Object.entries(row ?? {});
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeader(key) === alias);
    if (match && String(match[1] ?? '').trim()) return String(match[1]).trim();
  }
  return '';
};

const getCoordinate = (row, key, index, template) => {
  const aliases = key === 'lat'
    ? [...getTemplateAliases(template, 'fromLatitude'), ...getTemplateAliases(template, 'lat')]
    : [...getTemplateAliases(template, 'fromLongitude'), ...getTemplateAliases(template, 'lng')];
  const rawValue = getValueByAliases(row, aliases);
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;
  const offset = (index % 10) * 0.01;
  return key === 'lat' ? DEFAULT_CENTER[0] + offset : DEFAULT_CENTER[1] - offset;
};

const getDestinationCoordinate = (row, key, index, template) => {
  const aliases = key === 'lat' ? getTemplateAliases(template, 'toLatitude') : getTemplateAliases(template, 'toLongitude');
  const rawValue = getValueByAliases(row, aliases);
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = getCoordinate(row, key, index, template);
  return key === 'lat' ? fallback + 0.01 : fallback + 0.01;
};

const getRiderName = (row, index, template) => {
  const firstName = getValueByAliases(row, getTemplateAliases(template, 'patientFirstName'));
  const lastName = getValueByAliases(row, getTemplateAliases(template, 'patientLastName'));
  const combinedName = `${firstName} ${lastName}`.trim();
  return combinedName || getValueByAliases(row, getTemplateAliases(template, 'rider')) || `Rider ${index + 1}`;
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

const getImportedServiceDate = (row, rawPickupTime, rawDropoffTime, template) => {
  const explicitServiceDate = getValueByAliases(row, getTemplateAliases(template, 'serviceDate'));
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

const getNormalizedPhone = value => String(value || '').replace(/\D/g, '');

const buildImportedTripGroupKey = trip => {
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  if (brokerTripId) return `broker:${brokerTripId}`;

  const serviceDate = String(getTripServiceDateKey(trip) || '').trim();
  const rider = normalizeScanText(trip?.rider);
  const phone = getNormalizedPhone(trip?.patientPhoneNumber);
  return ['rider', serviceDate, rider, phone].filter(Boolean).join('|') || String(trip?.id || '').trim();
};

const isWillCallTrip = trip => {
  const pickupSortValue = Number(trip?.pickupSortValue);
  if (Number.isFinite(pickupSortValue) && pickupSortValue === 1439) return true;

  const normalizedPickup = normalizeScanText(trip?.pickup);
  const normalizedRawPickup = normalizeScanText(trip?.rawPickupTime);
  return ['11:59 pm', '11:59pm', '23:59', '23:59:00'].includes(normalizedPickup)
    || ['11:59 pm', '11:59pm', '23:59', '23:59:00'].includes(normalizedRawPickup);
};

const getReverseMatchQuality = (outboundTrip, candidateTrip) => {
  const exactReverse = hasSameLocation(outboundTrip?.destination, candidateTrip?.address) && hasSameLocation(outboundTrip?.address, candidateTrip?.destination);
  const similarReverse = !exactReverse && hasSimilarLocation(outboundTrip?.destination, candidateTrip?.address) && hasSimilarLocation(outboundTrip?.address, candidateTrip?.destination);
  return {
    exactReverse,
    similarReverse,
    matches: exactReverse || similarReverse
  };
};

const buildLogicalTripGroups = (groupTrips, rootGroupKey) => {
  const sortedTrips = [...(Array.isArray(groupTrips) ? groupTrips : [])].sort((leftTrip, rightTrip) => leftTrip.pickupSortValue - rightTrip.pickupSortValue || leftTrip.id.localeCompare(rightTrip.id));
  const usedTripIds = new Set();
  const logicalGroups = [];
  let pairIndex = 0;
  let singleIndex = 0;

  sortedTrips.forEach((trip, index) => {
    if (usedTripIds.has(trip.id)) return;

    const reverseCandidates = sortedTrips.slice(index + 1).filter(candidateTrip => !usedTripIds.has(candidateTrip.id)).map(candidateTrip => ({
      trip: candidateTrip,
      quality: getReverseMatchQuality(trip, candidateTrip)
    })).filter(candidate => candidate.quality.matches).sort((leftCandidate, rightCandidate) => {
      if (leftCandidate.quality.exactReverse !== rightCandidate.quality.exactReverse) {
        return leftCandidate.quality.exactReverse ? -1 : 1;
      }

      if (isWillCallTrip(leftCandidate.trip) !== isWillCallTrip(rightCandidate.trip)) {
        return isWillCallTrip(leftCandidate.trip) ? -1 : 1;
      }

      return (leftCandidate.trip.pickupSortValue ?? Number.MAX_SAFE_INTEGER) - (rightCandidate.trip.pickupSortValue ?? Number.MAX_SAFE_INTEGER);
    });

    const matchedReturnTrip = reverseCandidates[0]?.trip || null;
    if (matchedReturnTrip) {
      usedTripIds.add(trip.id);
      usedTripIds.add(matchedReturnTrip.id);
      pairIndex += 1;
      logicalGroups.push({
        logicalGroupKey: `${rootGroupKey}::pair-${pairIndex}`,
        trips: [trip, matchedReturnTrip]
      });
      return;
    }

    usedTripIds.add(trip.id);
    singleIndex += 1;
    logicalGroups.push({
      logicalGroupKey: `${rootGroupKey}::single-${singleIndex}`,
      trips: [trip]
    });
  });

  return logicalGroups;
};

const annotateSafeRideTrips = trips => {
  const groupedTrips = trips.reduce((accumulator, trip) => {
    const groupKey = buildImportedTripGroupKey(trip);
    accumulator.set(groupKey, [...(accumulator.get(groupKey) ?? []), trip]);
    return accumulator;
  }, new Map());

  return Array.from(groupedTrips.entries()).flatMap(([groupKey, groupTrips]) => {
    const sortedTrips = [...groupTrips].sort((leftTrip, rightTrip) => leftTrip.pickupSortValue - rightTrip.pickupSortValue || leftTrip.id.localeCompare(rightTrip.id));
    const logicalGroups = buildLogicalTripGroups(sortedTrips, groupKey);
    const annotationsByTripId = new Map();

    logicalGroups.forEach(logicalGroup => {
      if (logicalGroup.trips.length === 2) {
        const [outboundTrip, returnTrip] = logicalGroup.trips;
        annotationsByTripId.set(outboundTrip.id, {
          groupedTripKey: logicalGroup.logicalGroupKey,
          legLabel: 'Outbound',
          legVariant: 'success',
          isWillCall: isWillCallTrip(outboundTrip)
        });
        annotationsByTripId.set(returnTrip.id, {
          groupedTripKey: logicalGroup.logicalGroupKey,
          legLabel: 'Return',
          legVariant: 'warning',
          isWillCall: isWillCallTrip(returnTrip)
        });
        return;
      }

      const [trip] = logicalGroup.trips;
      annotationsByTripId.set(trip.id, {
        groupedTripKey: logicalGroup.logicalGroupKey,
        legLabel: isWillCallTrip(trip) ? 'WillCall' : trip.tripType?.toLowerCase() === 'one way' ? 'One Way' : 'Single Ride',
        legVariant: isWillCallTrip(trip) ? 'info' : 'secondary',
        isWillCall: isWillCallTrip(trip)
      });
    });

    return sortedTrips.map(trip => ({
      ...trip,
      ...annotationsByTripId.get(trip.id),
      scanRootGroupKey: groupKey
    }));
  });
};

export const annotateTripsByScanLogic = trips => annotateSafeRideTrips(Array.isArray(trips) ? trips : []);

const getLegLabelScanCategory = value => {
  const normalized = normalizeScanText(value);
  if (!normalized) return '';
  if (['al', 'a', 'outbound', 'appointment', 'appt'].includes(normalized) || normalized.includes('outbound') || normalized.includes('appointment') || normalized.includes('appt')) return 'outbound';
  if (['bl', 'b', 'return', 'home', 'back'].includes(normalized) || normalized.includes('return') || normalized.includes('home') || normalized.includes('house') || normalized.includes('back')) return 'return';
  if (normalized.includes('willcall') || normalized.includes('will call')) return 'willcall';
  if (normalized.includes('single ride') || normalized.includes('one way')) return 'single';
  if (normalized.includes('leg 3') || normalized.includes('leg 4') || normalized.includes('leg 5') || normalized.includes('connector') || normalized.includes('cross')) return 'extra';
  return normalized;
};

const normalizeScanText = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeStreetSignature = value => normalizeScanText(value)
  .replace(/,/g, ' ')
  .replace(/\busa\b/g, ' ')
  .replace(/\bunited states\b/g, ' ')
  .replace(/\bfl\b/g, ' florida ')
  .replace(/\bave\b/g, ' avenue ')
  .replace(/\bblvd\b/g, ' boulevard ')
  .replace(/\brd\b/g, ' road ')
  .replace(/\bst\b/g, ' street ')
  .replace(/\bdr\b/g, ' drive ')
  .replace(/\bcir\b/g, ' circle ')
  .replace(/\bhwy\b/g, ' highway ')
  .replace(/\bapt\b/g, ' ')
  .replace(/\bunit\b/g, ' ')
  .replace(/\bsuite\b/g, ' ')
  .replace(/#/g, ' ')
  .replace(/^\d+[a-z-]*\s+/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const hasSameLocation = (leftValue, rightValue) => {
  const left = normalizeScanText(leftValue);
  const right = normalizeScanText(rightValue);
  return Boolean(left) && Boolean(right) && left === right;
};

const hasSimilarLocation = (leftValue, rightValue) => {
  const left = normalizeStreetSignature(leftValue);
  const right = normalizeStreetSignature(rightValue);
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
  serviceDates: Array.from(new Set(trips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))),
  routes: trips.map(trip => ({
    rideId: String(trip?.rideId || '').trim(),
    brokerTripId: String(trip?.brokerTripId || '').trim(),
    pickup: String(trip?.pickup || '').trim(),
    fromAddress: String(trip?.address || '').trim(),
    toAddress: String(trip?.destination || '').trim()
  }))
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
  const sourceTripMap = new Map((Array.isArray(trips) ? trips : []).map(trip => [String(trip?.id || '').trim(), trip]));
  const annotatedTrips = annotateTripsByScanLogic(trips);
  const annotatedTripMap = new Map(annotatedTrips.map(trip => [String(trip?.id || '').trim(), trip]));
  const exactTripGroups = new Map();
  const riderDayGroups = new Map();

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

    const groupKey = buildImportedTripGroupKey(trip);
  riderDayGroups.set(groupKey, [...(riderDayGroups.get(groupKey) ?? []), trip]);

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

  const groupedTrips = new Map();
  riderDayGroups.forEach((groupTrips, groupKey) => {
    buildLogicalTripGroups(groupTrips, groupKey).forEach(logicalGroup => {
      groupedTrips.set(logicalGroup.logicalGroupKey, logicalGroup.trips);
    });
  });

  groupedTrips.forEach((groupTrips, groupKey) => {
    if (groupTrips.length < 2) return;

    const sortedTrips = [...groupTrips].sort((leftTrip, rightTrip) => leftTrip.pickupSortValue - rightTrip.pickupSortValue || leftTrip.id.localeCompare(rightTrip.id));
    const sameDirectionRouteGroups = new Map();
    const firstTrip = sortedTrips[0];
    const lastTrip = sortedTrips[sortedTrips.length - 1];
    const reverseLooksCorrect = hasSameLocation(firstTrip?.address, lastTrip?.destination) && hasSameLocation(firstTrip?.destination, lastTrip?.address);
    const repeatedPickup = hasSameLocation(firstTrip?.address, lastTrip?.address);
    const repeatedDestination = hasSameLocation(firstTrip?.destination, lastTrip?.destination);
    const closeReturnAddressMismatch = !hasSameLocation(firstTrip?.destination, lastTrip?.address) && hasSimilarLocation(firstTrip?.destination, lastTrip?.address);
    const chainedRoute = sortedTrips.every((trip, index) => index === 0 || hasSameLocation(sortedTrips[index - 1]?.destination, trip?.address));

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

    sortedTrips.forEach(trip => {
      const routeKey = [normalizeScanText(trip?.address), normalizeScanText(trip?.destination)].filter(Boolean).join('=>');
      if (!routeKey) return;
      sameDirectionRouteGroups.set(routeKey, [...(sameDirectionRouteGroups.get(routeKey) ?? []), trip]);
    });

    sameDirectionRouteGroups.forEach(repeatedDirectionTrips => {
      if (repeatedDirectionTrips.length < 2) return;
      const sampleTrip = repeatedDirectionTrips[0];
      findings.push(buildTripImportFinding({
        severity: 'blocking',
        code: 'same-direction-repeated',
        title: 'Same direction repeated instead of returning',
        detail: `This trip group repeats the same route from "${sampleTrip?.address || '-'}" to "${sampleTrip?.destination || '-'}" more than once. That usually means the home-bound leg stayed in the same direction instead of being reversed.`,
        trips: repeatedDirectionTrips,
        groupKey
      }));
    });

    if (closeReturnAddressMismatch) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'near-match-address-change',
        title: 'Linked legs almost match but one address changed',
        detail: `The return leg nearly matches the outbound destination, but the exact address changed from "${firstTrip?.destination || ''}" to "${lastTrip?.address || ''}".`,
        trips: sortedTrips,
        groupKey
      }));
      return;
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

    if (chainedRoute && !reverseLooksCorrect) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'chained-route',
        title: 'Linked legs form a chained route, not a return',
        detail: 'This SafeRide group continues from one stop to the next, but it does not come back to the original pickup address.',
        trips: sortedTrips,
        groupKey
      }));
      return;
    }

    if (!reverseLooksCorrect) {
      findings.push(buildTripImportFinding({
        severity: 'warning',
        code: 'route-mismatch',
        title: 'Possible reversed or mismatched addresses',
        detail: 'This trip group does not reverse cleanly. Review pickup and destination because one or more legs may be flipped before import.',
        trips: sortedTrips,
        groupKey
      }));
    }
  });

  annotatedTrips.forEach(trip => {
    const tripId = String(trip?.id || '').trim();
    const currentTrip = sourceTripMap.get(tripId);
    const currentLabelCategory = getLegLabelScanCategory(currentTrip?.legLabel);
    const expectedLabelCategory = getLegLabelScanCategory(annotatedTripMap.get(tripId)?.legLabel);
    if (!currentLabelCategory || !expectedLabelCategory || currentLabelCategory === expectedLabelCategory) return;

    findings.push(buildTripImportFinding({
      severity: expectedLabelCategory === 'outbound' || expectedLabelCategory === 'return' ? 'blocking' : 'warning',
      code: 'leg-label-mismatch',
      title: 'System leg label does not match route direction',
      detail: `${trip.rider || 'This rider'} is currently labeled as "${String(currentTrip?.legLabel || '-').trim() || '-'}", but the route pattern matches "${annotatedTripMap.get(tripId)?.legLabel || '-'}".`,
      trips: [currentTrip || trip],
      groupKey: String(trip?.scanRootGroupKey || trip?.groupedTripKey || buildImportedTripGroupKey(trip) || '')
    }));
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

const mapRowToTrip = (row, index, template) => {
  const rawPickupTime = getValueByAliases(row, getTemplateAliases(template, 'pickupTime')) || getValueByAliases(row, getTemplateAliases(template, 'pickup'));
  const rawDropoffTime = getValueByAliases(row, getTemplateAliases(template, 'appointmentTime')) || getValueByAliases(row, getTemplateAliases(template, 'dropoff'));
  const rider = getRiderName(row, index, template);
  const pickup = formatSafeRideTime(rawPickupTime);
  const dropoff = formatSafeRideTime(rawDropoffTime);
  const rawAddress = getValueByAliases(row, getTemplateAliases(template, 'fromAddress')) || getValueByAliases(row, getTemplateAliases(template, 'address')) || 'Address pending';
  const rawDestination = getValueByAliases(row, getTemplateAliases(template, 'toAddress')) || getValueByAliases(row, getTemplateAliases(template, 'destination')) || '';
  const {
    address,
    zipcode: fromZipcode
  } = splitAddressAndZipcode(rawAddress, getValueByAliases(row, getTemplateAliases(template, 'fromZipcode')));
  const {
    address: destination,
    zipcode: toZipcode
  } = splitAddressAndZipcode(rawDestination, getValueByAliases(row, getTemplateAliases(template, 'toZipcode')));
  const rideId = getValueByAliases(row, getTemplateAliases(template, 'id')) || '';
  const tripId = getValueByAliases(row, getTemplateAliases(template, 'brokerTripId'));
  const status = getValueByAliases(row, getTemplateAliases(template, 'status')) || 'Scheduled';
  const confirmationStatus = getValueByAliases(row, getTemplateAliases(template, 'confirmationStatus')) || 'confirmed';
  const serviceDate = getImportedServiceDate(row, rawPickupTime, rawDropoffTime, template);
  const tripStatus = getImportedTripStatus(status, confirmationStatus);
  const position = [getCoordinate(row, 'lat', index, template), getCoordinate(row, 'lng', index, template)];
  const destinationPosition = [getDestinationCoordinate(row, 'lat', index, template), getDestinationCoordinate(row, 'lng', index, template)];
  const providedMiles = getValueByAliases(row, getTemplateAliases(template, 'miles'));
  const scheduledPickup = getValueByAliases(row, getTemplateAliases(template, 'scheduledPickup')) || rawPickupTime;
  const actualPickup = getValueByAliases(row, getTemplateAliases(template, 'actualPickup'));
  const scheduledDropoff = getValueByAliases(row, getTemplateAliases(template, 'scheduledDropoff')) || rawDropoffTime;
  const actualDropoff = getValueByAliases(row, getTemplateAliases(template, 'actualDropoff'));
  const importedDelay = getValueByAliases(row, getTemplateAliases(template, 'delay')) || getValueByAliases(row, getTemplateAliases(template, 'lateMinutes'));
  const avgDelay = getValueByAliases(row, getTemplateAliases(template, 'avgDelay'));
  const tripDraft = {
    scheduledPickup,
    actualPickup,
    scheduledDropoff,
    actualDropoff,
    delay: importedDelay,
    avgDelay,
    onTimeStatus: getValueByAliases(row, getTemplateAliases(template, 'onTimeStatus')),
    late: getValueByAliases(row, getTemplateAliases(template, 'lateFlag')),
    delayed: getValueByAliases(row, getTemplateAliases(template, 'delayedFlag'))
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
  const excelLoaderSnapshot = {
    source: 'Excel Loader',
    templateLabel: template.label,
    rowNumber: index + 1,
    rideId,
    brokerTripId: tripId,
    rider,
    pickup,
    dropoff,
    rawPickupTime,
    rawDropoffTime,
    address,
    destination,
    fromZipcode,
    toZipcode,
    safeRideStatus: status,
    confirmationStatus,
    tripType: getValueByAliases(row, getTemplateAliases(template, 'tripType')),
    patientPhoneNumber: getValueByAliases(row, getTemplateAliases(template, 'patientPhoneNumber')),
    vehicleType: getValueByAliases(row, getTemplateAliases(template, 'vehicleType'))
  };

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
    fromZipcode,
    toZipcode,
    patientPhoneNumber: getValueByAliases(row, getTemplateAliases(template, 'patientPhoneNumber')),
    assistanceNeeds: getValueByAliases(row, getTemplateAliases(template, 'assistanceNeeds')),
    notes: getValueByAliases(row, getTemplateAliases(template, 'notes')),
    vehicleType: getValueByAliases(row, getTemplateAliases(template, 'vehicleType')),
    tripType: getValueByAliases(row, getTemplateAliases(template, 'tripType')),
    miles: providedMiles || getDistanceMiles(position, destinationPosition),
    safeRideStatus: status,
    confirmationStatus,
    source: 'SafeRide',
    status: tripStatus,
    serviceDate,
    driverId: null,
    routeId: null,
    importedDriverName: getValueByAliases(row, getTemplateAliases(template, 'driverName')),
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
    destinationPosition,
    excelLoaderSnapshot,
    importTemplateId: template.id,
    importTemplateLabel: template.label
  };
};

export const parseTripImportBuffer = arrayBuffer => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const template = detectImportTemplate(rows);
  const filePreview = buildImportFilePreview(rows);
  const importMapping = getTemplateImportMapping(template, filePreview.columns);
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      trips: [],
      serviceDateKeys: [],
      scan: analyzeImportedTrips([]),
      filePreview,
      importMapping,
      template: {
        id: template.id,
        label: template.label,
        description: template.description
      }
    };
  }
  const trips = annotateSafeRideTrips(rows.map((row, index) => mapRowToTrip(row, index, template)).filter(trip => trip.id && trip.rider && trip.address));
  return {
    trips,
    serviceDateKeys: Array.from(new Set(trips.map(trip => getTripServiceDateKey(trip)).filter(Boolean))).sort(),
    scan: analyzeImportedTrips(trips),
    filePreview,
    importMapping,
    template: {
      id: template.id,
      label: template.label,
      description: template.description
    }
  };
};

export const parseTripImportFile = async file => {
  const arrayBuffer = await file.arrayBuffer();
  return parseTripImportBuffer(arrayBuffer);
};