import { getVehicleCapabilityTokens } from '@/helpers/nemt-admin-model';
import { getTripMobilityMessageLabel, getTripRequiredCapabilityPrefixes } from '@/helpers/nemt-dispatch-state';

const stripCapabilityCount = token => String(token || '').trim().replace(/\d+$/, '');

export const findTripAssignmentCompatibilityIssue = ({ driver, tripIds, trips, adminDriversById, adminVehiclesById }) => {
  const normalizedTripIds = Array.isArray(tripIds) ? tripIds.map(tripId => String(tripId || '').trim()).filter(Boolean) : [];
  const normalizedDriverId = String(driver?.id || '').trim();
  const adminDriver = normalizedDriverId ? adminDriversById?.get?.(normalizedDriverId) || null : null;
  const resolvedDriver = driver || adminDriver;
  if (!resolvedDriver || normalizedTripIds.length === 0) return null;

  const adminVehicle = adminDriver?.vehicleId ? adminVehiclesById?.get?.(String(adminDriver.vehicleId || '').trim()) || null : null;
  const capabilityPrefixes = new Set(getVehicleCapabilityTokens(adminVehicle).map(stripCapabilityCount).filter(Boolean));
  if (capabilityPrefixes.size === 0) return null;

  const tripLookup = new Map((Array.isArray(trips) ? trips : []).map(trip => [String(trip?.id || '').trim(), trip]));
  for (const tripId of normalizedTripIds) {
    const trip = tripLookup.get(tripId);
    if (!trip) continue;
    const requiredCapabilityPrefixes = getTripRequiredCapabilityPrefixes(trip);
    if (requiredCapabilityPrefixes.length === 0) continue;
    if (requiredCapabilityPrefixes.some(prefix => capabilityPrefixes.has(prefix))) continue;
    const driverName = String(resolvedDriver?.name || resolvedDriver?.displayName || resolvedDriver?.username || 'This driver').trim() || 'This driver';
    return {
      tripId,
      message: `${driverName} is not ${getTripMobilityMessageLabel(trip)}-capable.`
    };
  }

  return null;
};