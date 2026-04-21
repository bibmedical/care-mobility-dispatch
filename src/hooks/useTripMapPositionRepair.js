import { getTripDropoffPosition, getTripPickupPosition, isLikelyUsCoordinate } from '@/helpers/nemt-dispatch-state';
import { useEffect, useMemo, useRef, useState } from 'react';

const buildTripAddressQuery = (address, zipcode) => [String(address || '').trim(), String(zipcode || '').trim()].filter(Boolean).join(', ');

const getTripRepairKey = trip => String(trip?.id || '').trim();

const readRepairEntry = (repairsByTripId, tripId) => repairsByTripId && tripId ? repairsByTripId[tripId] || {} : {};

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

    const lookupJobs = [];

    for (const trip of scopedTrips) {
      const tripId = getTripRepairKey(trip);
      if (!tripId) continue;

      const repairEntry = readRepairEntry(repairsByTripId, tripId);
      const pickupQuery = buildTripAddressQuery(trip?.address, trip?.fromZipcode);
      const dropoffQuery = buildTripAddressQuery(trip?.destination, trip?.toZipcode);

      if (pickupQuery && !repairEntry.pickupAttempted) {
        lookupJobs.push({ tripId, kind: 'pickup', query: pickupQuery });
      }

      if (dropoffQuery && !repairEntry.dropoffAttempted) {
        lookupJobs.push({ tripId, kind: 'dropoff', query: dropoffQuery });
      }
    }

    if (lookupJobs.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.all(lookupJobs.map(async job => {
      const resolvedPosition = await resolveAddress(job.query);

      if (cancelled) return;

      setRepairsByTripId(current => {
        const previousEntry = current[job.tripId] || {};
        const nextPosition = isLikelyUsCoordinate(resolvedPosition) ? resolvedPosition : null;
        const nextEntry = job.kind === 'pickup'
          ? {
              ...previousEntry,
              pickup: nextPosition,
              pickupAttempted: true
            }
          : {
              ...previousEntry,
              dropoff: nextPosition,
              dropoffAttempted: true
            };

        if (
          previousEntry.pickup === nextEntry.pickup
          && previousEntry.dropoff === nextEntry.dropoff
          && previousEntry.pickupAttempted === nextEntry.pickupAttempted
          && previousEntry.dropoffAttempted === nextEntry.dropoffAttempted
        ) {
          return current;
        }

        return {
          ...current,
          [job.tripId]: nextEntry
        };
      });
    }));

    return () => {
      cancelled = true;
    };
  }, [repairsByTripId, scopedTrips]);

  const getTripPickupMapPosition = trip => {
    const tripId = getTripRepairKey(trip);
    const repairedPickup = repairsByTripId[tripId]?.pickup;
    if (isLikelyUsCoordinate(repairedPickup)) return repairedPickup;

    const pickupPosition = getTripPickupPosition(trip);
    if (isLikelyUsCoordinate(pickupPosition)) return pickupPosition;

    return null;
  };

  const getTripDropoffMapPosition = trip => {
    const tripId = getTripRepairKey(trip);
    const repairedEntry = repairsByTripId[tripId];
    if (isLikelyUsCoordinate(repairedEntry?.dropoff)) return repairedEntry.dropoff;
    if (isLikelyUsCoordinate(repairedEntry?.pickup)) return repairedEntry.pickup;

    const dropoffPosition = getTripDropoffPosition(trip);
    if (isLikelyUsCoordinate(dropoffPosition)) return dropoffPosition;

    return null;
  };

  return {
    getTripPickupMapPosition,
    getTripDropoffMapPosition
  };
}