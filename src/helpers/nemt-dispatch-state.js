import { normalizePrintSetup } from '@/helpers/nemt-print-setup';

const DEFAULT_CENTER = [28.5383, -81.3792];
const DEFAULT_ASSISTANT_AVATAR_IMAGE = '/fmg-login-logo.png';
export const DEFAULT_DISPATCH_TIME_ZONE = 'America/New_York';

const normalizeTextValue = value => String(value ?? '').trim();
const TRIP_MOBILITY_SOURCE_FIELDS = ['mobilityType', 'mobility', 'vehicleType', 'assistanceNeeds', 'tripType', 'serviceType', 'levelOfService', 'serviceLevel', 'los', 'transportType', 'tripMode', 'vehicleRequired'];
const TRIP_MOBILITY_EXPLICIT_SOURCE_FIELDS = ['mobilityType', 'mobility', 'vehicleType', 'tripType', 'serviceType', 'levelOfService', 'serviceLevel', 'los', 'transportType', 'tripMode', 'vehicleRequired'];
const TRIP_MOBILITY_ASSISTANCE_SOURCE_FIELDS = ['assistanceNeeds'];

const padDatePart = value => String(value).padStart(2, '0');

const isValidTimeZone = timeZone => {
  const normalized = String(timeZone || '').trim();
  if (!normalized) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const normalizeDispatchTimeZonePreference = value => {
  const normalized = String(value || '').trim();
  return isValidTimeZone(normalized) ? normalized : DEFAULT_DISPATCH_TIME_ZONE;
};

const getDatePartsInTimeZone = (input = new Date(), timeZone = DEFAULT_DISPATCH_TIME_ZONE) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeDispatchTimeZonePreference(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return { year, month, day };
};

export const getLocalDateKey = (input = new Date(), timeZone = DEFAULT_DISPATCH_TIME_ZONE) => {
  const parts = getDatePartsInTimeZone(input, timeZone);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const formatDispatchTime = (value, timeZone = DEFAULT_DISPATCH_TIME_ZONE) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-US', {
    timeZone: normalizeDispatchTimeZonePreference(timeZone),
    hour: '2-digit',
    minute: '2-digit'
  });
};

const normalizeTripDateInput = value => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const month = padDatePart(slashMatch[1]);
    const day = padDatePart(slashMatch[2]);
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) return '';
  return `${parsedDate.getFullYear()}-${padDatePart(parsedDate.getMonth() + 1)}-${padDatePart(parsedDate.getDate())}`;
};

const normalizeTimestampToDateKey = value => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) return '';
  const parts = getDatePartsInTimeZone(parsedDate, DEFAULT_DISPATCH_TIME_ZONE);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getTripServiceDateKey = trip => {
  const dateCandidates = [
    trip?.serviceDate,
    trip?.dateOfService,
    trip?.pickupDate,
    trip?.appointmentDate,
    trip?.tripDate,
    trip?.scheduledDate,
    trip?.requestedDate,
    trip?.date,
    trip?.dos,
    trip?.service_day,
    trip?.service_day_date,
    trip?.rawDate,
    trip?.rawServiceDate,
    trip?.createdForDate,
    trip?.scheduleDate
  ];

  const explicitDate = dateCandidates.map(normalizeTripDateInput).find(Boolean);
  if (explicitDate) return explicitDate;

  return normalizeTimestampToDateKey(trip?.pickupSortValue) || normalizeTimestampToDateKey(trip?.dropoffSortValue) || normalizeTimestampToDateKey(trip?.confirmation?.sentAt) || '';
};

const getTripMobilitySource = (trip, fields = TRIP_MOBILITY_SOURCE_FIELDS) => fields.map(field => String(trip?.[field] || '').trim()).filter(Boolean).join(' ').toLowerCase();

const normalizeMobilitySource = source => source.replace(/provide\s+wheelchair/gi, ' ').replace(/wheelchair\s+provided/gi, ' ').replace(/needs?\s+wheelchair/gi, ' ').replace(/wheelchair\s+needed/gi, ' ').replace(/requires?\s+wheelchair/gi, ' ').replace(/wheelchair\s+required/gi, ' ').replace(/\s+/g, ' ').trim();

const detectTripMobilityLabelFromSource = source => {
  const normalizedSource = normalizeMobilitySource(String(source || '').toLowerCase());
  if (!normalizedSource) return '';
  if (normalizedSource.includes('stretcher') || normalizedSource.includes('gurney') || normalizedSource.includes('str')) return 'STR';
  if (normalizedSource.includes('wheelchair') || normalizedSource.includes('wheel chair') || normalizedSource.includes('wheel') || normalizedSource.includes('wc') || normalizedSource.includes('w/c') || normalizedSource.includes('wxl') || normalizedSource.includes('electric wheelchair') || normalizedSource.includes('power wheelchair') || normalizedSource.includes('ew')) return 'W';
  return 'A';
};

export const getTripMobilityLabel = trip => {
  const explicitSource = getTripMobilitySource(trip, TRIP_MOBILITY_EXPLICIT_SOURCE_FIELDS);
  if (explicitSource) {
    return detectTripMobilityLabelFromSource(explicitSource) || 'A';
  }

  const assistanceSource = getTripMobilitySource(trip, TRIP_MOBILITY_ASSISTANCE_SOURCE_FIELDS);
  return detectTripMobilityLabelFromSource(assistanceSource) || 'A';
};

export const getTripRequiredCapabilityPrefixes = trip => {
  const tripMobilityLabel = getTripMobilityLabel(trip);
  if (tripMobilityLabel === 'STR') return ['STR'];
  if (tripMobilityLabel === 'W') return ['W', 'WXL', 'EW'];
  return [];
};

export const getTripMobilityMessageLabel = trip => {
  const tripMobilityLabel = getTripMobilityLabel(trip);
  if (tripMobilityLabel === 'STR') return 'stretcher';
  if (tripMobilityLabel === 'W') return 'wheelchair';
  return 'ambulatory';
};

export const getRouteServiceDateKey = (routePlan, trips = []) => {
  const explicitRouteDate = normalizeTripDateInput(routePlan?.serviceDate || routePlan?.routeDate || routePlan?.date);
  if (explicitRouteDate) return explicitRouteDate;

  const routeTripIds = Array.isArray(routePlan?.tripIds) ? routePlan.tripIds : [];
  const firstRouteTrip = routeTripIds.map(tripId => (Array.isArray(trips) ? trips : []).find(trip => trip.id === tripId)).find(Boolean);
  return getTripServiceDateKey(firstRouteTrip);
};

export const getTripTimelineDateKey = (trip, routePlans = [], trips = []) => {
  const tripDate = getTripServiceDateKey(trip);
  if (tripDate) return tripDate;

  const routeId = String(trip?.routeId || '').trim();
  if (!routeId) return '';

  const linkedRoute = (Array.isArray(routePlans) ? routePlans : []).find(routePlan => String(routePlan?.id || '').trim() === routeId);
  return getRouteServiceDateKey(linkedRoute, trips);
};

export const isTripAssignedToDriver = (trip, driverId, includeSecondary = true) => {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return false;
  const primaryDriverId = String(trip?.driverId || '').trim();
  const secondaryDriverId = String(trip?.secondaryDriverId || '').trim();
  return includeSecondary ? primaryDriverId === normalizedDriverId || secondaryDriverId === normalizedDriverId : primaryDriverId === normalizedDriverId;
};

export const shiftTripDateKey = (dateKey, offsetDays) => {
  const normalized = normalizeTripDateInput(dateKey);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  const shiftedDate = new Date(year, month - 1, day + offsetDays);
  return `${shiftedDate.getFullYear()}-${padDatePart(shiftedDate.getMonth() + 1)}-${padDatePart(shiftedDate.getDate())}`;
};

export const formatTripDateLabel = dateKey => {
  const normalized = normalizeTripDateInput(dateKey);
  if (!normalized) return 'All dates';
  const [year, month, day] = normalized.split('-').map(Number);
  const displayDate = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(displayDate);
};

export const DEFAULT_ASSISTANT_AVATAR = {
  name: 'Balby',
  image: DEFAULT_ASSISTANT_AVATAR_IMAGE
};

const getFirstNonEmptyValue = (...values) => values.map(normalizeTextValue).find(Boolean) ?? '';

const getDerivedRiderName = trip => {
  const combinedPatientName = [trip?.patientFirstName, trip?.patientLastName].map(normalizeTextValue).filter(Boolean).join(' ').trim();
  return getFirstNonEmptyValue(trip?.rider, combinedPatientName, trip?.patientName, trip?.passengerName, trip?.riderName, trip?.memberName, trip?.clientName, trip?.name);
};

const getDerivedRideId = trip => {
  const explicitRideId = getFirstNonEmptyValue(trip?.rideId, trip?.riderId, trip?.memberId, trip?.tripId, trip?.tripNumber);
  if (explicitRideId) return explicitRideId;
  const normalizedId = normalizeTextValue(trip?.id);
  if (!normalizedId) return '';
  const [firstSegment] = normalizedId.split('-');
  return firstSegment || normalizedId;
};

const getTripAssistanceTokens = trip => {
  return Array.from(new Set([
    ...String(trip?.assistanceNeeds || '').split('|'),
    ...String(trip?.subMobilityType || '').split('|')
  ].map(normalizeTextValue).filter(Boolean)));
};

const findAssistanceToken = (tokens, patterns) => {
  return tokens.find(token => {
    const normalizedToken = token.toLowerCase();
    return patterns.some(pattern => normalizedToken === pattern || normalizedToken.includes(pattern));
  }) || '';
};

export const getTripSupportMetadata = trip => {
  const assistanceTokens = getTripAssistanceTokens(trip);
  const hasServiceAnimal = Boolean(findAssistanceToken(assistanceTokens, ['service animal', 'service dog']));
  const assistLevelToken = findAssistanceToken(assistanceTokens, ['room to door', 'door to door', 'curb to curb']);
  const mobilityToken = findAssistanceToken(assistanceTokens, ['wheelchair-power/electric', 'power wheelchair', 'standard manual wheelchair', 'manual wheelchair', 'folding wheelchair', 'stretcher/gurney', 'stretcher', 'gurney', 'scooter', 'walker', 'cane', 'none']);

  const mobilityType = mobilityToken
    ? mobilityToken.toLowerCase().includes('wheelchair-power/electric') || mobilityToken.toLowerCase().includes('power wheelchair')
      ? 'Power Wheelchair'
      : mobilityToken.toLowerCase().includes('standard manual wheelchair') || mobilityToken.toLowerCase() === 'manual wheelchair'
        ? 'Manual Wheelchair'
        : mobilityToken.toLowerCase().includes('folding wheelchair')
          ? 'Folding Wheelchair'
          : mobilityToken.toLowerCase().includes('stretcher') || mobilityToken.toLowerCase().includes('gurney')
            ? 'Stretcher/Gurney'
            : mobilityToken.toLowerCase().includes('scooter')
              ? 'Scooter'
              : mobilityToken.toLowerCase().includes('walker')
                ? 'Walker'
                : mobilityToken.toLowerCase().includes('cane')
                  ? 'Cane'
                  : mobilityToken.toLowerCase() === 'none'
                    ? 'None'
                    : mobilityToken
    : '';

  const assistLevel = assistLevelToken
    ? assistLevelToken.toLowerCase().includes('room to door')
      ? 'Room to Door'
      : assistLevelToken.toLowerCase().includes('door to door')
        ? 'Door to Door'
        : assistLevelToken.toLowerCase().includes('curb to curb')
          ? 'Curb to Curb'
          : assistLevelToken
    : '';

  return {
    assistanceTokens,
    hasServiceAnimal,
    mobilityType,
    assistLevel
  };
};

export const DISPATCH_TRIP_COLUMN_OPTIONS = [{
  key: 'trip',
  label: 'Trip / Ride'
}, {
  key: 'status',
  label: 'Status'
}, {
  key: 'confirmation',
  label: 'Confirmation'
}, {
  key: 'driver',
  label: 'Driver'
}, {
  key: 'pickup',
  label: 'PU'
}, {
  key: 'dropoff',
  label: 'DO'
}, {
  key: 'rider',
  label: 'Rider'
}, {
  key: 'address',
  label: 'PU Address'
}, {
  key: 'puZip',
  label: 'PU ZIP'
}, {
  key: 'destination',
  label: 'DO Address'
}, {
  key: 'doZip',
  label: 'DO ZIP'
}, {
  key: 'phone',
  label: 'Phone'
}, {
  key: 'miles',
  label: 'Miles'
}, {
  key: 'vehicle',
  label: 'Vehicle'
}, {
  key: 'mobility',
  label: 'Type'
}, {
  key: 'assistLevel',
  label: 'Assist'
}, {
  key: 'serviceAnimal',
  label: 'Animal'
}, {
  key: 'notes',
  label: 'Notes'
}, {
  key: 'leg',
  label: 'Leg'
}, {
  key: 'punctuality',
  label: 'Punctuality'
}, {
  key: 'lateMinutes',
  label: 'Late Minutes'
}];

const LEGACY_DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS = ['notes', 'miles', 'status', 'rider', 'address', 'destination'];
export const DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS = ['rider', 'pickup', 'dropoff', 'address', 'puZip', 'destination', 'doZip', 'phone', 'miles', 'status', 'notes'];

export const normalizeMapProviderPreference = value => {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  return ['auto', 'openstreetmap', 'mapbox'].includes(normalized) ? normalized : 'auto';
};

export const normalizeDispatcherVisibleTripColumns = value => {
  const allowedKeys = new Set(DISPATCH_TRIP_COLUMN_OPTIONS.map(option => option.key));
  const cleanedColumns = Array.isArray(value) ? value.filter(columnKey => allowedKeys.has(columnKey)) : [];
  const uniqueColumns = Array.from(new Set(cleanedColumns));
  if (uniqueColumns.length === LEGACY_DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS.length && uniqueColumns.every((columnKey, index) => columnKey === LEGACY_DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS[index])) {
    return [...DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS];
  }
  return uniqueColumns.length > 0 ? uniqueColumns : [...DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS];
};

export const normalizeNemtUiPreferences = value => ({
  dispatcherVisibleTripColumns: normalizeDispatcherVisibleTripColumns(value?.dispatcherVisibleTripColumns),
  mapProvider: normalizeMapProviderPreference(value?.mapProvider),
  timeZone: normalizeDispatchTimeZonePreference(value?.timeZone),
  printSetup: normalizePrintSetup(value?.printSetup)
});

const normalizeTripConfirmation = value => ({
  status: String(value?.status ?? 'Not Sent'),
  provider: String(value?.provider ?? ''),
  requestId: String(value?.requestId ?? ''),
  code: String(value?.code ?? ''),
  sentAt: String(value?.sentAt ?? ''),
  respondedAt: String(value?.respondedAt ?? ''),
  lastMessageId: String(value?.lastMessageId ?? ''),
  lastResponseText: String(value?.lastResponseText ?? ''),
  lastResponseCode: String(value?.lastResponseCode ?? ''),
  lastPhone: String(value?.lastPhone ?? ''),
  lastError: String(value?.lastError ?? '')
});

export const parseTripMinutesValue = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  const numericMatch = text.match(/-?\d+(?:\.\d+)?/);
  if (!numericMatch) return null;
  const parsed = Number(numericMatch[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseTripClockMinutes = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = String(match[3] ?? '').toLowerCase();
  if (suffix === 'pm' && hours < 12) hours += 12;
  if (suffix === 'am' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const normalizeTripBoolean = value => {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  return ['true', 'yes', 'y', '1', 'late', 'delayed'].includes(text);
};

export const getTripLateMinutes = trip => {
  const explicitLateMinutes = parseTripMinutesValue(trip?.lateMinutes);
  if (explicitLateMinutes != null && explicitLateMinutes > 0) return explicitLateMinutes;

  const explicitDelay = parseTripMinutesValue(trip?.delay) ?? parseTripMinutesValue(trip?.avgDelay);
  if (explicitDelay != null && explicitDelay > 0) return explicitDelay;

  const booleanLate = [trip?.late, trip?.delayed].some(normalizeTripBoolean);
  const onTimeStatus = normalizeTextValue(trip?.onTimeStatus).toLowerCase();
  if (booleanLate || onTimeStatus.includes('late') || onTimeStatus.includes('delay') || onTimeStatus.includes('tarde') || onTimeStatus.includes('retras')) {
    const pickupActual = parseTripClockMinutes(trip?.actualPickup);
    const pickupScheduled = parseTripClockMinutes(trip?.scheduledPickup);
    if (pickupActual != null && pickupScheduled != null && pickupActual > pickupScheduled) {
      return pickupActual - pickupScheduled;
    }

    const dropoffActual = parseTripClockMinutes(trip?.actualDropoff);
    const dropoffScheduled = parseTripClockMinutes(trip?.scheduledDropoff);
    if (dropoffActual != null && dropoffScheduled != null && dropoffActual > dropoffScheduled) {
      return dropoffActual - dropoffScheduled;
    }

    return 1;
  }

  const pickupActual = parseTripClockMinutes(trip?.actualPickup);
  const pickupScheduled = parseTripClockMinutes(trip?.scheduledPickup);
  if (pickupActual != null && pickupScheduled != null && pickupActual > pickupScheduled) {
    return pickupActual - pickupScheduled;
  }

  const dropoffActual = parseTripClockMinutes(trip?.actualDropoff);
  const dropoffScheduled = parseTripClockMinutes(trip?.scheduledDropoff);
  if (dropoffActual != null && dropoffScheduled != null && dropoffActual > dropoffScheduled) {
    return dropoffActual - dropoffScheduled;
  }

  return null;
};

export const getTripPunctualityLabel = trip => {
  const explicitStatus = normalizeTextValue(trip?.onTimeStatus);
  if (explicitStatus) return explicitStatus;
  const lateMinutes = getTripLateMinutes(trip);
  if (lateMinutes == null) return 'Pending';
  if (lateMinutes > 0) return 'Late';
  return 'On Time';
};

export const getTripPunctualityVariant = trip => {
  const label = getTripPunctualityLabel(trip).toLowerCase();
  if (label.includes('late') || label.includes('delay') || label.includes('tarde') || label.includes('retras')) return 'danger';
  if (label.includes('time') || label.includes('ontime') || label.includes('a tiempo') || label.includes('on time')) return 'success';
  return 'secondary';
};

export const getTripLateMinutesDisplay = trip => {
  const lateMinutes = getTripLateMinutes(trip);
  if (lateMinutes == null) return '-';
  return String(Math.round(lateMinutes));
};

export const normalizeTripRecord = trip => {
  const position = Array.isArray(trip?.position) && trip.position.length === 2 ? trip.position.map(Number) : [...DEFAULT_CENTER];
  const destinationPosition = Array.isArray(trip?.destinationPosition) && trip.destinationPosition.length === 2 ? trip.destinationPosition.map(Number) : [...position];
  const rider = getDerivedRiderName(trip);
  const rideId = getDerivedRideId(trip);
  const scheduledPickup = normalizeTextValue(trip?.scheduledPickup || trip?.rawPickupTime || trip?.pickup);
  const scheduledDropoff = normalizeTextValue(trip?.scheduledDropoff || trip?.rawDropoffTime || trip?.dropoff);
  const actualPickup = normalizeTextValue(trip?.actualPickup);
  const actualDropoff = normalizeTextValue(trip?.actualDropoff);
  const assistanceNeeds = normalizeTextValue(trip?.assistanceNeeds);
  const subMobilityType = normalizeTextValue(trip?.subMobilityType);
  const delay = trip?.delay ?? '';
  const avgDelay = trip?.avgDelay ?? '';
  const lateMinutes = getTripLateMinutes({
    ...trip,
    scheduledPickup,
    scheduledDropoff,
    actualPickup,
    actualDropoff,
    delay,
    avgDelay
  });
  const supportMetadata = getTripSupportMetadata({
    ...trip,
    assistanceNeeds,
    subMobilityType
  });
  return {
    ...trip,
    rider,
    rideId,
    position,
    destinationPosition,
    scheduledPickup,
    scheduledDropoff,
    actualPickup,
    actualDropoff,
    assistanceNeeds,
    subMobilityType,
    delay,
    avgDelay,
    hasServiceAnimal: supportMetadata.hasServiceAnimal,
    mobilityType: supportMetadata.mobilityType,
    assistLevel: supportMetadata.assistLevel,
    late: normalizeTripBoolean(trip?.late),
    delayed: normalizeTripBoolean(trip?.delayed),
    lateMinutes,
    onTimeStatus: normalizeTextValue(trip?.onTimeStatus || (lateMinutes == null ? 'Pending' : lateMinutes > 0 ? 'Late' : 'On Time')),
    confirmation: normalizeTripConfirmation(trip?.confirmation)
  };
};

export const normalizeTripRecords = trips => {
  const seenIds = new Map();

  return (Array.isArray(trips) ? trips : []).map((trip, index) => {
    const normalizedTrip = normalizeTripRecord(trip);
    const baseId = String(normalizedTrip?.id || normalizedTrip?.rideId || normalizedTrip?.brokerTripId || `trip-${index + 1}`).trim();
    const duplicateCount = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, duplicateCount + 1);

    return {
      ...normalizedTrip,
      id: duplicateCount === 0 ? baseId : `${baseId}-${duplicateCount + 1}`
    };
  });
};

export const normalizeRoutePlanRecord = routePlan => ({
  ...routePlan,
  serviceDate: normalizeTripDateInput(routePlan?.serviceDate || routePlan?.routeDate || routePlan?.date),
  tripIds: Array.isArray(routePlan?.tripIds) ? routePlan.tripIds.filter(Boolean) : []
});

export const normalizeDispatchMessageRecord = message => ({
  id: String(message?.id ?? `msg-${Date.now()}`),
  direction: String(message?.direction ?? 'incoming').trim() || 'incoming',
  text: String(message?.text ?? '').trim(),
  timestamp: String(message?.timestamp ?? new Date().toISOString()),
  status: String(message?.status ?? 'sent').trim() || 'sent',
  attachments: Array.isArray(message?.attachments) ? message.attachments.map(attachment => ({
    id: String(attachment?.id ?? `attachment-${Date.now()}`),
    kind: String(attachment?.kind ?? 'document').trim() || 'document',
    name: String(attachment?.name ?? '').trim(),
    mimeType: String(attachment?.mimeType ?? '').trim(),
    dataUrl: String(attachment?.dataUrl ?? '').trim()
  })) : []
});

export const normalizeDispatchThreadRecord = thread => ({
  driverId: String(thread?.driverId ?? '').trim(),
  messages: Array.isArray(thread?.messages) ? thread.messages.map(normalizeDispatchMessageRecord).filter(message => message.text || message.attachments.length > 0) : []
});

export const normalizeDailyDriverRecord = driver => ({
  id: String(driver?.id ?? `daily-${Date.now()}`),
  firstName: String(driver?.firstName ?? '').trim(),
  lastNameOrOrg: String(driver?.lastNameOrOrg ?? '').trim(),
  createdAt: String(driver?.createdAt ?? new Date().toISOString())
});

export const normalizeDispatchAuditRecord = entry => ({
  id: String(entry?.id ?? `audit-${Date.now()}`),
  action: String(entry?.action ?? 'update').trim() || 'update',
  entityType: String(entry?.entityType ?? 'dispatch').trim() || 'dispatch',
  entityId: String(entry?.entityId ?? '').trim(),
  actorId: String(entry?.actorId ?? '').trim(),
  actorName: String(entry?.actorName ?? '').trim(),
  source: String(entry?.source ?? 'web').trim() || 'web',
  timestamp: String(entry?.timestamp ?? new Date().toISOString()),
  summary: String(entry?.summary ?? '').trim(),
  metadata: typeof entry?.metadata === 'object' && entry?.metadata != null ? entry.metadata : {}
});

export const normalizePersistentDispatchState = value => ({
  version: 1,
  trips: normalizeTripRecords(value?.trips),
  routePlans: Array.isArray(value?.routePlans) ? value.routePlans.map(normalizeRoutePlanRecord) : [],
  dispatchThreads: Array.isArray(value?.dispatchThreads) ? value.dispatchThreads.map(normalizeDispatchThreadRecord).filter(thread => thread.driverId) : [],
  dailyDrivers: Array.isArray(value?.dailyDrivers) ? value.dailyDrivers.map(normalizeDailyDriverRecord).filter(driver => driver.id && driver.firstName) : [],
  auditLog: Array.isArray(value?.auditLog) ? value.auditLog.map(normalizeDispatchAuditRecord).filter(entry => entry.id && entry.action) : [],
  uiPreferences: normalizeNemtUiPreferences(value?.uiPreferences)
});
