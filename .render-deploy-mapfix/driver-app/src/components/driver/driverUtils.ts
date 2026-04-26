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

export const formatTripClockValue = (value?: string | number | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '--';

  // Preserve already formatted values like "7:40 AM" or "07:40".
  if (/\d{1,2}:\d{2}/.test(raw) || /\b(am|pm)\b/i.test(raw) || /^tbd$/i.test(raw)) {
    return raw;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;

  // SafeRide imports may carry Excel date serials (e.g. 46116.26875); time is in the fractional part.
  const dayFraction = Math.abs(numeric % 1);
  const totalMinutes = Math.round(dayFraction * 24 * 60) % (24 * 60);
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
};

export const getTripWindow = (trip: DriverTrip) => {
  const pickup = formatTripClockValue(trip.scheduledPickup || trip.pickup || '--');
  const dropoff = formatTripClockValue(trip.scheduledDropoff || trip.dropoff || '--');
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