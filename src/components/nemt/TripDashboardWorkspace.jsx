'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useLayoutContext } from '@/context/useLayoutContext';
import { DISPATCH_TRIP_COLUMN_OPTIONS, formatTripDateLabel, getRouteServiceDateKey, getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, parseTripClockMinutes, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { buildRoutePrintDocument } from '@/helpers/nemt-print-setup';
import { useNemtContext } from '@/context/useNemtContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import { openWhatsAppConversation, resolveRouteShareDriver } from '@/utils/whatsapp';
import { divIcon } from 'leaflet';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const addressClampStyle = {
  maxWidth: 260,
  minWidth: 220,
  whiteSpace: 'normal',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  lineHeight: 1.2
};

const riderNameStackStyle = {
  maxWidth: 170,
  minWidth: 140,
  lineHeight: 1.15,
  whiteSpace: 'normal'
};

const splitRiderName = value => {
  const text = String(value || '').trim();
  if (!text) return {
    firstName: '-',
    lastName: ''
  };
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return {
    firstName: parts[0],
    lastName: ''
  };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const yellowMapTabStyle = {
  position: 'absolute',
  top: 18,
  right: -14,
  zIndex: 720,
  minWidth: 118,
  minHeight: 38,
  padding: '8px 14px',
  borderRadius: '12px 12px 12px 0',
  border: '1px solid rgba(161, 98, 7, 0.48)',
  background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)',
  color: '#5b3b00',
  fontSize: 12,
  fontWeight: 800,
  boxShadow: '0 10px 26px rgba(120, 73, 0, 0.24)'
};

const TRIP_COLUMN_MIN_WIDTHS = {
  pickup: 56,
  dropoff: 56,
  miles: 56,
  puZip: 64,
  doZip: 64,
  leg: 52,
  lateMinutes: 68
};

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  if (status === 'WillCall') return 'danger';
  if (status === 'Cancelled') return 'danger';
  return 'secondary';
};

const getDriverCheckpoint = driver => {
  if (driver.checkpoint) return driver.checkpoint;
  if (!driver.position) return 'No GPS';
  return `${driver.position[0].toFixed(4)}, ${driver.position[1].toFixed(4)}`;
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

const formatDriveMinutes = minutes => {
  if (!Number.isFinite(minutes)) return 'Time unavailable';
  const roundedMinutes = Math.max(1, Math.round(minutes));
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
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

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const getTripTypeLabel = trip => {
  const source = `${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'STR';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};

const extractCityFromAddress = address => {
  const parts = String(address || '').split(',');
  return parts.length >= 2 ? parts[1].trim() : '';
};

const getPickupCity = trip => extractCityFromAddress(trip?.address);
const getDropoffCity = trip => extractCityFromAddress(trip?.destination);
const getPickupZip = trip => String(trip?.fromZipcode || trip?.fromZip || trip?.pickupZipcode || trip?.pickupZip || trip?.originZip || '').trim();
const getDropoffZip = trip => String(trip?.toZipcode || trip?.toZip || trip?.dropoffZipcode || trip?.dropoffZip || trip?.destinationZip || '').trim();

const getTripLegFilterKey = trip => {
  const explicitLeg = String(trip?.leg || trip?.tripLeg || trip?.legCode || '').trim().toUpperCase();
  if (['A', 'AL', '1', 'L1'].includes(explicitLeg)) return 'AL';
  if (['B', 'BL', '2', 'L2'].includes(explicitLeg)) return 'BL';
  if (['C', 'CL', '3', 'L3', 'D', 'DL', '4', 'L4'].includes(explicitLeg)) return 'CL';
  const legLabel = String(trip?.legLabel || '').trim().toLowerCase();
  if (!legLabel) return 'AL';
  if (legLabel.includes('outbound') || legLabel.includes('appointment') || legLabel.includes('appt')) return 'AL';
  if (legLabel.includes('return') || legLabel.includes('home') || legLabel.includes('house') || legLabel.includes('back')) return 'BL';
  if (legLabel.includes('3') || legLabel.includes('third') || legLabel.includes('connector') || legLabel.includes('cross')) return 'CL';
  return 'CL';
};

const hasMissingTripTime = trip => {
  const scheduledPickup = String(trip?.scheduledPickup || trip?.pickup || '').trim();
  const parsedPickupMinutes = parseTripClockMinutes(scheduledPickup);
  if (!scheduledPickup) return true;
  if (['tbd', 'willcall', 'will call', '23:', '23'].includes(scheduledPickup.toLowerCase())) return true;
  if (parsedPickupMinutes != null) return false;
  return !Number.isFinite(trip?.pickupSortValue) || trip?.pickupSortValue === Number.MAX_SAFE_INTEGER;
};

const getEffectiveTripStatus = trip => {
  const normalizedStatus = String(trip?.status || '').trim();
  const normalizedOverride = String(trip?.willCallOverride || '').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(normalizedStatus.toLowerCase())) return normalizedStatus || 'Cancelled';
  if (normalizedOverride === 'off') return normalizedStatus === 'WillCall' ? 'Unassigned' : normalizedStatus || 'Unassigned';
  if (normalizedOverride === 'manual') return 'WillCall';
  if (normalizedStatus === 'WillCall') return 'WillCall';
  if (getTripLegFilterKey(trip) !== 'AL' && hasMissingTripTime(trip)) return 'WillCall';
  return normalizedStatus || 'Unassigned';
};

const stopInputEventPropagation = event => {
  event.stopPropagation();
};

const getLegBadge = trip => {
  if (trip.legVariant && trip.legLabel) return {
    variant: trip.legVariant,
    label: trip.legLabel
  };
  return null;
};

const normalizeSortValue = value => {
  if (value == null) return '';
  if (typeof value === 'number') return value;
  return String(value).trim().toLowerCase();
};

const getTripSortValue = (trip, sortKey, getDriverName) => {
  switch (sortKey) {
    case 'trip':
      return trip.brokerTripId || trip.id;
    case 'status':
      return getEffectiveTripStatus(trip);
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

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? trip?.destinationPosition ?? trip?.position : trip?.position;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

const buildTripEditDraft = trip => ({
  notes: String(trip?.notes || '').trim(),
  scheduledPickup: String(trip?.scheduledPickup || '').trim(),
  actualPickup: String(trip?.actualPickup || '').trim(),
  scheduledDropoff: String(trip?.scheduledDropoff || '').trim(),
  actualDropoff: String(trip?.actualDropoff || '').trim(),
  delay: trip?.lateMinutes != null ? String(Math.round(trip.lateMinutes)) : String(trip?.delay || '').trim(),
  onTimeStatus: String(trip?.onTimeStatus || '').trim()
});

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#ef4444'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const TripDashboardWorkspace = () => {
  const router = useRouter();
  const { changeTheme, themeMode } = useLayoutContext();
  const {
    drivers,
    trips,
    routePlans,
    selectedTripIds,
    selectedDriverId,
    selectedRouteId,
    setSelectedTripIds,
    setSelectedDriverId,
    setSelectedRouteId,
    toggleTripSelection,
    assignTripsToDriver,
    assignTripsToSecondaryDriver,
    unassignTrips,
    cancelTrips,
    reinstateTrips,
    createRoute,
    deleteRoute,
    refreshDrivers,
    refreshDispatchState,
    getDriverName,
    updateTripNotes,
    updateTripRecord,
    uiPreferences,
    setDispatcherVisibleTripColumns,
    setMapProvider
  } = useNemtContext();
  const { showNotification } = useNotificationContext();
  const [routeName, setRouteName] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [tripIdSearch, setTripIdSearch] = useState('');
  const [tripDateFilter, setTripDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedSecondaryDriverId, setSelectedSecondaryDriverId] = useState('');
  const [tripLegFilter, setTripLegFilter] = useState('all');
  const [tripTypeFilter, setTripTypeFilter] = useState('all');
  const [mapCityQuickFilter, setMapCityQuickFilter] = useState('');
  const [mapZipQuickFilter, setMapZipQuickFilter] = useState('');
  const [pickupZipFilter, setPickupZipFilter] = useState('');
  const [dropoffZipFilter, setDropoffZipFilter] = useState('');
  const [zipFilter, setZipFilter] = useState('');
  const [puCityFilter, setPuCityFilter] = useState('');
  const [doCityFilter, setDoCityFilter] = useState('');
  const [driverGrouping, setDriverGrouping] = useState('VDR Grouping');
  const [routeSearch, setRouteSearch] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [showBottomPanels, setShowBottomPanels] = useState(false);
  const [showInlineMap, setShowInlineMap] = useState(true);
  const [showMapPane, setShowMapPane] = useState(true);
  const [mapLocked, setMapLocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [tripOrderMode, setTripOrderMode] = useState('original');
  const [tripSort, setTripSort] = useState({
    key: 'pickup',
    direction: 'asc'
  });
  const [columnWidths, setColumnWidths] = useState({});
  const [statusMessage, setStatusMessage] = useState('Trip dashboard listo con paneles inferiores cerrados.');
  const [columnSplit, setColumnSplit] = useState(58);
  const [rowSplit, setRowSplit] = useState(68);
  const [dragMode, setDragMode] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [noteModalTripId, setNoteModalTripId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tripEditDraft, setTripEditDraft] = useState(buildTripEditDraft(null));
  const workspaceRef = useRef(null);
  const tripTableTopScrollerRef = useRef(null);
  const tripTableBottomScrollerRef = useRef(null);
  const tripTableElementRef = useRef(null);
  const tripTableScrollSyncRef = useRef(false);
  const [tripTableScrollWidth, setTripTableScrollWidth] = useState(0);
  const deferredRouteSearch = useDeferredValue(routeSearch);

  const syncTripTableScroll = source => {
    if (tripTableScrollSyncRef.current) return;
    const topNode = tripTableTopScrollerRef.current;
    const bottomNode = tripTableBottomScrollerRef.current;
    if (!topNode || !bottomNode) return;
    tripTableScrollSyncRef.current = true;
    if (source === 'top') {
      bottomNode.scrollLeft = topNode.scrollLeft;
    } else {
      topNode.scrollLeft = bottomNode.scrollLeft;
    }
    window.requestAnimationFrame(() => {
      tripTableScrollSyncRef.current = false;
    });
  };

  const selectedDriver = useMemo(() => drivers.find(driver => driver.id === selectedDriverId) ?? null, [drivers, selectedDriverId]);
  const filteredRoutePlans = useMemo(() => routePlans.filter(routePlan => {
    if (tripDateFilter === 'all') return true;
    return getRouteServiceDateKey(routePlan, trips) === tripDateFilter;
  }), [routePlans, tripDateFilter, trips]);
  const selectedRoute = useMemo(() => filteredRoutePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [filteredRoutePlans, selectedRouteId]);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const isTripAssignedToSelectedDriver = trip => Boolean(selectedDriverId && (trip?.driverId === selectedDriverId || trip?.secondaryDriverId === selectedDriverId));
  const getTripDriverDisplay = trip => {
    const primaryDriverName = getDriverName(trip?.driverId);
    const hasPrimary = Boolean(trip?.driverId);
    const hasSecondary = Boolean(trip?.secondaryDriverId);
    if (!hasPrimary && !hasSecondary) return primaryDriverName;
    if (!hasSecondary) return primaryDriverName;
    const secondaryDriverName = getDriverName(trip.secondaryDriverId);
    if (!hasPrimary) return secondaryDriverName;
    return `${primaryDriverName} + ${secondaryDriverName}`;
  };
  const todayDateKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const getTripTimelineDateKey = trip => getTripServiceDateKey(trip) || getRouteServiceDateKey(routePlans.find(routePlan => routePlan.id === trip?.routeId), trips);
  const availableTripDateKeys = useMemo(() => Array.from(new Set(trips.map(getTripTimelineDateKey).filter(Boolean).concat(routePlans.map(routePlan => getRouteServiceDateKey(routePlan, trips)).filter(Boolean)))).sort(), [routePlans, trips]);
  const activeTripDateLabel = useMemo(() => formatTripDateLabel(tripDateFilter), [tripDateFilter]);
  const cityOptionTrips = useMemo(() => trips.filter(trip => {
    const normalizedStatus = String(getEffectiveTripStatus(trip) || '').toLowerCase();
    if (tripStatusFilter === 'all') return true;
    if (tripStatusFilter === 'unassigned') return !trip.driverId && !trip.secondaryDriverId && !['cancelled', 'canceled'].includes(normalizedStatus);
    return normalizedStatus === tripStatusFilter;
  }).filter(trip => {
    if (tripDateFilter === 'all') return true;
    return getTripTimelineDateKey(trip) === tripDateFilter;
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
  }), [dropoffZipFilter, pickupZipFilter, tripDateFilter, tripIdSearch, tripLegFilter, tripStatusFilter, tripTypeFilter, trips, zipFilter]);
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
  const selectedTrips = useMemo(() => trips.filter(trip => selectedTripIds.includes(trip.id)), [selectedTripIds, trips]);
  const visibleTripIds = filteredTrips.map(trip => trip.id);
  const filteredDrivers = drivers;
  const tripOriginalOrderLookup = useMemo(() => new Map(trips.map((trip, index) => [trip.id, index])), [trips]);
  const selectedDriverCandidateTripIds = useMemo(() => new Set(filteredTrips.filter(trip => selectedTripIds.includes(trip.id) && (!trip.driverId || trip.driverId === selectedDriverId)).map(trip => trip.id)), [filteredTrips, selectedDriverId, selectedTripIds]);
  const selectedDriverWorkingTrips = useMemo(() => {
    if (!selectedDriver) return [];
    const relevantTrips = filteredTrips.filter(trip => trip.driverId === selectedDriver.id || selectedDriverCandidateTripIds.has(trip.id));
    return sortTripsByPickupTime(relevantTrips);
  }, [filteredTrips, selectedDriver, selectedDriverCandidateTripIds]);

  const routeTrips = useMemo(() => {
    const baseTrips = selectedDriver ? selectedDriverWorkingTrips : selectedRoute ? trips.filter(trip => selectedRoute.tripIds.includes(trip.id)) : trips.filter(trip => selectedTripIds.includes(trip.id));
    const term = deferredRouteSearch.trim().toLowerCase();
    return sortTripsByPickupTime(baseTrips.filter(trip => !term || [trip.id, trip.rider, trip.address].some(value => value.toLowerCase().includes(term))));
  }, [deferredRouteSearch, selectedDriver, selectedDriverWorkingTrips, selectedRoute, selectedTripIds, trips]);

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

    if (selectedDriver) {
      return routeTrips.flatMap((trip, index) => [{
        key: `${trip.id}-pickup`,
        label: `${index * 2 + 1}`,
        variant: selectedDriverCandidateTripIds.has(trip.id) ? 'dropoff' : 'pickup',
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
  }, [routeTrips, selectedDriver, selectedRoute, selectedTripIds, selectedDriverCandidateTripIds, showRoute, trips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const assignedTripsCount = trips.filter(trip => trip.status === 'Assigned').length;
  const activeInfoTrip = selectedTripIds.length > 0 ? trips.find(trip => selectedTripIds.includes(trip.id)) ?? null : selectedRoute ? routeTrips[0] ?? null : selectedDriver ? trips.find(trip => trip.driverId === selectedDriver.id) ?? null : routeTrips[0] ?? filteredTrips[0] ?? null;
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIds.includes(id));
  const selectedDriverAssignedTripCount = useMemo(() => selectedDriverId ? trips.filter(trip => trip.driverId === selectedDriverId || trip.secondaryDriverId === selectedDriverId).length : 0, [selectedDriverId, trips]);
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
  const selectedDriverRouteHealth = useMemo(() => {
    if (!selectedDriver || selectedDriverWorkingTrips.length === 0) return null;

    const now = Date.now();
    const items = [];
    let previousAvailableAt = selectedDriver.hasRealLocation ? now : null;
    let previousDropoffPosition = selectedDriver.hasRealLocation ? selectedDriver.position : null;

    for (const trip of selectedDriverWorkingTrips) {
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
        finishAt,
        candidate: selectedDriverCandidateTripIds.has(trip.id)
      });

      previousAvailableAt = finishAt;
      previousDropoffPosition = trip.destinationPosition ?? trip.position;
    }

    return {
      items,
      lateCount: items.filter(item => item.late).length,
      candidateCount: items.filter(item => item.candidate).length
    };
  }, [selectedDriver, selectedDriverCandidateTripIds, selectedDriverWorkingTrips]);
  const routeTitle = useMemo(() => {
    if (selectedRoute?.name) return selectedRoute.name;
    if (routeName.trim()) return routeName.trim();
    if (selectedDriver) return `Ruta de ${selectedDriver.name}`;
    if (routeTrips.length > 0) return 'Ruta actual';
    return 'Ruta sin nombre';
  }, [routeName, routeTrips.length, selectedDriver, selectedRoute]);
  const noteModalTrip = useMemo(() => noteModalTripId ? trips.find(trip => trip.id === noteModalTripId) ?? null : null, [noteModalTripId, trips]);

  useEffect(() => {
    if (!selectedRouteId) return;
    if (filteredRoutePlans.some(routePlan => routePlan.id === selectedRouteId)) return;
    setSelectedRouteId('');
  }, [filteredRoutePlans, selectedRouteId, setSelectedRouteId]);

  useEffect(() => {
    if (!mapZipQuickFilter) return;
    if (mapQuickZipOptions.includes(mapZipQuickFilter)) return;
    setMapZipQuickFilter('');
  }, [mapQuickZipOptions, mapZipQuickFilter]);

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

  const handleShiftTripDate = offsetDays => {
    const baseDate = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
    const nextDate = shiftTripDateKey(baseDate, offsetDays);
    if (nextDate) setTripDateFilter(nextDate);
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

    const sortedTrips = [...filteredTrips].sort(compareTrips);
    const now = Date.now();
    const selectedDateIsToday = tripDateFilter === todayDateKey;
    const selectedDateIsPast = tripDateFilter !== 'all' && tripDateFilter < todayDateKey;
    const selectedDateIsFuture = tripDateFilter !== 'all' && tripDateFilter > todayDateKey;

    const happenedTrips = sortedTrips.filter(trip => {
      if (selectedDateIsPast) return true;
      if (selectedDateIsFuture) return false;
      if (!selectedDateIsToday) return false;
      const tripTime = Number(trip.pickupSortValue);
      return Number.isFinite(tripTime) ? tripTime < now : ['completed', 'cancelled'].includes(String(trip.status || '').toLowerCase());
    });

    const upcomingTrips = sortedTrips.filter(trip => !happenedTrips.includes(trip));
    const rows = [];

    if (tripDateFilter === 'all') {
      return sortedTrips.map(trip => ({
        type: 'trip',
        groupKey: trip.brokerTripId || trip.id,
        trip
      }));
    }

    if (happenedTrips.length > 0) {
      rows.push({
        type: 'section',
        key: 'happened',
        label: selectedDateIsPast ? 'What Happened On This Day' : 'Already Happened'
      });
      rows.push(...happenedTrips.map(trip => ({
        type: 'trip',
        groupKey: trip.brokerTripId || trip.id,
        trip
      })));
    }

    if (upcomingTrips.length > 0) {
      rows.push({
        type: 'section',
        key: 'upcoming',
        label: selectedDateIsFuture ? 'What Will Happen On This Day' : 'Still Pending / Will Happen'
      });
      rows.push(...upcomingTrips.map(trip => ({
        type: 'trip',
        groupKey: trip.brokerTripId || trip.id,
        trip
      })));
    }

    return rows;
  }, [filteredTrips, getDriverName, selectedDriverId, todayDateKey, tripDateFilter, tripOrderMode, tripOriginalOrderLookup, tripSort.direction, tripSort.key]);

  const selectedDateDriverSummary = useMemo(() => {
    const driverCounts = filteredTrips.reduce((summary, trip) => {
      const driverName = getDriverName(trip.driverId) || 'Unassigned';
      summary.set(driverName, (summary.get(driverName) ?? 0) + 1);
      return summary;
    }, new Map());
    return Array.from(driverCounts.entries()).sort((left, right) => right[1] - left[1]);
  }, [filteredTrips, getDriverName]);

  const tripTableColumnCount = visibleTripColumns.length + 3;

  const handleToggleTripColumn = columnKey => {
    const nextColumns = visibleTripColumns.includes(columnKey) ? visibleTripColumns.filter(item => item !== columnKey) : [...visibleTripColumns, columnKey];
    if (nextColumns.length === 0) {
      setStatusMessage('Debe quedar al menos una columna visible.');
      return;
    }
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage('Vista de columnas actualizada.');
  };

  const handleTripSelectionToggle = tripId => {
    toggleTripSelection(tripId);
  };

  const handleAssignTrip = tripId => {
    if (!selectedDriverId) {
      setStatusMessage('Primero escoge un chofer para asignar este trip.');
      return;
    }
    assignTripsToDriver(selectedDriverId, [tripId]);
    setSelectedTripIds([tripId]);
    setStatusMessage(`Trip ${tripId} asignado.`);
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

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(Array.from(new Set([...selectedTripIds, ...visibleTripIds])));
      setStatusMessage('Trips visibles seleccionados.');
      return;
    }

    setSelectedTripIds(selectedTripIds.filter(id => !visibleTripIds.includes(id)));
    setStatusMessage('Trips visibles deseleccionados.');
  };

  const handleCreateRoute = () => {
    if (!routeName.trim()) {
      setStatusMessage('Escribe un nombre para la ruta.');
      return;
    }
    if (!selectedDriverId) {
      setStatusMessage('Selecciona un chofer para la ruta.');
      return;
    }
    if (selectedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to build a route.');
      return;
    }

    createRoute({
      name: routeName.trim(),
      driverId: selectedDriverId,
      tripIds: selectedTripIds,
      notes: routeNotes.trim(),
      serviceDate: tripDateFilter
    });
    setStatusMessage('Ruta creada y sincronizada con dispatcher.');
    showNotification({
      message: 'Route created and synced with dispatcher.',
      variant: 'success'
    });
    setRouteName('');
    setRouteNotes('');
  };

  const handleAssign = driverId => {
    if (!driverId || selectedTripIds.length === 0) {
      setStatusMessage('Selecciona chofer y al menos un trip.');
      return;
    }

    assignTripsToDriver(driverId);
    setStatusMessage('Trips asignados al chofer seleccionado.');
  };

  const handleAssignSecondary = driverId => {
    if (!driverId || selectedTripIds.length === 0) {
      setStatusMessage('Escoge segundo chofer y al menos un trip.');
      return;
    }

    assignTripsToSecondaryDriver(driverId);
    setStatusMessage('Trips actualizados con segundo chofer.');
  };

  const handleUnassign = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to remove assignment.');
      return;
    }

    unassignTrips();
    setStatusMessage('Trips desasignados.');
  };

  const handleLoadRoute = routeId => {
    const route = routePlans.find(item => item.id === routeId);
    if (!route) return;
    setSelectedRouteId(routeId);
    setSelectedDriverId(route.driverId);
    setSelectedTripIds(route.tripIds);
    setStatusMessage(`Ruta ${route.name} cargada.`);
  };

  const handlePrintRoute = () => {
    if (routeTrips.length === 0) {
      setStatusMessage('No hay ruta para imprimir todavia.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) {
      setStatusMessage('No se pudo abrir la ventana de impresion.');
      return;
    }

    const generatedAt = new Date().toLocaleString();
    printWindow.document.write(buildRoutePrintDocument({
      routeTitle,
      driverName: selectedDriver ? selectedDriver.name : 'No driver selected',
      generatedAt,
      routeTrips,
      printSetup: uiPreferences?.printSetup,
      getTripTypeLabel
    }));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setStatusMessage(`Imprimiendo ${routeTitle.toLowerCase()}.`);
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

    const message = [`Hello ${targetDriver.name},`, '', `Your route: ${routeTitle}`, `Total trips: ${routeTrips.length}`, '', routeTrips.map((trip, index) => [`${index + 1}. ${trip.pickup} - ${trip.dropoff} | ${trip.rider}`,
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

  useEffect(() => {
    if (!showRoute || routeStops.length < 2) {
      setRouteGeometry([]);
      setRouteMetrics(null);
      return;
    }

    const abortController = new AbortController();
    const coordinates = routeStops.map(stop => `${stop.position[0]},${stop.position[1]}`).join(';');

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
          durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null
        });
      } catch {
        if (abortController.signal.aborted) return;
        setRouteGeometry(routeStops.map(stop => stop.position));
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
      const nextRowSplit = clamp((event.clientY - bounds.top) / bounds.height * 100, 32, 84);

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

  useEffect(() => {
    const updateTripTableScrollWidth = () => {
      const scrollContainer = tripTableBottomScrollerRef.current;
      const tableNode = tripTableElementRef.current;
      const containerWidth = scrollContainer?.scrollWidth || 0;
      const tableWidth = tableNode?.scrollWidth || 0;
      setTripTableScrollWidth(Math.max(containerWidth, tableWidth));
    };

    updateTripTableScrollWidth();
    const timeoutId = window.setTimeout(updateTripTableScrollWidth, 0);
    window.addEventListener('resize', updateTripTableScrollWidth);

    let resizeObserver;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      resizeObserver = new window.ResizeObserver(() => {
        updateTripTableScrollWidth();
      });
      if (tripTableBottomScrollerRef.current) resizeObserver.observe(tripTableBottomScrollerRef.current);
      if (tripTableElementRef.current) resizeObserver.observe(tripTableElementRef.current);
    }

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', updateTripTableScrollWidth);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [columnWidths, groupedFilteredTripRows, visibleTripColumns]);

  useEffect(() => {
    const handleAssistantAction = () => refreshDispatchState({ forceServer: true });
    window.addEventListener('nemt-assistant-action', handleAssistantAction);
    return () => window.removeEventListener('nemt-assistant-action', handleAssistantAction);
  }, [refreshDispatchState]);

  const workspaceHeight = expanded ? 1120 : 1000;
  const dividerSize = 10;
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns: showMapPane ? `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)` : `0px 0px minmax(0, 1fr)`,
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
    const mapUrl = `/map-screen?source=dashboard`;
    window.localStorage.setItem('__CARE_MOBILITY_MAP_SCREEN_SOURCE__', 'dashboard');
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
        <div style={{ minWidth: 0, minHeight: 0, display: showMapPane ? 'block' : 'none' }}>
          <Card className="h-100">
            <CardBody className="p-0 d-flex flex-column h-100">
              {showInlineMap ? <div className="position-relative h-100">
                <Button variant="warning" type="button" onClick={() => {
                setShowMapPane(false);
                setStatusMessage('Mapa escondido en Trip Dashboard.');
              }} style={yellowMapTabStyle}>
                  Hide Map
                </Button>
                <div className="position-absolute top-0 start-0 p-2 d-flex align-items-center gap-2 flex-wrap" style={{ zIndex: 650, maxWidth: '100%' }}>
                  <Button variant="dark" size="sm" onClick={() => setShowRoute(current => !current)}>Route</Button>
                  <Button variant="dark" size="sm" onClick={() => setSelectedTripIds([])}>Clear</Button>
                  <Form.Select size="sm" value={mapCityQuickFilter} onChange={event => setMapCityQuickFilter(event.target.value)} style={{ width: 150, backgroundColor: '#ffffff', color: '#08131a', borderColor: '#0f172a' }}>
                    <option value="">City</option>
                    {mapQuickCityOptions.map(city => <option key={city} value={city}>{city}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={mapZipQuickFilter} onChange={event => setMapZipQuickFilter(event.target.value)} style={{ width: 130, backgroundColor: '#ffffff', color: '#08131a', borderColor: '#0f172a' }}>
                    <option value="">ZIP Code</option>
                    {mapQuickZipOptions.map(zip => <option key={zip} value={zip}>{zip}</option>)}
                  </Form.Select>
                  <Button variant="dark" size="sm" onClick={() => setShowInfo(current => !current)}>{showInfo ? 'Hide Info' : 'Show Info'}</Button>
                  <Form.Select size="sm" value={uiPreferences?.mapProvider || 'auto'} onChange={event => setMapProvider(event.target.value)} style={{ width: 150, backgroundColor: '#ffffff', color: '#08131a', borderColor: '#0f172a' }}>
                    <option value="auto">Map: Auto</option>
                    <option value="openstreetmap">Map: OSM</option>
                    <option value="mapbox" disabled={!hasMapboxConfigured}>Map: Mapbox</option>
                  </Form.Select>
                  <Button variant="dark" size="sm" onClick={() => router.push('/drivers/grouping')}>Grouping</Button>
                  <Button variant="dark" size="sm" onClick={() => {
                  setShowBottomPanels(current => !current);
                  setStatusMessage(showBottomPanels ? 'Paneles inferiores ocultos.' : 'Paneles inferiores visibles.');
                }}>{showBottomPanels ? 'Hide Panel' : 'Panel'}</Button>
                  <Button variant="dark" size="sm" onClick={() => setMapLocked(current => !current)}>{mapLocked ? 'Unlock' : 'Lock'}</Button>
                  <Button variant="dark" size="sm" onClick={handleOpenMapWindow}>Pop Out</Button>
                </div>
                {activeInfoTrip && showInfo && selectedTripIds.length === 0 ? <div className="position-absolute top-0 start-50 translate-middle-x rounded shadow-sm px-3 py-2" style={{
                zIndex: 500,
                minWidth: 260,
                marginTop: 46,
                backgroundColor: 'rgba(15, 19, 32, 0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#f8fafc'
              }}>
                    <div className="small text-uppercase" style={{ color: '#94a3b8' }}>PU {activeInfoTrip.id}</div>
                    <div className="fw-semibold">{activeInfoTrip.rider}</div>
                    <div className="small">{activeInfoTrip.pickup}</div>
                    <div className="small" style={{ color: '#cbd5e1' }}>{activeInfoTrip.address || 'No pickup address available'}</div>
                    <div className="small mt-1">DO {activeInfoTrip.dropoff}</div>
                    <div className="small" style={{ color: '#cbd5e1' }}>{activeInfoTrip.destination || 'No dropoff address available'}</div>
                  </div> : null}
                <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} style={{ height: '100%', width: '100%' }}>
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
                  click: () => {
                    toggleTripSelection(point.tripId);
                  }
                }}>
                      <Popup>{point.label}</Popup>
                    </CircleMarker>)}
                  {routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                      <Popup>
                        <div className="fw-semibold">{stop.title}</div>
                        <div>{stop.detail}</div>
                      </Popup>
                    </Marker>)}
                </MapContainer>
              </div> : <div className="h-100 d-flex flex-column justify-content-center align-items-center text-center p-4" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #162236 100%)', color: '#f8fafc' }}>
                  <div className="fw-semibold fs-5">Mapa movido a otra pantalla</div>
                  <div className="small mt-2" style={{ color: '#cbd5e1', maxWidth: 360 }}>Abre el mapa solo en la otra pantalla y deja aqui el manejo de rutas, viajes y choferes.</div>
                  <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center mt-4">
                    <Button variant="light" size="sm" onClick={() => setShowInlineMap(true)}>Show Map Here</Button>
                    <Button variant="outline-light" size="sm" onClick={handleOpenMapWindow}>Open Map Window Again</Button>
                  </div>
                </div>}
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => showMapPane ? setDragMode('column') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'col-resize',
        gridColumn: 2,
        gridRow: '1 / span 3',
        display: showMapPane ? 'block' : 'none'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 6, backgroundColor: '#6b7280' }} />
        </div>

        <div style={{ minWidth: 0, minHeight: 0, gridColumn: showMapPane ? 3 : '1 / span 3', gridRow: 1 }}>
          <Card className="h-100">
            <CardBody className="p-0 d-flex flex-column h-100">
              <div className="d-flex flex-column align-items-stretch p-3 border-bottom bg-success text-dark gap-2 flex-shrink-0">
                {/* Row 1: Date selection and trip filters */}
                <div className="d-flex align-items-center gap-2 flex-nowrap" style={{ minWidth: 'max-content', overflowX: 'auto', overflowY: 'hidden' }}>
                  <strong>Trips</strong>
                  <Badge bg="light" text="dark">{assignedTripsCount}/{trips.length}</Badge>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleShiftTripDate(-1)} title="Previous day">Prev</Button>
                    <Form.Control size="sm" type="date" value={tripDateFilter === 'all' ? '' : tripDateFilter} onChange={event => setTripDateFilter(event.target.value || 'all')} style={{ width: 150 }} />
                    <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleShiftTripDate(1)} title="Next day">Next</Button>
                    <Button variant={tripDateFilter === todayDateKey ? 'dark' : 'outline-dark'} size="sm" style={tripDateFilter === todayDateKey ? undefined : greenToolbarButtonStyle} onClick={() => setTripDateFilter(todayDateKey)}>Today</Button>
                    <Badge bg="light" text="dark">{activeTripDateLabel}</Badge>
                    {availableTripDateKeys.length > 0 ? <Badge bg="light" text="dark">{availableTripDateKeys.length} days</Badge> : null}
                    {tripDateFilter !== 'all' && selectedDateDriverSummary.length > 0 ? <Badge bg="light" text="dark">Drivers {selectedDateDriverSummary.map(([name, count]) => `${name}: ${count}`).slice(0, 3).join(' | ')}</Badge> : null}
                  </div>
                  <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ width: 130 }}>
                    <option value="all">All</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="cancelled">Cancelled</option>
                  </Form.Select>
                  <Form.Control size="sm" value={tripIdSearch} onChange={event => setTripIdSearch(event.target.value)} placeholder="Search Trip ID" style={{ width: 150 }} />
                  {selectedDriver ? <Badge bg="light" text="dark">{selectedDriverAssignedTripCount} assigned</Badge> : null}
                  <Badge bg={selectedTripIds.length > 0 ? 'dark' : 'light'} text={selectedTripIds.length > 0 ? 'light' : 'dark'}>{selectedTripIds.length} selected trips</Badge>
                </div>
                
                {/* Row 2: Statistics and main action buttons */}
                <div className="d-flex gap-2 small flex-nowrap position-relative" style={{ minWidth: 'max-content', overflow: 'visible' }}>
                  {!showMapPane ? <Button variant="warning" size="sm" onClick={() => {
                  setShowMapPane(true);
                  setStatusMessage('Mapa visible otra vez en Trip Dashboard.');
                }} style={{
                  color: '#5b3b00',
                  borderColor: 'rgba(161, 98, 7, 0.48)',
                  background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)',
                  fontWeight: 800
                }}>
                      Show Map
                    </Button> : null}
                  <Badge bg="primary">{trips.length} trips</Badge>
                  <Badge bg="info">{drivers.length} drivers</Badge>
                  <Badge bg="secondary">{liveDrivers} live</Badge>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowColumnPicker(current => !current)}>Columns</Button>
                  
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={showInlineMap ? handleOpenMapWindow : () => setShowInlineMap(true)}>{showInlineMap ? 'Map Screen' : 'Show Map Here'}</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleTripOrderModeToggle}>{tripOrderMode === 'time' ? 'Como Vienen' : 'Por Hora'}</Button>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    {tripStatusFilter === 'cancelled' ? <Button variant="primary" size="sm" onClick={handleReinstateSelectedTrips}>I</Button> : <>
                      <Button variant="primary" size="sm" onClick={() => handleAssign(selectedDriverId)}>A</Button>
                      <Button variant="warning" size="sm" onClick={() => handleAssignSecondary(selectedSecondaryDriverId)} title="Assign second driver">A2</Button>
                      <Button variant="secondary" size="sm" onClick={handleUnassign}>U</Button>
                      <Button variant="danger" size="sm" onClick={handleCancelSelectedTrips}>C</Button>
                    </>}
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">Leg</span>
                    <Button variant={tripLegFilter === 'AL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'AL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'AL' ? 'all' : 'AL')} title="Primer viaje a la cita">AL</Button>
                    <Button variant={tripLegFilter === 'BL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'BL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'BL' ? 'all' : 'BL')} title="Return-leg trips">BL</Button>
                    <Button variant={tripLegFilter === 'CL' ? 'dark' : 'outline-dark'} size="sm" style={tripLegFilter === 'CL' ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'CL' ? 'all' : 'CL')} title="Tercer viaje o connector leg">CL</Button>
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">Type</span>
                    <Button variant={tripTypeFilter === 'A' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'A' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'A' ? 'all' : 'A')} title="Ambulatory">A</Button>
                    <Button variant={tripTypeFilter === 'W' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'W' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'W' ? 'all' : 'W')} title="Wheelchair">W</Button>
                    <Button variant={tripTypeFilter === 'STR' ? 'dark' : 'outline-dark'} size="sm" style={tripTypeFilter === 'STR' ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'STR' ? 'all' : 'STR')} title="Stretcher">STR</Button>
                  </div>
                  {showColumnPicker ? <Card className="shadow position-absolute end-0 mt-5" style={{ zIndex: 80, width: 240 }}>
                      <CardBody className="p-3 text-dark">
                        <div className="fw-semibold mb-2">Escoge que quieres ver</div>
                        <div className="small text-muted mb-3">Estos cambios se guardan para la proxima vez.</div>
                        <div className="d-flex flex-column gap-2">
                          {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={option.key} type="switch" id={`dashboard-column-${option.key}`} label={option.label} checked={visibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} />)}
                        </div>
                      </CardBody>
                    </Card> : null}
                </div>
                
                {/* Row 3: Leg/Type filters and misc buttons */}
                <div className="d-flex gap-2 small flex-nowrap position-relative" style={{ minWidth: 'max-content', overflowX: 'auto', overflowY: 'hidden' }}>
                  <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => handleDriverSelectionChange(event.target.value)} style={{ width: 220 }}>
                    <option value="">Select driver</option>
                    {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={selectedSecondaryDriverId} onChange={event => setSelectedSecondaryDriverId(event.target.value)} style={{ width: 220 }}>
                    <option value="">Second driver</option>
                    {drivers.map(driver => <option key={`secondary-${driver.id}`} value={driver.id}>{driver.name}</option>)}
                  </Form.Select>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">ZIP</span>
                    <Form.Select size="sm" value={pickupZipFilter} onChange={e => setPickupZipFilter(e.target.value)} style={{ width: 110 }} title="ZIP de origen">
                      <option value="">PU ZIP</option>
                      {availablePickupZips.map(zip => <option key={`pu-zip-${zip}`} value={zip}>{zip}</option>)}
                    </Form.Select>
                    <span className="text-muted small">→</span>
                    <Form.Select size="sm" value={dropoffZipFilter} onChange={e => setDropoffZipFilter(e.target.value)} style={{ width: 110 }} title="ZIP de destino">
                      <option value="">DO ZIP</option>
                      {availableDropoffZips.map(zip => <option key={`do-zip-${zip}`} value={zip}>{zip}</option>)}
                    </Form.Select>
                    <Form.Control size="sm" value={zipFilter} onChange={e => setZipFilter(e.target.value)} placeholder="Extra ZIP" style={{ width: 92 }} title="Filtro extra por cualquier ZIP" />
                  </div>
                  <div className="d-flex align-items-center gap-1 flex-nowrap">
                    <span className="fw-semibold small">Ruta</span>
                    <Form.Select size="sm" value={puCityFilter} onChange={e => setPuCityFilter(e.target.value)} style={{ width: 140 }} title="Ciudad de recogida">
                      <option value="">Origen</option>
                      {availablePickupCities.map(city => <option key={`pu-${city}`} value={city}>{city}</option>)}
                    </Form.Select>
                    <span className="text-muted small">→</span>
                    <Form.Select size="sm" value={doCityFilter} onChange={e => setDoCityFilter(e.target.value)} style={{ width: 140 }} title="Ciudad de destino">
                      <option value="">Destino</option>
                      {availableDropoffCities.map(city => <option key={`do-${city}`} value={city}>{city}</option>)}
                    </Form.Select>
                    {(puCityFilter || doCityFilter || pickupZipFilter || dropoffZipFilter || zipFilter) ? <Button variant="outline-secondary" size="sm" onClick={() => { setPuCityFilter(''); setDoCityFilter(''); setPickupZipFilter(''); setDropoffZipFilter(''); setZipFilter(''); }} title="Limpiar filtros de ciudad/zip" style={{ padding: '1px 6px', lineHeight: 1 }}>×</Button> : null}
                  </div>
                  <Button
                    variant="outline-dark"
                    size="sm"
                    style={greenToolbarButtonStyle}
                    onClick={() => changeTheme(themeMode === 'dark' ? 'light' : 'dark')}
                    title={themeMode === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
                    aria-label={themeMode === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
                  >
                    <i className={themeMode === 'dark' ? 'iconoir-sun-light' : 'iconoir-half-moon'} />
                  </Button>
                  {routeMetrics?.distanceMiles != null ? <Badge bg="light" text="dark">Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null}
                  {routeMetrics?.durationMinutes != null ? <Badge bg="light" text="dark">{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null}
                </div>
              </div>
                  {filteredTrips.length > 0 ? <div ref={tripTableTopScrollerRef} onScroll={() => syncTripTableScroll('top')} style={{ overflowX: 'scroll', overflowY: 'hidden', height: 20, marginBottom: 6, scrollbarGutter: 'stable', scrollbarWidth: 'thin', borderTop: '1px solid rgba(148, 163, 184, 0.25)', borderBottom: '1px solid rgba(148, 163, 184, 0.25)', backgroundColor: 'rgba(15, 23, 42, 0.35)' }}>
                    <div style={{ width: tripTableScrollWidth > 0 ? tripTableScrollWidth + 40 : 'calc(100% + 40px)', height: 18 }} />
                </div> : null}
              <div ref={tripTableBottomScrollerRef} className="table-responsive flex-grow-1" onScroll={() => syncTripTableScroll('bottom')} style={{ minHeight: 0, height: '100%', maxHeight: '100%', overflowX: 'auto', overflowY: 'auto', scrollbarGutter: 'stable both-edges', paddingBottom: 8 }}>
                <Table ref={tripTableElementRef} hover className="align-middle mb-0" style={{ whiteSpace: 'nowrap', minWidth: 'max-content', width: 'max-content' }}>
                  <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={event => handleSelectAll(event.target.checked)}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: '1px solid #6b7280',
                            backgroundColor: '#6b7280',
                            accentColor: '#8b5cf6',
                            cursor: 'pointer'
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
                      {visibleTripColumns.includes('address') ? renderTripHeader('address', 'PU Address', 260) : null}
                      {visibleTripColumns.includes('puZip') ? renderTripHeader('puZip', 'PU ZIP') : null}
                      {visibleTripColumns.includes('destination') ? renderTripHeader('destination', 'DO Address', 260) : null}
                      {visibleTripColumns.includes('doZip') ? renderTripHeader('doZip', 'DO ZIP') : null}
                      {visibleTripColumns.includes('phone') ? renderTripHeader('phone', 'Phone') : null}
                      {visibleTripColumns.includes('vehicle') ? renderTripHeader('vehicle', 'Vehicle') : null}
                      {visibleTripColumns.includes('leg') ? renderTripHeader('leg', 'Leg') : null}
                      {visibleTripColumns.includes('punctuality') ? renderTripHeader('punctuality', 'Punctuality') : null}
                      {visibleTripColumns.includes('lateMinutes') ? renderTripHeader('lateMinutes', 'Late Min') : null}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFilteredTripRows.length > 0 ? groupedFilteredTripRows.map(row => row.type === 'section' ? <tr key={row.key} className="table-light">
                        <td colSpan={tripTableColumnCount} className="small fw-semibold text-uppercase text-muted">{row.label}</td>
                      </tr> : <tr key={row.trip.id} className={selectedTripIds.includes(row.trip.id) ? 'table-primary' : isTripAssignedToSelectedDriver(row.trip) ? 'table-success' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTripIds.includes(row.trip.id)}
                            onChange={() => handleTripSelectionToggle(row.trip.id)}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: '1px solid #6b7280',
                              backgroundColor: '#6b7280',
                              accentColor: '#8b5cf6',
                              cursor: 'pointer'
                            }}
                          />
                        </td>
                        <td style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>
                          <div className="d-flex align-items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                            <Button variant={row.trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" onClick={() => {
                          setSelectedTripIds([row.trip.id]);
                          setSelectedDriverId(row.trip.driverId ?? selectedDriverId);
                          setSelectedRouteId(row.trip.routeId);
                          setStatusMessage(`Trip ${row.trip.id} activo.`);
                        }}>ACT</Button>
                          </div>
                        </td>
                        <td style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>
                          <Button variant="outline-secondary" size="sm" onClick={() => handleOpenTripNote(row.trip)} style={{ minWidth: 34, color: getTripNoteText(row.trip) ? '#9ca3af' : '#d1d5db', borderColor: '#6b7280', backgroundColor: 'transparent' }}>
                            N
                          </Button>
                        </td>
                        {visibleTripColumns.includes('trip') ? <td style={{ whiteSpace: 'nowrap' }}>
                            <div className="fw-semibold">{getDisplayTripId(row.trip)}</div>
                            {getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant} className="mt-1">{getLegBadge(row.trip).label}</Badge> : null}
                          </td> : null}
                        {visibleTripColumns.includes('status') ? <td style={{ whiteSpace: 'nowrap' }}><Badge bg={isTripAssignedToSelectedDriver(row.trip) ? 'success' : getStatusBadge(getEffectiveTripStatus(row.trip))}>{isTripAssignedToSelectedDriver(row.trip) ? 'Assigned Here' : getEffectiveTripStatus(row.trip)}</Badge>{row.trip.safeRideStatus && getEffectiveTripStatus(row.trip) !== 'Cancelled' ? <div className="small text-muted mt-1">{row.trip.safeRideStatus}</div> : null}</td> : null}
                        {visibleTripColumns.includes('driver') ? <td style={{ whiteSpace: 'nowrap' }}>{getTripDriverDisplay(row.trip)}</td> : null}
                        {visibleTripColumns.includes('pickup') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.pickup}</td> : null}
                        {visibleTripColumns.includes('dropoff') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.dropoff}</td> : null}
                        {visibleTripColumns.includes('miles') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.miles || '-'}</td> : null}
                        {visibleTripColumns.includes('rider') ? <td>
                            {(() => {
                          const {
                            firstName,
                            lastName
                          } = splitRiderName(row.trip.rider);
                          return <div style={riderNameStackStyle}>
                                  <div className="fw-semibold">{firstName}</div>
                                  {lastName ? <div className="small text-secondary">{lastName}</div> : null}
                                </div>;
                        })()}
                          </td> : null}
                        {visibleTripColumns.includes('address') ? <td><div style={addressClampStyle}>{row.trip.address}</div></td> : null}
                        {visibleTripColumns.includes('puZip') ? <td style={{ whiteSpace: 'nowrap' }}>{getPickupZip(row.trip) || '-'}</td> : null}
                        {visibleTripColumns.includes('destination') ? <td><div style={addressClampStyle}>{row.trip.destination || '-'}</div></td> : null}
                        {visibleTripColumns.includes('doZip') ? <td style={{ whiteSpace: 'nowrap' }}>{getDropoffZip(row.trip) || '-'}</td> : null}
                        {visibleTripColumns.includes('phone') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.patientPhoneNumber || '-'}</td> : null}
                        {visibleTripColumns.includes('vehicle') ? <td style={{ whiteSpace: 'nowrap' }}>{row.trip.vehicleType || '-'}</td> : null}
                        {visibleTripColumns.includes('leg') ? <td style={{ whiteSpace: 'nowrap' }}>{getLegBadge(row.trip) ? <Badge bg={getLegBadge(row.trip).variant}>{getLegBadge(row.trip).label}</Badge> : '-'}</td> : null}
                        {visibleTripColumns.includes('punctuality') ? <td style={{ whiteSpace: 'nowrap' }}><Badge bg={getTripPunctualityVariant(row.trip)}>{getTripPunctualityLabel(row.trip)}</Badge></td> : null}
                        {visibleTripColumns.includes('lateMinutes') ? <td style={{ whiteSpace: 'nowrap' }}>{getTripLateMinutesDisplay(row.trip)}</td> : null}
                      </tr>) : <tr>
                        <td colSpan={tripTableColumnCount} className="text-center text-muted py-4">No encontre movimientos para ese dia. Si habia una ruta guardada, revisa ese mismo dia en Trip Route y te mostrara los trips y choferes ligados a esa fecha.</td>
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
          <Card className="h-100 overflow-hidden">
            <CardBody className="p-0 d-flex flex-column h-100">
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>VDRS: {drivers.length}</strong>
                  <Form.Select size="sm" value={driverGrouping} onChange={event => setDriverGrouping(event.target.value)} style={{ width: 150 }}>
                    <option>VDR Grouping</option>
                    <option>By Live Status</option>
                    <option>By Vehicle</option>
                  </Form.Select>
                  <span>{liveDrivers} live</span>
                </div>
                <div className="d-flex gap-2">
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
                refreshDrivers();
                router.push('/drivers/grouping');
                setStatusMessage('Abriendo billing grouping del roster real.');
              }}>Open Grouping</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
                refreshDrivers();
                router.push('/drivers');
                setStatusMessage('Abriendo Drivers para administrar el roster real.');
              }}>Manage Drivers</Button>
                </div>
              </div>
              <div className="table-responsive flex-grow-1" style={{ minHeight: 0, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable' }}>
                <Table size="sm" className="align-middle mb-0 small" style={{ lineHeight: 1.1 }}>
                  <thead className="table-light">
                    <tr>
                      <th className="py-1" style={{ width: 60 }}>ACT</th>
                      <th className="py-1">#</th>
                      <th className="py-1">VID</th>
                      <th className="py-1">Vehicle</th>
                      <th className="py-1">Driver</th>
                      <th className="py-1">Checkpoint</th>
                      <th className="py-1">Attendant</th>
                      <th className="py-1">Info</th>
                      <th className="py-1">Live</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.length > 0 ? filteredDrivers.map((driver, index) => <tr key={driver.id} className={selectedDriverId === driver.id ? 'table-primary' : ''}>
                        <td className="py-1">
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check type="radio" checked={selectedDriverId === driver.id} onChange={() => setSelectedDriverId(driver.id)} />
                            <Button variant="light" size="sm" onClick={() => handleAssign(driver.id)}>
                              <IconifyIcon icon="la:arrow-right" />
                            </Button>
                          </div>
                        </td>
                        <td className="py-1">{index + 1}</td>
                        <td className="py-1">{driver.code}</td>
                        <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{driver.vehicle}</td>
                        <td className="py-1" style={{ whiteSpace: 'nowrap' }}><div className="fw-semibold">{driver.name}</div></td>
                        <td className="py-1">
                          <div className="d-flex align-items-center gap-2">
                            <IconifyIcon icon="iconoir:maps-arrow-diagonal" className={driver.live === 'Online' ? 'text-success' : 'text-muted'} />
                            <div>
                              <div className="fw-medium small">{getDriverCheckpoint(driver)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{driver.attendant}</td>
                        <td className="py-1 small text-truncate" style={{ maxWidth: 220 }}>{driver.info}</td>
                        <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{driver.live}</td>
                      </tr>) : <tr>
                        <td colSpan={9} className="text-center text-muted py-4">No hay choferes ni vehiculos cargados.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: showBottomPanels ? 'block' : 'none' }}>
          <Card className="h-100 overflow-hidden">
            <CardBody className="p-0 d-flex flex-column h-100">
              <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-dark gap-2 flex-wrap">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <Form.Select size="sm" value={selectedRouteId ?? ''} onChange={event => setSelectedRouteId(event.target.value)} style={{ width: 220 }}>
                    <option value="">Current selection</option>
                    {filteredRoutePlans.map(routePlan => <option key={routePlan.id} value={routePlan.id}>{routePlan.name}{getRouteServiceDateKey(routePlan, trips) ? ` • ${formatTripDateLabel(getRouteServiceDateKey(routePlan, trips))}` : ''}</option>)}
                  </Form.Select>
                  <Badge bg="light" text="dark">{filteredRoutePlans.length} route(s)</Badge>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handlePrintRoute}>Print Route</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleShareRouteWhatsapp}>WhatsApp</Button>
                </div>
                <Form.Control size="sm" value={routeSearch} onChange={event => setRouteSearch(event.target.value)} placeholder="Search" style={{ width: 180 }} />
              </div>
              <div className="table-responsive flex-grow-1" style={{ minHeight: 0, height: '100%', overflowY: 'auto' }}>
                <Table className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 48 }} />
                      <th>Trip ID</th>
                      <th>Miles</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Rider</th>
                      <th>Patient Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeTrips.length > 0 ? routeTrips.map(trip => <tr key={trip.id} className={selectedTripIds.includes(trip.id) ? 'table-success' : ''}>
                        <td>
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check checked={selectedTripIds.includes(trip.id)} onChange={() => toggleTripSelection(trip.id)} />
                            <Badge bg={getEffectiveTripStatus(trip) === 'Assigned' ? 'primary' : getStatusBadge(getEffectiveTripStatus(trip))}>{getEffectiveTripStatus(trip) === 'Assigned' ? 'A' : getEffectiveTripStatus(trip) === 'WillCall' ? 'WC' : 'U'}</Badge>
                          </div>
                        </td>
                        <td className="fw-semibold">{trip.id}</td>
                        <td>{trip.miles || '-'}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.rider}</td>
                        <td>{trip.patientPhoneNumber || '-'}</td>
                      </tr>) : <tr>
                        <td colSpan={7} className="text-center text-muted py-4">Selecciona una ruta, un chofer o trips para ver el menu de ruta.</td>
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
              }))} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="10:30 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Actual pickup</Form.Label>
                <Form.Control value={tripEditDraft.actualPickup} onChange={event => setTripEditDraft(current => ({
                ...current,
                actualPickup: event.target.value
              }))} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="10:42 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Scheduled dropoff</Form.Label>
                <Form.Control value={tripEditDraft.scheduledDropoff} onChange={event => setTripEditDraft(current => ({
                ...current,
                scheduledDropoff: event.target.value
              }))} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="11:00 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Actual dropoff</Form.Label>
                <Form.Control value={tripEditDraft.actualDropoff} onChange={event => setTripEditDraft(current => ({
                ...current,
                actualDropoff: event.target.value
              }))} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="11:08 AM" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Late minutes</Form.Label>
                <Form.Control value={tripEditDraft.delay} onChange={event => setTripEditDraft(current => ({
                ...current,
                delay: event.target.value
              }))} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="8" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Punctuality</Form.Label>
                <Form.Select value={tripEditDraft.onTimeStatus} onChange={event => setTripEditDraft(current => ({
                ...current,
                onTimeStatus: event.target.value
              }))} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation}>
                  <option value="">Auto</option>
                  <option value="On Time">On Time</option>
                  <option value="Late">Late</option>
                  <option value="Pending">Pending</option>
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Trip note</Form.Label>
                <Form.Control as="textarea" rows={5} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="Write the note for the driver here." />
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

export default TripDashboardWorkspace;