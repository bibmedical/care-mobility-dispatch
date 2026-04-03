import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { DriverTrip } from '../../types/driver';

export const formatCoordinate = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return value.toFixed(5);
};

export const formatShortClock = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export const getTripWindow = (trip: DriverTrip) => {
  const pickup = trip.scheduledPickup || trip.pickup || '--';
  const dropoff = trip.scheduledDropoff || trip.dropoff || '--';
  return `${pickup} -> ${dropoff}`;
};

export const getTripTone = (variant?: string) => {
  if (variant === 'danger') return '#ffe0dc';
  if (variant === 'success') return '#d8f1e3';
  return '#dfe8ec';
};

export const getTrackingTone = (runtime: DriverRuntime) => {
  if (runtime.backgroundTrackingError) return '#ffe0dc';
  if (runtime.isBackgroundTrackingEnabled) return '#d6f3e6';
  if (runtime.trackingEnabled) return '#fff0c7';
  return '#dce5ea';
};

export const getTrackingLabel = (runtime: DriverRuntime) => {
  if (runtime.backgroundTrackingError) return 'Needs background permission';
  if (runtime.isManagingBackgroundTracking) return 'Starting background GPS';
  if (runtime.isBackgroundTrackingEnabled) return 'Background GPS active';
  if (runtime.trackingEnabled) return 'Foreground GPS only';
  return 'Tracking off';
};