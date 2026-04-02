'use client';

import { useNemtContext } from '@/context/useNemtContext';
import { parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { getMapTileConfig } from '@/utils/map-tiles';
import { divIcon } from 'leaflet';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';

const DEFAULT_CENTER = [28.5383, -81.3792];
const EMPTY_ITEMS = [];
const MAP_SCREEN_DASHBOARD_STATE_KEY = '__CARE_MOBILITY_MAP_SCREEN_DASHBOARD_STATE__';

const darkSidebarStyle = {
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(17, 24, 39, 0.98) 100%)',
  borderRight: '1px solid rgba(148, 163, 184, 0.18)',
  color: '#f8fafc'
};

const darkCardStyle = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  color: '#f8fafc'
};

const soloMapButtonStyle = {
  background: 'rgba(15,23,42,0.92)',
  borderColor: 'rgba(148,163,184,0.24)',
  color: '#f8fafc'
};

const soloMapActiveButtonStyle = {
  color: '#082f49',
  fontWeight: 700
};

const formatDriveMinutes = minutes => {
  if (!Number.isFinite(minutes)) return 'Time unavailable';
  const roundedMinutes = Math.max(1, Math.round(minutes));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const toRadians = value => value * (Math.PI / 180);

const getDistanceMiles = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return null;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatEta = miles => {
  if (miles == null) return 'ETA unavailable';
  const speedMph = 28;
  const minutes = Math.max(1, Math.round(miles / speedMph * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const estimateTravelMinutes = (from, to) => {
  const miles = getDistanceMiles(from, to);
  if (miles == null) return 0;
  return Math.max(4, Math.round(miles / 28 * 60));
};

const estimateTripServiceMinutes = trip => {
  const scheduledPickupMinutes = parseTripClockMinutes(trip?.scheduledPickup || trip?.pickup);
  const scheduledDropoffMinutes = parseTripClockMinutes(trip?.scheduledDropoff || trip?.dropoff);
  if (scheduledPickupMinutes != null && scheduledDropoffMinutes != null && scheduledDropoffMinutes >= scheduledPickupMinutes) {
    return Math.max(10, scheduledDropoffMinutes - scheduledPickupMinutes);
  }
  const miles = Number(trip?.miles);
  if (Number.isFinite(miles) && miles > 0) {
    return Math.max(12, Math.round(miles / 28 * 60) + 8);
  }
  return 18;
};

const formatSlackLabel = minutes => {
  if (!Number.isFinite(minutes)) return 'Sin calculo';
  if (minutes >= 0) return `${minutes} min libres`;
  return `${Math.abs(minutes)} min tarde`;
};

const getDisplayTripId = trip => {
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  if (brokerTripId) return brokerTripId;
  const tripId = String(trip?.id || '').trim();
  if (!tripId) return '';
  return tripId.split('-')[0] || tripId;
};

const getLegBadge = trip => {
  if (trip?.legVariant && trip?.legLabel) {
    return {
      variant: trip.legVariant,
      label: trip.legLabel
    };
  }
  return null;
};

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? trip?.destinationPosition ?? trip?.position : trip?.position;

const createRouteStopIcon = (label, variant = 'pickup', timeLabel = '', isLarge = false) => {
  const normalizedLabel = String(label || '').trim();
  let background = '#16a34a';

  if (normalizedLabel === '1') {
    background = '#16a34a';
  } else if (normalizedLabel === '2') {
    background = '#dc2626';
  } else if (variant === 'dropoff' || variant === 'destination') {
    background = '#dc2626';
  } else if (variant === 'pickup' || variant === 'origin') {
    background = '#16a34a';
  } else if (variant === 'driver') {
    background = '#2563eb';
  }

  const size = isLarge ? 60 : 32;
  const fontSize = isLarge ? '18px' : '13px';
  
  let html = '';
  if (isLarge && timeLabel) {
    // Show only time when large, omit the number
    html = `<div style="width:${size}px;height:${size}px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${background};border:2px solid white;box-shadow:0 8px 20px rgba(15,23,42,0.24);color:white;font-weight:bold;padding:4px;box-sizing:border-box;">
      <div style="font-size:12px;line-height:1.2;font-weight:normal;">${timeLabel}</div>
    </div>`;
  } else {
    html = `<div style="width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${background};border:2px solid white;box-shadow:0 8px 20px rgba(15,23,42,0.24);color:white;font-size:${fontSize};font-weight:bold;line-height:1;text-align:center;">${label}</div>`;
  }

  return divIcon({
    className: 'route-stop-icon-shell',
    html: html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 8)]
  });
};

const getDashboardRouteStyle = (isSelected, index) => {
  if (isSelected) {
    return {
      color: '#2563eb',
      weight: 6,
      opacity: 0.95
    };
  }

  const altColors = ['#f59e0b', '#a855f7', '#22c55e', '#ef4444'];
  const color = altColors[index % altColors.length];
  return {
    color,
    weight: 4,
    opacity: 0.85,
    dashArray: '14 10'
  };
};

const areStringArraysEqual = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const MapViewportController = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(points) || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 11, {
        animate: true
      });
      return;
    }
    map.fitBounds(points, {
      animate: true,
      padding: [48, 48]
    });
  }, [map, points]);

  return null;
};

const StandaloneMapResizer = ({ resizeKey }) => {
  const map = useMap();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [map, resizeKey]);

  return null;
};

const findLocation = async query => {
  const response = await fetch(`/api/maps/search?q=${encodeURIComponent(query)}`, {
    cache: 'no-store'
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Location not found.');
  }
  return payload;
};

const findRoute = async (coordinates, options = {}) => {
  const coordinateQuery = coordinates.map(([latitude, longitude]) => `${latitude},${longitude}`).join(';');
  const includeAlternatives = options.alternatives ? '&alternatives=true' : '';
  const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinateQuery)}${includeAlternatives}`, {
    cache: 'no-store'
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to calculate route.');
  }
  return payload;
};

const readDashboardMapScreenState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MAP_SCREEN_DASHBOARD_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      tripDateFilter: String(parsed.tripDateFilter || 'all'),
      selectedTripIds: Array.isArray(parsed.selectedTripIds) ? parsed.selectedTripIds.map(value => String(value || '').trim()).filter(Boolean) : [],
      selectedDriverId: String(parsed.selectedDriverId || '').trim(),
      selectedRouteId: String(parsed.selectedRouteId || '').trim(),
      activeDateTripIds: Array.isArray(parsed.activeDateTripIds) ? parsed.activeDateTripIds.map(value => String(value || '').trim()).filter(Boolean) : [],
      routeTripIds: Array.isArray(parsed.routeTripIds) ? parsed.routeTripIds.map(value => String(value || '').trim()).filter(Boolean) : []
    };
  } catch {
    return null;
  }
};

const StandaloneDispatchMapScreen = () => {
  const searchParams = useSearchParams();
  const querySource = searchParams.get('source') || '';
  const [storedSource, setStoredSource] = useState('');
  const [dashboardMapState, setDashboardMapState] = useState(null);
  const { uiPreferences, drivers = [], trips = [], routePlans = [], selectedTripIds: contextSelectedTripIds = [], selectedDriverId: contextSelectedDriverId = '', selectedRouteId: contextSelectedRouteId = '', upsertDispatchThreadMessage } = useNemtContext();
  const source = querySource || storedSource || (contextSelectedDriverId || contextSelectedRouteId || contextSelectedTripIds.length > 0 ? 'dashboard' : '');
  const isDashboardMap = source === 'dashboard';
  const [originQuery, setOriginQuery] = useState('32808');
  const [destinationQuery, setDestinationQuery] = useState('32822');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [originResult, setOriginResult] = useState(null);
  const [destinationResult, setDestinationResult] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [dashboardRouteGeometry, setDashboardRouteGeometry] = useState([]);
  const [dashboardRouteMetrics, setDashboardRouteMetrics] = useState(null);
  const [dashboardAlternativeRoutes, setDashboardAlternativeRoutes] = useState([]);
  const [dashboardViewMode, setDashboardViewMode] = useState('all');
  const [selectedDashboardRouteIndex, setSelectedDashboardRouteIndex] = useState(0);
  const [jointTripSelections, setJointTripSelections] = useState({});
  const [segmentAlternativeLookup, setSegmentAlternativeLookup] = useState({});
  const [dashboardSidebarHidden, setDashboardSidebarHidden] = useState(false);
  const [routeDispatchNotice, setRouteDispatchNotice] = useState('');
  const [routeTripSelectionIds, setRouteTripSelectionIds] = useState([]);
  const [acceptedRouteByTripId, setAcceptedRouteByTripId] = useState({});
  const [showTimeLabels, setShowTimeLabels] = useState(false);
  const [timeFilterRange, setTimeFilterRange] = useState({ start: null, end: null });
  const [hideRoutes, setHideRoutes] = useState(false);

  useEffect(() => {
    if (querySource) {
      if (storedSource !== querySource) {
        setStoredSource(querySource);
      }
      if (window.localStorage.getItem('__CARE_MOBILITY_MAP_SCREEN_SOURCE__') !== querySource) {
        window.localStorage.setItem('__CARE_MOBILITY_MAP_SCREEN_SOURCE__', querySource);
      }
      return;
    }

    const fallbackSource = window.localStorage.getItem('__CARE_MOBILITY_MAP_SCREEN_SOURCE__') || '';
    if (fallbackSource && fallbackSource !== storedSource) {
      setStoredSource(fallbackSource);
    }
  }, [querySource, storedSource]);
  useEffect(() => {
    if (!isDashboardMap) return;
    const loadState = () => {
      setDashboardMapState(readDashboardMapScreenState());
    };
    loadState();
    window.addEventListener('storage', loadState);
    return () => {
      window.removeEventListener('storage', loadState);
    };
  }, [isDashboardMap]);

  const effectiveTripDateFilter = isDashboardMap ? String(dashboardMapState?.tripDateFilter || 'all') : 'all';
  const effectiveSelectedTripIds = isDashboardMap ? (Array.isArray(dashboardMapState?.selectedTripIds) ? dashboardMapState.selectedTripIds : EMPTY_ITEMS) : contextSelectedTripIds;
  const effectiveSelectedDriverId = isDashboardMap ? String(dashboardMapState?.selectedDriverId || '') : String(contextSelectedDriverId || '');
  const effectiveSelectedRouteId = isDashboardMap ? String(dashboardMapState?.selectedRouteId || '') : String(contextSelectedRouteId || '');
  const effectiveRouteTripIds = isDashboardMap ? (Array.isArray(dashboardMapState?.routeTripIds) ? dashboardMapState.routeTripIds : EMPTY_ITEMS) : EMPTY_ITEMS;
  const dashboardActiveDateTripIdSet = useMemo(() => {
    if (!isDashboardMap) return null;
    if (effectiveTripDateFilter === 'all') return new Set();
    return new Set((Array.isArray(dashboardMapState?.activeDateTripIds) ? dashboardMapState.activeDateTripIds : EMPTY_ITEMS).map(value => String(value || '').trim()).filter(Boolean));
  }, [dashboardMapState?.activeDateTripIds, effectiveTripDateFilter, isDashboardMap]);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);
  const selectedDriver = useMemo(() => drivers.find(driver => String(driver.id || '').trim() === effectiveSelectedDriverId) ?? null, [drivers, effectiveSelectedDriverId]);
  const selectedRoute = useMemo(() => routePlans.find(route => String(route.id || '').trim() === effectiveSelectedRouteId) ?? null, [effectiveSelectedRouteId, routePlans]);
  const normalizeTripId = tripId => String(tripId || '').trim();
  const selectedDashboardTripIds = useMemo(() => new Set((Array.isArray(effectiveSelectedTripIds) ? effectiveSelectedTripIds : EMPTY_ITEMS).map(value => normalizeTripId(value)).filter(Boolean)), [effectiveSelectedTripIds]);
  const selectedDashboardTrips = useMemo(() => sortTripsByPickupTime(trips.filter(trip => selectedDashboardTripIds.has(normalizeTripId(trip?.id)))), [selectedDashboardTripIds, trips]);
  const selectedDriverCandidateTripIds = useMemo(() => new Set(trips.filter(trip => selectedDashboardTripIds.has(normalizeTripId(trip?.id)) && (!trip.driverId || String(trip.driverId || '').trim() === effectiveSelectedDriverId)).map(trip => trip.id)), [effectiveSelectedDriverId, selectedDashboardTripIds, trips]);
  const dashboardRouteTrips = useMemo(() => {
    if (effectiveRouteTripIds.length > 0) {
      const lookup = new Map(trips.map(trip => [normalizeTripId(trip?.id), trip]));
      const fromSnapshot = effectiveRouteTripIds.map(id => lookup.get(normalizeTripId(id))).filter(Boolean);
      return sortTripsByPickupTime(fromSnapshot);
    }
    if (selectedDriver) {
      const mergedTrips = new Map();
      trips.forEach(trip => {
        if (trip.driverId === selectedDriver.id) {
          mergedTrips.set(trip.id, trip);
        }
      });
      selectedDashboardTrips.forEach(trip => {
        mergedTrips.set(trip.id, trip);
      });
      const merged = Array.from(mergedTrips.values());
      const scoped = dashboardActiveDateTripIdSet ? merged.filter(trip => dashboardActiveDateTripIdSet.has(normalizeTripId(trip?.id))) : merged;
      return sortTripsByPickupTime(scoped);
    }
    if (selectedRoute) {
      const base = sortTripsByPickupTime(trips.filter(trip => selectedRoute.tripIds.includes(trip.id)));
      const scoped = dashboardActiveDateTripIdSet ? base.filter(trip => dashboardActiveDateTripIdSet.has(normalizeTripId(trip?.id))) : base;
      return sortTripsByPickupTime(scoped);
    }
    const scopedSelected = dashboardActiveDateTripIdSet ? selectedDashboardTrips.filter(trip => dashboardActiveDateTripIdSet.has(normalizeTripId(trip?.id))) : selectedDashboardTrips;
    return sortTripsByPickupTime(scopedSelected);
  }, [dashboardActiveDateTripIdSet, effectiveRouteTripIds, selectedDashboardTrips, selectedDriver, selectedRoute, trips]);

  useEffect(() => {
    const availableIds = dashboardRouteTrips.map(trip => String(trip?.id || '').trim()).filter(Boolean);
    setRouteTripSelectionIds(current => {
      const kept = current.filter(id => availableIds.includes(id));
      if (kept.length > 0) {
        return areStringArraysEqual(kept, current) ? current : kept;
      }
      return areStringArraysEqual(availableIds, current) ? current : availableIds;
    });
  }, [dashboardRouteTrips]);

  useEffect(() => {
    if (!dashboardSidebarHidden) return;
    const allVisibleTripIds = dashboardRouteTrips.map(trip => String(trip?.id || '').trim()).filter(Boolean);
    setDashboardViewMode(currentMode => currentMode === 'route' ? currentMode : 'route');
    setRouteTripSelectionIds(current => areStringArraysEqual(current, allVisibleTripIds) ? current : allVisibleTripIds);
  }, [dashboardRouteTrips, dashboardSidebarHidden]);

  const selectedRouteTripIdSet = useMemo(() => new Set(routeTripSelectionIds.map(value => normalizeTripId(value)).filter(Boolean)), [routeTripSelectionIds]);
  const isTripSelectedForRoute = tripId => selectedRouteTripIdSet.has(normalizeTripId(tripId));
  const activeDashboardRouteTrips = useMemo(() => {
    if (selectedRouteTripIdSet.size === 0) return [];
    return dashboardRouteTrips.filter(trip => selectedRouteTripIdSet.has(String(trip?.id || '').trim()));
  }, [dashboardRouteTrips, selectedRouteTripIdSet]);

  const dashboardRouteStops = useMemo(() => activeDashboardRouteTrips.flatMap((trip, index) => {
    // Get pickup time - prioritize pickup over scheduledPickup (pickup has the actual time)
    const pickup = String(trip?.pickup || '').trim();
    const scheduledPickup = String(trip?.scheduledPickup || '').trim();
    const pickupTime = pickup || scheduledPickup;
    
    // Get dropoff time similarly
    const dropoff = String(trip?.dropoff || '').trim();
    const scheduledDropoff = String(trip?.scheduledDropoff || '').trim();
    const dropoffTime = dropoff || scheduledDropoff;
    
    // For filtering, convert to timestamp
    const getTimestamp = (timeStr) => {
      if (!timeStr) return 0;
      const parts = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (!parts) return 0;
      let hours = parseInt(parts[1], 10);
      const minutes = parseInt(parts[2], 10);
      if (parts[3]?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
      if (parts[3]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date.getTime();
    };
    
    return [{
      key: `${trip.id}-pickup`,
      label: '1',
      variant: selectedDashboardTripIds.has(normalizeTripId(trip?.id)) ? 'dropoff' : 'pickup',
      position: trip.position,
      title: `Pickup ${trip.pickup}`,
      detail: trip.address,
      timeLabel: pickupTime,
      timestamp: getTimestamp(pickupTime)
    }, {
      key: `${trip.id}-dropoff`,
      label: '2',
      variant: 'dropoff',
      position: trip.destinationPosition ?? trip.position,
      title: `Dropoff ${trip.dropoff}`,
      detail: trip.destination || 'Destination pending',
      timeLabel: dropoffTime,
      timestamp: getTimestamp(dropoffTime)
    }];
  }), [activeDashboardRouteTrips, selectedDashboardTripIds]);

  const filteredDashboardRouteStops = useMemo(() => {
    if (!timeFilterRange.start && !timeFilterRange.end) return dashboardRouteStops;
    
    return dashboardRouteStops.filter(stop => {
      if (timeFilterRange.start && stop.timestamp < timeFilterRange.start) return false;
      if (timeFilterRange.end && stop.timestamp > timeFilterRange.end) return false;
      return true;
    });
  }, [dashboardRouteStops, timeFilterRange]);
  const dashboardDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const preferredTrip = trips.find(trip => selectedDashboardTripIds.has(normalizeTripId(trip?.id)) && trip.driverId === selectedDriver.id);
    if (preferredTrip) return preferredTrip;
    return activeDashboardRouteTrips.find(trip => trip.driverId === selectedDriver.id) || dashboardRouteTrips.find(trip => trip.driverId === selectedDriver.id) || trips.find(trip => trip.driverId === selectedDriver.id) || null;
  }, [activeDashboardRouteTrips, dashboardRouteTrips, selectedDashboardTripIds, selectedDriver, trips]);
  const dashboardDriverEta = useMemo(() => {
    if (!selectedDriver || !selectedDriver.hasRealLocation || !dashboardDriverActiveTrip) return null;
    const miles = getDistanceMiles(selectedDriver.position, getTripTargetPosition(dashboardDriverActiveTrip));
    return {
      miles,
      label: formatEta(miles)
    };
  }, [dashboardDriverActiveTrip, selectedDriver]);
  const dashboardRouteHealth = useMemo(() => {
    if (!selectedDriver || dashboardRouteTrips.length === 0) return null;
    const now = Date.now();
    const items = [];
    let previousAvailableAt = selectedDriver.hasRealLocation ? now : null;
    let previousDropoffPosition = selectedDriver.hasRealLocation ? selectedDriver.position : null;

    for (const trip of dashboardRouteTrips) {
      const scheduledStart = Number.isFinite(Number(trip.pickupSortValue)) ? Number(trip.pickupSortValue) : previousAvailableAt;
      const travelMinutes = previousDropoffPosition ? estimateTravelMinutes(previousDropoffPosition, trip.position) : 0;
      const estimatedArrival = previousAvailableAt != null ? previousAvailableAt + travelMinutes * 60000 : scheduledStart;
      const effectiveStart = scheduledStart != null && estimatedArrival != null ? Math.max(scheduledStart, estimatedArrival) : scheduledStart ?? estimatedArrival ?? null;
      const slackMinutes = scheduledStart != null && estimatedArrival != null ? Math.round((scheduledStart - estimatedArrival) / 60000) : null;
      const late = Number.isFinite(slackMinutes) ? slackMinutes < -5 : false;
      const serviceMinutes = estimateTripServiceMinutes(trip);
      const finishAt = effectiveStart != null ? effectiveStart + serviceMinutes * 60000 : null;

      items.push({
        trip,
        travelMinutes,
        slackMinutes,
        late,
        candidate: selectedDashboardTripIds.has(normalizeTripId(trip?.id)),
        assignedElsewhere: selectedDashboardTripIds.has(normalizeTripId(trip?.id)) && trip.driverId && String(trip.driverId || '').trim() !== effectiveSelectedDriverId
      });

      previousAvailableAt = finishAt;
      previousDropoffPosition = trip.destinationPosition ?? trip.position;
    }

    return {
      items,
      lateCount: items.filter(item => item.late).length,
      candidateCount: items.filter(item => item.candidate).length
    };
  }, [dashboardRouteTrips, effectiveSelectedDriverId, selectedDashboardTripIds, selectedDriver]);
  const dashboardRouteHealthItems = dashboardRouteHealth?.items ?? EMPTY_ITEMS;
  const dashboardVisibleTripItems = useMemo(() => {
    if (dashboardRouteHealthItems.length > 0) return dashboardRouteHealthItems;
    return activeDashboardRouteTrips.map(trip => ({
      trip,
      travelMinutes: null,
      slackMinutes: null,
      late: false,
      candidate: selectedDashboardTripIds.has(normalizeTripId(trip?.id)),
      assignedElsewhere: false
    }));
  }, [activeDashboardRouteTrips, dashboardRouteHealthItems, selectedDashboardTripIds]);
  const dashboardRouteOptions = useMemo(() => {
    const options = [];
    if (dashboardRouteGeometry.length > 1) {
      options.push({
        id: 'primary',
        label: 'Ruta principal',
        geometry: dashboardRouteGeometry,
        distanceMiles: dashboardRouteMetrics?.distanceMiles ?? null,
        durationMinutes: dashboardRouteMetrics?.durationMinutes ?? null,
        isFallback: Boolean(dashboardRouteMetrics?.isFallback)
      });
    }

    dashboardAlternativeRoutes.forEach((route, index) => {
      options.push({
        id: `alternative-${index + 1}`,
        label: `Ruta alternativa ${index + 1}`,
        geometry: Array.isArray(route?.geometry) ? route.geometry : [],
        distanceMiles: route?.distanceMiles ?? null,
        durationMinutes: route?.durationMinutes ?? null,
        isFallback: false
      });
    });

    return options;
  }, [dashboardAlternativeRoutes, dashboardRouteGeometry, dashboardRouteMetrics]);
  const selectedDashboardRouteOption = dashboardRouteOptions[selectedDashboardRouteIndex] ?? dashboardRouteOptions[0] ?? null;

  useEffect(() => {
    if (dashboardRouteOptions.length === 0) {
      if (selectedDashboardRouteIndex !== 0) {
        setSelectedDashboardRouteIndex(0);
      }
      return;
    }

    if (selectedDashboardRouteIndex >= dashboardRouteOptions.length) {
      setSelectedDashboardRouteIndex(0);
    }
  }, [dashboardRouteOptions, selectedDashboardRouteIndex]);

  useEffect(() => {
    if (!isDashboardMap) return;
    if (dashboardRouteStops.length < 2) {
      setDashboardRouteGeometry(current => current.length === 0 ? current : []);
      setDashboardRouteMetrics(current => current == null ? current : null);
      setDashboardAlternativeRoutes(current => current.length === 0 ? current : []);
      return;
    }

    let active = true;

    const loadDashboardRoute = async () => {
      try {
        const payload = await findRoute(dashboardRouteStops.map(stop => stop.position), {
          alternatives: true
        });
        if (!active) return;
        setDashboardRouteGeometry(Array.isArray(payload?.geometry) ? payload.geometry : []);
        setDashboardRouteMetrics({
          distanceMiles: Number.isFinite(payload?.distanceMiles) ? payload.distanceMiles : null,
          durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null,
          isFallback: Boolean(payload?.isFallback)
        });
        setDashboardAlternativeRoutes(Array.isArray(payload?.alternatives) ? payload.alternatives : []);
      } catch {
        if (!active) return;
        setDashboardRouteGeometry(dashboardRouteStops.map(stop => stop.position));
        setDashboardRouteMetrics({
          distanceMiles: null,
          durationMinutes: null,
          isFallback: true
        });
        setDashboardAlternativeRoutes([]);
      }
    };

    loadDashboardRoute();

    return () => {
      active = false;
    };
  }, [dashboardRouteStops, isDashboardMap]);

  useEffect(() => {
    if (!isDashboardMap || !selectedDriver || dashboardRouteHealthItems.length === 0) {
      setSegmentAlternativeLookup(current => Object.keys(current).length === 0 ? current : {});
      return;
    }

    let active = true;

    const loadSegmentAlternatives = async () => {
      const nextLookup = {};

      for (let index = 0; index < dashboardRouteHealthItems.length; index += 1) {
        const item = dashboardRouteHealthItems[index];
        const previousItem = dashboardRouteHealthItems[index - 1];
        const fromPosition = previousItem?.trip?.destinationPosition ?? previousItem?.trip?.position ?? selectedDriver.position;
        const toPosition = item?.trip?.position;
        if (!Array.isArray(fromPosition) || !Array.isArray(toPosition)) continue;

        try {
          const payload = await findRoute([fromPosition, toPosition], {
            alternatives: true
          });
          const altRoute = Array.isArray(payload?.alternatives) ? payload.alternatives[0] : null;
          if (altRoute) {
            nextLookup[item.trip.id] = {
              durationMinutes: altRoute.durationMinutes,
              distanceMiles: altRoute.distanceMiles
            };
          }
        } catch {
          // Ignore per-segment alternative errors and keep the rest of the screen working.
        }
      }

      if (!active) return;
      setSegmentAlternativeLookup(nextLookup);
    };

    loadSegmentAlternatives();

    return () => {
      active = false;
    };
  }, [dashboardRouteHealthItems, isDashboardMap, selectedDriver]);

  const mapPoints = useMemo(() => {
    if (isDashboardMap) {
      const points = [];
      if (selectedDriver?.position) points.push(selectedDriver.position);
      dashboardRouteStops.forEach(stop => {
        if (Array.isArray(stop.position)) points.push(stop.position);
      });
      return points.length > 0 ? points : [DEFAULT_CENTER];
    }
    const points = [];
    if (originResult?.coordinates) points.push(originResult.coordinates);
    if (destinationResult?.coordinates) points.push(destinationResult.coordinates);
    return points.length > 0 ? points : [DEFAULT_CENTER];
  }, [dashboardRouteStops, destinationResult, isDashboardMap, originResult, selectedDriver]);

  const handleLookupRoute = async event => {
    event?.preventDefault();
    const originValue = originQuery.trim();
    const destinationValue = destinationQuery.trim();

    if (!originValue || !destinationValue) {
      setErrorMessage('Write the origin and destination first.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const [nextOrigin, nextDestination] = await Promise.all([findLocation(originValue), findLocation(destinationValue)]);
      const nextRoute = await findRoute([nextOrigin.coordinates, nextDestination.coordinates]);
      setOriginResult(nextOrigin);
      setDestinationResult(nextDestination);
      setRouteGeometry(Array.isArray(nextRoute?.geometry) ? nextRoute.geometry : []);
      setRouteMetrics({
        distanceMiles: Number.isFinite(nextRoute?.distanceMiles) ? nextRoute.distanceMiles : null,
        durationMinutes: Number.isFinite(nextRoute?.durationMinutes) ? nextRoute.durationMinutes : null,
        isFallback: Boolean(nextRoute?.isFallback)
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to calculate route.');
      setRouteGeometry([]);
      setRouteMetrics(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setOriginQuery('');
    setDestinationQuery('');
    setOriginResult(null);
    setDestinationResult(null);
    setRouteGeometry([]);
    setRouteMetrics(null);
    setErrorMessage('');
  };

  const handleToggleTripTogether = tripId => {
    setJointTripSelections(current => ({
      ...current,
      [tripId]: !current[tripId]
    }));
  };

  const handleRouteOnlyThisTrip = tripId => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return;
    setRouteTripSelectionIds([normalizedTripId]);
    const savedRouteIndex = acceptedRouteByTripId?.[normalizedTripId]?.routeIndex;
    if (Number.isInteger(savedRouteIndex)) {
      setSelectedDashboardRouteIndex(savedRouteIndex);
    } else {
      setSelectedDashboardRouteIndex(0);
    }
    setRouteDispatchNotice('');
  };

  const handleToggleTripForRoute = tripId => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return;
    setRouteTripSelectionIds(current => current.includes(normalizedTripId) ? current.filter(id => id !== normalizedTripId) : [...current, normalizedTripId]);
    setRouteDispatchNotice('');
  };

  const handleCheckTripForRouting = (tripId, checked) => {
    const normalizedTripId = String(tripId || '').trim();
    if (!normalizedTripId) return;
    if (checked) {
      handleRouteOnlyThisTrip(normalizedTripId);
      return;
    }
    setRouteTripSelectionIds(current => current.filter(id => id !== normalizedTripId));
    setRouteDispatchNotice('');
  };

  const handleAcceptRouteForDriver = routeIndex => {
    const resolvedIndex = Number.isInteger(routeIndex) ? routeIndex : selectedDashboardRouteIndex;
    const routeOption = dashboardRouteOptions[resolvedIndex] ?? selectedDashboardRouteOption;
    if (!selectedDriver?.id) {
      setRouteDispatchNotice('Select a driver first to send the accepted route.');
      return;
    }
    if (!routeOption || activeDashboardRouteTrips.length === 0) {
      setRouteDispatchNotice('No route is ready to send yet.');
      return;
    }

    if (resolvedIndex !== selectedDashboardRouteIndex) {
      setSelectedDashboardRouteIndex(resolvedIndex);
    }

    const firstTrip = activeDashboardRouteTrips[0];
    const lastTrip = activeDashboardRouteTrips[activeDashboardRouteTrips.length - 1];
    const distanceText = routeOption.distanceMiles != null ? `${routeOption.distanceMiles.toFixed(1)} mi` : selectedDashboardDistance != null ? `${selectedDashboardDistance.toFixed(1)} mi` : 'Distance unavailable';
    const durationText = routeOption.durationMinutes != null ? formatDriveMinutes(routeOption.durationMinutes) : selectedDashboardDuration != null ? formatDriveMinutes(selectedDashboardDuration) : 'Duration unavailable';
    const tripSummary = activeDashboardRouteTrips.slice(0, 6).map(trip => getDisplayTripId(trip)).filter(Boolean).join(', ');
    const moreTrips = activeDashboardRouteTrips.length > 6 ? ` +${activeDashboardRouteTrips.length - 6} more` : '';

    const text = [
      `Accepted route: ${routeOption.label}`,
      `Driver: ${selectedDriver.name}`,
      `Trips: ${tripSummary || 'N/A'}${moreTrips} (${activeDashboardRouteTrips.length} selected)`,
      `From: ${firstTrip?.address || 'N/A'}`,
      `To: ${lastTrip?.destination || 'N/A'}`,
      `Estimated: ${distanceText} • ${durationText}`
    ].join('\n');

    upsertDispatchThreadMessage({
      driverId: selectedDriver.id,
      message: {
        id: `msg-route-${Date.now()}`,
        direction: 'outgoing',
        text,
        timestamp: new Date().toISOString(),
        status: 'sent'
      }
    });

    if (activeDashboardRouteTrips.length === 1) {
      const focusedTripId = String(activeDashboardRouteTrips[0]?.id || '').trim();
      if (focusedTripId) {
        setAcceptedRouteByTripId(current => ({
          ...current,
          [focusedTripId]: {
            routeIndex: resolvedIndex,
            routeLabel: routeOption.label,
            acceptedAt: new Date().toISOString()
          }
        }));
      }
    }

    setRouteDispatchNotice(`Route ${routeOption.label} sent to ${selectedDriver.name} at ${new Date().toLocaleTimeString()} (${activeDashboardRouteTrips.length} trip(s)).`);
  };

  const selectedDashboardRouteGeometry = selectedDashboardRouteOption?.geometry ?? dashboardRouteGeometry;
  const selectedDashboardDistance = selectedDashboardRouteOption?.distanceMiles ?? dashboardRouteMetrics?.distanceMiles ?? dashboardDriverEta?.miles ?? null;
  const selectedDashboardDuration = selectedDashboardRouteOption?.durationMinutes ?? dashboardRouteMetrics?.durationMinutes ?? null;
  const selectedDashboardFallback = selectedDashboardRouteOption?.isFallback ?? dashboardRouteMetrics?.isFallback ?? false;
  const activeDashboardViewMode = dashboardViewMode;

  if (isDashboardMap) {
    if (dashboardSidebarHidden) {
      return <div style={{ height: '100vh', padding: 0, background: '#020617', position: 'relative' }}>
          <div className="d-flex gap-2 flex-wrap" style={{ position: 'absolute', top: 16, left: 16, zIndex: 700 }}>
            <Button variant="dark" size="sm" onClick={() => setDashboardSidebarHidden(false)} style={soloMapButtonStyle}>Return to Panel</Button>
          </div>
          <div className="d-flex gap-2 flex-wrap" style={{ position: 'absolute', top: 16, right: 16, zIndex: 700 }}>
            <Button variant="dark" size="sm" onClick={() => setHideRoutes(!hideRoutes)} style={soloMapButtonStyle}>{hideRoutes ? '🗺️ Show Routes' : '✕ Hide Routes'}</Button>
          </div>
          {dashboardViewMode !== 'addresses' && (selectedDriver || dashboardRouteOptions.length > 0) ? <div className="d-flex flex-column gap-2" style={{ position: 'absolute', top: 16, right: 16, zIndex: 700, width: 320, maxWidth: 'calc(100vw - 32px)' }}>
              <div className="rounded-4" style={{ ...darkCardStyle, padding: 16, backdropFilter: 'blur(12px)' }}>
                <div className="mt-2 fw-semibold" style={{ fontSize: 18 }}>{selectedDriver?.name || 'No driver selected'}</div>
                <div className="small mt-1" style={{ color: '#cbd5e1' }}>{selectedDashboardDistance != null ? `${selectedDashboardDistance.toFixed(1)} mi` : 'No distance'} • {selectedDashboardDuration != null ? formatDriveMinutes(selectedDashboardDuration) : 'No duration'}</div>
              </div>
              {dashboardRouteOptions.length > 0 ? <div className="rounded-4 d-flex flex-column gap-2" style={{ ...darkCardStyle, padding: 16, backdropFilter: 'blur(12px)' }}>
                  {dashboardRouteOptions.map((routeOption, index) => <div key={routeOption.id} className="text-start rounded-3 px-3 py-2" style={{ background: index === selectedDashboardRouteIndex ? 'rgba(37,99,235,0.22)' : 'rgba(255,255,255,0.05)', border: `1px solid ${index === selectedDashboardRouteIndex ? 'rgba(96,165,250,0.8)' : 'rgba(148,163,184,0.18)'}`, color: '#e2e8f0' }}>
                      <button type="button" onClick={() => { setSelectedDashboardRouteIndex(index); setRouteDispatchNotice(''); }} className="w-100 text-start border-0 p-0" style={{ background: 'transparent', color: 'inherit' }}>
                        <div className="d-flex justify-content-between align-items-center gap-2">
                          <span className="fw-semibold small">{routeOption.label}</span>
                          <Badge bg={index === selectedDashboardRouteIndex ? 'info' : 'secondary'}>{index === selectedDashboardRouteIndex ? 'Activa' : 'Disponible'}</Badge>
                        </div>
                        <div className="small mt-1" style={{ color: '#cbd5e1' }}>{routeOption.distanceMiles != null ? `${routeOption.distanceMiles.toFixed(1)} mi` : 'No distance'} • {routeOption.durationMinutes != null ? formatDriveMinutes(routeOption.durationMinutes) : 'No duration'}</div>
                      </button>
                      <div className="mt-2">
                        <Button variant="success" size="sm" onClick={() => handleAcceptRouteForDriver(index)} disabled={!selectedDriver}>Accept this route</Button>
                      </div>
                    </div>)}
                  <Button variant="outline-success" size="sm" onClick={() => handleAcceptRouteForDriver()} disabled={!selectedDriver || dashboardRouteOptions.length === 0}>Accept selected route</Button>
                  {routeDispatchNotice ? <Alert variant="info" className="mb-0 py-2">{routeDispatchNotice}</Alert> : null}
                </div> : null}
                {dashboardRouteOptions.length > 0 ? <div className="rounded-4 d-flex flex-column gap-2" style={{ ...darkCardStyle, padding: 16, backdropFilter: 'blur(12px)' }}>
                    <button type="button" onClick={() => setShowTimeLabels(!showTimeLabels)} className="btn btn-sm" style={{ background: showTimeLabels ? 'rgba(16,185,129,0.22)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showTimeLabels ? 'rgba(16,185,129,0.8)' : 'rgba(148,163,184,0.18)'}`, color: '#e2e8f0' }}>
                      {showTimeLabels ? '⏰ Hide Times' : '⏰ Show Times'}
                    </button>
                    {showTimeLabels && dashboardRouteStops.length > 0 ? <>
                      <div className="small text-uppercase fw-semibold" style={{ color: '#94a3b8', letterSpacing: '0.08em', marginTop: 8 }}>Filter by Time Range</div>
                      <div className="d-flex gap-2" style={{ fontSize: 12 }}>
                        <input type="time" value={timeFilterRange.start ? new Date(timeFilterRange.start).toTimeString().substring(0, 5) : ''} onChange={(e) => setTimeFilterRange(prev => ({ ...prev, start: e.target.value ? new Date(`2000-01-01T${e.target.value}`).getTime() : null }))} style={{ flex: 1, padding: 6, borderRadius: 4, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0' }} placeholder="From" />
                        <input type="time" value={timeFilterRange.end ? new Date(timeFilterRange.end).toTimeString().substring(0, 5) : ''} onChange={(e) => setTimeFilterRange(prev => ({ ...prev, end: e.target.value ? new Date(`2000-01-01T${e.target.value}`).getTime() : null }))} style={{ flex: 1, padding: 6, borderRadius: 4, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0' }} placeholder="To" />
                      </div>
                      {(timeFilterRange.start || timeFilterRange.end) ? <button type="button" onClick={() => setTimeFilterRange({ start: null, end: null })} className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,163,184,0.18)', color: '#cbd5e1', fontSize: 11 }}>Clear Filter</button> : null}
                    </> : null}
                  </div> : null}
                  {dashboardVisibleTripItems.length > 0 ? <div className="rounded-4 d-flex flex-column gap-2" style={{ ...darkCardStyle, padding: 16, flex: 1, minHeight: 200, maxHeight: 'calc(100vh - 350px)', overflowY: 'auto', backdropFilter: 'blur(12px)', scrollBehavior: 'smooth' }}>
                    <div className="small text-uppercase fw-semibold" style={{ color: '#94a3b8', letterSpacing: '0.08em' }}>Trips in Route</div>
                    {dashboardVisibleTripItems.slice(0, 12).map(item => <div key={`solo-list-${item.trip.id}`} className="rounded-3 px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,163,184,0.16)' }}>
                      <div className="fw-semibold small" style={{ color: '#f8fafc' }}>{item.trip.pickup} • {item.trip.rider}</div>
                      <div className="small mt-1" style={{ color: '#cbd5e1' }}>{item.trip.address}</div>
                      {acceptedRouteByTripId?.[item.trip.id] ? <div className="small mt-1" style={{ color: '#34d399' }}>Accepted: {acceptedRouteByTripId[item.trip.id].routeLabel}</div> : null}
                      <div className="mt-2 d-flex align-items-center gap-2">
                        <Form.Check
                          id={`solo-trip-check-${item.trip.id}`}
                          type="checkbox"
                          checked={isTripSelectedForRoute(item.trip.id)}
                          onChange={event => handleCheckTripForRouting(item.trip.id, event.target.checked)}
                          label="Select this trip"
                          style={{ color: '#e2e8f0' }}
                        />
                        {isTripSelectedForRoute(item.trip.id) ? <Badge bg="info">Checked</Badge> : null}
                      </div>
                    </div>)}
                  </div> : null}
            </div> : null}
          <MapContainer key={`solo-map-${dashboardViewMode}`} center={selectedDriver?.position ?? DEFAULT_CENTER} zoom={10} zoomControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
            <StandaloneMapResizer resizeKey={`solo-map-${dashboardViewMode}-${dashboardRouteStops.length}-${routeGeometry.length}-${selectedDashboardRouteGeometry.length}`} />
            <MapViewportController points={mapPoints} />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
            <ZoomControl position="bottomright" />
            {activeDashboardViewMode !== 'addresses' && !hideRoutes ? dashboardRouteOptions.map((routeOption, index) => {
            if (routeOption.geometry.length <= 1) return null;
            return <Polyline key={`solo-route-option-${routeOption.id}`} positions={routeOption.geometry} pathOptions={getDashboardRouteStyle(index === selectedDashboardRouteIndex, index)} />;
          }) : null}
            {activeDashboardViewMode !== 'route' && routeGeometry.length > 1 && !hideRoutes ? <Polyline positions={routeGeometry} pathOptions={{ color: '#f59e0b', weight: 4, dashArray: '10 8' }} /> : null}
            {selectedDriver?.hasRealLocation ? <Marker position={selectedDriver.position} icon={createRouteStopIcon('D', 'driver')}>
                <Popup>
                  <div className="fw-semibold">{selectedDriver.name}</div>
                  <div>{selectedDriver.live || 'Offline'}</div>
                </Popup>
              </Marker> : null}
            {activeDashboardViewMode !== 'addresses' && selectedDriver?.hasRealLocation && dashboardDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(dashboardDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
            {filteredDashboardRouteStops.map(stop => <Marker key={`solo-${stop.key}`} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant, stop.timeLabel, showTimeLabels)}>
                <Popup>
                  <div className="fw-semibold">{stop.title}</div>
                  <div>{stop.detail}</div>
                  {stop.timeLabel ? <div className="small mt-1" style={{ color: '#cbd5e1' }}>{stop.timeLabel}</div> : null}
                </Popup>
              </Marker>)}
            {originResult?.coordinates ? <Marker position={originResult.coordinates} icon={createRouteStopIcon('A', 'origin')} /> : null}
            {destinationResult?.coordinates ? <Marker position={destinationResult.coordinates} icon={createRouteStopIcon('B', 'destination')} /> : null}
          </MapContainer>
        </div>;
    }

    return <div style={{ height: '100vh', padding: 0, background: '#020617' }}>
        <div className="h-100" style={{ display: 'grid', gridTemplateColumns: dashboardSidebarHidden ? '0px minmax(0, 1fr)' : '420px minmax(0, 1fr)' }}>
          {!dashboardSidebarHidden ? <aside className="d-flex flex-column" style={{ ...darkSidebarStyle, padding: 20, gap: 16, overflowY: 'auto' }}>
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <h1 className="h4 mt-1 mb-1" style={{ color: '#f8fafc' }}>Directions</h1>
                </div>
                <Button variant="outline-light" size="sm" onClick={() => setDashboardSidebarHidden(true)}>Solo mapa</Button>
              </div>

              <Form onSubmit={handleLookupRoute} className="d-flex flex-column gap-3">
                <Form.Group>
                  <Form.Label className="fw-semibold" style={{ color: '#e2e8f0' }}>From</Form.Label>
                  <Form.Control value={originQuery} onChange={event => setOriginQuery(event.target.value)} placeholder="Example: 32808 or Orlando, FL" style={{ borderRadius: 14, padding: '12px 14px', backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(148, 163, 184, 0.22)', color: '#f8fafc' }} />
                </Form.Group>
                <Form.Group>
                  <Form.Label className="fw-semibold" style={{ color: '#e2e8f0' }}>To</Form.Label>
                  <Form.Control value={destinationQuery} onChange={event => setDestinationQuery(event.target.value)} placeholder="Example: 32822 or Kissimmee, FL" style={{ borderRadius: 14, padding: '12px 14px', backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(148, 163, 184, 0.22)', color: '#f8fafc' }} />
                </Form.Group>
                <div className="d-flex gap-2">
                  <Button type="submit" disabled={isLoading} style={{ flex: 1, borderRadius: 14, border: 'none', background: '#0f766e', padding: '12px 16px' }}>
                    {isLoading ? <span className="d-inline-flex align-items-center gap-2"><Spinner size="sm" /> Calculating...</span> : 'Buscar direcciones'}
                  </Button>
                  <Button type="button" variant="outline-light" onClick={handleClear} style={{ borderRadius: 14, padding: '12px 16px' }}>Clear</Button>
                </div>
              </Form>

              {errorMessage ? <Alert variant="danger" className="mb-0" style={{ borderRadius: 16 }}>{errorMessage}</Alert> : null}

              <div className="rounded-4" style={{ ...darkCardStyle, padding: 16 }}>
                <div className="small text-uppercase fw-semibold" style={{ color: '#94a3b8', letterSpacing: '0.08em' }}>Chofer seleccionado</div>
                <div className="mt-2 fw-semibold" style={{ fontSize: 20 }}>{selectedDriver?.name || 'No driver selected'}</div>
                <div className="small mt-1" style={{ color: '#cbd5e1' }}>{dashboardRouteTrips.length} viaje(s){dashboardRouteHealth?.candidateCount ? ` • ${dashboardRouteHealth.candidateCount} seleccionados` : ''}</div>
                <div className="mt-3 d-flex gap-2 flex-wrap">
                  <Badge bg={dashboardRouteHealth?.lateCount ? 'danger' : 'info'}>{dashboardRouteHealth?.lateCount ? 'Late risk' : dashboardDriverEta?.label || 'ETA unavailable'}</Badge>
                  <Badge bg="secondary">{dashboardDriverEta?.miles != null ? `${dashboardDriverEta.miles.toFixed(1)} mi` : 'No distance'}</Badge>
                </div>
                <div className="small mt-2" style={{ color: '#94a3b8' }}>Ruta activa segun modo seleccionado. Puedes cambiarla sin cerrar esta ventana.</div>
              </div>

              {dashboardRouteOptions.length > 0 ? <div className="rounded-4 d-flex flex-column gap-2" style={{ ...darkCardStyle, padding: 16 }}>
                  <div className="small text-uppercase fw-semibold" style={{ color: '#94a3b8', letterSpacing: '0.08em' }}>Opciones de ruta</div>
                  {dashboardRouteOptions.map((routeOption, index) => <div key={`sidebar-${routeOption.id}`} className="text-start rounded-3 px-3 py-2" style={{ background: index === selectedDashboardRouteIndex ? 'rgba(37,99,235,0.22)' : 'rgba(255,255,255,0.05)', border: `1px solid ${index === selectedDashboardRouteIndex ? 'rgba(96,165,250,0.8)' : 'rgba(148,163,184,0.18)'}`, color: '#e2e8f0' }}>
                      <button type="button" onClick={() => { setSelectedDashboardRouteIndex(index); setRouteDispatchNotice(''); }} className="w-100 text-start border-0 p-0" style={{ background: 'transparent', color: 'inherit' }}>
                        <div className="d-flex justify-content-between align-items-center gap-2">
                          <span className="fw-semibold small">{routeOption.label}</span>
                          <Badge bg={index === selectedDashboardRouteIndex ? 'info' : 'secondary'}>{index === selectedDashboardRouteIndex ? 'Activa' : 'Disponible'}</Badge>
                        </div>
                        <div className="small mt-1" style={{ color: '#cbd5e1' }}>{routeOption.distanceMiles != null ? `${routeOption.distanceMiles.toFixed(1)} mi` : 'No distance'} • {routeOption.durationMinutes != null ? formatDriveMinutes(routeOption.durationMinutes) : 'No duration'}</div>
                      </button>
                      <div className="mt-2">
                        <Button variant="success" size="sm" onClick={() => handleAcceptRouteForDriver(index)} disabled={!selectedDriver}>Accept this route</Button>
                      </div>
                    </div>)}
                  <Button variant="outline-success" size="sm" onClick={() => handleAcceptRouteForDriver()} disabled={!selectedDriver || dashboardRouteOptions.length === 0}>Accept selected route</Button>
                  {routeDispatchNotice ? <Alert variant="info" className="mb-0 py-2">{routeDispatchNotice}</Alert> : null}
                </div> : null}

              <div className="rounded-4" style={{ ...darkCardStyle, padding: 16 }}>
                <div className="small text-uppercase fw-semibold" style={{ color: '#94a3b8', letterSpacing: '0.08em' }}>Address Search</div>
                <div className="mt-2 small" style={{ color: '#e2e8f0', lineHeight: 1.6 }}>
                  <div><strong>A:</strong> {originResult?.label || 'Waiting for origin'}</div>
                  <div className="mt-2"><strong>B:</strong> {destinationResult?.label || 'Waiting for destination'}</div>
                </div>
                <div className="mt-3 d-flex gap-2 flex-wrap">
                  <Badge bg="light" text="dark">{routeMetrics?.distanceMiles != null ? `${routeMetrics.distanceMiles.toFixed(1)} mi` : '--'}</Badge>
                  <Badge bg="light" text="dark">{routeMetrics?.durationMinutes != null ? formatDriveMinutes(routeMetrics.durationMinutes) : '--'}</Badge>
                </div>
              </div>

              <div className="d-flex flex-column gap-2">
                {dashboardVisibleTripItems.slice(0, 10).map(item => <div key={item.trip.id} className="rounded-3 px-3 py-2" style={{ backgroundColor: item.late ? 'rgba(239,68,68,0.18)' : item.candidate ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${item.late ? 'rgba(239,68,68,0.42)' : item.candidate ? 'rgba(245,158,11,0.34)' : 'rgba(148,163,184,0.16)'}` }}>
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <div className="d-flex flex-column gap-1" style={{ minWidth: 0 }}>
                        <div className="fw-semibold small" style={{ color: '#f8fafc' }}>{item.trip.pickup} • {item.trip.rider}</div>
                        <div className="d-flex gap-2 flex-wrap align-items-center">
                          <span className="small" style={{ color: '#94a3b8' }}>Trip {getDisplayTripId(item.trip)}</span>
                          {getLegBadge(item.trip) ? <Badge bg={getLegBadge(item.trip).variant}>{getLegBadge(item.trip).label}</Badge> : null}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleRouteOnlyThisTrip(item.trip.id)} className="border-0 p-0" style={{ background: 'transparent' }}>
                        <Badge bg={item.late ? 'danger' : item.candidate ? 'warning' : 'secondary'} text={item.candidate ? 'dark' : undefined} style={{ cursor: 'pointer' }}>{item.late ? 'Late risk' : item.assignedElsewhere ? 'Selected' : item.candidate ? 'Adding' : 'OK'}</Badge>
                      </button>
                    </div>
                    <div className="small mt-1" style={{ color: '#cbd5e1' }}>{item.trip.address}</div>
                    <div className="small mt-1" style={{ color: item.late ? '#fca5a5' : '#94a3b8' }}>Drive {item.travelMinutes == null ? '--' : formatDriveMinutes(item.travelMinutes)} • {item.slackMinutes == null ? '--' : formatSlackLabel(item.slackMinutes)}</div>
                    {acceptedRouteByTripId?.[item.trip.id] ? <div className="small mt-1" style={{ color: '#34d399' }}>Accepted: {acceptedRouteByTripId[item.trip.id].routeLabel}</div> : null}
                    {segmentAlternativeLookup[item.trip.id] ? <div className="small mt-1" style={{ color: '#93c5fd' }}>Alt route: {formatDriveMinutes(segmentAlternativeLookup[item.trip.id].durationMinutes)} • {segmentAlternativeLookup[item.trip.id].distanceMiles != null ? `${segmentAlternativeLookup[item.trip.id].distanceMiles.toFixed(1)} mi` : 'No distance'}</div> : null}
                    <div className="mt-2 d-flex gap-2 flex-wrap">
                      <Button size="sm" variant={isTripSelectedForRoute(item.trip.id) && routeTripSelectionIds.length === 1 ? 'info' : 'outline-info'} onClick={() => handleRouteOnlyThisTrip(item.trip.id)}>Route only this trip</Button>
                      <Button size="sm" variant={isTripSelectedForRoute(item.trip.id) ? 'warning' : 'outline-warning'} onClick={() => handleToggleTripForRoute(item.trip.id)}>{isTripSelectedForRoute(item.trip.id) ? 'Remove from route' : 'Add to route'}</Button>
                    </div>
                    <Form.Check id={`joint-trip-${item.trip.id}`} className="mt-2" type="checkbox" label={jointTripSelections[item.trip.id] ? 'Van juntos' : 'Montarlo junto con otro paciente'} checked={Boolean(jointTripSelections[item.trip.id])} onChange={() => handleToggleTripTogether(item.trip.id)} style={{ color: '#e2e8f0' }} />
                  </div>)}
              </div>
            </aside> : null}

          <div style={{ position: 'relative', minWidth: 0 }}>
            {dashboardSidebarHidden ? <div className="d-flex gap-2 flex-wrap" style={{ position: 'absolute', top: 16, left: 16, zIndex: 700 }}>
                <Button variant="dark" size="sm" onClick={() => setDashboardSidebarHidden(false)} style={{ background: 'rgba(15,23,42,0.92)', borderColor: 'rgba(148,163,184,0.24)' }}>Show Panel</Button>
                <Button variant={dashboardViewMode === 'addresses' ? 'warning' : 'dark'} size="sm" onClick={() => setDashboardViewMode('addresses')} style={dashboardViewMode === 'addresses' ? undefined : { background: 'rgba(15,23,42,0.92)', borderColor: 'rgba(148,163,184,0.24)' }}>Solo addresses</Button>
                <Button variant={dashboardViewMode === 'route' ? 'warning' : 'dark'} size="sm" onClick={() => setDashboardViewMode('route')} style={dashboardViewMode === 'route' ? undefined : { background: 'rgba(15,23,42,0.92)', borderColor: 'rgba(148,163,184,0.24)' }}>Solo route</Button>
                <Button variant={dashboardViewMode === 'all' ? 'info' : 'dark'} size="sm" onClick={() => setDashboardViewMode('all')} style={dashboardViewMode === 'all' ? undefined : { background: 'rgba(15,23,42,0.92)', borderColor: 'rgba(148,163,184,0.24)' }}>Todo</Button>
              </div> : null}
            <MapContainer center={selectedDriver?.position ?? DEFAULT_CENTER} zoom={10} zoomControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
              <StandaloneMapResizer resizeKey={`${dashboardSidebarHidden}-${dashboardViewMode}-${dashboardRouteStops.length}-${routeGeometry.length}-${selectedDashboardRouteGeometry.length}`} />
              <MapViewportController points={mapPoints} />
              <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
              <ZoomControl position="bottomright" />
              {activeDashboardViewMode !== 'addresses' && !hideRoutes ? dashboardRouteOptions.map((routeOption, index) => {
              if (routeOption.geometry.length <= 1) return null;
              return <Polyline key={`route-option-${routeOption.id}`} positions={routeOption.geometry} pathOptions={getDashboardRouteStyle(index === selectedDashboardRouteIndex, index)} />;
            }) : null}
              {activeDashboardViewMode !== 'route' && routeGeometry.length > 1 && !hideRoutes ? <Polyline positions={routeGeometry} pathOptions={{ color: '#f59e0b', weight: 4, dashArray: '10 8' }} /> : null}
              {selectedDriver?.hasRealLocation ? <Marker position={selectedDriver.position} icon={createRouteStopIcon('D', 'driver')}>
                  <Popup>
                    <div className="fw-semibold">{selectedDriver.name}</div>
                    <div>{selectedDriver.live || 'Offline'}</div>
                  </Popup>
                </Marker> : null}
              {activeDashboardViewMode !== 'addresses' && selectedDriver?.hasRealLocation && dashboardDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(dashboardDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
              {activeDashboardViewMode !== 'route' ? filteredDashboardRouteStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant, stop.timeLabel, showTimeLabels)}>
                  <Popup>
                    <div className="fw-semibold">{stop.title}</div>
                    <div>{stop.detail}</div>
                    {stop.timeLabel ? <div className="small mt-1" style={{ color: '#cbd5e1' }}>{stop.timeLabel}</div> : null}
                  </Popup>
                </Marker>) : null}
              {activeDashboardViewMode !== 'route' && originResult?.coordinates ? <Marker position={originResult.coordinates} icon={createRouteStopIcon('A', 'origin')} /> : null}
              {activeDashboardViewMode !== 'route' && destinationResult?.coordinates ? <Marker position={destinationResult.coordinates} icon={createRouteStopIcon('B', 'destination')} /> : null}
            </MapContainer>
          </div>
        </div>
      </div>;
  }

  return <div style={{ height: '100vh', padding: 0, background: '#eff3ea' }}>
      <div className="h-100" style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)' }}>
        <aside className="d-flex flex-column" style={{ background: 'linear-gradient(180deg, #f7f3ec 0%, #f1eee6 100%)', borderRight: '1px solid rgba(15, 23, 42, 0.08)', padding: 24, gap: 18 }}>
          <div>
            <div className="text-uppercase fw-semibold small" style={{ color: '#0f766e', letterSpacing: '0.12em' }}>Route Finder</div>
            <h1 className="h3 mt-2 mb-2" style={{ color: '#18212f' }}>ZIP code, city or full address</h1>
            <p className="mb-0" style={{ color: '#5b6677', lineHeight: 1.6 }}>Write where you start and where you are going. The map will show the route, miles and estimated driving time.</p>
          </div>

          <Form onSubmit={handleLookupRoute} className="d-flex flex-column gap-3">
            <Form.Group>
              <Form.Label className="fw-semibold" style={{ color: '#18212f' }}>From</Form.Label>
              <Form.Control value={originQuery} onChange={event => setOriginQuery(event.target.value)} placeholder="Example: 32808 or Orlando, FL" style={{ borderRadius: 16, padding: '14px 16px', borderColor: 'rgba(15, 23, 42, 0.14)' }} />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold" style={{ color: '#18212f' }}>To</Form.Label>
              <Form.Control value={destinationQuery} onChange={event => setDestinationQuery(event.target.value)} placeholder="Example: 32822 or Kissimmee, FL" style={{ borderRadius: 16, padding: '14px 16px', borderColor: 'rgba(15, 23, 42, 0.14)' }} />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" disabled={isLoading} style={{ flex: 1, borderRadius: 16, border: 'none', background: '#0f766e', padding: '12px 16px' }}>
                {isLoading ? <span className="d-inline-flex align-items-center gap-2"><Spinner size="sm" /> Calculating...</span> : 'Calculate Route'}
              </Button>
              <Button type="button" variant="light" onClick={handleClear} style={{ borderRadius: 16, padding: '12px 16px', borderColor: 'rgba(15, 23, 42, 0.12)' }}>Clear</Button>
            </div>
          </Form>

          {errorMessage ? <Alert variant="danger" className="mb-0" style={{ borderRadius: 16 }}>{errorMessage}</Alert> : null}

          <div className="d-flex flex-column gap-3" style={{ marginTop: 4 }}>
            <div className="rounded-4" style={{ background: '#ffffff', padding: 18, border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div className="small text-uppercase fw-semibold" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Estimated Drive Time</div>
              <div className="mt-2 fw-bold" style={{ fontSize: 32, color: '#18212f', lineHeight: 1.1 }}>{routeMetrics ? formatDriveMinutes(routeMetrics.durationMinutes) : '--'}</div>
              <div className="small mt-2" style={{ color: '#667085' }}>{routeMetrics?.isFallback ? 'Showing a direct line because no driving route was available.' : 'Live route based on the current map provider.'}</div>
            </div>
            <div className="rounded-4" style={{ background: '#ffffff', padding: 18, border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div className="small text-uppercase fw-semibold" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Distance</div>
              <div className="mt-2 fw-bold" style={{ fontSize: 28, color: '#18212f', lineHeight: 1.1 }}>{routeMetrics?.distanceMiles != null ? `${routeMetrics.distanceMiles.toFixed(1)} mi` : '--'}</div>
            </div>
            <div className="rounded-4" style={{ background: '#ffffff', padding: 18, border: '1px solid rgba(15, 23, 42, 0.08)' }}>
              <div className="small text-uppercase fw-semibold" style={{ color: '#6b7280', letterSpacing: '0.08em' }}>Points</div>
              <div className="mt-3 small" style={{ color: '#18212f', lineHeight: 1.6 }}>
                <div><strong>A:</strong> {originResult?.label || 'Waiting for origin'}</div>
                <div className="mt-2"><strong>B:</strong> {destinationResult?.label || 'Waiting for destination'}</div>
              </div>
            </div>
          </div>
        </aside>

        <div style={{ position: 'relative', minWidth: 0 }}>
          <MapContainer center={DEFAULT_CENTER} zoom={10} zoomControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
            <StandaloneMapResizer resizeKey={`${originResult?.label || ''}-${destinationResult?.label || ''}-${routeGeometry.length}`} />
            <MapViewportController points={mapPoints} />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
            <ZoomControl position="bottomright" />
            {routeGeometry.length > 1 ? <Polyline positions={routeGeometry} pathOptions={{ color: '#0f766e', weight: 5 }} /> : null}
            {originResult?.coordinates ? <Marker position={originResult.coordinates} icon={createRouteStopIcon('A')} /> : null}
            {destinationResult?.coordinates ? <Marker position={destinationResult.coordinates} icon={createRouteStopIcon('B')} /> : null}
          </MapContainer>
        </div>
      </div>
    </div>;
};

export default StandaloneDispatchMapScreen;