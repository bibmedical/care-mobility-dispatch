const DEFAULT_CENTER = [28.5383, -81.3792];

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

export const DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS = ['trip', 'status', 'driver', 'pickup', 'dropoff', 'rider', 'address'];

export const normalizeDispatcherVisibleTripColumns = value => {
  const allowedKeys = new Set(DISPATCH_TRIP_COLUMN_OPTIONS.map(option => option.key));
  const cleanedColumns = Array.isArray(value) ? value.filter(columnKey => allowedKeys.has(columnKey)) : [];
  const uniqueColumns = Array.from(new Set(cleanedColumns));
  return uniqueColumns.length > 0 ? uniqueColumns : [...DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS];
};

export const normalizeNemtUiPreferences = value => ({
  dispatcherVisibleTripColumns: normalizeDispatcherVisibleTripColumns(value?.dispatcherVisibleTripColumns)
});

export const normalizeTripRecord = trip => {
  const position = Array.isArray(trip?.position) && trip.position.length === 2 ? trip.position.map(Number) : [...DEFAULT_CENTER];
  const destinationPosition = Array.isArray(trip?.destinationPosition) && trip.destinationPosition.length === 2 ? trip.destinationPosition.map(Number) : [...position];
  return {
    ...trip,
    position,
    destinationPosition
  };
};

export const normalizeRoutePlanRecord = routePlan => ({
  ...routePlan,
  tripIds: Array.isArray(routePlan?.tripIds) ? routePlan.tripIds.filter(Boolean) : []
});

export const normalizePersistentDispatchState = value => ({
  version: 1,
  trips: Array.isArray(value?.trips) ? value.trips.map(normalizeTripRecord) : [],
  routePlans: Array.isArray(value?.routePlans) ? value.routePlans.map(normalizeRoutePlanRecord) : [],
  uiPreferences: normalizeNemtUiPreferences(value?.uiPreferences)
});
