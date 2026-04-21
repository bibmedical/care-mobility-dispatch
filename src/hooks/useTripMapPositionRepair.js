import { getTripDropoffPosition, getTripPickupPosition, isLikelyUsCoordinate } from '@/helpers/nemt-dispatch-state';
import { useEffect, useMemo, useRef, useState } from 'react';

const buildTripAddressQuery = (address, zipcode) => [String(address || '').trim(), String(zipcode || '').trim()].filter(Boolean).join(', ');

const getTripRepairKey = trip => String(trip?.id || '').trim();

const dedupeTrips = trips => {
  const seen = new Set();
  return (Array.isArray(trips) ? trips : []).filter(trip => {
    const tripKey = getTripRepairKey(trip);
    if (!tripKey || seen.has(tripKey)) return false;
    seen.add(tripKey);
    return true;
  });
};

export default function useTripMapPositionRepair(trips) {
  const [repairsByTripId, setRepairsByTripId] = useState({});
  const queryCacheRef = useRef(new Map());
  const scopedTrips = useMemo(() => dedupeTrips(trips), [trips]);

  useEffect(() => {
    let cancelled = false;

    const resolveAddress = async query => {
      const normalizedQuery = String(query || '').trim();
      if (!normalizedQuery) return null;

      if (!queryCacheRef.current.has(normalizedQuery)) {
        queryCacheRef.current.set(normalizedQuery, fetch(`/api/maps/search?q=${encodeURIComponent(normalizedQuery)}`, {
          cache: 'no-store'
        }).then(async response => {
          if (!response.ok) return null;
          const payload = await response.json();
          return isLikelyUsCoordinate(payload?.coordinates) ? payload.coordinates : null;
        }).catch(() => null));
      }

      return queryCacheRef.current.get(normalizedQuery);
    };

    void Promise.all(scopedTrips.map(async trip => {
      const tripId = getTripRepairKey(trip);
      if (!tripId) return;

      const pickupPosition = getTripPickupPosition(trip);
      const dropoffPosition = getTripDropoffPosition(trip);
      const needsPickupRepair = !isLikelyUsCoordinate(pickupPosition);
      const needsDropoffRepair = !isLikelyUsCoordinate(dropoffPosition);
      if (!needsPickupRepair && !needsDropoffRepair) return;

      const pickupQuery = needsPickupRepair ? buildTripAddressQuery(trip?.address, trip?.fromZipcode) : '';
      const dropoffQuery = needsDropoffRepair ? buildTripAddressQuery(trip?.destination, trip?.toZipcode) : '';
      if (!pickupQuery && !dropoffQuery) return;

      const [resolvedPickup, resolvedDropoff] = await Promise.all([
        pickupQuery ? resolveAddress(pickupQuery) : pickupPosition,
        dropoffQuery ? resolveAddress(dropoffQuery) : dropoffPosition
      ]);

      if (cancelled) return;

      setRepairsByTripId(current => {
        const nextPickup = isLikelyUsCoordinate(resolvedPickup) ? resolvedPickup : null;
        const nextDropoff = isLikelyUsCoordinate(resolvedDropoff) ? resolvedDropoff : nextPickup;
        const previousEntry = current[tripId];
        if (previousEntry?.pickup === nextPickup && previousEntry?.dropoff === nextDropoff) {
          return current;
        }
        return {
          ...current,
          [tripId]: {
            pickup: nextPickup,
            dropoff: nextDropoff
          }
        };
      });
    }));

    return () => {
      cancelled = true;
    };
  }, [scopedTrips]);

  const getTripPickupMapPosition = trip => {
    const pickupPosition = getTripPickupPosition(trip);
    if (isLikelyUsCoordinate(pickupPosition)) return pickupPosition;
    return repairsByTripId[getTripRepairKey(trip)]?.pickup || null;
  };

  const getTripDropoffMapPosition = trip => {
    const dropoffPosition = getTripDropoffPosition(trip);
    if (isLikelyUsCoordinate(dropoffPosition)) return dropoffPosition;
    const repairedEntry = repairsByTripId[getTripRepairKey(trip)];
    return repairedEntry?.dropoff || repairedEntry?.pickup || null;
  };

  return {
    getTripPickupMapPosition,
    getTripDropoffMapPosition
  };
}