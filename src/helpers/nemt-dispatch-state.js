import { normalizePrintSetup } from '@/helpers/nemt-print-setup';

const DEFAULT_CENTER = [28.5383, -81.3792];
const DEFAULT_ASSISTANT_AVATAR_IMAGE = '/WhatsApp%20Image%202026-03-28%20at%2011.58.52%20PM.jpeg';

const normalizeTextValue = value => String(value ?? '').trim();

const padDatePart = value => String(value).padStart(2, '0');

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
  return `${parsedDate.getFullYear()}-${padDatePart(parsedDate.getMonth() + 1)}-${padDatePart(parsedDate.getDate())}`;
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

export const getRouteServiceDateKey = (routePlan, trips = []) => {
  const explicitRouteDate = normalizeTripDateInput(routePlan?.serviceDate || routePlan?.routeDate || routePlan?.date);
  if (explicitRouteDate) return explicitRouteDate;

  const routeTripIds = Array.isArray(routePlan?.tripIds) ? routePlan.tripIds : [];
  const firstRouteTrip = routeTripIds.map(tripId => (Array.isArray(trips) ? trips : []).find(trip => trip.id === tripId)).find(Boolean);
  return getTripServiceDateKey(firstRouteTrip);
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

export const DISPATCH_TRIP_COLUMN_OPTIONS = [{
  key: 'trip',
  label: 'Trip / Ride'
}, {
  key: 'status',
  label: 'Status'
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
  key: 'destination',
  label: 'DO Address'
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
  key: 'leg',
  label: 'Leg'
}, {
  key: 'punctuality',
  label: 'Punctuality'
}, {
  key: 'lateMinutes',
  label: 'Late Min'
}];

export const DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS = ['trip', 'status', 'driver', 'pickup', 'dropoff', 'punctuality', 'lateMinutes', 'rider', 'address', 'destination', 'miles'];

export const normalizeMapProviderPreference = value => {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  return ['auto', 'openstreetmap', 'mapbox'].includes(normalized) ? normalized : 'auto';
};

export const normalizeDispatcherVisibleTripColumns = value => {
  const allowedKeys = new Set(DISPATCH_TRIP_COLUMN_OPTIONS.map(option => option.key));
  const cleanedColumns = Array.isArray(value) ? value.filter(columnKey => allowedKeys.has(columnKey)) : [];
  const requiredColumns = ['address', 'destination', 'miles'];
  const uniqueColumns = Array.from(new Set([...cleanedColumns, ...requiredColumns]));
  return uniqueColumns.length > 0 ? uniqueColumns : [...DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS];
};

export const normalizeNemtUiPreferences = value => ({
  dispatcherVisibleTripColumns: normalizeDispatcherVisibleTripColumns(value?.dispatcherVisibleTripColumns),
  mapProvider: normalizeMapProviderPreference(value?.mapProvider),
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
    delay,
    avgDelay,
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

export const normalizePersistentDispatchState = value => ({
  version: 1,
  trips: normalizeTripRecords(value?.trips),
  routePlans: Array.isArray(value?.routePlans) ? value.routePlans.map(normalizeRoutePlanRecord) : [],
  uiPreferences: normalizeNemtUiPreferences(value?.uiPreferences)
});
