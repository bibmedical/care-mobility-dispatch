const TRIP_COLUMN_MIN_WIDTHS = {
  pickup: 56,
  dropoff: 56,
  miles: 56,
  puZip: 64,
  doZip: 64,
  leg: 52,
  lateMinutes: 68
};
'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import DispatcherMessagingPanel from '@/components/nemt/DispatcherMessagingPanel';
import { useNemtContext } from '@/context/useNemtContext';
import { DISPATCH_TRIP_COLUMN_OPTIONS, getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { buildRoutePrintDocument } from '@/helpers/nemt-print-setup';
import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import { openWhatsAppConversation, resolveRouteShareDriver } from '@/utils/whatsapp';
import { divIcon } from 'leaflet';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const DispatcherMapResizer = ({ resizeKey }) => {
  const map = useMap();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [map, resizeKey]);

  return null;
};

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  if (status === 'WillCall') return 'danger';
  if (status === 'Cancelled') return 'danger';
  return 'secondary';
};

const getLegBadge = trip => {
  if (trip.legVariant && trip.legLabel) return {
    variant: trip.legVariant,
    label: trip.legLabel
  };
  return null;
};

const getDriverCheckpoint = driver => {
  if (driver.checkpoint) return driver.checkpoint;
  if (!driver.position) return 'No GPS';
  return `${driver.position[0].toFixed(4)}, ${driver.position[1].toFixed(4)}`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

const formatDriveMinutes = minutes => {
  if (!Number.isFinite(minutes)) return 'Time unavailable';
  const roundedMinutes = Math.max(1, Math.round(minutes));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const normalizeSortValue = value => {
  if (value == null) return '';
  if (typeof value === 'number') return value;
  return String(value).trim().toLowerCase();
};

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const getDisplayTripId = trip => {
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  if (brokerTripId) return brokerTripId;
  const tripId = String(trip?.id || '').trim();
  if (!tripId) return '';
  return tripId.split('-')[0] || tripId;
};

const getTripNoteText = trip => String(trip?.notes || trip?.note || trip?.comments || '').trim();

const getPickupZip = trip => String(trip?.fromZipcode || trip?.fromZip || trip?.pickupZipcode || trip?.pickupZip || trip?.originZip || '').trim();

const getDropoffZip = trip => String(trip?.toZipcode || trip?.toZip || trip?.dropoffZipcode || trip?.dropoffZip || trip?.destinationZip || '').trim();

const extractCityFromAddress = address => {
  const parts = String(address || '').split(',');
  return parts.length >= 2 ? parts[1].trim() : '';
};

const getPickupCity = trip => extractCityFromAddress(trip?.address);
const getDropoffCity = trip => extractCityFromAddress(trip?.destination);

const buildTripEditDraft = trip => ({
  notes: String(trip?.notes || '').trim(),
  scheduledPickup: String(trip?.scheduledPickup || '').trim(),
  actualPickup: String(trip?.actualPickup || '').trim(),
  scheduledDropoff: String(trip?.scheduledDropoff || '').trim(),
  actualDropoff: String(trip?.actualDropoff || '').trim(),
  delay: trip?.lateMinutes != null ? String(Math.round(trip.lateMinutes)) : String(trip?.delay || '').trim(),
  onTimeStatus: String(trip?.onTimeStatus || '').trim()
});

const getTripSortValue = (trip, sortKey, getDriverName) => {
  switch (sortKey) {
    case 'trip':
      return trip.brokerTripId || trip.id;
    case 'status':
      return trip.status;
    case 'driver':
      return getDriverName(trip.driverId);
    case 'pickup':
      return trip.pickupSortValue ?? trip.pickup;
    case 'dropoff':
      return trip.dropoff;
    case 'rider':
      return trip.rider;
    case 'address':
      return trip.address;
    case 'puZip':
      return getPickupZip(trip);
    case 'destination':
      return trip.destination;
    case 'doZip':
      return getDropoffZip(trip);
    case 'phone':
      return trip.patientPhoneNumber;
    case 'miles':
      return Number(trip.miles) || 0;
    case 'vehicle':
      return trip.vehicleType;
    case 'leg':
      return trip.legLabel;
    case 'punctuality':
      return getTripPunctualityLabel(trip);
    case 'lateMinutes':
      return Number(trip.lateMinutes) || 0;
    default:
      return trip.pickupSortValue ?? trip.id;
  }
};

const getTripTypeLabel = trip => {
  const source = `${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'STR';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};

const getTripLegFilterKey = trip => {
  const legLabel = String(trip?.legLabel || '').trim().toLowerCase();
  if (!legLabel) return 'AL';
  if (legLabel.includes('outbound') || legLabel.includes('appointment') || legLabel.includes('appt')) return 'AL';
  if (legLabel.includes('return') || legLabel.includes('home') || legLabel.includes('house') || legLabel.includes('back')) return 'BL';
  if (legLabel.includes('3') || legLabel.includes('third') || legLabel.includes('connector') || legLabel.includes('cross')) return 'CL';
  return 'CL';
};

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? trip?.destinationPosition ?? trip?.position : trip?.position;

const createDriverMapIcon = ({ isSelected, isOnline }) => divIcon({
  className: 'driver-map-icon-shell',
  html: `<div style="width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${isSelected ? '#f59e0b' : isOnline ? '#16a34a' : '#475569'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:16px;line-height:1;">&#128663;</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -16]
});

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#2563eb'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const DispatcherWorkspace = () => {
  const router = useRouter();
  const {
    drivers,
    trips,
    routePlans,
    selectedTripIds,
    selectedDriverId,
    selectedRouteId,
    setSelectedDriverId,
    setSelectedRouteId,
    setSelectedTripIds,
    uiPreferences,
    toggleTripSelection,
    assignTripsToDriver,
    unassignTrips,
    cancelTrips,
    reinstateTrips,
    refreshDrivers,
    refreshDispatchState,
    getDriverName,
    updateTripNotes,
    updateTripRecord,
    setDispatcherVisibleTripColumns,
    setMapProvider
  } = useNemtContext();
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [tripIdSearch, setTripIdSearch] = useState('');
  const [tripLegFilter, setTripLegFilter] = useState('all');
  const [tripTypeFilter, setTripTypeFilter] = useState('all');
  const [tripDateFilter, setTripDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [mapCityQuickFilter, setMapCityQuickFilter] = useState('');
  const [mapZipQuickFilter, setMapZipQuickFilter] = useState('');
  const [pickupZipFilter, setPickupZipFilter] = useState('');
  const [dropoffZipFilter, setDropoffZipFilter] = useState('');
  const [zipFilter, setZipFilter] = useState('');
  const [puCityFilter, setPuCityFilter] = useState('');
  const [doCityFilter, setDoCityFilter] = useState('');
  const [routeSearch, setRouteSearch] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showBottomPanels, setShowBottomPanels] = useState(false);
  const [showInlineMap, setShowInlineMap] = useState(true);
  const [mapLocked, setMapLocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Dispatcher listo.');
  const [columnSplit, setColumnSplit] = useState(50);
  const [rowSplit, setRowSplit] = useState(56);
  const [dragMode, setDragMode] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [tripOrderMode, setTripOrderMode] = useState('original');
  const [quickReassignDriverId, setQuickReassignDriverId] = useState('');
  const [noteModalTripId, setNoteModalTripId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tripEditDraft, setTripEditDraft] = useState(buildTripEditDraft(null));
  const [tripSort, setTripSort] = useState({
    key: 'pickup',
    direction: 'asc'
  });
  const [columnWidths, setColumnWidths] = useState({});
  const workspaceRef = useRef(null);
  const deferredRouteSearch = useDeferredValue(routeSearch);

  const selectedDriver = useMemo(() => drivers.find(driver => driver.id === selectedDriverId) ?? null, [drivers, selectedDriverId]);
  const selectedRoute = useMemo(() => routePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [routePlans, selectedRouteId]);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);
  const hasSelectedTrips = selectedTripIds.length > 0;

  const cityOptionTrips = useMemo(() => trips.filter(trip => {
    const normalizedStatus = String(trip.status || '').toLowerCase();
    const matchesStatus = tripStatusFilter === 'all' ? normalizedStatus !== 'cancelled' : normalizedStatus === tripStatusFilter;
    if (!matchesStatus) return false;
    const tripDate = getTripServiceDateKey(trip);
    if (tripDate && tripDate !== tripDateFilter) return false;
    if (!selectedDriverId) return true;
    return !trip.driverId || trip.driverId === selectedDriverId;
  }).filter(trip => {
    if (tripLegFilter === 'all') return true;
    return getTripLegFilterKey(trip) === tripLegFilter;
  }).filter(trip => {
    if (tripTypeFilter === 'all') return true;
    return getTripTypeLabel(trip) === tripTypeFilter;
  }).filter(trip => {
    const searchValue = tripIdSearch.trim().toLowerCase();
    if (!searchValue) return true;
    return String(trip.id || '').toLowerCase().includes(searchValue) || String(trip.brokerTripId || '').toLowerCase().includes(searchValue);
  }).filter(trip => {
    const pickupZipValue = pickupZipFilter.trim();
    if (!pickupZipValue) return true;
    return getPickupZip(trip) === pickupZipValue;
  }).filter(trip => {
    const dropoffZipValue = dropoffZipFilter.trim();
    if (!dropoffZipValue) return true;
    return getDropoffZip(trip) === dropoffZipValue;
  }).filter(trip => {
    const zipValue = zipFilter.trim().toLowerCase();
    if (!zipValue) return true;
    return getPickupZip(trip).toLowerCase().includes(zipValue) || getDropoffZip(trip).toLowerCase().includes(zipValue);
  }), [dropoffZipFilter, pickupZipFilter, selectedDriverId, tripIdSearch, tripLegFilter, tripStatusFilter, tripTypeFilter, tripDateFilter, trips, zipFilter]);
  const availablePickupZips = useMemo(() => {
    const targetDropoffZip = dropoffZipFilter.trim();
    return Array.from(new Set(cityOptionTrips.filter(trip => !targetDropoffZip || getDropoffZip(trip) === targetDropoffZip).map(trip => getPickupZip(trip).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, dropoffZipFilter]);
  const availableDropoffZips = useMemo(() => {
    const targetPickupZip = pickupZipFilter.trim();
    return Array.from(new Set(cityOptionTrips.filter(trip => !targetPickupZip || getPickupZip(trip) === targetPickupZip).map(trip => getDropoffZip(trip).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, pickupZipFilter]);
  const availablePickupCities = useMemo(() => {
    const targetDropoffCity = doCityFilter.trim().toLowerCase();
    return Array.from(new Set(cityOptionTrips.filter(trip => !targetDropoffCity || getDropoffCity(trip).toLowerCase() === targetDropoffCity).map(trip => getPickupCity(trip).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, doCityFilter]);
  const availableDropoffCities = useMemo(() => {
    const targetPickupCity = puCityFilter.trim().toLowerCase();
    return Array.from(new Set(cityOptionTrips.filter(trip => !targetPickupCity || getPickupCity(trip).toLowerCase() === targetPickupCity).map(trip => getDropoffCity(trip).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, puCityFilter]);
  const filteredTrips = useMemo(() => cityOptionTrips.filter(trip => {
    const pickupCityValue = puCityFilter.trim().toLowerCase();
    if (!pickupCityValue) return true;
    return getPickupCity(trip).toLowerCase() === pickupCityValue;
  }).filter(trip => {
    const dropoffCityValue = doCityFilter.trim().toLowerCase();
    if (!dropoffCityValue) return true;
    return getDropoffCity(trip).toLowerCase() === dropoffCityValue;
  }), [cityOptionTrips, doCityFilter, puCityFilter]);
  const mapQuickCityOptions = useMemo(() => {
    const citySet = new Set();
    for (const trip of cityOptionTrips) {
      const pickupCity = getPickupCity(trip).trim();
      const dropoffCity = getDropoffCity(trip).trim();
      if (pickupCity) citySet.add(pickupCity);
      if (dropoffCity) citySet.add(dropoffCity);
    }
    return Array.from(citySet).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips]);
  const mapQuickZipOptions = useMemo(() => {
    const selectedCity = mapCityQuickFilter.trim().toLowerCase();
    const zipSet = new Set();
    for (const trip of cityOptionTrips) {
      const pickupCity = getPickupCity(trip).toLowerCase();
      const dropoffCity = getDropoffCity(trip).toLowerCase();
      if (selectedCity && pickupCity !== selectedCity && dropoffCity !== selectedCity) continue;
      const pickupZip = getPickupZip(trip).trim();
      const dropoffZip = getDropoffZip(trip).trim();
      if (pickupZip) zipSet.add(pickupZip);
      if (dropoffZip) zipSet.add(dropoffZip);
    }
    return Array.from(zipSet).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, mapCityQuickFilter]);
  const mapQuickTrips = useMemo(() => {
    const selectedCity = mapCityQuickFilter.trim().toLowerCase();
    const selectedZip = mapZipQuickFilter.trim();
    if (!selectedCity && !selectedZip) return [];
    return cityOptionTrips.filter(trip => {
      const pickupCity = getPickupCity(trip).toLowerCase();
      const dropoffCity = getDropoffCity(trip).toLowerCase();
      const pickupZip = getPickupZip(trip);
      const dropoffZip = getDropoffZip(trip);
      const cityMatches = !selectedCity || pickupCity === selectedCity || dropoffCity === selectedCity;
      const zipMatches = !selectedZip || pickupZip === selectedZip || dropoffZip === selectedZip;
      return cityMatches && zipMatches;
    });
  }, [cityOptionTrips, mapCityQuickFilter, mapZipQuickFilter]);
  const visibleTripIds = filteredTrips.map(trip => trip.id);
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const filteredDrivers = drivers;
  const tripOriginalOrderLookup = useMemo(() => new Map(trips.map((trip, index) => [trip.id, index])), [trips]);
  const selectedDriverAssignedTripCount = useMemo(() => selectedDriverId ? trips.filter(trip => trip.driverId === selectedDriverId).length : 0, [selectedDriverId, trips]);
  const groupedFilteredTripRows = useMemo(() => {
    const compareTrips = (leftTrip, rightTrip) => {
      const leftAssignedToSelectedDriver = selectedDriverId && leftTrip.driverId === selectedDriverId ? 1 : 0;
      const rightAssignedToSelectedDriver = selectedDriverId && rightTrip.driverId === selectedDriverId ? 1 : 0;
      if (leftAssignedToSelectedDriver !== rightAssignedToSelectedDriver) return rightAssignedToSelectedDriver - leftAssignedToSelectedDriver;
      if (tripOrderMode === 'time') {
        const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        if (leftTime !== rightTime) return leftTime - rightTime;
      } else if (tripOrderMode === 'custom') {
        const leftValue = normalizeSortValue(getTripSortValue(leftTrip, tripSort.key, getDriverName));
        const rightValue = normalizeSortValue(getTripSortValue(rightTrip, tripSort.key, getDriverName));
        if (leftValue !== rightValue) {
          const result = leftValue > rightValue ? 1 : -1;
          return tripSort.direction === 'asc' ? result : -result;
        }
      } else {
        const leftOriginalIndex = tripOriginalOrderLookup.get(leftTrip.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOriginalIndex = tripOriginalOrderLookup.get(rightTrip.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftOriginalIndex !== rightOriginalIndex) return leftOriginalIndex - rightOriginalIndex;
      }
      const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
      const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(leftTrip.id).localeCompare(String(rightTrip.id));
    };

    const groups = filteredTrips.reduce((map, trip) => {
      const groupKey = trip.brokerTripId || trip.id;
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(trip);
      return map;
    }, new Map());

    return Array.from(groups.entries()).map(([groupKey, groupTrips]) => ({
      groupKey,
      trips: [...groupTrips].sort(compareTrips)
    })).sort((leftGroup, rightGroup) => compareTrips(leftGroup.trips[0], rightGroup.trips[0])).flatMap(group => [{
      type: 'group',
      groupKey: group.groupKey,
      ridesCount: group.trips.length,
      label: group.trips.length > 1 ? `Trip ${group.groupKey} • ${group.trips.length} rides` : `Trip ${group.groupKey}`
    }, ...group.trips.map(trip => ({
      type: 'trip',
      groupKey: group.groupKey,
      trip
    }))]);
  }, [filteredTrips, getDriverName, selectedDriverId, tripOrderMode, tripOriginalOrderLookup, tripSort.direction, tripSort.key]);

  const routeTrips = useMemo(() => {
    const baseTrips = selectedRoute ? trips.filter(trip => selectedRoute.tripIds.includes(trip.id)) : selectedDriver ? trips.filter(trip => trip.driverId === selectedDriver.id) : trips.filter(trip => selectedTripIds.includes(trip.id));
    const term = deferredRouteSearch.trim().toLowerCase();
    return sortTripsByPickupTime(baseTrips.filter(trip => !term || [trip.id, trip.rider, trip.address].some(value => value.toLowerCase().includes(term))));
  }, [deferredRouteSearch, selectedDriver, selectedRoute, selectedTripIds, trips]);

  const routeStops = useMemo(() => {
    if (!showRoute) return [];

    if (selectedTripIds.length > 0) {
      return sortTripsByPickupTime(trips.filter(trip => selectedTripIds.includes(trip.id))).flatMap((trip, index) => [{
        key: `${trip.id}-pickup`,
        label: `${index * 2 + 1}`,
        variant: 'pickup',
        position: trip.position,
        title: `Pickup ${trip.pickup}`,
        detail: trip.address
      }, {
        key: `${trip.id}-dropoff`,
        label: `${index * 2 + 2}`,
        variant: 'dropoff',
        position: trip.destinationPosition ?? trip.position,
        title: `Dropoff ${trip.dropoff}`,
        detail: trip.destination || 'Destination pending'
      }]);
    }

    if (selectedRoute) {
      return routeTrips.flatMap((trip, index) => [{
        key: `${trip.id}-pickup`,
        label: `${index * 2 + 1}`,
        variant: 'pickup',
        position: trip.position,
        title: `Pickup ${trip.pickup}`,
        detail: trip.address
      }, {
        key: `${trip.id}-dropoff`,
        label: `${index * 2 + 2}`,
        variant: 'dropoff',
        position: trip.destinationPosition ?? trip.position,
        title: `Dropoff ${trip.dropoff}`,
        detail: trip.destination || 'Destination pending'
      }]);
    }

    return [];
  }, [routeTrips, selectedRoute, selectedTripIds, showRoute, trips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const assignedTripsCount = trips.filter(trip => trip.status === 'Assigned').length;
  const activeInfoTrip = useMemo(() => {
    if (selectedTripIds.length > 0) {
      return trips.find(trip => selectedTripIds.includes(trip.id)) ?? null;
    }

    if (selectedRoute) {
      return routeTrips[0] ?? null;
    }

    if (selectedDriver) {
      return trips.find(trip => trip.driverId === selectedDriver.id) ?? null;
    }

    return null;
  }, [routeTrips, selectedDriver, selectedRoute, selectedTripIds, trips]);
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIds.includes(id));
  const tripTableColumnCount = visibleTripColumns.length + 3;
  const selectedDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const preferredTrip = trips.find(trip => selectedTripIds.includes(trip.id) && trip.driverId === selectedDriver.id);
    if (preferredTrip) return preferredTrip;
    const routeTrip = routeTrips.find(trip => trip.driverId === selectedDriver.id);
    if (routeTrip) return routeTrip;
    return trips.find(trip => trip.driverId === selectedDriver.id) ?? null;
  }, [routeTrips, selectedDriver, selectedTripIds, trips]);
  const selectedDriverEta = useMemo(() => {
    if (!selectedDriver || !selectedDriver.hasRealLocation || !selectedDriverActiveTrip) return null;
    const miles = getDistanceMiles(selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip));
    return {
      miles,
      label: formatEta(miles)
    };
  }, [selectedDriver, selectedDriverActiveTrip]);
  const driversWithRealLocation = useMemo(() => drivers.filter(driver => driver.hasRealLocation), [drivers]);
  const activeDrivers = useMemo(() => {
    const onlineDrivers = drivers.filter(driver => driver.live === 'Online');
    return onlineDrivers.length > 0 ? onlineDrivers : drivers;
  }, [drivers]);
  const noteModalTrip = useMemo(() => noteModalTripId ? trips.find(trip => trip.id === noteModalTripId) ?? null : null, [noteModalTripId, trips]);

  const handleOpenTripNote = trip => {
    setNoteModalTripId(trip.id);
    setNoteDraft(getTripNoteText(trip));
    setTripEditDraft(buildTripEditDraft(trip));
  };

  const handleCloseTripNote = () => {
    setNoteModalTripId(null);
    setNoteDraft('');
    setTripEditDraft(buildTripEditDraft(null));
  };

  const handleSaveTripNote = () => {
    if (!noteModalTrip) return;
    updateTripRecord(noteModalTrip.id, {
      notes: noteDraft,
      scheduledPickup: tripEditDraft.scheduledPickup,
      actualPickup: tripEditDraft.actualPickup,
      scheduledDropoff: tripEditDraft.scheduledDropoff,
      actualDropoff: tripEditDraft.actualDropoff,
      delay: tripEditDraft.delay,
      lateMinutes: tripEditDraft.delay,
      onTimeStatus: tripEditDraft.onTimeStatus
    });
    setStatusMessage(`Puntualidad y nota guardadas para ${getDisplayTripId(noteModalTrip)}.`);
    handleCloseTripNote();
  };

  const handleToggleTripColumn = columnKey => {
    const nextColumns = visibleTripColumns.includes(columnKey) ? visibleTripColumns.filter(item => item !== columnKey) : [...visibleTripColumns, columnKey];
    if (nextColumns.length === 0) {
      setStatusMessage('Debe quedar al menos una columna visible.');
      return;
    }
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage('Vista de columnas actualizada.');
  };

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...visibleTripIds])));
      setStatusMessage('Trips visibles seleccionados.');
      return;
    }
    setSelectedTripIds(selectedTripIds.filter(id => !visibleTripIds.includes(id)));
    setStatusMessage('Trips visibles deseleccionados.');
  };

  const handleShiftTripDate = offsetDays => {
    const nextDate = shiftTripDateKey(tripDateFilter, offsetDays);
    if (nextDate) setTripDateFilter(nextDate);
  };

  const handleTripSelectionToggle = tripId => {
    const trip = trips.find(item => item.id === tripId);
    const isSelecting = !selectedTripIds.includes(tripId);

    toggleTripSelection(tripId);

    if (isSelecting && trip?.driverId) {
      setSelectedDriverId(trip.driverId);
      if (!showBottomPanels) {
        setShowBottomPanels(true);
      }
      setStatusMessage(`SMS listo con ${getDriverName(trip.driverId)} para el trip ${trip.id}.`);
    }
  };

  const handleAssign = driverId => {
    if (!driverId || selectedTripIds.length === 0) {
      setStatusMessage('Selecciona chofer y al menos un trip.');
      return;
    }

    const driver = drivers.find(item => item.id === driverId);
    if (!driver) {
      setStatusMessage('El chofer seleccionado ya no esta disponible. Recarga la lista.');
      return;
    }

    assignTripsToDriver(driverId);
    setStatusMessage(`${selectedTripIds.length} trip(s) asignados a ${driver.name}.`);
  };

  const handleAssignTrip = tripId => {
    if (!selectedDriverId) {
      setStatusMessage('Primero escoge un chofer para asignar este trip.');
      return;
    }

    const driver = drivers.find(item => item.id === selectedDriverId);
    if (!driver) {
      setStatusMessage('El chofer seleccionado no esta disponible.');
      return;
    }

    assignTripsToDriver(selectedDriverId, [tripId]);
    setSelectedTripIds([tripId]);
    setStatusMessage(`Trip ${tripId} asignado a ${driver.name}.`);
  };

  const handleQuickReassignSelectedTrips = () => {
    if (!quickReassignDriverId || selectedTripIds.length === 0) {
      setStatusMessage('Escoge un chofer activo y al menos un trip abajo para reasignar.');
      return;
    }

    const driver = drivers.find(item => item.id === quickReassignDriverId);
    if (!driver) {
      setStatusMessage('Ese chofer ya no esta disponible.');
      return;
    }

    const selectedCount = selectedTripIds.length;
    assignTripsToDriver(quickReassignDriverId, selectedTripIds);
    setSelectedTripIds([]);
    setSelectedDriverId(quickReassignDriverId);
    setSelectedRouteId('');
    setQuickReassignDriverId('');
    if (!showBottomPanels) {
      setShowBottomPanels(true);
    }
    setStatusMessage(`${selectedCount} trip(s) reasignados a ${driver.name}.`);
  };

  useEffect(() => {
    if (!mapZipQuickFilter) return;
    if (mapQuickZipOptions.includes(mapZipQuickFilter)) return;
    setMapZipQuickFilter('');
  }, [mapQuickZipOptions, mapZipQuickFilter]);

  const handleDriverSelectionChange = nextDriverId => {
    setSelectedDriverId(nextDriverId);
    setSelectedRouteId('');

    if (!nextDriverId) {
      setSelectedTripIds([]);
      setStatusMessage('Mostrando todos los trips otra vez.');
      return;
    }

    const nextSelectedTripIds = selectedTripIds.filter(id => {
      const trip = trips.find(item => item.id === id);
      return trip && (!trip.driverId || trip.driverId === nextDriverId);
    });

    setSelectedTripIds(nextSelectedTripIds);

    const driver = drivers.find(item => item.id === nextDriverId);
    if (!driver) {
      setStatusMessage('Chofer no encontrado.');
      return;
    }

    const assignedCount = trips.filter(trip => trip.driverId === nextDriverId).length;
    const openCount = trips.filter(trip => !trip.driverId).length;
    setStatusMessage(`Viendo ${driver.name}: ${assignedCount} asignados y ${openCount} pendientes.`);
  };

  const handleUnassign = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to remove assignment.');
      return;
    }
    unassignTrips();
    setStatusMessage('Trips desasignados.');
  };

  const handleUnassignTrip = tripId => {
    unassignTrips([tripId]);
    setSelectedTripIds(currentIds => currentIds.filter(id => id !== tripId));
    setStatusMessage(`Trip ${tripId} desasignado.`);
  };

  const handleCancelTrip = tripId => {
    cancelTrips([tripId]);
    setStatusMessage(`Trip ${tripId} cancelado.`);
  };

  const handleCancelSelectedTrips = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to cancel.');
      return;
    }

    cancelTrips(selectedTripIds);
    setStatusMessage(`${selectedTripIds.length} trip(s) cancelados.`);
  };

  const handleReinstateTrip = tripId => {
    reinstateTrips([tripId]);
    setStatusMessage(`Trip ${tripId} incorporado otra vez.`);
  };

  const handleReinstateSelectedTrips = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to incorporate.');
      return;
    }

    reinstateTrips(selectedTripIds);
    setStatusMessage(`${selectedTripIds.length} trip(s) incorporados otra vez.`);
  };

  const handleToggleWillCall = tripId => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    
    const newStatus = trip.status === 'WillCall' ? 'Unassigned' : 'WillCall';
    updateTripRecord(tripId, { status: newStatus });
    
    if (newStatus === 'WillCall') {
      setStatusMessage(`Trip ${tripId} marcado como WillCall - Notificación enviada al chofer.`);
      // Send notification to driver via app
      if (trip.driverId) {
        const driver = drivers.find(d => d.id === trip.driverId);
        if (driver) {
          sendWillCallNotification(driver, trip);
        }
      }
    } else {
      setStatusMessage(`Trip ${tripId} removido de WillCall.`);
    }
  };

  const sendWillCallNotification = async (driver, trip) => {
    try {
      const message = `⚠️ WILL CALL - Trip ${trip.id}: Patient ${trip.rider || 'N/A'} from ${trip.pickup || 'N/A'} to ${trip.dropoff || 'N/A'}. Aguarda la llamada del seguro para instrucciones.`;
      
      await fetch('/api/extensions/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'whatsapp',
          phoneNumber: driver.phone,
          driverId: driver.id,
          driverName: driver.name,
          message: message
        })
      });
      
      console.log(`WillCall notification sent to ${driver.name} for trip ${trip.id}`);
    } catch (error) {
      console.error('Error sending WillCall notification:', error);
    }
  };

  const handleTripSortChange = columnKey => {
    setTripOrderMode('custom');
    setTripSort(currentSort => currentSort.key === columnKey ? {
      key: columnKey,
      direction: currentSort.direction === 'asc' ? 'desc' : 'asc'
    } : {
      key: columnKey,
      direction: 'asc'
    });
  };

  const handleTripOrderModeToggle = () => {
    setTripOrderMode(currentMode => {
      const nextMode = currentMode === 'time' ? 'original' : 'time';
      setStatusMessage(nextMode === 'time' ? 'Trips ordenados por hora.' : 'Trips en el orden original.');
      return nextMode;
    });
  };

  const handlePrintRoute = () => {
    if (routeTrips.length === 0) {
      setStatusMessage('No hay ruta para imprimir todavia.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) {
      setStatusMessage('No se pudo abrir la ventana de impresion.');
      return;
    }

    const title = selectedDriver ? `Ruta de ${selectedDriver.name}` : selectedRoute ? `Ruta ${selectedRoute.name}` : 'Ruta actual';
    const generatedAt = new Date().toLocaleString();
    printWindow.document.write(buildRoutePrintDocument({
      routeTitle: title,
      driverName: selectedDriver ? selectedDriver.name : 'No driver selected',
      generatedAt,
      routeTrips,
      printSetup: uiPreferences?.printSetup,
      getTripTypeLabel
    }));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setStatusMessage(`Imprimiendo ${title.toLowerCase()}.`);
  };

  const handleSendConfirmationSms = async () => {
    const targetTripIds = selectedTripIds.length > 0 ? selectedTripIds : routeTrips.map(trip => trip.id);
    if (targetTripIds.length === 0) {
      setStatusMessage('Select at least one trip or route before sending a confirmation SMS.');
      return;
    }

    try {
      const response = await fetch('/api/integrations/sms/send-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tripIds: targetTripIds
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send confirmation SMS');

      if (payload.failedCount > 0) {
        await refreshDispatchState({ forceServer: true });
        setStatusMessage(`SMS enviados: ${payload.sentCount}. Fallidos: ${payload.failedCount}.`);
        return;
      }

      await refreshDispatchState({ forceServer: true });
      setStatusMessage(`SMS de confirmacion enviados para ${payload.sentCount} trip(s).`);
    } catch (error) {
      setStatusMessage(error.message || 'No se pudo mandar el SMS de confirmacion.');
    }
  };

  const handleShareRouteWhatsapp = () => {
    const targetDriver = resolveRouteShareDriver({
      selectedDriver,
      selectedRoute,
      routeTrips,
      drivers
    });

    if (!targetDriver) {
      setStatusMessage('Selecciona un chofer antes de enviar por WhatsApp.');
      return;
    }
    if (routeTrips.length === 0) {
      setStatusMessage('No hay ruta para enviar por WhatsApp todavia.');
      return;
    }

    const title = targetDriver ? `Ruta de ${targetDriver.name}` : selectedRoute ? `Ruta ${selectedRoute.name}` : 'Ruta actual';
    const message = [`Hello ${targetDriver.name},`, '', `Your route: ${title}`, `Total trips: ${routeTrips.length}`, '', routeTrips.map((trip, index) => [`${index + 1}. ${trip.pickup} - ${trip.dropoff} | ${trip.rider}`,
      `PU: ${trip.address || 'No pickup address'}`,
      `DO: ${trip.destination || 'No dropoff address'}`
    ].join('\n')).join('\n\n')].join('\n');
    const whatsappResult = openWhatsAppConversation({
      phoneNumber: targetDriver.phone,
      message
    });

    if (!whatsappResult.ok) {
      if (whatsappResult.reason === 'missing-phone') {
        setStatusMessage(`El chofer ${targetDriver.name} no tiene un numero valido para WhatsApp.`);
        return;
      }

      if (whatsappResult.reason === 'popup-blocked') {
        setStatusMessage('The browser blocked the new WhatsApp tab. Allow pop-ups for this page.');
        return;
      }

      setStatusMessage('No se pudo abrir WhatsApp.');
      return;
    }

    setStatusMessage(`Abriendo WhatsApp en una nueva pestaña para ${targetDriver.name}.`);
  };

  const handleColumnResizeStart = (event, columnKey) => {
    event.preventDefault();
    event.stopPropagation();
    const headerCell = event.currentTarget.closest('th');
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey] ?? Math.round(headerCell?.getBoundingClientRect().width || 120);

    const handlePointerMove = moveEvent => {
      const delta = moveEvent.clientX - startX;
      const minWidth = TRIP_COLUMN_MIN_WIDTHS[columnKey] ?? 56;
      const nextWidth = Math.max(minWidth, Math.min(640, startWidth + delta));
      setColumnWidths(current => ({
        ...current,
        [columnKey]: Math.round(nextWidth)
      }));
    };

    const stopDragging = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopDragging);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopDragging);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  const renderTripHeader = (columnKey, label, width) => {
    const resolvedWidth = columnWidths[columnKey] ?? width;
    return <th style={resolvedWidth ? { width: resolvedWidth, minWidth: resolvedWidth, maxWidth: resolvedWidth, position: 'relative' } : {
      position: 'relative'
    }}>
      <button type="button" onClick={() => handleTripSortChange(columnKey)} className="btn btn-link text-decoration-none text-reset p-0 d-inline-flex align-items-center gap-1 fw-semibold">
        <span>{label}</span>
        <span className="small">{tripSort.key === columnKey ? tripSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </button>
      <span role="presentation" onMouseDown={event => handleColumnResizeStart(event, columnKey)} style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 10,
        height: '100%',
        cursor: 'col-resize',
        background: 'linear-gradient(180deg, rgba(107,114,128,0) 0%, rgba(107,114,128,0.45) 30%, rgba(107,114,128,0.45) 70%, rgba(107,114,128,0) 100%)'
      }} />
    </th>;
  };

  useEffect(() => {
    if (!showRoute || routeStops.length < 2) {
      setRouteGeometry([]);
      setRouteMetrics(null);
      return;
    }

    const uniqueStops = routeStops.filter((stop, index, stops) => index === 0 || stop.position[0] !== stops[index - 1].position[0] || stop.position[1] !== stops[index - 1].position[1]);
    if (uniqueStops.length < 2) {
      setRouteGeometry(uniqueStops.map(stop => stop.position));
      setRouteMetrics(null);
      return;
    }

    const abortController = new AbortController();
    const coordinates = uniqueStops.map(stop => `${stop.position[0]},${stop.position[1]}`).join(';');

    const loadRouteGeometry = async () => {
      try {
        const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinates)}`, {
          signal: abortController.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('Routing service unavailable');
        const payload = await response.json();
        const geometry = Array.isArray(payload?.geometry) ? payload.geometry : [];
        if (geometry.length < 2) throw new Error('No drivable route found');
        setRouteGeometry(geometry);
        setRouteMetrics({
          distanceMiles: Number.isFinite(payload?.distanceMiles) ? payload.distanceMiles : null,
          durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null,
          isFallback: Boolean(payload?.isFallback)
        });
      } catch {
        if (abortController.signal.aborted) return;
        setRouteGeometry(uniqueStops.map(stop => stop.position));
        setRouteMetrics(null);
      }
    };

    loadRouteGeometry();

    return () => {
      abortController.abort();
    };
  }, [routeStops, showRoute]);

  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = event => {
      if (!workspaceRef.current) return;
      const bounds = workspaceRef.current.getBoundingClientRect();
      const nextColumnSplit = clamp((event.clientX - bounds.left) / bounds.width * 100, 28, 72);
      const nextRowSplit = clamp((event.clientY - bounds.top) / bounds.height * 100, 32, 74);

      if (dragMode === 'column' || dragMode === 'both') {
        setColumnSplit(nextColumnSplit);
      }

      if (dragMode === 'row' || dragMode === 'both') {
        setRowSplit(nextRowSplit);
      }
    };

    const stopDragging = () => {
      setDragMode(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopDragging);
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopDragging);
      document.body.style.userSelect = '';
    };
  }, [dragMode]);

  const workspaceHeight = expanded ? 1100 : 980;
  const dividerSize = 10;
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns: `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)`,
    gridTemplateRows: showBottomPanels ? `${rowSplit}% ${dividerSize}px minmax(0, ${100 - rowSplit}%)` : '1fr 0px 0px',
    height: workspaceHeight,
    minHeight: workspaceHeight,
    position: 'relative'
  };
  const dividerBaseStyle = {
    backgroundColor: '#2d3448',
    borderRadius: 999,
    position: 'relative',
    zIndex: 30,
    transition: 'background-color 0.15s'
  };

  const handleOpenMapWindow = () => {
    const mapUrl = `/map-screen?source=dispatcher`;
    window.localStorage.setItem('__CARE_MOBILITY_MAP_SCREEN_SOURCE__', 'dispatcher');
    const popup = window.open(mapUrl, 'care-mobility-map', 'popup=yes,width=1600,height=900,resizable=yes,scrollbars=no');
    if (popup) {
      popup.focus();
      setShowInlineMap(false);
      setStatusMessage('Mapa abierto en otra pantalla.');
      return;
    }
    window.open(mapUrl, '_blank', 'noopener,noreferrer');
    setShowInlineMap(false);
    setStatusMessage('Mapa abierto en otra pestana.');
  };

  return <>
      <div ref={workspaceRef} style={workspaceGridStyle}>
        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0">
              {showInlineMap ? <div className="position-relative h-100">
                <div className="position-absolute top-0 start-0 p-2 d-flex align-items-center gap-2 flex-wrap" style={{ zIndex: 650, maxWidth: '100%' }}>
                  <Button variant="dark" size="sm" onClick={() => setShowRoute(current => !current)} disabled={mapLocked}>Route</Button>
                  <Button variant="dark" size="sm" onClick={() => setSelectedTripIds([])} disabled={mapLocked}>Clear</Button>
                  <Form.Select size="sm" value={mapCityQuickFilter} onChange={event => setMapCityQuickFilter(event.target.value)} disabled={mapLocked} style={{ width: 150, backgroundColor: '#ffffff', color: '#08131a', borderColor: '#0f172a' }}>
                    <option value="">City</option>
                    {mapQuickCityOptions.map(city => <option key={city} value={city}>{city}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={mapZipQuickFilter} onChange={event => setMapZipQuickFilter(event.target.value)} disabled={mapLocked} style={{ width: 130, backgroundColor: '#ffffff', color: '#08131a', borderColor: '#0f172a' }}>
                    <option value="">ZIP Code</option>
                    {mapQuickZipOptions.map(zip => <option key={zip} value={zip}>{zip}</option>)}
                  </Form.Select>
                  <Button variant="dark" size="sm" onClick={() => setShowInfo(current => !current)} disabled={mapLocked}>{showInfo ? 'Hide Info' : 'Show Info'}</Button>
                  <Form.Select size="sm" value={uiPreferences?.mapProvider || 'auto'} onChange={event => setMapProvider(event.target.value)} disabled={mapLocked} style={{ width: 150, backgroundColor: '#ffffff', color: '#08131a', borderColor: '#0f172a' }}>
                    <option value="auto">Map: Auto</option>
                    <option value="openstreetmap">Map: OSM</option>
                    <option value="mapbox" disabled={!hasMapboxConfigured}>Map: Mapbox</option>
                  </Form.Select>
                  <Button variant="dark" size="sm" onClick={() => router.push('/drivers/grouping')} disabled={mapLocked}>Grouping</Button>
                  <Button variant="dark" size="sm" onClick={() => {
                  setShowBottomPanels(current => !current);
                  setStatusMessage(showBottomPanels ? 'Paneles inferiores ocultos.' : 'Paneles inferiores visibles.');
                }} disabled={mapLocked}>{showBottomPanels ? 'Hide SMS' : 'SMS'}</Button>
                  <Button variant={mapLocked ? 'danger' : 'dark'} size="sm" onClick={() => setMapLocked(current => !current)} style={{ fontWeight: 'bold' }}>{mapLocked ? '🔒 LOCKED' : 'Unlock'}</Button>
                  <Button variant="dark" size="sm" onClick={handleOpenMapWindow} disabled={mapLocked}>Pop Out</Button>
                </div>
                {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <div className="position-absolute bottom-0 start-0 m-3 bg-dark text-white border rounded shadow-sm p-3" style={{ zIndex: 500, minWidth: 260, borderColor: '#2a3144' }}>
                    <div className="small text-uppercase text-secondary">Driver ETA</div>
                    <div className="fw-semibold d-flex align-items-center gap-2"><IconifyIcon icon="iconoir:map-pin" /> {selectedDriver.name}</div>
                    <div className="small mt-1">Heading to {selectedDriverActiveTrip.id} • {selectedDriverActiveTrip.rider}</div>
                    <div className="small text-secondary">{selectedDriverActiveTrip.pickup} • {selectedDriverActiveTrip.address}</div>
                    <div className="mt-2 d-flex align-items-center gap-2 flex-wrap">
                      <Badge bg="info">{selectedDriverEta?.label || 'ETA unavailable'}</Badge>
                      <Badge bg="secondary">{selectedDriverEta?.miles != null ? `${selectedDriverEta.miles.toFixed(1)} mi` : 'No distance'}</Badge>
                      <Badge bg={selectedDriver.live === 'Online' ? 'success' : 'dark'}>{selectedDriver.live}</Badge>
                    </div>
                  </div> : null}
                <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} style={{ height: '100%', width: '100%' }}>
                  <DispatcherMapResizer resizeKey={`${showBottomPanels}-${columnSplit}-${rowSplit}-${selectedTripIds.join(',')}`} />
                  <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} />
                  <ZoomControl position="bottomleft" />
                  {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#2563eb', weight: 4 }} /> : null}
                  {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
                  {mapQuickTrips.flatMap(trip => {
                  const points = [{
                    key: `${trip.id}-pickup-mapquick`,
                    tripId: trip.id,
                    position: trip.position,
                    color: '#0ea5e9',
                    label: `PU ${trip.pickup}`
                  }, {
                    key: `${trip.id}-dropoff-mapquick`,
                    tripId: trip.id,
                    position: trip.destinationPosition ?? trip.position,
                    color: '#22c55e',
                    label: `DO ${trip.dropoff}`
                  }];
                  return points;
                }).map(point => <CircleMarker key={point.key} center={point.position} radius={6} pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.85 }} eventHandlers={{
                  click: () => toggleTripSelection(point.tripId)
                }}>
                      <Popup>{point.label}</Popup>
                    </CircleMarker>)}
                  {hasSelectedTrips ? routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                      <Popup>
                        <div className="fw-semibold">{stop.title}</div>
                        <div>{stop.detail}</div>
                      </Popup>
                    </Marker>) : null}
                  {hasSelectedTrips ? filteredTrips.filter(trip => selectedTripIds.includes(trip.id)).map(trip => <CircleMarker key={trip.id} center={trip.position} radius={10} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9 }} eventHandlers={{
                    click: () => toggleTripSelection(trip.id)
                  }}>
                      <Popup>{`${trip.brokerTripId || trip.id} | ${trip.legLabel || 'Ride'} | ${trip.rider} | ${trip.pickup}`}</Popup>
                    </CircleMarker>) : null}
                </MapContainer>
              </div> : <div className="h-100 d-flex flex-column justify-content-center align-items-center text-center p-4" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #162236 100%)', color: '#f8fafc' }}>
                  <div className="fw-semibold fs-5">Mapa movido a otra pantalla</div>
                  <div className="small mt-2" style={{ color: '#cbd5e1', maxWidth: 360 }}>Usa la ventana nueva para el mapa y sigue trabajando aqui con viajes, SMS y choferes.</div>
                  <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center mt-4">
                    <Button variant="light" size="sm" onClick={() => setShowInlineMap(true)}>Show Map Here</Button>
                    <Button variant="outline-light" size="sm" onClick={handleOpenMapWindow}>Open Map Window Again</Button>
                  </div>
                </div>}
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => setDragMode('column')} style={{
        ...dividerBaseStyle,
        cursor: 'col-resize',
        gridColumn: 2,
        gridRow: '1 / span 3'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 6, backgroundColor: '#6b7280' }} />
        </div>

        <div style={{ minWidth: 0, minHeight: 0 }}>
          <Card className="h-100">
            <CardBody className="p-0 d-flex flex-column h-100">
              <div className="d-flex flex-column align-items-stretch p-3 border-bottom bg-success text-dark gap-2 flex-shrink-0">
                {/* Row 1: Trip filters and selection */}
                <div className="d-flex align-items-center gap-2 flex-nowrap" style={{ minWidth: 'max-content', overflowX: 'auto', overflowY: 'hidden' }}>
                  <strong>Trips</strong>
                  <Badge bg="light" text="dark">{assignedTripsCount}/{trips.length}</Badge>
                  <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ width: 130 }}>
                    <option value="all">All</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="willcall">WillCall</option>
                    <option value="cancelled">Cancelled</option>
                  </Form.Select>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <Button variant="outline-dark" size="sm" onClick={() => handleShiftTripDate(-1)} title="Previous day" style={greenToolbarButtonStyle}>Prev</Button>
                    <Form.Control size="sm" type="date" value={tripDateFilter} onChange={event => setTripDateFilter(event.target.value)} style={{ width: 150 }} title="Filter trips by date" />
                    <Button variant="outline-dark" size="sm" onClick={() => handleShiftTripDate(1)} title="Next day" style={greenToolbarButtonStyle}>Next</Button>
                    <Button variant="outline-dark" size="sm" onClick={() => setTripDateFilter(new Date().toISOString().slice(0, 10))} title="Today" style={greenToolbarButtonStyle}>Today</Button>
                  </div>
                  <Form.Control size="sm" value={tripIdSearch} onChange={event => setTripIdSearch(event.target.value)} placeholder="Search Trip ID" disabled={mapLocked} style={{ width: 150 }} />
                  <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => handleDriverSelectionChange(event.target.value)} disabled={mapLocked} style={{ width: 220 }}>
                    <option value="">Select driver</option>
                    {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  {selectedDriver ? <Badge bg="light" text="dark">{selectedDriverAssignedTripCount} assigned</Badge> : null}
                  <Badge bg={selectedTripIds.length > 0 ? 'dark' : 'light'} text={selectedTripIds.length > 0 ? 'light' : 'dark'}>{selectedTripIds.length} selected trips</Badge>
                </div>
                
                {/* Row 2: Statistics and main action buttons */}
                <div className="d-flex gap-2 small flex-nowrap position-relative" style={{ minWidth: 'max-content', overflow: 'visible' }}>
                  <Badge bg="primary">{trips.length} trips</Badge>
                  <Badge bg="info">{drivers.length} drivers</Badge>
                  <Badge bg="secondary">{liveDrivers} live</Badge>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowColumnPicker(current => !current)} disabled={mapLocked}>
                    Columns
                  </Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={showInlineMap ? handleOpenMapWindow : () => setShowInlineMap(true)} disabled={mapLocked}>
                    {showInlineMap ? 'Map Screen' : 'Show Map Here'}
                  </Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleTripOrderModeToggle} disabled={mapLocked}>
                    {tripOrderMode === 'time' ? 'Como Vienen' : 'Por Hora'}
                  </Button>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    {tripStatusFilter === 'cancelled' ? <Button variant="primary" size="sm" onClick={handleReinstateSelectedTrips} disabled={mapLocked}>I</Button> : <>
                      <Button variant="primary" size="sm" onClick={() => handleAssign(selectedDriverId)} disabled={mapLocked}>A</Button>
                      <Button variant="secondary" size="sm" onClick={handleUnassign} disabled={mapLocked}>U</Button>
                      <Button variant="danger" size="sm" onClick={handleCancelSelectedTrips} disabled={mapLocked}>C</Button>
                    </>}
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">Leg</span>
                    <Button variant={tripLegFilter === 'AL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'AL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'AL' ? 'all' : 'AL')} disabled={mapLocked} title="Primer viaje a la cita">AL</Button>
                    <Button variant={tripLegFilter === 'BL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'BL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'BL' ? 'all' : 'BL')} disabled={mapLocked} title="Return-leg trips">BL</Button>
                    <Button variant={tripLegFilter === 'CL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'CL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'CL' ? 'all' : 'CL')} disabled={mapLocked} title="Tercer viaje o connector leg">CL</Button>
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">Type</span>
                    <Button variant={tripTypeFilter === 'A' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'A' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'A' ? 'all' : 'A')} disabled={mapLocked} title="Ambulatory">A</Button>
                    <Button variant={tripTypeFilter === 'W' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'W' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'W' ? 'all' : 'W')} disabled={mapLocked} title="Wheelchair">W</Button>
                    <Button variant={tripTypeFilter === 'STR' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'STR' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'STR' ? 'all' : 'STR')} disabled={mapLocked} title="Stretcher">STR</Button>
                  </div>
                  {showColumnPicker ? <Card className="shadow position-absolute end-0 mt-5" style={{ zIndex: 80, width: 240 }}>
                      <CardBody className="p-3 text-dark">
                        <div className="fw-semibold mb-2">Escoge que quieres ver</div>
                        <div className="small text-muted mb-3">Estos cambios se guardan para la proxima vez.</div>
                        <div className="d-flex flex-column gap-2">
                          {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={option.key} type="switch" id={`dispatcher-column-${option.key}`} label={option.label} checked={visibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} disabled={mapLocked} />)}
                        </div>
                      </CardBody>
                    </Card> : null}
                </div>
                
                {/* Row 3: Leg/Type filters and misc buttons */}
                <div className="d-flex gap-2 small flex-nowrap position-relative" style={{ minWidth: 'max-content', overflowX: 'auto', overflowY: 'hidden' }}>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">ZIP</span>
                    <Form.Select size="sm" value={pickupZipFilter} onChange={e => setPickupZipFilter(e.target.value)} disabled={mapLocked} style={{ width: 110 }} title="ZIP de origen">
                      <option value="">PU ZIP</option>
                      {availablePickupZips.map(zip => <option key={`pu-zip-${zip}`} value={zip}>{zip}</option>)}
                    </Form.Select>
                    <span className="text-muted small">→</span>
                    <Form.Select size="sm" value={dropoffZipFilter} onChange={e => setDropoffZipFilter(e.target.value)} disabled={mapLocked} style={{ width: 110 }} title="ZIP de destino">
                      <option value="">DO ZIP</option>
                      {availableDropoffZips.map(zip => <option key={`do-zip-${zip}`} value={zip}>{zip}</option>)}
                    </Form.Select>
                    <Form.Control size="sm" value={zipFilter} onChange={e => setZipFilter(e.target.value)} placeholder="Extra ZIP" disabled={mapLocked} style={{ width: 92 }} title="Filtro extra por cualquier ZIP" />
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">Ruta</span>
                    <Form.Select size="sm" value={puCityFilter} onChange={e => setPuCityFilter(e.target.value)} disabled={mapLocked} style={{ width: 140 }} title="Ciudad de recogida">
                      <option value="">Origen</option>
                      {availablePickupCities.map(city => <option key={`pu-${city}`} value={city}>{city}</option>)}
                    </Form.Select>
                    <span className="text-muted small">→</span>
                    <Form.Select size="sm" value={doCityFilter} onChange={e => setDoCityFilter(e.target.value)} disabled={mapLocked} style={{ width: 140 }} title="Ciudad de destino">
                      <option value="">Destino</option>
                      {availableDropoffCities.map(city => <option key={`do-${city}`} value={city}>{city}</option>)}
                    </Form.Select>
                    {(puCityFilter || doCityFilter || pickupZipFilter || dropoffZipFilter || zipFilter) ? <Button variant="outline-secondary" size="sm" onClick={() => { setPuCityFilter(''); setDoCityFilter(''); setPickupZipFilter(''); setDropoffZipFilter(''); setZipFilter(''); }} disabled={mapLocked} title="Limpiar filtros de ciudad/zip" style={{ padding: '1px 6px', lineHeight: 1 }}>×</Button> : null}
                  </div>
                  {routeMetrics?.distanceMiles != null ? <Badge bg="light" text="dark">Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null}
                  {routeMetrics?.durationMinutes != null ? <Badge bg="light" text="dark">{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null}
                </div>
              </div>
              <div className="table-responsive flex-grow-1" style={{ minHeight: 0, maxHeight: showBottomPanels ? expanded ? 520 : 390 : '100%', position: 'relative', overflowX: 'auto', overflowY: 'auto', scrollbarGutter: 'stable both-edges' }}>
                {mapLocked && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45, borderRadius: '4px', backdropFilter: 'blur(1px)' }}>
                  <div style={{ backgroundColor: 'rgba(15,23,42,0.95)', color: '#fff', padding: '16px 32px', borderRadius: '8px', textAlign: 'center', border: '2px solid #ef4444', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>🔒 PANEL LOCKED</div>
                    <div style={{ fontSize: '12px', color: '#d1d5db' }}>Click "Unlock" to make changes</div>
                  </div>
                </div>}
                <Table hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap', minWidth: 'max-content', opacity: mapLocked ? 0.6 : 1 }}>
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={event => handleSelectAll(event.target.checked)}
                          disabled={mapLocked}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: '1px solid #6b7280',
                            backgroundColor: '#6b7280',
                            accentColor: '#8b5cf6',
                            cursor: mapLocked ? 'not-allowed' : 'pointer',
                            opacity: mapLocked ? 0.5 : 1
                          }}
                        />
                      </th>
                      <th style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>ACT</th>
                      <th style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>Notes</th>
                      {visibleTripColumns.includes('trip') ? renderTripHeader('trip', 'Trip / Ride') : null}
                      {visibleTripColumns.includes('status') ? renderTripHeader('status', 'Status') : null}
                      {visibleTripColumns.includes('driver') ? renderTripHeader('driver', 'Driver') : null}
                      {visibleTripColumns.includes('pickup') ? renderTripHeader('pickup', 'PU') : null}
                      {visibleTripColumns.includes('dropoff') ? renderTripHeader('dropoff', 'DO') : null}
                      {visibleTripColumns.includes('miles') ? renderTripHeader('miles', 'Miles') : null}
                      {visibleTripColumns.includes('rider') ? renderTripHeader('rider', 'Rider') : null}
                      {visibleTripColumns.includes('address') ? renderTripHeader('address', 'PU Address') : null}
                      {visibleTripColumns.includes('puZip') ? renderTripHeader('puZip', 'PU ZIP') : null}
                      {visibleTripColumns.includes('destination') ? renderTripHeader('destination', 'DO Address') : null}
                      {visibleTripColumns.includes('doZip') ? renderTripHeader('doZip', 'DO ZIP') : null}
                      {visibleTripColumns.includes('phone') ? renderTripHeader('phone', 'Phone') : null}
                      {visibleTripColumns.includes('vehicle') ? renderTripHeader('vehicle', 'Vehicle') : null}
                      {visibleTripColumns.includes('leg') ? renderTripHeader('leg', 'Leg') : null}
                      {visibleTripColumns.includes('punctuality') ? renderTripHeader('punctuality', 'Punctuality') : null}
                      {visibleTripColumns.includes('lateMinutes') ? renderTripHeader('lateMinutes', 'Late Min') : null}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFilteredTripRows.length > 0 ? groupedFilteredTripRows.map(row => row.type === 'group' ? <tr key={`group-${row.groupKey}`} className="table-light">
                        <td colSpan={tripTableColumnCount} className="small fw-semibold text-uppercase text-muted">{row.label}</td>
                      </tr> : <tr key={row.trip.id} className={selectedTripIds.includes(row.trip.id) ? 'table-primary' : row.trip.driverId && row.trip.driverId === selectedDriverId ? 'table-success' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTripIds.includes(row.trip.id)}
                            onChange={() => handleTripSelectionToggle(row.trip.id)}
                            disabled={mapLocked}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: '1px solid #6b7280',
                              backgroundColor: '#6b7280',
                              accentColor: '#8b5cf6',
                              cursor: mapLocked ? 'not-allowed' : 'pointer',
                              opacity: mapLocked ? 0.5 : 1
                            }}
                          />
                        </td>
                        <td style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>
                          <div className="d-flex align-items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                            <Button variant={row.trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" disabled={mapLocked} onClick={() => {
                          setSelectedTripIds([row.trip.id]);
                          setSelectedDriverId(row.trip.driverId ?? selectedDriverId);
                          setSelectedRouteId(row.trip.routeId);
                          if (row.trip.driverId && !showBottomPanels) {
                            setShowBottomPanels(true);
                          }
                          setStatusMessage(`Trip ${row.trip.id} activo.`);
                        }}>ACT</Button>
                          </div>
                        </td>
                        <td style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>
                          <Button variant="outline-secondary" size="sm" disabled={mapLocked} onClick={() => handleOpenTripNote(row.trip)} style={{ minWidth: 34, color: getTripNoteText(row.trip) ? '#9ca3af' : '#d1d5db', borderColor: '#6b7280', backgroundColor: 'transparent', opacity: mapLocked ? 0.5 : 1 }}>
                            N
                          </Button>
                        </td>
                        <td style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>
                          <Button variant={row.trip.status === 'WillCall' ? 'danger' : 'outline-secondary'} size="sm" disabled={mapLocked} onClick={() => handleToggleWillCall(row.trip.id)} title={row.trip.status === 'WillCall' ? 'Remove WillCall' : 'Mark as WillCall'} style={{ minWidth: 40, opacity: mapLocked ? 0.5 : 1 }}>
                            WC
                          </Button>
                        </td>
                        {visibleTripColumns.includes('trip') ? <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="fw-semibold">{getDisplayTripId(row.trip)}</div>
                            {getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant} className="mt-1">{getLegBadge(row.trip).label}</Badge> : null}
                          </td> : null}
                        {visibleTripColumns.includes('status') ? <td style={{ whiteSpace: 'nowrap' }}><Badge bg={row.trip.driverId && row.trip.driverId === selectedDriverId ? 'success' : getStatusBadge(row.trip.status)}>{row.trip.driverId && row.trip.driverId === selectedDriverId ? 'Assigned Here' : row.trip.status}</Badge>{row.trip.safeRideStatus && row.trip.status !== 'Cancelled' ? <div className="small text-muted mt-1">{row.trip.safeRideStatus}</div> : null}</td> : null}
                        {visibleTripColumns.includes('driver') ? <td style={{ whiteSpace: 'nowrap' }}>{getDriverName(row.trip.driverId)}</td> : null}
                        {visibleTripColumns.includes('pickup') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.pickup}</td> : null}
                        {visibleTripColumns.includes('dropoff') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.dropoff}</td> : null}
                        {visibleTripColumns.includes('miles') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.miles || '-'}</td> : null}
                        {visibleTripColumns.includes('rider') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.rider}</td> : null}
                        {visibleTripColumns.includes('address') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.address}</td> : null}
                        {visibleTripColumns.includes('puZip') ? <td style={{ whiteSpace: 'nowrap' }}>{getPickupZip(row.trip) || '-'}</td> : null}
                        {visibleTripColumns.includes('destination') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.destination || '-'}</td> : null}
                        {visibleTripColumns.includes('doZip') ? <td style={{ whiteSpace: 'nowrap' }}>{getDropoffZip(row.trip) || '-'}</td> : null}
                        {visibleTripColumns.includes('phone') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.patientPhoneNumber || '-'}</td> : null}
                        {visibleTripColumns.includes('vehicle') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.vehicleType || '-'}</td> : null}
                        {visibleTripColumns.includes('leg') ? <td style={{ whiteSpace: 'nowrap' }}>{getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant}>{getLegBadge(row.trip).label}</Badge> : '-'}</td> : null}
                        {visibleTripColumns.includes('punctuality') ? <td style={{ whiteSpace: 'nowrap' }}><Badge bg={getTripPunctualityVariant(row.trip)}>{getTripPunctualityLabel(row.trip)}</Badge></td> : null}
                        {visibleTripColumns.includes('lateMinutes') ? <td style={{ whiteSpace: 'nowrap' }}>{getTripLateMinutesDisplay(row.trip)}</td> : null}
                      </tr>) : <tr>
                        <td colSpan={tripTableColumnCount} className="text-center text-muted py-4">No trips loaded. Waiting for your real trips.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => showBottomPanels ? setDragMode('row') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'row-resize',
        gridColumn: '1 / span 3',
        gridRow: 2,
        display: showBottomPanels ? 'block' : 'none'
      }}>
          <div className="position-absolute top-50 start-50 translate-middle rounded-pill" style={{ width: 56, height: 6, backgroundColor: '#6b7280' }} />
        </div>

        <div onMouseDown={() => showBottomPanels ? setDragMode('both') : undefined} style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: '#58607a',
        border: '3px solid #0f1320',
        position: 'absolute',
        left: `calc(${columnSplit}% - ${dividerSize / 2}px)`,
        top: `calc(${rowSplit}% - ${dividerSize / 2}px)`,
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        zIndex: 50,
        boxShadow: '0 0 0 2px rgba(88, 96, 122, 0.25)',
        display: showBottomPanels ? 'block' : 'none'
      }} />

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <DispatcherMessagingPanel drivers={filteredDrivers} selectedDriverId={selectedDriverId} setSelectedDriverId={setSelectedDriverId} openFullChat={() => {
              refreshDrivers();
              router.push('/driver-chat');
              setStatusMessage('Opening full driver messaging panel.');
            }} />
            </CardBody>
          </Card>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0">
              <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-dark gap-2 flex-wrap">
                <div className="d-flex gap-2 flex-wrap align-items-center">
                  <Form.Select size="sm" value={selectedRouteId ?? ''} onChange={event => setSelectedRouteId(event.target.value)} disabled={mapLocked} style={{ width: 180 }}>
                    <option value="">Current selection</option>
                    {routePlans.map(routePlan => <option key={routePlan.id} value={routePlan.id}>{routePlan.name}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={quickReassignDriverId} onChange={event => setQuickReassignDriverId(event.target.value)} disabled={mapLocked} style={{ width: 220 }}>
                    <option value="">Reassign to active driver</option>
                    {activeDrivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleQuickReassignSelectedTrips} disabled={mapLocked}>Reassign</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleSendConfirmationSms} disabled={mapLocked}>Confirm SMS</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handlePrintRoute} disabled={mapLocked}>Print Route</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleShareRouteWhatsapp} disabled={mapLocked}>WhatsApp</Button>
                </div>
                <Form.Control size="sm" value={routeSearch} onChange={event => setRouteSearch(event.target.value)} placeholder="Search" disabled={mapLocked} style={{ width: 180 }} />
              </div>
              <div className="table-responsive" style={{ minHeight: 360, maxHeight: 360 }}>
                <Table className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 48 }} />
                      <th>Driver</th>
                      <th>Type</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Rider</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeTrips.length > 0 ? routeTrips.map(trip => <tr key={trip.id} className={selectedTripIds.includes(trip.id) ? 'table-success' : ''}>
                        <td>
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check checked={selectedTripIds.includes(trip.id)} onChange={() => handleTripSelectionToggle(trip.id)} disabled={mapLocked} />
                            <Badge bg={trip.status === 'Assigned' ? 'primary' : 'secondary'}>{trip.status === 'Assigned' ? 'A' : 'U'}</Badge>
                          </div>
                        </td>
                        <td className="fw-semibold">{getDriverName(trip.driverId)}</td>
                        <td>{getTripTypeLabel(trip)}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.rider}</td>
                        <td>{trip.patientPhoneNumber || '-'}</td>
                      </tr>) : <tr>
                        <td colSpan={6} className="text-center text-muted py-4">Selecciona una ruta, un chofer o trips para ver el menu de ruta.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <Modal show={Boolean(noteModalTrip)} onHide={handleCloseTripNote} centered>
          <Modal.Header closeButton>
            <Modal.Title>Trip Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-2">{noteModalTrip ? getDisplayTripId(noteModalTrip) : ''}</div>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Scheduled pickup</Form.Label>
                <Form.Control value={tripEditDraft.scheduledPickup} onChange={event => setTripEditDraft(current => ({
                ...current,
                scheduledPickup: event.target.value
              }))} placeholder="10:30 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Actual pickup</Form.Label>
                <Form.Control value={tripEditDraft.actualPickup} onChange={event => setTripEditDraft(current => ({
                ...current,
                actualPickup: event.target.value
              }))} placeholder="10:42 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Scheduled dropoff</Form.Label>
                <Form.Control value={tripEditDraft.scheduledDropoff} onChange={event => setTripEditDraft(current => ({
                ...current,
                scheduledDropoff: event.target.value
              }))} placeholder="11:00 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Actual dropoff</Form.Label>
                <Form.Control value={tripEditDraft.actualDropoff} onChange={event => setTripEditDraft(current => ({
                ...current,
                actualDropoff: event.target.value
              }))} placeholder="11:08 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Late minutes</Form.Label>
                <Form.Control value={tripEditDraft.delay} onChange={event => setTripEditDraft(current => ({
                ...current,
                delay: event.target.value
              }))} placeholder="8" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Punctuality</Form.Label>
                <Form.Select value={tripEditDraft.onTimeStatus} onChange={event => setTripEditDraft(current => ({
                ...current,
                onTimeStatus: event.target.value
              }))}>
                  <option value="">Auto</option>
                  <option value="On Time">On Time</option>
                  <option value="Late">Late</option>
                  <option value="Pending">Pending</option>
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Trip note</Form.Label>
                <Form.Control as="textarea" rows={5} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Write the note for the driver here." />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseTripNote}>Close</Button>
            <Button variant="primary" onClick={handleSaveTripNote}>Save Trip</Button>
          </Modal.Footer>
        </Modal>
      </div>
    </>;
};

export default DispatcherWorkspace;