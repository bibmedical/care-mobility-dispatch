const DEFAULT_CENTER = [28.5383, -81.3792];

const normalizeTextValue = value => String(value ?? '').trim();

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
}];

export const DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS = ['trip', 'status', 'driver', 'pickup', 'dropoff', 'rider', 'address', 'destination', 'miles'];

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
  mapProvider: normalizeMapProviderPreference(value?.mapProvider)
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

export const normalizeTripRecord = trip => {
  const position = Array.isArray(trip?.position) && trip.position.length === 2 ? trip.position.map(Number) : [...DEFAULT_CENTER];
  const destinationPosition = Array.isArray(trip?.destinationPosition) && trip.destinationPosition.length === 2 ? trip.destinationPosition.map(Number) : [...position];
  const rider = getDerivedRiderName(trip);
  const rideId = getDerivedRideId(trip);
  return {
    ...trip,
    rider,
    rideId,
    position,
    destinationPosition,
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
  tripIds: Array.isArray(routePlan?.tripIds) ? routePlan.tripIds.filter(Boolean) : []
});

export const normalizePersistentDispatchState = value => ({
  version: 1,
  trips: normalizeTripRecords(value?.trips),
  routePlans: Array.isArray(value?.routePlans) ? value.routePlans.map(normalizeRoutePlanRecord) : [],
  uiPreferences: normalizeNemtUiPreferences(value?.uiPreferences)
});
