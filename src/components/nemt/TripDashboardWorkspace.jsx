'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import ManualTripModal from '@/components/nemt/ManualTripModal';
import { useLayoutContext } from '@/context/useLayoutContext';
import { buildStableDriverId, createBlankDriver, GROUPING_SERVICE_TYPE_OPTIONS, getVehicleCapabilityTokens } from '@/helpers/nemt-admin-model';
import { DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS, DISPATCH_TRIP_COLUMN_OPTIONS, formatTripDateLabel, getLocalDateKey, getRouteServiceDateKey, getTripDropoffPosition, getTripLateMinutesDisplay, getTripMobilityLabel, getTripPickupPosition, getTripPunctualityLabel, getTripPunctualityVariant, getTripServiceDateKey, getTripTimelineDateKey, isTripAssignedToDriver, parseTripClockMinutes, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { buildRoutePrintDocument, DEFAULT_ROUTE_PRINT_COLUMNS, formatPrintGeneratedAt, normalizeRoutePrintColumns, PRINT_COLUMN_OPTIONS } from '@/helpers/nemt-print-setup';
import { findTripAssignmentCompatibilityIssue } from '@/helpers/nemt-trip-assignment';
import { analyzeImportedTrips, annotateTripsByScanLogic, parseTripImportFile } from '@/helpers/nemt-trip-import';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { useNemtContext } from '@/context/useNemtContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import { openWhatsAppConversation, resolveRouteShareDriver } from '@/utils/whatsapp';
import { divIcon } from 'leaflet';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';
import { signOut, useSession } from 'next-auth/react';

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const darkToolbarButtonStyle = {
  color: '#e5e7eb',
  borderColor: 'rgba(226, 232, 240, 0.34)',
  backgroundColor: 'transparent'
};

const TripDashboardMapResizer = ({ resizeKey }) => {
  const map = useMap();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const frameId = window.requestAnimationFrame(() => {
      map.invalidateSize();
    });
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [map, resizeKey]);

  return null;
};

const iconToolbarButtonStyle = {
  minWidth: 34,
  width: 34,
  height: 34,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  boxShadow: 'none'
};

const greenIconToolbarButtonStyle = {
  ...iconToolbarButtonStyle,
  backgroundColor: '#23c28b',
  borderColor: '#23c28b',
  color: '#0f172a',
  borderRadius: 4
};

const compactTripActionButtonStyle = {
  minWidth: 26,
  width: 26,
  height: 20,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
  fontWeight: 700,
  fontSize: 11,
  lineHeight: 1,
  borderRadius: 4,
  whiteSpace: 'nowrap'
};

const compactTripActionLabelButtonStyle = {
  minWidth: 30,
  width: 30,
  height: 20,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
  fontWeight: 700,
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: 0,
  borderRadius: 4,
  whiteSpace: 'nowrap'
};

const compactTripActionWideButtonStyle = {
  minWidth: 72,
  width: 72,
  paddingLeft: 0,
  paddingRight: 0,
  fontWeight: 700,
  whiteSpace: 'nowrap'
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

const vehicleMetaStackStyle = {
  minWidth: 220,
  maxWidth: 280,
  lineHeight: 1.15,
  whiteSpace: 'normal'
};

const tripFieldErrorHighlightStyle = {
  backgroundColor: '#fee2e2',
  boxShadow: 'inset 0 0 0 1px rgba(185, 28, 28, 0.28)'
};

const getScanFindingColumnKeys = finding => {
  switch (String(finding?.code || '').trim()) {
    case 'same-location-leg':
      return ['address', 'destination', 'puZip', 'doZip'];
    case 'missing-destination':
      return ['destination', 'doZip'];
    case 'duplicate-trip-rows':
      return ['trip', 'pickup', 'address', 'destination', 'puZip', 'doZip'];
    case 'same-direction-repeated':
    case 'repeated-route-endpoint':
    case 'near-match-address-change':
    case 'route-mismatch':
    case 'chained-route':
      return ['address', 'destination', 'puZip', 'doZip'];
    case 'leg-label-mismatch':
      return ['trip', 'leg'];
    case 'multi-leg-group':
      return ['trip', 'leg', 'address', 'destination'];
    default:
      return [];
  }
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

const normalizeImportedDriverLookup = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const splitImportedDriverName = value => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: 'Imported', lastName: 'Driver' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Driver' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const isImportedDriverUsable = value => {
  const normalized = normalizeImportedDriverLookup(value);
  return Boolean(normalized) && !['unassigned', 'dispatcher managed', 'care mobility', 'care services mobility'].includes(normalized);
};

const ROUTE_IMPORT_ADD_PREFIX = '__add__:';

const findImportedDriverExactMatch = (importedName, availableDrivers = []) => {
  const normalizedImportedName = normalizeImportedDriverLookup(importedName);
  if (!normalizedImportedName) return null;
  return (Array.isArray(availableDrivers) ? availableDrivers : []).find(driver => normalizeImportedDriverLookup(driver?.name) === normalizedImportedName) || null;
};

const getImportedRouteDriverGroups = pendingTrips => {
  const usableGroupMap = new Map();
  let cancelledTripCount = 0;
  let missingNameTripCount = 0;

  (Array.isArray(pendingTrips) ? pendingTrips : []).forEach(trip => {
    if (String(trip?.status || '').trim().toLowerCase() === 'cancelled') {
      cancelledTripCount += 1;
      return;
    }

    const importedDriverName = String(trip?.importedDriverName || '').trim();
    if (!isImportedDriverUsable(importedDriverName)) {
      missingNameTripCount += 1;
      return;
    }

    const lookupKey = normalizeImportedDriverLookup(importedDriverName);
    const currentGroup = usableGroupMap.get(lookupKey) || {
      key: lookupKey,
      label: importedDriverName,
      tripCount: 0,
      serviceDates: new Set()
    };
    currentGroup.tripCount += 1;
    if (trip?.serviceDate) {
      currentGroup.serviceDates.add(String(trip.serviceDate).trim());
    }
    usableGroupMap.set(lookupKey, currentGroup);
  });

  return {
    usableGroups: Array.from(usableGroupMap.values()).map(group => ({
      ...group,
      serviceDates: Array.from(group.serviceDates).sort()
    })).sort((leftGroup, rightGroup) => leftGroup.label.localeCompare(rightGroup.label, undefined, { sensitivity: 'base' })),
    cancelledTripCount,
    missingNameTripCount
  };
};

const stripVehicleCapabilityCount = token => String(token || '').trim().replace(/\d+$/, '');

const getTripPairKey = trip => {
  const grouped = String(trip?.groupedTripKey || '').trim();
  if (grouped) return grouped;
  const broker = String(trip?.brokerTripId || '').trim();
  if (broker) return broker;
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const id = String(trip?.id || '').trim();
  if (!id) return '';
  return id.replace(/-\d+$/, '');
};

const getSiblingLegTrips = (targetTrip, allTrips = []) => {
  const pairKey = getTripPairKey(targetTrip);
  if (!pairKey) return [];
  return (Array.isArray(allTrips) ? allTrips : []).filter(item => String(item?.id) !== String(targetTrip?.id) && getTripPairKey(item) === pairKey);
};

const normalizeSignaturePayload = value => {
  if (!value || typeof value !== 'object') return null;
  const width = Number(value.width);
  const height = Number(value.height);
  const points = Array.isArray(value.points)
    ? value.points
      .map(point => ({
        x: Number(point?.x),
        y: Number(point?.y)
      }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 1200)
    : [];
  if (points.length < 2) return null;
  return {
    width: Number.isFinite(width) && width > 0 ? width : 300,
    height: Number.isFinite(height) && height > 0 ? height : 120,
    points
  };
};

const RiderSignaturePreview = ({ trip }) => {
  const payload = normalizeSignaturePayload(trip?.riderSignatureData);
  if (!payload) {
    if (!trip?.riderSignatureName) return null;
    return <div className="small text-muted mt-1">Signed by {trip.riderSignatureName}</div>;
  }
  const points = payload.points.map(point => `${point.x},${point.y}`).join(' ');
  return <div className="mt-1">
      <div className="small text-muted" style={{ lineHeight: 1.1 }}>Rider signature</div>
      <div style={{
      width: 180,
      maxWidth: '100%',
      height: 72,
      border: '1px solid #cbd5e1',
      borderRadius: 8,
      backgroundColor: '#ffffff'
    }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${payload.width} ${payload.height}`} preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {trip?.riderSignatureName ? <div className="small text-muted mt-1" style={{ lineHeight: 1.1 }}>Signed by {trip.riderSignatureName}</div> : null}
    </div>;
};

const yellowMapTabStyle = {
  position: 'absolute',
  top: 28,
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

const greenMapTabStyle = {
  ...yellowMapTabStyle,
  top: 74,
  border: '1px solid rgba(22, 101, 52, 0.48)',
  background: 'linear-gradient(180deg, #86efac 0%, #22c55e 100%)',
  color: '#14532d',
  boxShadow: '0 10px 26px rgba(21, 128, 61, 0.24)'
};

const blueMapTabStyle = {
  ...yellowMapTabStyle,
  top: 120,
  border: '1px solid rgba(29, 78, 216, 0.48)',
  background: 'linear-gradient(180deg, #93c5fd 0%, #2563eb 100%)',
  color: '#eff6ff',
  boxShadow: '0 10px 26px rgba(37, 99, 235, 0.26)'
};

const compactMapToolbarButtonStyle = {
  minWidth: 38,
  width: 38,
  height: 30,
  padding: 0,
  borderRadius: 6,
  border: '1px solid rgba(161, 98, 7, 0.48)',
  background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)',
  color: '#5b3b00',
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  boxShadow: 'none'
};

const lightToolbarButtonStyle = {
  color: '#10212b',
  borderColor: 'rgba(15, 23, 42, 0.24)',
  backgroundColor: 'rgba(255, 255, 255, 0.9)'
};

const redToolbarButtonStyle = {
  color: '#ffffff',
  borderColor: '#b91c1c',
  backgroundColor: '#dc2626'
};

const TRIP_COLUMN_MIN_WIDTHS = {
  act: 52,
  notes: 240,
  pickup: 56,
  dropoff: 56,
  miles: 56,
  puZip: 64,
  doZip: 64,
  leg: 52,
  lateMinutes: 68
};

const BLACKLIST_CATEGORY_OPTIONS = ['Do Not Schedule', 'Medical Hold', 'Deceased', 'This Week Only', 'Legal / Claim', 'Safety Risk', 'Other'];
const TRIP_SYSTEM_NOTE_PREFIXES = ['[TRIP UPDATE]', '[SCHEDULE CHANGE]', '[DISPATCH NOTE]', '[CANCELLED]'];
const TRIP_CONFIRMATION_OUTPUT_COLUMNS = ['tripId', 'rider', 'phone', 'pickupTime', 'pickupAddress', 'dropoffTime', 'dropoffAddress', 'leg', 'type'];

const createEmptyBlacklistEntryDraft = () => ({
  name: '',
  phone: '',
  category: 'Do Not Schedule',
  holdUntil: '',
  notes: ''
});

const TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS = ['date-controls', 'trip-search', 'driver-assigned', 'action-buttons', 'leg-buttons', 'type-buttons', 'closed-route'];
const TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS = ['show-map', 'peek-panel', 'toolbar-edit', 'layout', 'panels', 'trip-order'];
const TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS = ['driver-select', 'secondary-driver', 'zip-filter', 'route-filter', 'theme-toggle', 'metric-miles', 'metric-duration'];
const TRIP_DASHBOARD_RIGHT_PANEL_COLLAPSED_WIDTH = 56;
const TRIP_DASHBOARD_RIGHT_PANEL_EXPANDED_SPLIT = 50;
const TRIP_DASHBOARD_DEFAULT_NORMAL_MAP_SPLIT = 47;
const TRIP_DASHBOARD_FOCUS_RIGHT_MIN_SPLIT = 16;
const TRIP_DASHBOARD_FOCUS_RIGHT_MAX_SPLIT = 84;
const TRIP_DASHBOARD_DEFAULT_STANDARD_SPLIT = 58;
const TRIP_DASHBOARD_DEFAULT_FOCUS_RIGHT_SPLIT = 47;
const TRIP_DASHBOARD_DEFAULT_ROW_SPLIT = 68;

const TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS = [...TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS, ...TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS, ...TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS];

const TRIP_DASHBOARD_TOOLBAR_BLOCK_LABELS = {
  'date-controls': 'Date controls',
  'status-filter': 'Status filter',
  'trip-search': 'Search',
  'driver-assigned': 'Assigned',
  'action-buttons': 'Actions',
  'type-buttons': 'Tipo',
  'leg-buttons': 'Leg',
  'closed-route': 'Close route',
  'show-map': 'Show map',
  'peek-panel': 'Panel peek',
  'toolbar-edit': 'Toolbar editor',
  'layout': 'Layout',
  'panels': 'Panels',
  'trip-order': 'Trip order',
  'driver-select': 'Primary driver',
  'secondary-driver': 'Secondary driver',
  'zip-filter': 'ZIP filter',
  'route-filter': 'Route filter',
  'theme-toggle': 'Tema',
  'metric-miles': 'Miles metric',
  'metric-duration': 'Duration metric'
};

const TRIP_DASHBOARD_LAYOUTS = {
  normal: 'normal',
  focusRight: 'focus-right',
  stacked: 'stacked'
};

const TRIP_DASHBOARD_PANEL_VIEWS = {
  both: 'both',
  drivers: 'drivers',
  routes: 'routes'
};

const TRIP_DASHBOARD_PANEL_ORDERS = {
  driversFirst: 'drivers-first',
  routesFirst: 'routes-first'
};

const TRIP_TIME_DISPLAY_MODES = {
  standard: '12h',
  military: '24h'
};

const normalizeTripTimeDisplayMode = value => String(value || '').trim() === TRIP_TIME_DISPLAY_MODES.military ? TRIP_TIME_DISPLAY_MODES.military : TRIP_TIME_DISPLAY_MODES.standard;

const getInitialTripDashboardLayoutMode = () => TRIP_DASHBOARD_LAYOUTS.focusRight;

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  if (status === 'WillCall') return 'danger';
  if (status === 'Cancelled') return 'danger';
  return 'secondary';
};

const getDriverCheckpoint = driver => {
  if (driver.hasRealLocation) return 'Live location';
  if (driver.checkpoint) return driver.checkpoint;
  if (!driver.position) return 'No GPS';
  return 'No GPS';
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
  if (!Number.isFinite(minutes)) return 'No estimate';
  if (minutes >= 0) return `${minutes} min early`;
  return `${Math.abs(minutes)} min late`;
};

const formatMinutesToTimeInput = minutes => {
  if (!Number.isFinite(minutes)) return '';
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mins = String(normalized % 60).padStart(2, '0');
  return `${hours}:${mins}`;
};

const formatMinutesAsClock = (minutes, mode = TRIP_TIME_DISPLAY_MODES.standard) => {
  if (!Number.isFinite(minutes)) return '';
  const normalized = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  if (normalizeTripTimeDisplayMode(mode) === TRIP_TIME_DISPLAY_MODES.military) {
    return `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${suffix}`;
};

const parseSpreadsheetTimeMinutes = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const fractionalDay = numeric - Math.floor(numeric);
  const totalMinutes = Math.round(fractionalDay * 24 * 60);
  if (!Number.isFinite(totalMinutes)) return null;
  return ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
};

const looksLikeExcelSerialTime = value => /^\d{4,6}(?:\.\d+)?$/.test(String(value || '').trim());

const getEffectiveTimeText = (scheduledValue, fallbackValue) => {
  const scheduledText = String(scheduledValue || '').trim();
  const fallbackText = String(fallbackValue || '').trim();
  if (looksLikeExcelSerialTime(scheduledText) && fallbackText) return fallbackText;
  return scheduledText || fallbackText;
};

const normalizeTripTimeDisplay = value => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const asClockMinutes = parseTripClockMinutes(text);
  if (asClockMinutes != null) return formatMinutesToTimeInput(asClockMinutes);

  const spreadsheetMinutes = parseSpreadsheetTimeMinutes(text);
  if (spreadsheetMinutes != null) return formatMinutesToTimeInput(spreadsheetMinutes);

  return text;
};

const formatTripTimeDisplay = (value, mode = TRIP_TIME_DISPLAY_MODES.standard) => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const asClockMinutes = parseTripClockMinutes(text);
  if (asClockMinutes != null) return formatMinutesAsClock(asClockMinutes, mode);

  const spreadsheetMinutes = parseSpreadsheetTimeMinutes(text);
  if (spreadsheetMinutes != null) return formatMinutesAsClock(spreadsheetMinutes, mode);

  return text;
};

const getTripDisplayTimeText = (trip, field = 'pickup', mode = TRIP_TIME_DISPLAY_MODES.standard) => {
  if (field === 'dropoff') {
    return formatTripTimeDisplay(getEffectiveTimeText(trip?.scheduledDropoff, trip?.dropoff), mode);
  }
  return formatTripTimeDisplay(getEffectiveTimeText(trip?.scheduledPickup, trip?.pickup), mode);
};

const getSuggestedPlannerCutoffTime = trip => {
  const dropoffMinutes = parseTripClockMinutes(getEffectiveTimeText(trip?.scheduledDropoff, trip?.dropoff));
  if (dropoffMinutes != null) return formatMinutesToTimeInput(dropoffMinutes + 180);
  const pickupMinutes = parseTripClockMinutes(getEffectiveTimeText(trip?.scheduledPickup, trip?.pickup));
  if (pickupMinutes != null) return formatMinutesToTimeInput(pickupMinutes + 240);
  return '';
};

const getPlannerTripLabel = trip => {
  if (!trip) return 'Trip';
  const rawTripId = String(trip?.rideId || trip?.id || '').trim();
  const tripId = rawTripId.split('-')[0]?.trim() || rawTripId;
  const rider = String(trip?.rider || '').trim();
  const pickup = getEffectiveTimeText(trip?.scheduledPickup, trip?.pickup);
  const pickupZip = getPickupZip(trip);
  return [tripId, rider, pickup, pickupZip].filter(Boolean).join(' - ');
};

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const extractCityFromAddress = address => {
  const parts = String(address || '').split(',');
  return parts.length >= 2 ? parts[1].trim() : '';
};

const getTripTypeLabel = getTripMobilityLabel;

const getPickupCity = trip => extractCityFromAddress(trip?.address);
const getDropoffCity = trip => extractCityFromAddress(trip?.destination);
const getPickupZip = trip => String(trip?.fromZipcode || trip?.fromZip || trip?.pickupZipcode || trip?.pickupZip || trip?.originZip || '').trim();
const getDropoffZip = trip => String(trip?.toZipcode || trip?.toZip || trip?.dropoffZipcode || trip?.dropoffZip || trip?.destinationZip || '').trim();
const normalizeCityValue = value => String(value || '').trim().toLowerCase();
const normalizeZipValue = value => String(value || '').trim();
const tripMatchesCity = (trip, cityValue) => {
  const normalizedCity = normalizeCityValue(cityValue);
  if (!normalizedCity) return true;
  return normalizeCityValue(getPickupCity(trip)) === normalizedCity || normalizeCityValue(getDropoffCity(trip)) === normalizedCity;
};
const tripMatchesZip = (trip, zipValue) => {
  const normalizedZip = normalizeZipValue(zipValue);
  if (!normalizedZip) return true;
  return normalizeZipValue(getPickupZip(trip)) === normalizedZip || normalizeZipValue(getDropoffZip(trip)) === normalizedZip;
};
const buildAiPlannerRoutePairKey = (pickupCity, dropoffCity) => `${String(pickupCity || '').trim()}|||${String(dropoffCity || '').trim()}`;
const parseAiPlannerRoutePairKey = pairKey => {
  const [pickupCity = '', dropoffCity = ''] = String(pairKey || '').split('|||');
  return {
    pickupCity: pickupCity.trim(),
    dropoffCity: dropoffCity.trim()
  };
};
const formatAiPlannerRoutePairLabel = pairKey => {
  const { pickupCity, dropoffCity } = parseAiPlannerRoutePairKey(pairKey);
  if (!pickupCity && !dropoffCity) return 'All routes';
  return `${pickupCity || '?'} -> ${dropoffCity || '?'}`;
};
const normalizeTripId = tripId => String(tripId || '').trim();
const invertDashboardTripDirection = trip => ({
  address: String(trip?.destination || '').trim(),
  destination: String(trip?.address || '').trim(),
  fromZipcode: getDropoffZip(trip),
  toZipcode: getPickupZip(trip),
  fromZip: getDropoffZip(trip),
  toZip: getPickupZip(trip),
  position: Array.isArray(trip?.destinationPosition) ? [...trip.destinationPosition] : trip?.destinationPosition,
  destinationPosition: Array.isArray(trip?.position) ? [...trip.position] : trip?.position
});
const normalizeDriverId = driverId => String(driverId || '').trim();
const getClosedRouteKey = (driverId, dateKey) => {
  const normalizedDriverId = normalizeDriverId(driverId);
  const normalizedDateKey = String(dateKey || '').trim();
  if (!normalizedDriverId || !normalizedDateKey || normalizedDateKey === 'all') return '';
  return `${normalizedDriverId}::${normalizedDateKey}`;
};

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

const getEffectivePickupTimeText = trip => getEffectiveTimeText(trip?.scheduledPickup, trip?.pickup);

const readJsonResponse = async response => {
  const rawText = await response.text();
  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error('The server returned HTML instead of JSON. Check the API error on the server.');
    }
    throw new Error(rawText.slice(0, 220) || 'The server returned an invalid response.');
  }
};

const hasMissingTripTime = trip => {
  const effectivePickupText = getEffectivePickupTimeText(trip);
  const parsedPickupMinutes = parseTripClockMinutes(effectivePickupText);
  const normalizedPickup = effectivePickupText.toLowerCase().replace(/\s+/g, '');
  if (!effectivePickupText) return true;
  if (['tbd', 'willcall', 'will call', '23:', '23'].includes(effectivePickupText.toLowerCase())) return true;
  if (['11:59pm', '11:59p.m.', '11:59p'].includes(normalizedPickup)) return true;
  if (parsedPickupMinutes != null) return false;
  return !Number.isFinite(trip?.pickupSortValue) || trip?.pickupSortValue === Number.MAX_SAFE_INTEGER;
};

const hasWillCallPickupMarker = trip => {
  const effectivePickupText = getEffectivePickupTimeText(trip).toLowerCase();
  if (!effectivePickupText) return false;
  const normalizedPickup = effectivePickupText.replace(/\s+/g, '');
  if (['11:59pm', '11:59p.m.', '11:59p'].includes(normalizedPickup)) return true;
  return ['tbd', 'willcall', 'will call', '23', '23:'].some(marker => effectivePickupText === marker || effectivePickupText.startsWith(marker));
};

const getEffectiveTripStatus = trip => {
  const normalizedStatus = String(trip?.status || '').trim();
  const normalizedStatusToken = normalizedStatus.toLowerCase().replace(/\s+/g, '');
  const normalizedOverride = String(trip?.willCallOverride || '').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(normalizedStatusToken)) return 'Cancelled';
  if (normalizedOverride === 'off') return normalizedStatusToken === 'willcall' ? 'Unassigned' : normalizedStatus || 'Unassigned';
  if (normalizedOverride === 'manual') return 'WillCall';
  if (normalizedStatusToken === 'willcall') return 'WillCall';
  if (hasWillCallPickupMarker(trip)) return 'WillCall';
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

const compareNormalizedTripSortValues = (leftValue, rightValue, direction = 'asc') => {
  const leftEmpty = leftValue === '' || leftValue == null;
  const rightEmpty = rightValue === '' || rightValue == null;

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  let result = 0;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
  } else {
    result = String(leftValue).localeCompare(String(rightValue), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  return direction === 'asc' ? result : -result;
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
    case 'notes':
      return trip.notes;
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

const getTripTargetPosition = trip => trip?.status === 'In Progress' ? getTripDropoffPosition(trip) : getTripPickupPosition(trip);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getDisplayTripId = trip => {
  const rideId = String(trip?.rideId || '').trim();
  if (rideId) return rideId;
  const brokerTripId = String(trip?.brokerTripId || '').trim();
  if (brokerTripId) return brokerTripId;
  const tripId = String(trip?.id || '').trim();
  if (!tripId) return '';
  if (tripId.includes('|')) {
    return tripId.split('|').map(part => String(part || '').trim()).find(Boolean) || tripId;
  }
  return tripId.split('-')[0] || tripId;
};

const getUniqueNoteBlocks = values => {
  const seen = new Set();
  return values.map(value => String(value || '').trim()).filter(Boolean).filter(value => {
    const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const splitTripNoteSections = trip => {
  const legacyImportedNotes = [trip?.note, trip?.comments].map(value => String(value || '').trim()).filter(Boolean).join('\n\n');
  const rawUnifiedNotes = String(trip?.notes || '').trim();
  const storedDispatchNotes = String(trip?.dispatchNotes || trip?.dispatchNote || '').trim();

  if (!rawUnifiedNotes) {
    return {
      importedNotes: legacyImportedNotes,
      dispatchNotes: storedDispatchNotes,
      combinedNotes: getUniqueNoteBlocks([legacyImportedNotes, storedDispatchNotes]).join('\n\n')
    };
  }

  const importedLines = [];
  const systemLines = [];
  rawUnifiedNotes.split(/\r?\n/).forEach(line => {
    const trimmedLine = String(line || '').trim();
    if (!trimmedLine) return;
    if (TRIP_SYSTEM_NOTE_PREFIXES.some(prefix => trimmedLine.startsWith(prefix))) {
      systemLines.push(trimmedLine);
      return;
    }
    importedLines.push(trimmedLine);
  });

  const importedNotes = getUniqueNoteBlocks([legacyImportedNotes, importedLines.join('\n')]).join('\n\n');
  const dispatchNotes = getUniqueNoteBlocks([storedDispatchNotes, systemLines.join('\n')]).join('\n\n');
  return {
    importedNotes,
    dispatchNotes,
    combinedNotes: getUniqueNoteBlocks([importedNotes, dispatchNotes]).join('\n\n')
  };
};

const getTripImportedNoteText = trip => splitTripNoteSections(trip).importedNotes;

const getTripDispatchNoteText = trip => splitTripNoteSections(trip).dispatchNotes;

const getTripNoteText = trip => splitTripNoteSections(trip).combinedNotes;

const getTripExcelLoaderSnapshot = trip => trip?.excelLoaderSnapshot && typeof trip.excelLoaderSnapshot === 'object' ? trip.excelLoaderSnapshot : null;

const buildTripExcelComparisonRows = trip => {
  const snapshot = getTripExcelLoaderSnapshot(trip);
  if (!snapshot) return [];

  return [{
    label: 'Ride ID',
    excelValue: snapshot.rideId || '-',
    currentValue: trip?.rideId || '-'
  }, {
    label: 'Trip ID',
    excelValue: snapshot.brokerTripId || '-',
    currentValue: trip?.brokerTripId || '-'
  }, {
    label: 'Rider',
    excelValue: snapshot.rider || '-',
    currentValue: trip?.rider || '-'
  }, {
    label: 'Pickup',
    excelValue: snapshot.rawPickupTime || snapshot.pickup || '-',
    currentValue: trip?.pickup || '-'
  }, {
    label: 'Dropoff',
    excelValue: snapshot.rawDropoffTime || snapshot.dropoff || '-',
    currentValue: trip?.dropoff || '-'
  }, {
    label: 'Pickup Address',
    excelValue: snapshot.address || '-',
    currentValue: trip?.address || '-'
  }, {
    label: 'Pickup ZIP',
    excelValue: snapshot.fromZipcode || '-',
    currentValue: getPickupZip(trip) || '-'
  }, {
    label: 'Dropoff Address',
    excelValue: snapshot.destination || '-',
    currentValue: trip?.destination || '-'
  }, {
    label: 'Dropoff ZIP',
    excelValue: snapshot.toZipcode || '-',
    currentValue: getDropoffZip(trip) || '-'
  }, {
    label: 'Status',
    excelValue: snapshot.safeRideStatus || '-',
    currentValue: trip?.safeRideStatus || trip?.status || '-'
  }, {
    label: 'Confirmation',
    excelValue: snapshot.confirmationStatus || '-',
    currentValue: trip?.confirmationStatus || '-'
  }, {
    label: 'Type',
    excelValue: snapshot.tripType || '-',
    currentValue: trip?.tripType || '-'
  }, {
    label: 'Phone',
    excelValue: snapshot.patientPhoneNumber || '-',
    currentValue: trip?.patientPhoneNumber || '-'
  }, {
    label: 'Vehicle',
    excelValue: snapshot.vehicleType || '-',
    currentValue: trip?.vehicleType || '-'
  }];
};

const buildTripEditDraft = trip => ({
  notes: String(trip?.notes || '').trim(),
  scheduledPickup: String(trip?.scheduledPickup || '').trim(),
  actualPickup: String(trip?.actualPickup || '').trim(),
  scheduledDropoff: String(trip?.scheduledDropoff || '').trim(),
  actualDropoff: String(trip?.actualDropoff || '').trim(),
  delay: trip?.lateMinutes != null ? String(Math.round(trip.lateMinutes)) : String(trip?.delay || '').trim(),
  onTimeStatus: String(trip?.onTimeStatus || '').trim()
});

const INLINE_EDITABLE_TRIP_COLUMNS = new Set(['pickup', 'dropoff', 'rider', 'address', 'puZip', 'destination', 'doZip', 'phone', 'miles', 'vehicle']);

const getInlineEditableTripValue = (trip, columnKey) => {
  switch (columnKey) {
    case 'pickup':
      return getEffectiveTimeText(trip?.scheduledPickup, trip?.pickup);
    case 'dropoff':
      return getEffectiveTimeText(trip?.scheduledDropoff, trip?.dropoff);
    case 'rider':
      return String(trip?.rider || '').trim();
    case 'address':
      return String(trip?.address || '').trim();
    case 'puZip':
      return getPickupZip(trip);
    case 'destination':
      return String(trip?.destination || '').trim();
    case 'doZip':
      return getDropoffZip(trip);
    case 'phone':
      return String(trip?.patientPhoneNumber || '').trim();
    case 'miles':
      return String(trip?.miles ?? '').trim();
    case 'vehicle':
      return String(trip?.vehicleType || '').trim();
    default:
      return '';
  }
};

const buildInlineTripTimeSortValue = (trip, timeText, routePlans, trips, fallbackKey) => {
  const parsedMinutes = parseTripClockMinutes(timeText);
  if (parsedMinutes == null) return Number.MAX_SAFE_INTEGER;
  const serviceDateKey = getTripTimelineDateKey(trip, routePlans, trips) || getLocalDateKey(new Date());
  const [year, month, day] = String(serviceDateKey || '').split('-').map(Number);
  if (!year || !month || !day) {
    return Number.isFinite(Number(trip?.[fallbackKey])) ? Number(trip[fallbackKey]) : Number.MAX_SAFE_INTEGER;
  }
  const hours = Math.floor(parsedMinutes / 60);
  const minutes = parsedMinutes % 60;
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
};

const buildInlineTripUpdatePayload = ({ trip, columnKey, value, routePlans, trips }) => {
  const nextValue = String(value ?? '').trim();
  switch (columnKey) {
    case 'pickup':
      return {
        pickup: nextValue,
        scheduledPickup: nextValue,
        pickupSortValue: buildInlineTripTimeSortValue(trip, nextValue, routePlans, trips, 'pickupSortValue')
      };
    case 'dropoff':
      return {
        dropoff: nextValue,
        scheduledDropoff: nextValue,
        dropoffSortValue: buildInlineTripTimeSortValue(trip, nextValue, routePlans, trips, 'dropoffSortValue')
      };
    case 'rider':
      return {
        rider: nextValue,
        patientName: nextValue
      };
    case 'address':
      return { address: nextValue };
    case 'puZip':
      return {
        fromZipcode: nextValue,
        fromZip: nextValue,
        pickupZipcode: nextValue,
        pickupZip: nextValue,
        originZip: nextValue
      };
    case 'destination':
      return { destination: nextValue };
    case 'doZip':
      return {
        toZipcode: nextValue,
        toZip: nextValue,
        dropoffZipcode: nextValue,
        dropoffZip: nextValue,
        destinationZip: nextValue
      };
    case 'phone':
      return { patientPhoneNumber: nextValue };
    case 'miles':
      return { miles: nextValue };
    case 'vehicle':
      return { vehicleType: nextValue };
    default:
      return null;
  }
};

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#ef4444'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const DEFAULT_VEHICLE_ICON_URL = '/assets/gpscars/car-19.svg';

const createLiveVehicleIcon = ({ heading = 0, isOnline = false, vehicleIconScalePercent = 100 }) => {
  const normalizedHeading = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const normalizedScale = clamp(Number(vehicleIconScalePercent) || 100, 70, 200);
  const shellSize = Math.round(60 * normalizedScale / 100);
  const bodyWidth = Math.round(34 * normalizedScale / 100);
  const bodyHeight = Math.round(48 * normalizedScale / 100);
  const imageSizePercent = Math.round(clamp(132 * normalizedScale / 100, 110, 190));

  return divIcon({
    className: 'driver-live-vehicle-icon-shell',
    html: `<div style="width:${shellSize}px;height:${shellSize}px;display:flex;align-items:center;justify-content:center;transform: rotate(${normalizedHeading}deg);filter: drop-shadow(0 6px 16px rgba(15,23,42,0.28));opacity:${isOnline ? '1' : '0.82'};"><div style="width:${bodyWidth}px;height:${bodyHeight}px;overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${DEFAULT_VEHICLE_ICON_URL}" alt="car" style="width:${imageSizePercent}%;height:${imageSizePercent}%;object-fit:cover;filter:${isOnline ? 'none' : 'grayscale(0.9)'};" onerror="this.onerror=null;this.src='${DEFAULT_VEHICLE_ICON_URL}';" /></div></div>`,
    iconSize: [shellSize, shellSize],
    iconAnchor: [Math.round(shellSize / 2), Math.round(shellSize / 2)],
    popupAnchor: [0, -Math.round(shellSize * 0.4)]
  });
};

const TripDashboardWorkspace = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const { changeTheme, themeMode } = useLayoutContext();
  const { data: smsData, saveData: saveSmsData } = useSmsIntegrationApi();
  const { data: adminData, saveData: saveAdminData, refresh: refreshAdminData } = useNemtAdminApi();
  const { data: blacklistData, loading: blacklistLoading, saving: blacklistSaving, error: blacklistError, refresh: refreshBlacklist, saveData: saveBlacklistData } = useBlacklistApi();
  const { data: userPreferences, loading: userPreferencesLoading, saveData: saveUserPreferences } = useUserPreferencesApi();
  const {
    drivers,
    trips,
    routePlans,
    selectedDriverId,
    setSelectedDriverId,
    assignTripsToDriver,
    assignTripsToSecondaryDriver,
    unassignTrips,
    upsertImportedTrips,
    previewImportedTripRoutingChanges,
    cancelTrips,
    reinstateTrips,
    createRoute,
    deleteRoute,
    refreshDrivers,
    refreshDispatchState,
    getDriverName,
    createManualTripRecord,
    updateTripNotes,
    updateTripRecord,
    cloneTripRecord,
    deleteTripRecord,
    uiPreferences,
    hasLoadedUserUiPreferences,
    setDispatcherVisibleTripColumns,
    setMapProvider,
  } = useNemtContext();
  const { showNotification } = useNotificationContext();
  const [routeName, setRouteName] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [tripIdSearch, setTripIdSearch] = useState('');
  const [tripDateFilter, setTripDateFilter] = useState('all');
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedSecondaryDriverId, setSelectedSecondaryDriverId] = useState('');
  const [tripLegFilter, setTripLegFilter] = useState('all');
  const [tripTypeFilter, setTripTypeFilter] = useState('all');
  const [serviceAnimalOnly, setServiceAnimalOnly] = useState(false);
  const [mapCityQuickFilter, setMapCityQuickFilter] = useState('');
  const [mapZipQuickFilter, setMapZipQuickFilter] = useState('');
  const [pickupZipFilter, setPickupZipFilter] = useState('');
  const [dropoffZipFilter, setDropoffZipFilter] = useState('');
  const [zipFilter, setZipFilter] = useState('');
  const [puCityFilter, setPuCityFilter] = useState('');
  const [doCityFilter, setDoCityFilter] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [driverVehicleCapabilityFilters, setDriverVehicleCapabilityFilters] = useState([]);
  const [driverSort, setDriverSort] = useState({
    key: 'name',
    direction: 'asc'
  });
  const [driverGrouping, setDriverGrouping] = useState('VDR Grouping');
  const [routeSearch, setRouteSearch] = useState('');
  const [showBlacklistModal, setShowBlacklistModal] = useState(false);
  const [showTripImportModal, setShowTripImportModal] = useState(false);
  const [showDayOffModal, setShowDayOffModal] = useState(false);
  const [showManualTripModal, setShowManualTripModal] = useState(false);
  const [blacklistSearch, setBlacklistSearch] = useState('');
  const [blacklistDraft, setBlacklistDraft] = useState(createEmptyBlacklistEntryDraft());
  const [blacklistDraftTrip, setBlacklistDraftTrip] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [showBottomPanels, setShowBottomPanels] = useState(() => getInitialTripDashboardLayoutMode() !== TRIP_DASHBOARD_LAYOUTS.normal);
  const showInlineMap = true;
  const [showMapPane, setShowMapPane] = useState(() => getInitialTripDashboardLayoutMode() === TRIP_DASHBOARD_LAYOUTS.normal);
  const [mapLocked, setMapLocked] = useState(false);
    const handleFocusLiveScanTrip = (tripId, riderName = '') => {
      const normalizedTripId = normalizeTripId(tripId);
      if (!normalizedTripId) return;

      const focusTrip = filteredTrips.find(trip => normalizeTripId(trip.id) === normalizedTripId) || scanAnnotatedTrips.find(trip => normalizeTripId(trip.id) === normalizedTripId) || null;
      const focusGroupKey = String(focusTrip?.scanRootGroupKey || focusTrip?.groupedTripKey || '').trim();

      const groupedTripIds = focusGroupKey
        ? filteredTrips.filter(trip => String(trip?.scanRootGroupKey || trip?.groupedTripKey || '').trim() === focusGroupKey).map(trip => normalizeTripId(trip.id)).filter(Boolean)
        : [];

      setSelectedTripIds(groupedTripIds.length > 0 ? groupedTripIds : [normalizedTripId]);
      if (String(riderName || '').trim()) {
        setTripIdSearch(String(riderName).trim());
        setStatusMessage(`Scanner found ${riderName}. The lower panel was filtered for review.`);
        return;
      }
      setStatusMessage(`Scanner focus ready for ${groupedTripIds.length > 1 ? `${groupedTripIds.length} linked legs` : normalizedTripId}.`);
    };

    const handleResetLiveScanFocus = () => {
      setSelectedTripIds([]);
      setTripIdSearch('');
      setStatusMessage('System scanner focus reset. All visible trips are shown again.');
    };
    const handleInvertSelectedLiveScanTrips = () => {
      if (selectedVisibleTrips.length === 0) {
        showNotification({ message: 'Select at least one visible trip before inverting direction.', variant: 'warning' });
        return;
      }

      selectedVisibleTrips.forEach(trip => {
        updateTripRecord(trip.id, invertDashboardTripDirection(trip));
      });

      setStatusMessage(`${selectedVisibleTrips.length} selected visible trip(s) inverted. Pickup, dropoff, and ZIP codes were swapped together.`);
      showNotification({ message: `${selectedVisibleTrips.length} selected visible trip(s) inverted.`, variant: 'success' });
    };

    const handleAutoRepairLiveScan = () => {
      if (liveTripAutoRepairableFindings.length === 0) {
        setStatusMessage('Scanner checked the visible trips. No auto-repairable issues were found.');
        showNotification({ message: 'No simple repeated-direction issues are available for auto-repair in the visible trips.', variant: 'warning' });
        return;
      }

      const targetTripIds = new Set();
      liveTripAutoRepairableFindings.forEach(finding => {
        finding.tripIds.slice(1).forEach(tripId => targetTripIds.add(normalizeTripId(tripId)));
      });

      const targetTrips = filteredTrips.filter(trip => targetTripIds.has(normalizeTripId(trip?.id)));
      if (targetTrips.length === 0) {
        showNotification({ message: 'Scanner found issues, but the target trips were not available for repair in the current visible list.', variant: 'warning' });
        return;
      }

      targetTrips.forEach(trip => {
        updateTripRecord(trip.id, invertDashboardTripDirection(trip));
      });
      setSelectedTripIds(targetTrips.map(trip => normalizeTripId(trip.id)).filter(Boolean));
      const riderSummary = Array.from(new Set(targetTrips.map(trip => String(trip?.rider || '').trim()).filter(Boolean))).slice(0, 3);
      const riderSuffix = riderSummary.length > 0 ? ` Affected rider(s): ${riderSummary.join(', ')}${riderSummary.length < new Set(targetTrips.map(trip => String(trip?.rider || '').trim()).filter(Boolean)).size ? ', ...' : ''}.` : '';
      const repairSummary = `Scanner auto-repair inverted direction for ${targetTrips.length} visible trip(s). Pickup, dropoff, and ZIP codes were swapped together.${riderSuffix}`;
      setStatusMessage(repairSummary);
      showNotification({ message: repairSummary, variant: 'success' });
    };

    const handleOpenLiveScanConfirmation = () => {
      if (selectedVisibleTrips.length === 0) {
        setStatusMessage('Select at least one visible scanner trip before opening confirmation.');
        showNotification({ message: 'Select at least one visible scanner trip before opening confirmation.', variant: 'warning' });
        return;
      }

      handleOpenConfirmationMethod(selectedVisibleTrips, selectedVisibleTrips[0] || null);
      setStatusMessage(`Confirmation opened for ${selectedVisibleTrips.length} visible scanner trip(s).`);
    };
  const [expanded, setExpanded] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showRoutePrintColumnPicker, setShowRoutePrintColumnPicker] = useState(false);
  const [showToolbarTools, setShowToolbarTools] = useState(false);
  const [showConfirmationTools, setShowConfirmationTools] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [topButtonsRowCollapsed, setTopButtonsRowCollapsed] = useState(false);
  const [isToolbarEditMode, setIsToolbarEditMode] = useState(false);
  const [toolbarRow1Order, setToolbarRow1Order] = useState(TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS);
  const [toolbarRow2Order, setToolbarRow2Order] = useState(TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS);
  const [toolbarRow3Order, setToolbarRow3Order] = useState(TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS);
  const [toolbarBlockVisibility, setToolbarBlockVisibility] = useState(() => Object.fromEntries(TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => [blockId, true])));
  const [draggingToolbarBlockId, setDraggingToolbarBlockId] = useState(null);
  const [draggingToolbarRow2BlockId, setDraggingToolbarRow2BlockId] = useState(null);
  const [draggingToolbarRow3BlockId, setDraggingToolbarRow3BlockId] = useState(null);
  const [draggingTripColumnKey, setDraggingTripColumnKey] = useState('');
  const [layoutMode, setLayoutMode] = useState(() => getInitialTripDashboardLayoutMode());
  const [panelView, setPanelView] = useState(TRIP_DASHBOARD_PANEL_VIEWS.both);
  const [panelOrder, setPanelOrder] = useState(TRIP_DASHBOARD_PANEL_ORDERS.driversFirst);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [tripOrderMode, setTripOrderMode] = useState('original');
  const [routePrintColumns, setRoutePrintColumns] = useState(DEFAULT_ROUTE_PRINT_COLUMNS);
  const [tripSort, setTripSort] = useState({
    key: 'pickup',
    direction: 'asc'
  });
  const [columnWidths, setColumnWidths] = useState({});
  const [statusMessage, setStatusMessage] = useState('Trip dashboard ready in focus-right layout with dock panels open.');
  const [closedRouteStateByKey, setClosedRouteStateByKey] = useState({});
  const [columnSplit, setColumnSplit] = useState(() => getInitialTripDashboardLayoutMode() === TRIP_DASHBOARD_LAYOUTS.focusRight ? TRIP_DASHBOARD_DEFAULT_FOCUS_RIGHT_SPLIT : TRIP_DASHBOARD_DEFAULT_STANDARD_SPLIT);
  const [rowSplit, setRowSplit] = useState(TRIP_DASHBOARD_DEFAULT_ROW_SPLIT);
  const [dragMode, setDragMode] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [importPendingTrips, setImportPendingTrips] = useState([]);
  const [importedServiceDateKeys, setImportedServiceDateKeys] = useState([]);
  const [selectedImportFileName, setSelectedImportFileName] = useState('');
  const [importScan, setImportScan] = useState(null);
  const [importRoutingChanges, setImportRoutingChanges] = useState([]);
  const [showImportRoutingChangeModal, setShowImportRoutingChangeModal] = useState(false);
  const [pendingImportAction, setPendingImportAction] = useState('');
  const [isImportParsing, setIsImportParsing] = useState(false);
  const [localImportPath, setLocalImportPath] = useState('');
  const [isRouteImporting, setIsRouteImporting] = useState(false);
  const [pendingRouteImportPlan, setPendingRouteImportPlan] = useState(null);
  const [routeImportAssignments, setRouteImportAssignments] = useState({});
  const [cancelTripIds, setCancelTripIds] = useState([]);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');
  const [noteModalTripId, setNoteModalTripId] = useState(null);
  const [tripExcelCompareModalId, setTripExcelCompareModalId] = useState(null);
  const [tripExcelCompareModalFallbackTrip, setTripExcelCompareModalFallbackTrip] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tripEditDraft, setTripEditDraft] = useState(buildTripEditDraft(null));
  const [confirmationMethodModal, setConfirmationMethodModal] = useState(null);
  const [confirmationMethod, setConfirmationMethod] = useState('whatsapp');
  const [confirmationSourceTrip, setConfirmationSourceTrip] = useState(null);
  const [confirmationLegScope, setConfirmationLegScope] = useState('single');
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false);
  const [tripUpdateModal, setTripUpdateModal] = useState(null);
  const [tripUpdateLegScope, setTripUpdateLegScope] = useState('single');
  const [tripUpdateConfirmMethod, setTripUpdateConfirmMethod] = useState('call');
  const [tripUpdatePickupTime, setTripUpdatePickupTime] = useState('');
  const [tripUpdateDropoffTime, setTripUpdateDropoffTime] = useState('');
  const [tripUpdatePickupAddress, setTripUpdatePickupAddress] = useState('');
  const [tripUpdateDropoffAddress, setTripUpdateDropoffAddress] = useState('');
  const [tripUpdateNote, setTripUpdateNote] = useState('');
  const [showLiveTripScanPanel, setShowLiveTripScanPanel] = useState(true);
  const [cancelNoteModal, setCancelNoteModal] = useState(null);
  const [cancelNoteDraft, setCancelNoteDraft] = useState('');
  const [cancelLegScope, setCancelLegScope] = useState('single');
  const [inlineTripEditCell, setInlineTripEditCell] = useState(null);
  const [inlineTripEditValue, setInlineTripEditValue] = useState('');
  const [aiPlannerMode, setAiPlannerMode] = useState('local');
  const [aiPlannerAnchorTripId, setAiPlannerAnchorTripId] = useState('');
  const [aiPlannerStartZip, setAiPlannerStartZip] = useState('');
  const importFileInputRef = useRef(null);

  const [aiPlannerCutoffTime, setAiPlannerCutoffTime] = useState('');
  const [aiPlannerCityFilter, setAiPlannerCityFilter] = useState('');
  const adminDriversById = useMemo(() => new Map((Array.isArray(adminData?.drivers) ? adminData.drivers : []).map(driver => [String(driver?.id || '').trim(), driver])), [adminData?.drivers]);
  const adminVehiclesById = useMemo(() => new Map((Array.isArray(adminData?.vehicles) ? adminData.vehicles : []).map(vehicle => [String(vehicle?.id || '').trim(), vehicle])), [adminData?.vehicles]);
  const adminGroupingsById = useMemo(() => new Map((Array.isArray(adminData?.groupings) ? adminData.groupings : []).map(grouping => [String(grouping?.id || '').trim(), grouping])), [adminData?.groupings]);

  const getAdminDriverVehicles = adminDriver => {
    if (!adminDriver) return [];

    const directVehicleId = String(adminDriver?.vehicleId || '').trim();
    const directVehicle = directVehicleId ? adminVehiclesById.get(directVehicleId) || null : null;
    if (directVehicle) return [directVehicle];

    const groupingId = String(adminDriver?.groupingId || '').trim();
    const grouping = groupingId ? adminGroupingsById.get(groupingId) || null : null;
    const assignedVehicleIds = Array.isArray(grouping?.assignedVehicleIds) ? grouping.assignedVehicleIds.map(id => String(id || '').trim()).filter(Boolean) : [];
    return assignedVehicleIds.map(vehicleId => adminVehiclesById.get(vehicleId) || null).filter(Boolean);
  };

  const buildResolvedVehicleMeta = (adminDriver, fallbackVehicleLabel = '') => {
    const vehicles = getAdminDriverVehicles(adminDriver);
    const capabilityTokens = Array.from(new Set(vehicles.flatMap(vehicle => getVehicleCapabilityTokens(vehicle)).filter(Boolean)));
    const vehicleLabels = vehicles.map(vehicle => String(vehicle?.label || vehicle?.unitNumber || vehicle?.id || '').trim()).filter(Boolean);

    return {
      vehicles,
      vehicleLabels,
      vehicleLabel: vehicleLabels.join(', ') || String(fallbackVehicleLabel || '').trim(),
      capabilityTokens
    };
  };

  const getTripVehicleMeta = trip => {
    const assignedDriver = drivers.find(driver => String(driver?.id || '').trim() === String(trip?.driverId || '').trim()) || null;
    const adminDriver = adminDriversById.get(String(trip?.driverId || '').trim()) || null;
    const resolvedVehicleMeta = buildResolvedVehicleMeta(adminDriver, assignedDriver?.vehicle || '');

    return {
      requestedVehicle: String(trip?.vehicleType || '').trim(),
      actualVehicleLabel: resolvedVehicleMeta.vehicleLabel,
      actualDriverName: String(assignedDriver?.name || getDriverName(trip?.driverId) || '').trim(),
      capabilityTokens: resolvedVehicleMeta.capabilityTokens
    };
  };
  const getDriverVehicleMeta = driver => {
    const adminDriver = adminDriversById.get(String(driver?.id || '').trim()) || null;
    return buildResolvedVehicleMeta(adminDriver, driver?.vehicle || '');
  };
  const [aiPlannerRoutePairPickupCity, setAiPlannerRoutePairPickupCity] = useState('');
  const [aiPlannerRoutePairDropoffCity, setAiPlannerRoutePairDropoffCity] = useState('');
  const [aiPlannerRoutePairMode, setAiPlannerRoutePairMode] = useState('exact');
  const [aiPlannerRoutePairs, setAiPlannerRoutePairs] = useState([]);
  const [aiPlannerLegFilter, setAiPlannerLegFilter] = useState('all');
  const [aiPlannerTypeFilter, setAiPlannerTypeFilter] = useState('all');
  const [aiPlannerMaxTrips, setAiPlannerMaxTrips] = useState('12');
  const [aiPlannerLateToleranceMinutes, setAiPlannerLateToleranceMinutes] = useState('15');
  const [aiPlannerPreview, setAiPlannerPreview] = useState(null);
  const [aiPlannerLoading, setAiPlannerLoading] = useState(false);
  const [aiPlannerCollapsed, setAiPlannerCollapsed] = useState(true);

  const handleTripImportFileChange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportParsing(true);
    setSelectedImportFileName(file.name);
    setLocalImportPath('');

    try {
      const parsedImport = await parseTripImportFile(file);
      setImportPendingTrips(parsedImport.trips);
      setImportedServiceDateKeys(parsedImport.serviceDateKeys);
      setImportScan(parsedImport.scan || null);
      const routingChanges = previewImportedTripRoutingChanges(parsedImport.trips);
      setImportRoutingChanges(routingChanges);
      if (parsedImport.trips.length === 0) {
        setStatusMessage('The selected file does not contain trips to import.');
        showNotification({ message: 'The selected file does not contain trips to import.', variant: 'warning' });
        return;
      }
      const routingChangeCount = routingChanges.length;
      const scanSuffix = parsedImport.scan?.findingCount ? ` Scanner found ${parsedImport.scan.blockingCount} blocking issue(s) and ${parsedImport.scan.warningCount} warning(s).` : '';
      const routingSuffix = routingChangeCount > 0 ? ` ${routingChangeCount} trip(s) have a new address change waiting for review.` : '';
      setStatusMessage(`${parsedImport.trips.length} trip(s) ready to import from ${file.name}.${scanSuffix}${routingSuffix}`);
    } catch (error) {
      setImportPendingTrips([]);
      setImportedServiceDateKeys([]);
      setImportScan(null);
      setImportRoutingChanges([]);
      const message = error?.message || `Could not read ${file.name}. Use a valid .xlsx, .xls, or .csv import file.`;
      setStatusMessage(message);
      showNotification({ message, variant: 'danger' });
    } finally {
      setIsImportParsing(false);
      event.target.value = '';
    }
  };

  const handleOpenTripImportPicker = () => {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleTripImportPathLoad = async () => {
    const trimmedPath = String(localImportPath || '').trim();
    if (!trimmedPath) {
      setStatusMessage('Paste the local CSV or Excel path first.');
      return;
    }

    setIsImportParsing(true);
    setSelectedImportFileName(trimmedPath.split(/[/\\]/).pop() || trimmedPath);

    try {
      const response = await fetch('/api/nemt/dispatch/import-local-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: trimmedPath })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not read the local file path.');
      }

      setImportPendingTrips(Array.isArray(payload?.trips) ? payload.trips : []);
      setImportedServiceDateKeys(Array.isArray(payload?.serviceDateKeys) ? payload.serviceDateKeys : []);
      setImportScan(payload?.scan || null);
      const routingChanges = previewImportedTripRoutingChanges(payload.trips);
      setImportRoutingChanges(routingChanges);

      if (!Array.isArray(payload?.trips) || payload.trips.length === 0) {
        const message = 'The selected local file does not contain trips to import.';
        setStatusMessage(message);
        showNotification({ message, variant: 'warning' });
        return;
      }

      const routingChangeCount = routingChanges.length;
      const scanSuffix = payload?.scan?.findingCount ? ` Scanner found ${payload.scan.blockingCount} blocking issue(s) and ${payload.scan.warningCount} warning(s).` : '';
      const routingSuffix = routingChangeCount > 0 ? ` ${routingChangeCount} trip(s) have a new address change waiting for review.` : '';
      setStatusMessage(`${payload.trips.length} trip(s) ready to import from ${trimmedPath}.${scanSuffix}${routingSuffix}`);
    } catch (error) {
      setImportPendingTrips([]);
      setImportedServiceDateKeys([]);
      setImportScan(null);
      setImportRoutingChanges([]);
      const message = error?.message || 'Could not read the local file path.';
      setStatusMessage(message);
      showNotification({ message, variant: 'danger' });
    } finally {
      setIsImportParsing(false);
    }
  };

  const handleImportTripsIntoDashboard = () => {
    if (importPendingTrips.length === 0) {
      setStatusMessage('Select a valid Excel or CSV file first.');
      return;
    }

    const routingChanges = previewImportedTripRoutingChanges(importPendingTrips);
    let applyRoutingChanges = true;
    if (routingChanges.length > 0) {
      const previewLines = routingChanges.slice(0, 5).map(change => `${change.rider || change.rideId || change.brokerTripId || change.id}: ${change.currentAddress || '-'} -> ${change.importedAddress || '-'} | ${change.currentDestination || '-'} -> ${change.importedDestination || '-'}`).join('\n');
      applyRoutingChanges = window.confirm(`The new import changed the route on ${routingChanges.length} trip(s).\n\nPress OK to apply the new address(es).\nPress Cancel to keep the current system address(es) and import everything else.\n\n${previewLines}${routingChanges.length > 5 ? '\n...' : ''}`);
    }

    upsertImportedTrips(importPendingTrips, {
      applyRoutingChanges
    });
    setShowTripImportModal(false);
    const importMessage = routingChanges.length > 0
      ? applyRoutingChanges
        ? `${importPendingTrips.length} trip(s) imported into Trip Dashboard. ${routingChanges.length} route change(s) were applied.`
        : `${importPendingTrips.length} trip(s) imported into Trip Dashboard. ${routingChanges.length} route change(s) were kept as warning only and current addresses stayed in place. Use the Address Review filter to see them later.`
      : `${importPendingTrips.length} trip(s) imported into Trip Dashboard.`;
    setStatusMessage(importMessage);
    showNotification({ message: importMessage, variant: routingChanges.length > 0 && !applyRoutingChanges ? 'warning' : 'success' });
    setImportPendingTrips([]);
    setImportedServiceDateKeys([]);
    setSelectedImportFileName('');
    setImportScan(null);
    setRouteImportAssignments({});
  };

  const importedRouteDriverSummary = useMemo(() => getImportedRouteDriverGroups(importPendingTrips), [importPendingTrips]);

  useEffect(() => {
    if (importedRouteDriverSummary.usableGroups.length === 0) {
      setRouteImportAssignments({});
      return;
    }

    setRouteImportAssignments(previousAssignments => {
      const nextAssignments = {};
      importedRouteDriverSummary.usableGroups.forEach(group => {
        const previousValue = previousAssignments[group.key];
        if (previousValue) {
          nextAssignments[group.key] = previousValue;
          return;
        }
        const exactMatch = findImportedDriverExactMatch(group.label, drivers);
        nextAssignments[group.key] = exactMatch?.id || '';
      });
      return nextAssignments;
    });
  }, [drivers, importedRouteDriverSummary.usableGroups]);

  const buildRouteImportPlan = (pendingTrips, availableDrivers, assignments = {}) => {
    const driverByLookup = new Map((Array.isArray(availableDrivers) ? availableDrivers : []).map(driver => {
      const normalizedName = normalizeImportedDriverLookup(driver?.name);
      return normalizedName ? [normalizedName, driver] : null;
    }).filter(Boolean));
    const driverById = new Map((Array.isArray(availableDrivers) ? availableDrivers : []).map(driver => [String(driver?.id || '').trim(), driver]));

    const missingDriverNames = [];
    const missingDriverSet = new Set();
    const routePlanMap = new Map();
    let matchedTripCount = 0;
    let skippedTripCount = 0;

    (Array.isArray(pendingTrips) ? pendingTrips : []).forEach(trip => {
      const importedDriverName = String(trip?.importedDriverName || '').trim();
      if (String(trip?.status || '').trim().toLowerCase() === 'cancelled') {
        skippedTripCount += 1;
        return;
      }

      const importedDriverKey = normalizeImportedDriverLookup(importedDriverName);
      const selectedAssignment = String(assignments?.[importedDriverKey] || '').trim();
      const matchedDriver = importedDriverKey && !selectedAssignment.startsWith(ROUTE_IMPORT_ADD_PREFIX)
        ? null
        : driverById.get(selectedAssignment) || driverByLookup.get(importedDriverKey);
      const hasUsableImportedDriver = isImportedDriverUsable(importedDriverName);
      if (!matchedDriver) {
        if (hasUsableImportedDriver && !missingDriverSet.has(importedDriverName)) {
          missingDriverSet.add(importedDriverName);
          missingDriverNames.push(importedDriverName);
        }
      }

      const serviceDateKey = String(trip?.serviceDate || '').trim() || getLocalDateKey();
      const routeKey = matchedDriver
        ? `${serviceDateKey}::${matchedDriver.id}`
        : `${serviceDateKey}::unassigned::${importedDriverKey || 'no-driver'}`;
      const currentSpec = routePlanMap.get(routeKey) || {
        name: matchedDriver
          ? `${matchedDriver.name} Route`
          : hasUsableImportedDriver
            ? `${importedDriverName} Route (Unassigned)`
            : 'Imported Route (Unassigned)',
        driverId: matchedDriver?.id || '',
        tripIds: [],
        notes: matchedDriver
          ? `Loaded from Excel by driver name (${matchedDriver.name})`
          : hasUsableImportedDriver
            ? `Loaded from Excel without driver match (${importedDriverName})`
            : 'Loaded from Excel without a usable driver name',
        serviceDate: serviceDateKey
      };
      currentSpec.tripIds.push(String(trip?.id || '').trim());
      routePlanMap.set(routeKey, currentSpec);
      matchedTripCount += 1;
    });

    return {
      missingDriverNames,
      routeSpecs: Array.from(routePlanMap.values()).filter(spec => spec.tripIds.length > 0),
      matchedTripCount,
      skippedTripCount
    };
  };

  const buildImportedAdminDriver = driverName => {
    const baseDriver = createBlankDriver();
    const { firstName, lastName } = splitImportedDriverName(driverName);
    const nextDriver = {
      ...baseDriver,
      firstName,
      lastName,
      displayName: String(driverName || '').trim(),
      username: normalizeImportedDriverLookup(driverName).replace(/\s+/g, '.'),
      notes: 'Created from Trip Dashboard Load Route',
      checkpoint: 'Imported from route loader',
      routeRoster: {
        ...baseDriver.routeRoster,
        mode: 'permanent'
      }
    };
    return {
      ...nextDriver,
      id: buildStableDriverId(nextDriver)
    };
  };

  const handleLoadRoutesIntoDashboard = async () => {
    if (importPendingTrips.length === 0) {
      setStatusMessage('Select a valid Excel or CSV file first.');
      return;
    }

    setIsRouteImporting(true);

    try {
      let availableDrivers = [...drivers];
      const effectiveAssignments = { ...routeImportAssignments };
      const namesMarkedToAdd = importedRouteDriverSummary.usableGroups
        .filter(group => String(effectiveAssignments[group.key] || '').startsWith(ROUTE_IMPORT_ADD_PREFIX))
        .map(group => group.label);

      if (namesMarkedToAdd.length > 0) {
        if (!adminData || !Array.isArray(adminData?.drivers)) {
          throw new Error('Admin driver data is not ready yet. Try again in a moment.');
        }

        const existingAdminDrivers = Array.isArray(adminData?.drivers) ? adminData.drivers : [];
        const existingLookup = new Set(existingAdminDrivers.map(driver => normalizeImportedDriverLookup(driver?.displayName || `${driver?.firstName || ''} ${driver?.lastName || ''}`)));
        const driversToAdd = namesMarkedToAdd
          .filter(driverName => !existingLookup.has(normalizeImportedDriverLookup(driverName)))
          .map(buildImportedAdminDriver);

        if (driversToAdd.length > 0) {
          const nextAdminState = {
            ...adminData,
            drivers: [...existingAdminDrivers, ...driversToAdd]
          };
          await saveAdminData(nextAdminState);
          await Promise.allSettled([refreshAdminData(), refreshDrivers()]);
          availableDrivers = [...availableDrivers, ...driversToAdd.map(driver => ({
            id: driver.id,
            name: `${driver.firstName} ${driver.lastName}`.trim()
          }))];
        }

        namesMarkedToAdd.forEach(driverName => {
          const importedKey = normalizeImportedDriverLookup(driverName);
          const matchedDriver = findImportedDriverExactMatch(driverName, availableDrivers);
          if (matchedDriver?.id) {
            effectiveAssignments[importedKey] = matchedDriver.id;
          }
        });
        setRouteImportAssignments(effectiveAssignments);
      }

      const routePlan = buildRouteImportPlan(importPendingTrips, availableDrivers, effectiveAssignments);

      const routingChanges = previewImportedTripRoutingChanges(importPendingTrips);
      let applyRoutingChanges = true;
      if (routingChanges.length > 0) {
        const previewLines = routingChanges.slice(0, 5).map(change => `${change.rider || change.rideId || change.brokerTripId || change.id}: ${change.currentAddress || '-'} -> ${change.importedAddress || '-'} | ${change.currentDestination || '-'} -> ${change.importedDestination || '-'}`).join('\n');
        applyRoutingChanges = window.confirm(`The new import changed the route on ${routingChanges.length} trip(s).\n\nPress OK to apply the new address(es).\nPress Cancel to keep the current system address(es) and import everything else.\n\n${previewLines}${routingChanges.length > 5 ? '\n...' : ''}`);
      }

      upsertImportedTrips(importPendingTrips, {
        applyRoutingChanges
      });

      if (routePlan.routeSpecs.length > 0) {
        setPendingRouteImportPlan(routePlan.routeSpecs);
        if (routePlan.missingDriverNames.length > 0) {
          const message = `${routePlan.matchedTripCount} trip(s) imported. Some routes were left unassigned because these driver names did not match: ${routePlan.missingDriverNames.join(', ')}`;
          setStatusMessage(message);
          showNotification({ message, variant: 'warning' });
        }
      } else {
        const message = routePlan.missingDriverNames.length > 0
          ? `Trips were imported, but these route names still need a driver match: ${routePlan.missingDriverNames.join(', ')}`
          : 'Trips were imported, but the file did not contain usable driver names for route loading.';
        setStatusMessage(message);
        showNotification({ message, variant: 'warning' });
      }

      setShowTripImportModal(false);
      setImportPendingTrips([]);
      setImportedServiceDateKeys([]);
      setSelectedImportFileName('');
      setRouteImportAssignments({});
    } catch (error) {
      const message = error?.message || 'Could not load routes from the selected file.';
      setStatusMessage(message);
      showNotification({ message, variant: 'danger' });
    } finally {
      setIsRouteImporting(false);
    }
  };

  useEffect(() => {
    if (!pendingRouteImportPlan || pendingRouteImportPlan.length === 0) return;

    const currentTripIdSet = new Set(trips.map(trip => String(trip?.id || '').trim()).filter(Boolean));
    const routesReady = pendingRouteImportPlan.every(routeSpec => routeSpec.tripIds.every(tripId => currentTripIdSet.has(String(tripId || '').trim())));
    if (!routesReady) return;

    const nextRouteSpecs = pendingRouteImportPlan;
    setPendingRouteImportPlan(null);
    nextRouteSpecs.forEach(routeSpec => {
      createRoute(routeSpec);
    });

    const tripCount = nextRouteSpecs.reduce((total, routeSpec) => total + routeSpec.tripIds.length, 0);
    const unassignedRouteCount = nextRouteSpecs.filter(routeSpec => !String(routeSpec?.driverId || '').trim()).length;
    const successMessage = unassignedRouteCount > 0
      ? `${tripCount} trip(s) imported and ${nextRouteSpecs.length} route(s) loaded. ${unassignedRouteCount} route(s) remain unassigned.`
      : `${tripCount} trip(s) imported and ${nextRouteSpecs.length} route(s) loaded by driver name.`;
    setStatusMessage(successMessage);
    showNotification({ message: successMessage, variant: 'success' });
  }, [createRoute, pendingRouteImportPlan, showNotification, trips]);

  const [showDriversPanel, setShowDriversPanel] = useState(true);
  const [showRoutesPanel, setShowRoutesPanel] = useState(true);
  const [showTripsPanel, setShowTripsPanel] = useState(true);
  const [timeDisplayMode, setTimeDisplayMode] = useState(TRIP_TIME_DISPLAY_MODES.standard);
  const [driversWindowOpen, setDriversWindowOpen] = useState(false);
  const [routesWindowOpen, setRoutesWindowOpen] = useState(false);
  const [tripsWindowOpen, setTripsWindowOpen] = useState(false);
  const workspaceRef = useRef(null);
  const tripTableTopScrollerRef = useRef(null);
  const tripTableBottomScrollerRef = useRef(null);
  const tripTableElementRef = useRef(null);
  const tripTableScrollSyncRef = useRef(false);
  const lastMapScreenStatePayloadRef = useRef('');
  const layoutHydratedRef = useRef(false);
  const panelViewHydratedRef = useRef(false);
  const panelOrderHydratedRef = useRef(false);
  const detailedDashboardHydratedRef = useRef(false);
  const lastSavedToolbarVisibilityRef = useRef('');
  const lastSavedDetailedDashboardRef = useRef('');
  const detailedDashboardSaveTimeoutRef = useRef(null);
  const [tripTableScrollWidth, setTripTableScrollWidth] = useState(0);
  const deferredRouteSearch = useDeferredValue(routeSearch);
  const deferredTripIdSearch = useDeferredValue(tripIdSearch);
  const optOutList = useMemo(() => Array.isArray(smsData?.sms?.optOutList) ? smsData.sms.optOutList : [], [smsData?.sms?.optOutList]);
  const riderProfiles = useMemo(() => smsData?.sms?.riderProfiles || {}, [smsData?.sms?.riderProfiles]);
  const blacklistEntries = useMemo(() => Array.isArray(blacklistData?.entries) ? blacklistData.entries : [], [blacklistData?.entries]);
  const activeBlacklistEntries = useMemo(() => blacklistEntries.filter(entry => String(entry?.status || 'Active').trim() === 'Active'), [blacklistEntries]);
  const filteredBlacklistEntries = useMemo(() => {
    const normalizedSearch = blacklistSearch.trim().toLowerCase();
    return blacklistEntries.filter(entry => {
      if (!normalizedSearch) return true;
      const haystack = [entry?.name, entry?.phone, entry?.category, entry?.notes, entry?.source].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [blacklistEntries, blacklistSearch]);
  const tripBlockingMap = useMemo(() => new Map(trips.map(trip => [trip.id, getTripBlockingState({
    trip,
    optOutList,
    blacklistEntries,
    defaultCountryCode: smsData?.sms?.defaultCountryCode,
    tripDateKey: getTripTimelineDateKey(trip, routePlans, trips)
  })])), [blacklistEntries, optOutList, routePlans, smsData?.sms?.defaultCountryCode, trips]);

  const handleCloseBlacklistModal = () => {
    setShowBlacklistModal(false);
    setBlacklistDraft(createEmptyBlacklistEntryDraft());
    setBlacklistDraftTrip(null);
  };

  const handleOpenBlacklistModal = trip => {
    if (trip) {
      setBlacklistDraftTrip(trip);
      setBlacklistDraft({
        name: String(trip?.rider || '').trim(),
        phone: String(trip?.patientPhoneNumber || '').trim(),
        category: 'Do Not Schedule',
        holdUntil: '',
        notes: `Trip: ${trip?.id || ''}`.trim()
      });
      setStatusMessage(`Black List ready for ${trip?.rider || 'selected rider'}.`);
    } else {
      setBlacklistDraftTrip(null);
      setBlacklistDraft(createEmptyBlacklistEntryDraft());
    }
    setShowBlacklistModal(true);
  };

  const handleAddBlacklistEntry = async () => {
    if (!blacklistDraft.name.trim() && !blacklistDraft.phone.trim()) {
      setStatusMessage('Write a name or phone before adding to Black List.');
      return;
    }

    const addedFromTrip = Boolean(blacklistDraftTrip);

    const nextEntry = {
      id: `blacklist-${Date.now()}`,
      name: blacklistDraft.name.trim(),
      phone: blacklistDraft.phone.trim(),
      category: blacklistDraft.category,
      status: 'Active',
      holdUntil: blacklistDraft.holdUntil,
      notes: blacklistDraft.notes.trim(),
      source: addedFromTrip ? 'Trip Dashboard Black List' : 'Trip Dashboard',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await saveBlacklistData({
        version: blacklistData?.version ?? 1,
        entries: [nextEntry, ...blacklistEntries]
      });
      setBlacklistDraft(createEmptyBlacklistEntryDraft());
      setBlacklistDraftTrip(null);
      if (addedFromTrip) setShowBlacklistModal(false);
      setStatusMessage('Black List entry added from Trip Dashboard.');
    } catch {
      setStatusMessage('Unable to save the new Black List entry.');
    }
  };

  const handleToggleBlacklistEntry = async entryId => {
    try {
      await saveBlacklistData({
        version: blacklistData?.version ?? 1,
        entries: blacklistEntries.map(entry => entry.id === entryId ? {
          ...entry,
          status: String(entry?.status || 'Active').trim() === 'Active' ? 'Resolved' : 'Active',
          updatedAt: new Date().toISOString()
        } : entry)
      });
      setStatusMessage('Black List entry updated.');
    } catch {
      setStatusMessage('Unable to update the Black List entry.');
    }
  };

  const handleDeleteBlacklistEntry = async entryId => {
    try {
      await saveBlacklistData({
        version: blacklistData?.version ?? 1,
        entries: blacklistEntries.filter(entry => entry.id !== entryId)
      });
      setStatusMessage('Black List entry removed.');
    } catch {
      setStatusMessage('Unable to remove the Black List entry.');
    }
  };

  const toggleTripSelection = tripId => {
    const normalizedTripId = normalizeTripId(tripId);
    if (!normalizedTripId) return;
    setSelectedTripIds(currentTripIds => {
      const currentIds = currentTripIds.map(normalizeTripId).filter(Boolean);
      return currentIds.includes(normalizedTripId) ? currentIds.filter(id => id !== normalizedTripId) : [...currentIds, normalizedTripId];
    });
  };

  const removeTripIdsFromSelection = tripIds => {
    const targetTripIdSet = new Set((Array.isArray(tripIds) ? tripIds : []).map(normalizeTripId).filter(Boolean));
    if (targetTripIdSet.size === 0) return;
    setSelectedTripIds(currentTripIds => currentTripIds.map(normalizeTripId).filter(id => id && !targetTripIdSet.has(id)));
  };

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
    if (tripDateFilter === 'all') return false;
    return getRouteServiceDateKey(routePlan, trips) === tripDateFilter;
  }), [routePlans, tripDateFilter, trips]);
  const selectedRoute = useMemo(() => filteredRoutePlans.find(routePlan => routePlan.id === selectedRouteId) ?? null, [filteredRoutePlans, selectedRouteId]);
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);
  const isDarkTheme = themeMode === 'dark';
  const mapQuickFilterControlStyle = themeMode === 'dark'
    ? {
      width: 150,
      backgroundColor: '#0f172a',
      color: '#e5e7eb',
      borderColor: '#334155'
    }
    : {
      width: 150,
      backgroundColor: '#ffffff',
      color: '#08131a',
      borderColor: '#0f172a'
    };
  const mapQuickZipControlStyle = {
    ...mapQuickFilterControlStyle,
    width: 130
  };
  const compactToolbarOutlineVariant = isDarkTheme ? 'outline-light' : 'outline-dark';
  const compactToolbarActiveVariant = isDarkTheme ? 'success' : 'dark';
  const compactToolbarLabelStyle = isDarkTheme ? { color: '#cbd5e1' } : undefined;
  const compactToolbarSelectBaseStyle = isDarkTheme
    ? {
      backgroundColor: '#0f172a',
      color: '#e5e7eb',
      borderColor: '#334155',
      colorScheme: 'dark'
    }
    : {
      backgroundColor: '#ffffff',
      color: '#08131a',
      borderColor: 'rgba(8, 19, 26, 0.35)',
      colorScheme: 'light'
    };
  const compactToolbarDestinationSelectStyle = {
    ...compactToolbarSelectBaseStyle,
    width: 140
  };
  const toolbarButtonStyle = isDarkTheme ? darkToolbarButtonStyle : lightToolbarButtonStyle;
  const tripDashboardToolbarShellStyle = isDarkTheme ? {
    backgroundColor: '#14532d',
    color: '#f8fafc'
  } : {
    backgroundColor: '#198754',
    color: '#10212b'
  };
  const mutedThemeTextStyle = isDarkTheme ? { color: '#94a3b8' } : { color: '#64748b' };
  const aiPlannerCollapsedTriggerStyle = isDarkTheme ? {
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.28)',
    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    color: '#e2e8f0',
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: '0.06em',
    padding: '6px 12px',
    boxShadow: '0 6px 14px rgba(2, 6, 23, 0.28)'
  } : {
    borderRadius: 10,
    border: '1px solid rgba(15, 23, 42, 0.18)',
    background: 'linear-gradient(180deg, #eef2ff 0%, #dbeafe 100%)',
    color: '#1e293b',
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: '0.06em',
    padding: '6px 12px',
    boxShadow: '0 6px 14px rgba(15, 23, 42, 0.12)'
  };
  const aiPlannerPanelStyle = isDarkTheme ? {
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    color: '#e5e7eb'
  } : {
    borderColor: 'rgba(15, 23, 42, 0.12)',
    backgroundColor: '#f1f5f9',
    color: '#111827'
  };
  const aiPlannerInnerSectionStyle = isDarkTheme ? {
    borderColor: '#334155',
    backgroundColor: '#111827',
    color: '#e5e7eb'
  } : {
    borderColor: 'rgba(15, 23, 42, 0.1)',
    backgroundColor: '#ffffff',
    color: '#111827'
  };
  const tripTableHeaderStyle = isDarkTheme
    ? {
      backgroundColor: '#1f2937',
      color: '#f8fafc',
      borderBottom: '1px solid rgba(148, 163, 184, 0.28)'
    }
    : {
      backgroundColor: '#dcebdc',
      color: '#12202a',
      borderBottom: '1px solid rgba(15, 23, 42, 0.14)'
    };
  const offlineDriverBadgeStyle = isDarkTheme
    ? {
      backgroundColor: '#475569',
      color: '#f8fafc',
      border: '1px solid #64748b'
    }
    : undefined;
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const allTripColumnKeys = useMemo(() => DISPATCH_TRIP_COLUMN_OPTIONS.map(option => option.key), []);
  const tripColumnMeta = useMemo(() => Object.fromEntries(DISPATCH_TRIP_COLUMN_OPTIONS.map(option => [option.key, {
    label: option.label,
    width: option.key === 'address' || option.key === 'destination' ? 260 : option.key === 'phone' ? 150 : option.key === 'rider' ? 180 : undefined,
    sortable: option.key !== 'notes'
  }])), []);
  const orderedVisibleTripColumns = useMemo(() => {
    const normalizedVisibleColumns = visibleTripColumns.filter(columnKey => Boolean(tripColumnMeta[columnKey]));
    if (normalizedVisibleColumns.includes('notes')) return normalizedVisibleColumns;
    return ['notes', ...normalizedVisibleColumns];
  }, [tripColumnMeta, visibleTripColumns]);
  const isAllTripColumnsSelected = orderedVisibleTripColumns.length === allTripColumnKeys.length && allTripColumnKeys.every(columnKey => orderedVisibleTripColumns.includes(columnKey));
  const hasTripNotesColumn = orderedVisibleTripColumns.includes('notes');
  const orderedVisibleTripColumnsWithoutNotes = useMemo(() => orderedVisibleTripColumns.filter(columnKey => columnKey !== 'notes'), [orderedVisibleTripColumns]);
  const activeDateTripIdSet = useMemo(() => {
    if (tripDateFilter === 'all') return null;
    return new Set(trips.filter(trip => getTripTimelineDateKey(trip, routePlans, trips) === tripDateFilter).map(trip => String(trip?.id || '').trim()).filter(Boolean));
  }, [tripDateFilter, routePlans, trips]);

  const isTripAssignedToSelectedDriver = trip => isTripAssignedToDriver(trip, selectedDriverId);
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
  const getTripCompanionNote = trip => {
    const directCompanion = String(trip?.companion || trip?.companionNote || '').trim();
    if (directCompanion) return directCompanion;
    const profilePhoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    const profileRiderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    const profileKey = profilePhoneKey ? `phone:${profilePhoneKey}` : profileRiderKey ? `rider:${profileRiderKey}` : '';
    if (!profileKey) return '';
    return String(riderProfiles?.[profileKey]?.companion || '').trim();
  };
  const todayDateKey = useMemo(() => getLocalDateKey(new Date(), uiPreferences?.timeZone), [uiPreferences?.timeZone]);
  const activeRouteDateKey = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
  const operatorDisplayName = useMemo(() => {
    const sessionName = String(session?.user?.name || '').trim();
    const sessionUsername = String(session?.user?.username || '').trim();
    if (sessionName) return sessionName;
    if (sessionUsername) return sessionUsername;
    return 'Dispatcher';
  }, [session?.user?.name, session?.user?.username]);
  const activeClosedRouteKey = useMemo(() => getClosedRouteKey(selectedDriverId, tripDateFilter), [selectedDriverId, tripDateFilter]);
  const activeClosedRouteState = useMemo(() => activeClosedRouteKey ? closedRouteStateByKey[activeClosedRouteKey] ?? null : null, [activeClosedRouteKey, closedRouteStateByKey]);
  const isActiveRouteClosed = Boolean(activeClosedRouteState?.closed);
  const availableTripDateKeys = useMemo(() => Array.from(new Set(trips.map(getTripTimelineDateKey).filter(Boolean).concat(routePlans.map(routePlan => getRouteServiceDateKey(routePlan, trips)).filter(Boolean)))).sort(), [routePlans, trips]);
  const activeTripDateLabel = useMemo(() => formatTripDateLabel(tripDateFilter), [tripDateFilter]);
  const serverScopedDateKey = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
  const serverScopedPastDays = tripDateFilter === 'all' ? 1 : 0;
  const serverScopedFutureDays = tripDateFilter === 'all' ? 1 : 0;
  const refreshDispatchStateRef = useRef(refreshDispatchState);
  const lastServerScopeKeyRef = useRef('');

  useEffect(() => {
    refreshDispatchStateRef.current = refreshDispatchState;
  }, [refreshDispatchState]);

  useEffect(() => {
    if (!serverScopedDateKey) return;
    const scopeKey = [serverScopedDateKey, serverScopedPastDays, serverScopedFutureDays].join('|');
    if (lastServerScopeKeyRef.current === scopeKey) return;
    lastServerScopeKeyRef.current = scopeKey;
    void refreshDispatchStateRef.current({
      forceServer: true,
      dateKey: serverScopedDateKey,
      windowPastDays: serverScopedPastDays,
      windowFutureDays: serverScopedFutureDays
    });
  }, [serverScopedDateKey, serverScopedFutureDays, serverScopedPastDays]);

  const tripDashboardPreferenceState = useMemo(() => ({
    storageVersion: 1,
    layoutMode,
    panelView,
    panelOrder,
    showBottomPanels,
    showMapPane,
    showDriversPanel,
    showRoutesPanel,
    showTripsPanel,
    rightPanelCollapsed,
    showConfirmationTools,
    timeDisplayMode,
    tripOrderMode,
    printColumns: routePrintColumns,
    columnSplit: Math.round(columnSplit * 100) / 100,
    rowSplit: Math.round(rowSplit * 100) / 100,
    columnWidths,
    closedRouteStateByKey
  }), [closedRouteStateByKey, columnSplit, columnWidths, layoutMode, panelOrder, panelView, rightPanelCollapsed, routePrintColumns, rowSplit, showBottomPanels, showConfirmationTools, showDriversPanel, showMapPane, showRoutesPanel, showTripsPanel, timeDisplayMode, tripOrderMode]);

  useEffect(() => {
    if (!todayDateKey) return;
    setTripDateFilter(todayDateKey);
    setSelectedTripIds([]);
    setSelectedDriverId(null);
    setSelectedRouteId(null);
  }, [todayDateKey]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    try {
      setToolbarRow1Order(userPreferences?.tripDashboard?.row1?.length ? userPreferences.tripDashboard.row1 : TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS);
      setToolbarRow2Order(userPreferences?.tripDashboard?.row2?.length ? userPreferences.tripDashboard.row2.filter(blockId => TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS.includes(blockId)) : TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS);
      setToolbarRow3Order(userPreferences?.tripDashboard?.row3?.length ? userPreferences.tripDashboard.row3 : TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS);
    } catch {
      // Ignore corrupted toolbar layout preferences.
    }
  }, [userPreferences?.tripDashboard?.row1, userPreferences?.tripDashboard?.row2, userPreferences?.tripDashboard?.row3, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    try {
      const parsed = userPreferences?.tripDashboard?.toolbarVisibility && Object.keys(userPreferences.tripDashboard.toolbarVisibility).length > 0 ? userPreferences.tripDashboard.toolbarVisibility : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      const normalized = Object.fromEntries(TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => [blockId, parsed[blockId] !== false]));
      setToolbarBlockVisibility(normalized);
    } catch {
      // Ignore corrupted toolbar visibility preferences.
    }
  }, [userPreferences?.tripDashboard?.toolbarVisibility, userPreferencesLoading]);

  useEffect(() => {
    try {
      const serializedToolbarVisibility = JSON.stringify(toolbarBlockVisibility);
      if (lastSavedToolbarVisibilityRef.current === serializedToolbarVisibility) return;
      lastSavedToolbarVisibilityRef.current = serializedToolbarVisibility;
      if (!userPreferencesLoading) {
        void saveUserPreferences({
          ...userPreferences,
          tripDashboard: {
            ...userPreferences?.tripDashboard,
            toolbarVisibility: toolbarBlockVisibility
          }
        }).catch(() => {});
      }
    } catch {
      // Ignore localStorage write errors.
    }
  }, [saveUserPreferences, toolbarBlockVisibility, userPreferences, userPreferencesLoading]);

  const isToolbarBlockEnabled = blockId => toolbarBlockVisibility[blockId] !== false;
  const hasAnyVisibleToolbarBlock = TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.some(blockId => isToolbarBlockEnabled(blockId));
  const shouldShowPinnedToolbarRecovery = !isToolbarBlockEnabled('toolbar-edit') || !hasAnyVisibleToolbarBlock;

  const handleToggleToolbarBlockVisibility = (blockId, enabled) => {
    setToolbarBlockVisibility(current => ({
      ...current,
      [blockId]: enabled
    }));
  };

  const moveToolbarRow1Block = (fromBlockId, toBlockId) => {
    if (!fromBlockId || !toBlockId || fromBlockId === toBlockId) return;
    setToolbarRow1Order(currentOrder => {
      const fromIndex = currentOrder.indexOf(fromBlockId);
      const toIndex = currentOrder.indexOf(toBlockId);
      if (fromIndex === -1 || toIndex === -1) return currentOrder;
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, moved);
      return nextOrder;
    });
  };

  const moveToolbarRow2Block = (fromBlockId, toBlockId) => {
    if (!fromBlockId || !toBlockId || fromBlockId === toBlockId) return;
    setToolbarRow2Order(currentOrder => {
      const fromIndex = currentOrder.indexOf(fromBlockId);
      const toIndex = currentOrder.indexOf(toBlockId);
      if (fromIndex === -1 || toIndex === -1) return currentOrder;
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, moved);
      return nextOrder;
    });
  };

  const moveToolbarRow3Block = (fromBlockId, toBlockId) => {
    if (!fromBlockId || !toBlockId || fromBlockId === toBlockId) return;
    setToolbarRow3Order(currentOrder => {
      const fromIndex = currentOrder.indexOf(fromBlockId);
      const toIndex = currentOrder.indexOf(toBlockId);
      if (fromIndex === -1 || toIndex === -1) return currentOrder;
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, moved);
      return nextOrder;
    });
  };

  const getActiveDraggedToolbarBlockId = () => draggingToolbarBlockId || draggingToolbarRow2BlockId || draggingToolbarRow3BlockId || null;

  const clearDraggingToolbarBlockIds = () => {
    setDraggingToolbarBlockId(null);
    setDraggingToolbarRow2BlockId(null);
    setDraggingToolbarRow3BlockId(null);
  };

  const moveToolbarBlockAcrossRows = (fromBlockId, targetRow, targetBlockId = null) => {
    if (!fromBlockId || !targetRow) return;

    const nextRow1 = toolbarRow1Order.filter(currentId => currentId !== fromBlockId);
    const nextRow2 = toolbarRow2Order.filter(currentId => currentId !== fromBlockId);
    const nextRow3 = toolbarRow3Order.filter(currentId => currentId !== fromBlockId);

    const insertInto = row => {
      if (!targetBlockId) {
        row.push(fromBlockId);
        return;
      }
      const targetIndex = row.indexOf(targetBlockId);
      if (targetIndex === -1) {
        row.push(fromBlockId);
        return;
      }
      row.splice(targetIndex, 0, fromBlockId);
    };

    if (targetRow === 'row1') insertInto(nextRow1);
    if (targetRow === 'row2') insertInto(nextRow2);
    if (targetRow === 'row3') insertInto(nextRow3);

    setToolbarRow1Order(nextRow1);
    setToolbarRow2Order(nextRow2);
    setToolbarRow3Order(nextRow3);
  };

  const handleSaveToolbarLayout = () => {
    try {
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          row1: toolbarRow1Order,
          row2: toolbarRow2Order,
          row3: toolbarRow3Order
        }
      }).catch(() => {});
      setStatusMessage('Toolbar layout saved.');
    } catch {
      setStatusMessage('Could not save toolbar layout.');
    } finally {
      setIsToolbarEditMode(false);
      clearDraggingToolbarBlockIds();
    }
  };

  const handleResetToolbarLayout = () => {
    const defaultRow1Order = [...TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS];
    const defaultRow2Order = [...TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS];
    const defaultRow3Order = [...TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS];
    const defaultVisibility = Object.fromEntries(TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => [blockId, true]));
    setToolbarRow1Order(defaultRow1Order);
    setToolbarRow2Order(defaultRow2Order);
    setToolbarRow3Order(defaultRow3Order);
    setToolbarBlockVisibility(defaultVisibility);
    setShowToolbarTools(false);
    setIsToolbarEditMode(false);
    clearDraggingToolbarBlockIds();
    try {
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          row1: defaultRow1Order,
          row2: defaultRow2Order,
          row3: defaultRow3Order,
          toolbarVisibility: defaultVisibility
        }
      }).catch(() => {});
      setStatusMessage('Toolbar layout reset.');
    } catch {
      setStatusMessage('Could not reset toolbar layout.');
    }
  };

  const openDetachedMapScreen = () => {
    if (typeof window === 'undefined') return;

    const popup = window.open('/map-screen', 'care-mobility-map-screen', 'popup=yes,width=1440,height=920,resizable=yes,scrollbars=yes');

    if (popup) {
      popup.focus();
      setStatusMessage('Detached map screen opened. Move it to your other monitor.');
      return;
    }

    router.push('/map-screen');
    setStatusMessage('Popup blocked. Opened the map screen in this tab instead.');
  };

  const renderInlineDateControls = () => <div className="d-flex align-items-center gap-1 flex-nowrap" style={{ flexShrink: 0 }}>
      <Button variant="outline-dark" size="sm" style={toolbarButtonStyle} onClick={() => handleShiftTripDate(-1)} title="Previous day">←</Button>
      <Form.Control size="sm" type="date" value={tripDateFilter === 'all' ? '' : tripDateFilter} onChange={event => setTripDateFilter(event.target.value || 'all')} style={{ width: 150 }} />
      <Button variant="outline-dark" size="sm" style={toolbarButtonStyle} onClick={() => handleShiftTripDate(1)} title="Next day">→</Button>
    </div>;

  const renderColumnsButton = () => <Button
      variant={showColumnPicker ? 'dark' : 'outline-dark'}
      size="sm"
      style={{ ...toolbarButtonStyle, minWidth: 86, fontWeight: 600 }}
      onClick={() => {
        setShowColumnPicker(current => !current);
        setShowToolbarTools(false);
      }}
      title="Choose trip columns"
      aria-label="Choose trip columns"
    >
      Columns
    </Button>;

  const renderDispatchHistoryButton = () => <Button
      variant="outline-dark"
      size="sm"
      style={{ ...toolbarButtonStyle, minWidth: 36, width: 36, fontWeight: 800, paddingInline: 0 }}
      onClick={() => router.push('/dispatch-history')}
      title="Dispatch History"
      aria-label="Open Dispatch History"
    >
      H
    </Button>;

  const renderHelpButton = () => <Button
      variant="outline-dark"
      size="sm"
      style={{ ...toolbarButtonStyle, minWidth: 58, fontWeight: 700 }}
      onClick={() => {
        setStatusMessage('Opening Diarie workspace.');
        router.push('/help');
      }}
      title="Diarie"
      aria-label="Open Diarie"
    >
      Diarie
    </Button>;

  const renderScannerConfirmationPanelButtons = () => <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
      <Button variant={showConfirmationTools ? 'warning' : 'light'} size="sm" onClick={handleToggleConfirmationTools}>Confirmation</Button>
      {showConfirmationTools ? <Button variant="light" size="sm" onClick={() => {
      const selectedTripsForConfirmation = trips.filter(trip => selectedTripIdSet.has(normalizeTripId(trip.id)));
      handleOpenConfirmationMethod(selectedTripsForConfirmation);
    }}>
          Send Selected
        </Button> : null}
      {renderDispatchHistoryButton()}
      {renderHelpButton()}
    </div>;

  const renderRouteUtilityButtonsBlock = () => <div className="d-flex align-items-center gap-2 flex-nowrap">
      <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={{ ...toolbarButtonStyle, minWidth: 36, width: 36, paddingInline: 0, fontWeight: 800 }} onClick={handlePrintRoute} title="Print Route" aria-label="Print Route">P</Button>
      <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={{ ...toolbarButtonStyle, minWidth: 36, width: 36, paddingInline: 0, fontWeight: 800 }} onClick={handleShareRouteWhatsapp} title="WhatsApp" aria-label="WhatsApp">W</Button>
      <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => setSelectedDriverId(event.target.value || null)} style={{ ...compactToolbarSelectBaseStyle, width: 150 }}>
        <option value="">Reassign to driver</option>
        {drivers.map(driver => <option key={`route-reassign-toolbar-${driver.id}`} value={driver.id}>{driver.name}</option>)}
      </Form.Select>
      <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={handleRoutePanelReassign}>Reassign</Button>
    </div>;

  const renderTripSearchBlock = () => <Form.Control
      size="sm"
      value={tripIdSearch}
      onChange={event => setTripIdSearch(event.target.value)}
      placeholder="Search trip or rider"
      style={{ width: 190 }}
    />;

  const renderActionButtonsBlock = () => tripStatusFilter === 'cancelled' ? <Button variant="primary" size="sm" onClick={handleReinstateSelectedTrips}>I</Button> : <div className="d-flex align-items-center gap-1 flex-nowrap">
      <Button variant="success" size="sm" onClick={() => setShowManualTripModal(true)} title="Create manual trip">+Trip</Button>
      <Button variant="primary" size="sm" onClick={() => handleAssign(selectedDriverId)}>A</Button>
      <Button variant="warning" size="sm" onClick={() => handleAssignSecondary(selectedSecondaryDriverId)} title="Assign secondary driver">A2</Button>
      <Button variant="secondary" size="sm" onClick={handleUnassign}>U</Button>
      <Button variant="danger" size="sm" onClick={handleCancelSelectedTrips}>C</Button>
    </div>;

  const renderLegButtonsBlock = () => <div className="d-flex align-items-center gap-1 flex-nowrap">
      <span className="fw-semibold small" style={isDarkTheme ? compactToolbarLabelStyle : { color: '#10212b' }}>Leg</span>
      <Button variant={tripLegFilter === 'AL' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripLegFilter === 'AL' ? undefined : toolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'AL' ? 'all' : 'AL')} title="First leg to appointment">AL</Button>
      <Button variant={tripLegFilter === 'BL' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripLegFilter === 'BL' ? undefined : toolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'BL' ? 'all' : 'BL')} title="Return-leg trips">BL</Button>
      <Button variant={tripLegFilter === 'CL' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripLegFilter === 'CL' ? undefined : toolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'CL' ? 'all' : 'CL')} title="Third or connector leg">CL</Button>
    </div>;

  const renderTypeButtonsBlock = () => <div className="d-flex align-items-center gap-1 flex-nowrap">
      <span className="fw-semibold small" style={isDarkTheme ? compactToolbarLabelStyle : { color: '#10212b' }}>Type</span>
      <Button variant={tripTypeFilter === 'A' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripTypeFilter === 'A' ? undefined : toolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'A' ? 'all' : 'A')} title="Ambulatory">A</Button>
      <Button variant={tripTypeFilter === 'W' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripTypeFilter === 'W' ? undefined : toolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'W' ? 'all' : 'W')} title="Wheelchair">W</Button>
      <Button variant={tripTypeFilter === 'STR' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripTypeFilter === 'STR' ? undefined : toolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'STR' ? 'all' : 'STR')} title="Stretcher">STR</Button>
      <Button variant={serviceAnimalOnly ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={serviceAnimalOnly ? undefined : toolbarButtonStyle} onClick={() => setServiceAnimalOnly(current => !current)} title="Service Animal">SA</Button>
    </div>;

    const renderStatusFilterBlock = () => <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 150 }}>
      <option value="all">All</option>
      <option value="unassigned">Unassigned</option>
      <option value="assigned">Assigned</option>
      <option value="inprogress">In progress</option>
      <option value="completed">Completed</option>
      <option value="removedsinceload">Last Removed ({removedSinceLastLoadScopeCount})</option>
      <option value="addressreview">Address Review</option>
      <option value="willcall">WillCall</option>
      <option value="confirm">Confirmed</option>
      <option value="unconfirm">Unconfirmed</option>
      <option value="cancelled">Cancelled</option>
      <option value="block">Blocked</option>
    </Form.Select>;

  const renderShowMapBlock = () => <Button variant="warning" size="sm" onClick={() => {
      if (!showMapPane) {
        applyLayoutMode(TRIP_DASHBOARD_LAYOUTS.normal);
        return;
      }
      setShowMapPane(false);
      setStatusMessage('Map hidden in Trip Dashboard.');
    }} style={showMapPane ? undefined : {
      color: '#5b3b00',
      borderColor: 'rgba(161, 98, 7, 0.48)',
      background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)',
      fontWeight: 800
    }}>
      {showMapPane ? 'Hide Map' : 'Show Map'}
    </Button>;

  const renderToolbarEditBlock = () => <Button variant={isToolbarEditMode ? 'dark' : 'outline-dark'} size="sm" style={isToolbarEditMode ? undefined : toolbarButtonStyle} onClick={() => setIsToolbarEditMode(current => !current)}>
      {isToolbarEditMode ? 'Done' : 'Edit toolbar'}
    </Button>;

  const renderLayoutBlock = () => <Form.Select size="sm" value={layoutMode} onChange={event => applyLayoutMode(event.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 160 }}>
      <option value={TRIP_DASHBOARD_LAYOUTS.normal}>Layout: Normal</option>
      <option value={TRIP_DASHBOARD_LAYOUTS.focusRight}>Layout: Focus Right</option>
      <option value={TRIP_DASHBOARD_LAYOUTS.stacked}>Layout: Stacked</option>
    </Form.Select>;

  const renderPanelsBlock = () => <div className="d-flex align-items-center gap-1 flex-nowrap">
      <Button variant={showDriversPanel ? 'success' : compactToolbarOutlineVariant} size="sm" style={showDriversPanel ? undefined : toolbarButtonStyle} onClick={() => setShowDriversPanel(current => !current)}>Drivers</Button>
      <Button variant={showRoutesPanel ? 'success' : compactToolbarOutlineVariant} size="sm" style={showRoutesPanel ? undefined : toolbarButtonStyle} onClick={() => setShowRoutesPanel(current => !current)}>Routes</Button>
      <Button variant={showTripsPanel ? 'success' : compactToolbarOutlineVariant} size="sm" style={showTripsPanel ? undefined : toolbarButtonStyle} onClick={() => setShowTripsPanel(current => !current)}>Trips</Button>
    </div>;

  const renderTripOrderBlock = () => <Button variant={tripOrderMode === 'time' ? 'dark' : 'outline-dark'} size="sm" style={tripOrderMode === 'time' ? undefined : toolbarButtonStyle} onClick={handleTripOrderModeToggle}>
      {tripOrderMode === 'time' ? 'Order: Time' : 'Order: Original'}
    </Button>;

  const handleToggleTimeDisplayMode = () => {
    const nextMode = timeDisplayMode === TRIP_TIME_DISPLAY_MODES.military ? TRIP_TIME_DISPLAY_MODES.standard : TRIP_TIME_DISPLAY_MODES.military;
    setTimeDisplayMode(nextMode);
    setStatusMessage(nextMode === TRIP_TIME_DISPLAY_MODES.military ? '24-hour time enabled.' : '12-hour time enabled.');
  };

  const renderTimeDisplayToggleBlock = () => <Button
      variant={timeDisplayMode === TRIP_TIME_DISPLAY_MODES.military ? 'warning' : 'outline-dark'}
      size="sm"
      style={timeDisplayMode === TRIP_TIME_DISPLAY_MODES.military ? { minWidth: 40, fontWeight: 800 } : { ...toolbarButtonStyle, minWidth: 40, fontWeight: 800 }}
      onClick={handleToggleTimeDisplayMode}
      title="Toggle 24-hour time"
      aria-label="Toggle 24-hour time"
    >
      24
    </Button>;

  const renderSystemScannerEntryBlock = () => !showLiveTripScanPanel ? <div className="d-flex align-items-center gap-2 flex-nowrap">
      <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
      setShowLiveTripScanPanel(true);
      setStatusMessage('System Trip Scanner reopened.');
    }}>
        System Trip Scanner
      </Button>
    </div> : null;

  const renderClosedRouteBlock = () => <Button variant={isActiveRouteClosed ? 'danger' : compactToolbarOutlineVariant} size="sm" style={isActiveRouteClosed ? undefined : toolbarButtonStyle} onClick={handleToggleClosedRoute}>
      {isActiveRouteClosed ? 'Open Route' : 'Close Route'}
    </Button>;

  const renderRemainingTripsBlock = () => tripStatusFilter === 'unassigned' ? <Badge bg="danger" style={{ minWidth: 56, fontSize: '0.75rem' }} title="Visible unassigned trips remaining">
      {remainingVisibleTripCount} left
    </Badge> : null;

  const renderCompletedRoutesBlock = () => tripStatusFilter === 'unassigned' ? <Badge bg="success" style={{ minWidth: 62, fontSize: '0.75rem' }} title="Routes already built in the current scope">
      {completedRoutesCount} rutas
    </Badge> : null;

  const renderRemovedSinceLoadBlock = () => removedSinceLastLoadScopeCount > 0 ? <Badge bg={tripStatusFilter === 'removedsinceload' ? 'danger' : 'warning'} text={tripStatusFilter === 'removedsinceload' ? undefined : 'dark'} style={{ minWidth: 132, fontSize: '0.75rem' }} title={tripDateFilter === 'all' ? 'Trips removed across all visible dates' : `Trips removed on ${tripDateFilter}`}>
      {tripDateFilter === 'all' ? `Removed: ${removedSinceLastLoadScopeCount}` : `Last Removed: ${removedSinceLastLoadScopeCount}`}
    </Badge> : null;

  const renderSecondaryToolbarActionBlocks = () => <>
      {isToolbarEditMode || isToolbarBlockEnabled('action-buttons') ? renderActionButtonsBlock() : null}
      {isToolbarEditMode || isToolbarBlockEnabled('leg-buttons') ? renderLegButtonsBlock() : null}
      {isToolbarEditMode || isToolbarBlockEnabled('type-buttons') ? renderTypeButtonsBlock() : null}
      {isToolbarEditMode || isToolbarBlockEnabled('closed-route') ? renderClosedRouteBlock() : null}
      {renderTimeDisplayToggleBlock()}
      {renderSystemScannerEntryBlock()}
      {renderRemovedSinceLoadBlock()}
      {renderCompletedRoutesBlock()}
      {renderRemainingTripsBlock()}
    </>;

  const renderToolbarRow1Block = blockId => {
    switch (blockId) {
      case 'date-controls':
        return renderInlineDateControls();
      case 'status-filter':
        return renderStatusFilterBlock();
      case 'trip-search':
        return renderTripSearchBlock();
      case 'driver-assigned':
        return selectedDriver ? <div className="d-flex align-items-center gap-2 flex-nowrap">
            <Badge bg={themeMode === 'dark' ? 'secondary' : 'light'} text={themeMode === 'dark' ? 'light' : 'dark'}>{selectedDriverAssignedTripCount} assigned</Badge>
            {getDriverTimeOffDateForUi(selectedDriver) ? <Badge bg="secondary">{getDriverTimeOffLabelForUi(selectedDriver)}</Badge> : null}
          </div> : null;
      case 'action-buttons':
        return null;
      case 'leg-buttons':
        return null;
      case 'type-buttons':
        return null;
      case 'closed-route':
        return null;
      default:
        return null;
    }
  };

  const renderToolbarRow2Block = blockId => {
    switch (blockId) {
      case 'show-map':
        return renderShowMapBlock();
      case 'peek-panel':
        return isStandardLayout && showMapPane ? <Button variant="outline-dark" size="sm" style={toolbarButtonStyle} onClick={() => {
          setRightPanelCollapsed(true);
          setColumnSplit(94);
          setStatusMessage('Right panel minimized into tab mode.');
        }}>
            Peek panel
          </Button> : null;
      case 'toolbar-edit':
        return renderToolbarEditBlock();
      case 'columns':
        return renderColumnsButton();
      case 'layout':
        return renderLayoutBlock();
      case 'panels':
        return renderPanelsBlock();
      case 'trip-order':
        return renderTripOrderBlock();
      default:
        return null;
    }
  };

  const renderToolbarRow3Block = blockId => {
    switch (blockId) {
      case 'driver-select':
        return <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => handleDriverSelectionChange(event.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 180 }}>
            <option value="">Select driver</option>
            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}{getDriverTimeOffLabelForUi(driver) ? ` (${getDriverTimeOffLabelForUi(driver)})` : ''}</option>)}
          </Form.Select>;
      case 'secondary-driver':
        return <Form.Select size="sm" value={selectedSecondaryDriverId} onChange={event => setSelectedSecondaryDriverId(event.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 180 }}>
            <option value="">Secondary driver</option>
            {drivers.map(driver => <option key={`secondary-${driver.id}`} value={driver.id}>{driver.name}{getDriverTimeOffLabelForUi(driver) ? ` (${getDriverTimeOffLabelForUi(driver)})` : ''}</option>)}
          </Form.Select>;
      case 'zip-filter':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Form.Select size="sm" value={pickupZipFilter} onChange={e => setPickupZipFilter(e.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 110 }} title="Pickup ZIP">
              <option value="">PU ZIP</option>
              {availablePickupZips.map(zip => <option key={`pu-zip-${zip}`} value={zip}>{zip}</option>)}
            </Form.Select>
            <span className="text-muted small">→</span>
            <Form.Select size="sm" value={dropoffZipFilter} onChange={e => setDropoffZipFilter(e.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 110 }} title="Dropoff ZIP">
              <option value="">DO ZIP</option>
              {availableDropoffZips.map(zip => <option key={`do-zip-${zip}`} value={zip}>{zip}</option>)}
            </Form.Select>
            <Form.Control size="sm" value={zipFilter} onChange={e => setZipFilter(e.target.value)} placeholder="Extra ZIP" style={{ width: 92 }} title="Extra filter by any ZIP" />
          </div>;
      case 'route-filter':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Form.Select size="sm" value={puCityFilter} onChange={e => setPuCityFilter(e.target.value)} style={compactToolbarDestinationSelectStyle} title="Pickup city">
              <option value="">Origin</option>
              {availablePickupCities.map(city => <option key={`pu-${city}`} value={city}>{city}</option>)}
            </Form.Select>
            <Form.Select size="sm" value={doCityFilter} onChange={event => setDoCityFilter(event.target.value)} style={compactToolbarDestinationSelectStyle} title="Dropoff city">
              <option value="">Destination</option>
              {availableDropoffCities.map(city => <option key={`do-inline-${city}`} value={city}>{city}</option>)}
            </Form.Select>
            {(puCityFilter || doCityFilter || pickupZipFilter || dropoffZipFilter || zipFilter) ? <Button variant="outline-secondary" size="sm" onClick={() => { setPuCityFilter(''); setDoCityFilter(''); setPickupZipFilter(''); setDropoffZipFilter(''); setZipFilter(''); }} title="Clear city/ZIP filters" style={{ padding: '1px 6px', lineHeight: 1 }}>×</Button> : null}
          </div>;
      case 'theme-toggle':
        return <div className="d-flex align-items-center gap-2">
            <Button
              variant="outline-dark"
              size="sm"
              style={toolbarButtonStyle}
              onClick={() => changeTheme(themeMode === 'dark' ? 'light' : 'dark')}
              title={themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
              aria-label={themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              <i className={themeMode === 'dark' ? 'iconoir-sun-light' : 'iconoir-half-moon'} />
            </Button>
          </div>;
      case 'metric-miles':
        return routeMetrics?.distanceMiles != null ? <Badge bg={themeMode === 'dark' ? 'secondary' : 'light'} text={themeMode === 'dark' ? 'light' : 'dark'}>Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null;
      case 'metric-duration':
        return routeMetrics?.durationMinutes != null ? <Badge bg={themeMode === 'dark' ? 'secondary' : 'light'} text={themeMode === 'dark' ? 'light' : 'dark'}>{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null;
      default:
        return null;
    }
  };

  const handleCreateManualTrip = async draft => {
    const createdTrip = createManualTripRecord({
      ...draft,
      manualEntrySource: 'trip-dashboard'
    });
    setTripDateFilter(createdTrip.serviceDate || draft.serviceDate);
    setTripStatusFilter('all');
    setSelectedRouteId(null);
    setSelectedTripIds([createdTrip.id]);
    setShowManualTripModal(false);
    const message = `Manual trip ${createdTrip.brokerTripId || createdTrip.id} created for ${createdTrip.rider}.`;
    setStatusMessage(message);
    showNotification({ message, variant: 'success' });
  };
  const scanAnnotatedTrips = useMemo(() => annotateTripsByScanLogic(trips), [trips]);

  const matchesTripStatusFilter = (trip, blockingState) => {
    const tripDateKey = getTripTimelineDateKey(trip, routePlans, trips);
    const profilePhoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    const profileRiderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    const profileKey = profilePhoneKey ? `phone:${profilePhoneKey}` : profileRiderKey ? `rider:${profileRiderKey}` : '';
    const exclusion = profileKey ? riderProfiles?.[profileKey]?.exclusion : null;
    const exclusionMode = String(exclusion?.mode || '').trim().toLowerCase();
    const exclusionStart = String(exclusion?.startDate || '').trim();
    const exclusionEnd = String(exclusion?.endDate || '').trim();
    const hasActiveBlacklistBlock = blockingState?.source === 'blacklist';
    const isAutoCancelledByExclusion = !hasActiveBlacklistBlock && Boolean(tripDateKey) && (exclusionMode === 'always' || exclusionMode === 'single-day' && tripDateKey === exclusionStart || exclusionMode === 'range' && exclusionStart && exclusionEnd && tripDateKey >= exclusionStart && tripDateKey <= exclusionEnd);
    const normalizedStatus = isAutoCancelledByExclusion ? 'cancelled' : String(getEffectiveTripStatus(trip) || '').toLowerCase().replace(/\s+/g, '');
    const nowDateKey = getLocalDateKey(new Date());
    const hasActiveHospitalRehab = Boolean(trip?.hospitalStatus?.startDate) && Boolean(trip?.hospitalStatus?.endDate) && nowDateKey >= String(trip.hospitalStatus.startDate) && nowDateKey <= String(trip.hospitalStatus.endDate);
    const isNonOperationalTrip = ['cancelled', 'canceled', 'rehab'].includes(normalizedStatus) || hasActiveHospitalRehab;
    const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
    if (tripStatusFilter === 'all') return !isNonOperationalTrip;
    if (tripStatusFilter === 'unassigned') return !trip.driverId && !trip.secondaryDriverId && !isNonOperationalTrip;
    if (tripStatusFilter === 'removedsinceload') return Boolean(trip?.missingFromLatestSafeRideImport);
    if (tripStatusFilter === 'addressreview') return Boolean(trip?.routeChangePendingReview);
    if (tripStatusFilter === 'willcall') return normalizedStatus === 'willcall';
    if (tripStatusFilter === 'block') return confirmationStatus === 'Opted Out';
    if (tripStatusFilter === 'confirm') {
      const confirmCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
      return confirmationStatus === 'Confirmed' || (['C', 'S', 'W'].includes(confirmCode) && (confirmationStatus === 'Not Sent' || confirmationStatus === 'Pending'));
    }
    if (tripStatusFilter === 'unconfirm') {
      const confirmCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
      return ['Not Sent', 'Pending', 'Needs Call', 'Disconnected'].includes(confirmationStatus) || confirmCode === 'U';
    }
    return normalizedStatus === tripStatusFilter;
  };

  const matchesTripDateFilter = trip => {
    if (tripDateFilter === 'all') return true;
    return getTripTimelineDateKey(trip, routePlans, trips) === tripDateFilter;
  };

  const matchesTripLegFilter = trip => {
    if (tripLegFilter === 'all') return true;
    return getTripLegFilterKey(trip) === tripLegFilter;
  };

  const matchesTripTypeFilter = trip => {
    if (tripTypeFilter === 'all') return true;
    return getTripTypeLabel(trip) === tripTypeFilter;
  };

  const matchesTripServiceAnimalFilter = trip => {
    if (!serviceAnimalOnly) return true;
    return Boolean(trip?.hasServiceAnimal);
  };

  const matchesTripSearchFilter = trip => {
    const searchValue = deferredTripIdSearch.trim().toLowerCase();
    if (!searchValue) return true;
    const tokens = searchValue.split(/\s+/).filter(Boolean);
    const haystack = [trip.id, trip.brokerTripId, trip.rideId, trip.rider, trip.patientFirstName, trip.patientLastName, trip.patientName, trip.patientPhoneNumber, trip.address, trip.destination, getPickupZip(trip), getDropoffZip(trip), getPickupCity(trip), getDropoffCity(trip), trip.notes, trip.status, trip.safeRideStatus].filter(Boolean).join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  };

  const matchesPickupZipFilter = trip => {
    const pickupZipValue = pickupZipFilter.trim();
    return tripMatchesZip(trip, pickupZipValue);
  };

  const matchesDropoffZipFilter = trip => {
    const dropoffZipValue = dropoffZipFilter.trim();
    return tripMatchesZip(trip, dropoffZipValue);
  };

  const matchesAnyZipFilter = trip => {
    const zipValue = zipFilter.trim().toLowerCase();
    if (!zipValue) return true;
    return getPickupZip(trip).toLowerCase().includes(zipValue) || getDropoffZip(trip).toLowerCase().includes(zipValue);
  };

  const cityOptionTrips = useMemo(() => scanAnnotatedTrips.filter(trip => matchesTripStatusFilter(trip, tripBlockingMap.get(trip.id))).filter(matchesTripDateFilter).filter(matchesTripLegFilter).filter(matchesTripTypeFilter).filter(matchesTripServiceAnimalFilter).filter(matchesTripSearchFilter).filter(matchesPickupZipFilter).filter(matchesDropoffZipFilter).filter(matchesAnyZipFilter), [deferredTripIdSearch, dropoffZipFilter, pickupZipFilter, riderProfiles, routePlans, scanAnnotatedTrips, serviceAnimalOnly, todayDateKey, tripDateFilter, tripLegFilter, tripStatusFilter, tripTypeFilter, tripBlockingMap, trips, zipFilter]);
  const availablePickupZips = useMemo(() => {
    const targetDropoffZip = dropoffZipFilter.trim();
    return Array.from(new Set(cityOptionTrips.filter(trip => tripMatchesZip(trip, targetDropoffZip)).flatMap(trip => [getPickupZip(trip).trim(), getDropoffZip(trip).trim()]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, dropoffZipFilter]);
  const availableDropoffZips = useMemo(() => {
    const targetPickupZip = pickupZipFilter.trim();
    return Array.from(new Set(cityOptionTrips.filter(trip => tripMatchesZip(trip, targetPickupZip)).flatMap(trip => [getPickupZip(trip).trim(), getDropoffZip(trip).trim()]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, pickupZipFilter]);
  const availablePickupCities = useMemo(() => {
    const targetDropoffCity = doCityFilter.trim().toLowerCase();
    return Array.from(new Set(cityOptionTrips.filter(trip => tripMatchesCity(trip, targetDropoffCity)).flatMap(trip => [getPickupCity(trip).trim(), getDropoffCity(trip).trim()]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, doCityFilter]);
  const availableDropoffCities = useMemo(() => {
    const targetPickupCity = puCityFilter.trim().toLowerCase();
    return Array.from(new Set(cityOptionTrips.filter(trip => tripMatchesCity(trip, targetPickupCity)).flatMap(trip => [getPickupCity(trip).trim(), getDropoffCity(trip).trim()]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [cityOptionTrips, puCityFilter]);
  const filteredTrips = useMemo(() => cityOptionTrips.filter(trip => {
    const pickupCityValue = puCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, pickupCityValue);
  }).filter(trip => {
    const dropoffCityValue = doCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, dropoffCityValue);
  }), [cityOptionTrips, doCityFilter, puCityFilter]);
  const removedSinceLastLoadScopeCount = useMemo(() => scanAnnotatedTrips.filter(matchesTripDateFilter).filter(trip => Boolean(trip?.missingFromLatestSafeRideImport)).length, [matchesTripDateFilter, scanAnnotatedTrips, tripDateFilter, routePlans, trips]);
  const liveScanScopeTrips = useMemo(() => scanAnnotatedTrips.filter(matchesTripDateFilter).filter(matchesTripLegFilter).filter(matchesTripTypeFilter).filter(matchesTripServiceAnimalFilter).filter(matchesTripSearchFilter).filter(matchesPickupZipFilter).filter(matchesDropoffZipFilter).filter(matchesAnyZipFilter).filter(trip => {
    const pickupCityValue = puCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, pickupCityValue);
  }).filter(trip => {
    const dropoffCityValue = doCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, dropoffCityValue);
  }), [doCityFilter, matchesAnyZipFilter, matchesPickupZipFilter, matchesDropoffZipFilter, matchesTripDateFilter, matchesTripLegFilter, matchesTripSearchFilter, matchesTripServiceAnimalFilter, matchesTripTypeFilter, puCityFilter, scanAnnotatedTrips]);
  const visibleFilteredTripIdSet = useMemo(() => new Set(filteredTrips.map(trip => String(trip?.id || '').trim()).filter(Boolean)), [filteredTrips]);
  const liveAnnotatedFilteredTripMap = useMemo(() => new Map(annotateTripsByScanLogic(liveScanScopeTrips).map(trip => [String(trip?.id || '').trim(), trip])), [liveScanScopeTrips]);
  const liveTripScan = useMemo(() => {
    const scanResult = analyzeImportedTrips(liveScanScopeTrips);
    const visibleFindings = (scanResult?.findings || []).filter(finding => (Array.isArray(finding?.tripIds) ? finding.tripIds : []).some(tripId => visibleFilteredTripIdSet.has(String(tripId || '').trim())));
    return {
      ...scanResult,
      findingCount: visibleFindings.length,
      warningCount: visibleFindings.filter(finding => finding.severity === 'warning').length,
      blockingCount: visibleFindings.filter(finding => finding.severity === 'blocking').length,
      findings: visibleFindings
    };
  }, [liveScanScopeTrips, visibleFilteredTripIdSet]);
  const liveTripFieldErrorMap = useMemo(() => {
    const errorMap = new Map();

    const addFieldError = (tripId, columnKey, detail) => {
      const normalizedTripId = String(tripId || '').trim();
      if (!normalizedTripId || !columnKey) return;

      const currentTripErrors = errorMap.get(normalizedTripId) || new Map();
      const existingDetail = currentTripErrors.get(columnKey);
      currentTripErrors.set(columnKey, existingDetail ? `${existingDetail}\n${detail}` : detail);
      errorMap.set(normalizedTripId, currentTripErrors);
    };

    (liveTripScan?.findings || []).forEach(finding => {
      const columnKeys = getScanFindingColumnKeys(finding);
      if (columnKeys.length === 0) return;
      const detail = String(finding?.detail || finding?.title || 'Scanner detected an issue here.').trim();
      (Array.isArray(finding?.tripIds) ? finding.tripIds : []).forEach(tripId => {
        columnKeys.forEach(columnKey => addFieldError(tripId, columnKey, detail));
      });
    });

    return errorMap;
  }, [liveTripScan]);
  const liveTripScanAttentionGroups = useMemo(() => {
    const groups = new Map();
    (liveTripScan?.findings || []).forEach(finding => {
      const rider = String(finding?.riderNames?.[0] || finding?.tripIds?.[0] || 'Trip').trim();
      const tripId = String(finding?.tripIds?.[0] || '').trim();
      if (!tripId) return;
      const current = groups.get(rider) || {
        rider,
        tripId,
        severity: 'warning',
        count: 0
      };
      current.count += 1;
      if (finding.severity === 'blocking') current.severity = 'blocking';
      groups.set(rider, current);
    });
    return Array.from(groups.values()).sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === 'blocking' ? -1 : 1;
      return left.rider.localeCompare(right.rider);
    });
  }, [liveTripScan]);
  const liveTripAutoRepairableFindings = useMemo(() => (liveTripScan?.findings || []).filter(finding => finding.code === 'same-direction-repeated' && Array.isArray(finding.tripIds) && finding.tripIds.length === 2), [liveTripScan]);
  const assignmentProgressTrips = useMemo(() => trips.filter(trip => {
    const tripDateKey = getTripTimelineDateKey(trip, routePlans, trips);
    const profilePhoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    const profileRiderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    const profileKey = profilePhoneKey ? `phone:${profilePhoneKey}` : profileRiderKey ? `rider:${profileRiderKey}` : '';
    const exclusion = profileKey ? riderProfiles?.[profileKey]?.exclusion : null;
    const exclusionMode = String(exclusion?.mode || '').trim().toLowerCase();
    const exclusionStart = String(exclusion?.startDate || '').trim();
    const exclusionEnd = String(exclusion?.endDate || '').trim();
    const blockingState = tripBlockingMap.get(trip.id);
    const hasActiveBlacklistBlock = blockingState?.source === 'blacklist';
    const isAutoCancelledByExclusion = !hasActiveBlacklistBlock && Boolean(tripDateKey) && (exclusionMode === 'always' || exclusionMode === 'single-day' && tripDateKey === exclusionStart || exclusionMode === 'range' && exclusionStart && exclusionEnd && tripDateKey >= exclusionStart && tripDateKey <= exclusionEnd);
    const normalizedStatus = isAutoCancelledByExclusion ? 'cancelled' : String(getEffectiveTripStatus(trip) || '').toLowerCase().replace(/\s+/g, '');
    const nowDateKey = getLocalDateKey(new Date());
    const hasActiveHospitalRehab = Boolean(trip?.hospitalStatus?.startDate) && Boolean(trip?.hospitalStatus?.endDate) && nowDateKey >= String(trip.hospitalStatus.startDate) && nowDateKey <= String(trip.hospitalStatus.endDate);
    const isNonOperationalTrip = ['cancelled', 'canceled', 'rehab'].includes(normalizedStatus) || hasActiveHospitalRehab;
    return !isNonOperationalTrip;
  }).filter(trip => {
    if (tripDateFilter === 'all') return true;
    return getTripTimelineDateKey(trip, routePlans, trips) === tripDateFilter;
  }).filter(trip => {
    if (tripLegFilter === 'all') return true;
    return getTripLegFilterKey(trip) === tripLegFilter;
  }).filter(trip => {
    if (tripTypeFilter === 'all') return true;
    return getTripTypeLabel(trip) === tripTypeFilter;
  }).filter(trip => {
    if (!serviceAnimalOnly) return true;
    return Boolean(trip?.hasServiceAnimal);
  }).filter(trip => {
    const searchValue = deferredTripIdSearch.trim().toLowerCase();
    if (!searchValue) return true;
    const tokens = searchValue.split(/\s+/).filter(Boolean);
    const haystack = [trip.id, trip.brokerTripId, trip.rideId, trip.rider, trip.patientFirstName, trip.patientLastName, trip.patientName, trip.patientPhoneNumber, trip.address, trip.destination, getPickupZip(trip), getDropoffZip(trip), getPickupCity(trip), getDropoffCity(trip), trip.notes, trip.status, trip.safeRideStatus].filter(Boolean).join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  }).filter(trip => {
    const pickupZipValue = pickupZipFilter.trim();
    return tripMatchesZip(trip, pickupZipValue);
  }).filter(trip => {
    const dropoffZipValue = dropoffZipFilter.trim();
    return tripMatchesZip(trip, dropoffZipValue);
  }).filter(trip => {
    const zipValue = zipFilter.trim().toLowerCase();
    if (!zipValue) return true;
    return getPickupZip(trip).toLowerCase().includes(zipValue) || getDropoffZip(trip).toLowerCase().includes(zipValue);
  }).filter(trip => {
    const pickupCityValue = puCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, pickupCityValue);
  }).filter(trip => {
    const dropoffCityValue = doCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, dropoffCityValue);
  }), [deferredTripIdSearch, doCityFilter, doCityFilter, dropoffZipFilter, pickupZipFilter, puCityFilter, riderProfiles, serviceAnimalOnly, tripDateFilter, tripLegFilter, tripTypeFilter, routePlans, tripBlockingMap, trips, zipFilter]);
  const assignmentProgressTripIdSet = useMemo(() => new Set(assignmentProgressTrips.map(trip => normalizeTripId(trip?.id)).filter(Boolean)), [assignmentProgressTrips]);
  const driverAssignedTripCountById = useMemo(() => {
    const counts = new Map();
    assignmentProgressTrips.forEach(trip => {
      const primaryDriverId = normalizeDriverId(trip?.driverId);
      if (!primaryDriverId) return;
      counts.set(primaryDriverId, (counts.get(primaryDriverId) || 0) + 1);
    });
    return counts;
  }, [assignmentProgressTrips]);
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
  const selectedTripIdSet = useMemo(() => new Set(selectedTripIds.map(normalizeTripId).filter(Boolean)), [selectedTripIds]);
  const selectedTrips = useMemo(() => trips.filter(trip => selectedTripIdSet.has(normalizeTripId(trip.id))), [selectedTripIdSet, trips]);
  const selectedVisibleTrips = useMemo(() => sortTripsByPickupTime(filteredTrips.filter(trip => selectedTripIdSet.has(normalizeTripId(trip.id)))), [filteredTrips, selectedTripIdSet]);
  const getMapTripTargetPosition = trip => trip?.status === 'In Progress' ? getTripDropoffPosition(trip) : getTripPickupPosition(trip);
  const selectedTripMapPoints = useMemo(() => {
    if (selectedTrips.length === 0 || showRoute) return [];
    const scopedSelectedTrips = activeDateTripIdSet ? selectedTrips.filter(trip => activeDateTripIdSet.has(String(trip?.id || '').trim())) : selectedTrips;
    return sortTripsByPickupTime(scopedSelectedTrips).flatMap(trip => {
      const pickupPosition = getTripPickupPosition(trip);
      const dropoffPosition = getTripDropoffPosition(trip);
      const points = [];
      if (pickupPosition) {
        points.push({
          key: `${trip.id}-pickup-selected-map`,
          tripId: trip.id,
          position: pickupPosition,
          color: '#0284c7',
          label: `PU ${getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-'}`,
          detail: trip.address || 'No pickup address available'
        });
      }
      if (dropoffPosition) {
        points.push({
          key: `${trip.id}-dropoff-selected-map`,
          tripId: trip.id,
          position: dropoffPosition,
          color: '#16a34a',
          label: `DO ${getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-'}`,
          detail: trip.destination || 'No dropoff address available'
        });
      }
      return points;
    });
  }, [activeDateTripIdSet, selectedTrips, showRoute]);
  const aiPlannerBaseScopeTrips = useMemo(() => {
    if (selectedVisibleTrips.length > 0) return selectedVisibleTrips;
    return sortTripsByPickupTime(filteredTrips).slice(0, 200);
  }, [filteredTrips, selectedTripIdSet]);
  const aiPlannerCityOptions = useMemo(() => {
    const citySet = new Set();
    aiPlannerBaseScopeTrips.forEach(trip => {
      const pickupCity = getPickupCity(trip).trim();
      const dropoffCity = getDropoffCity(trip).trim();
      if (pickupCity) citySet.add(pickupCity);
      if (dropoffCity) citySet.add(dropoffCity);
    });
    return Array.from(citySet).sort((left, right) => left.localeCompare(right));
  }, [aiPlannerBaseScopeTrips]);
  const aiPlannerRoutePairPickupOptions = useMemo(() => Array.from(new Set(aiPlannerBaseScopeTrips.map(trip => getPickupCity(trip).trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right)), [aiPlannerBaseScopeTrips]);
  const aiPlannerRoutePairDropoffOptions = useMemo(() => {
    const pickupCityValue = normalizeCityValue(aiPlannerRoutePairPickupCity);
    return Array.from(new Set(aiPlannerBaseScopeTrips.filter(trip => !pickupCityValue || normalizeCityValue(getPickupCity(trip)) === pickupCityValue).map(trip => getDropoffCity(trip).trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  }, [aiPlannerBaseScopeTrips, aiPlannerRoutePairPickupCity]);
  const aiPlannerRoutePairSet = useMemo(() => new Set(aiPlannerRoutePairs), [aiPlannerRoutePairs]);
  const aiPlanningScopeTrips = useMemo(() => aiPlannerBaseScopeTrips.filter(trip => {
    const cityValue = aiPlannerCityFilter.trim().toLowerCase();
    return tripMatchesCity(trip, cityValue);
  }).filter(trip => {
    if (aiPlannerRoutePairSet.size === 0) return true;
    const pickupCity = getPickupCity(trip).trim();
    const dropoffCity = getDropoffCity(trip).trim();
    const exactPairKey = buildAiPlannerRoutePairKey(pickupCity, dropoffCity);
    if (aiPlannerRoutePairSet.has(exactPairKey)) return true;
    if (aiPlannerRoutePairMode !== 'both') return false;
    const reversePairKey = buildAiPlannerRoutePairKey(dropoffCity, pickupCity);
    return aiPlannerRoutePairSet.has(reversePairKey);
  }).filter(trip => {
    if (aiPlannerLegFilter === 'all') return true;
    return getTripLegFilterKey(trip) === aiPlannerLegFilter;
  }).filter(trip => {
    if (aiPlannerTypeFilter === 'all') return true;
    return getTripTypeLabel(trip) === aiPlannerTypeFilter;
  }), [aiPlannerBaseScopeTrips, aiPlannerCityFilter, aiPlannerLegFilter, aiPlannerRoutePairMode, aiPlannerRoutePairSet, aiPlannerTypeFilter]);
  const aiPlannerAnchorTrip = useMemo(() => aiPlanningScopeTrips.find(trip => trip.id === aiPlannerAnchorTripId) ?? null, [aiPlanningScopeTrips, aiPlannerAnchorTripId]);
  const aiPlannerZipOptions = useMemo(() => Array.from(new Set(aiPlanningScopeTrips.flatMap(trip => [getPickupZip(trip), getDropoffZip(trip)]).filter(Boolean))).sort((left, right) => left.localeCompare(right)), [aiPlanningScopeTrips]);
  const visibleTripIds = filteredTrips.map(trip => normalizeTripId(trip.id)).filter(Boolean);
  const getDriverTimeOffDateForUi = driver => String(driver?.timeOffAppointment?.appointmentDate || '').trim();
  const getDriverTimeOffLabelForUi = driver => {
    const appointmentDate = getDriverTimeOffDateForUi(driver);
    if (!appointmentDate) return '';
    const appointmentType = String(driver?.timeOffAppointment?.appointmentType || 'Appointment').trim();
    return `DAY OFF ${appointmentDate}${appointmentType ? ` - ${appointmentType}` : ''}`;
  };
  const countDriverBlockedTrips = (driver, tripIds = []) => {
    const appointmentDate = getDriverTimeOffDateForUi(driver);
    if (!appointmentDate) return 0;
    return (Array.isArray(tripIds) ? tripIds : []).reduce((total, tripId) => {
      const trip = trips.find(item => String(item?.id || '').trim() === String(tripId || '').trim());
      if (!trip) return total;
      return getTripServiceDateKey(trip) === appointmentDate ? total + 1 : total;
    }, 0);
  };
  const activeTimeOffDrivers = useMemo(() => drivers.filter(driver => Boolean(getDriverTimeOffDateForUi(driver))).sort((leftDriver, rightDriver) => {
    const leftDate = getDriverTimeOffDateForUi(leftDriver);
    const rightDate = getDriverTimeOffDateForUi(rightDriver);
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return String(leftDriver?.name || '').localeCompare(String(rightDriver?.name || ''), undefined, {
      sensitivity: 'base'
    });
  }), [drivers]);
  const routeDayOffDrivers = useMemo(() => activeTimeOffDrivers.filter(driver => getDriverTimeOffDateForUi(driver) === activeRouteDateKey), [activeRouteDateKey, activeTimeOffDrivers]);
  const futureDayOffDrivers = useMemo(() => activeTimeOffDrivers.filter(driver => getDriverTimeOffDateForUi(driver) !== activeRouteDateKey), [activeRouteDateKey, activeTimeOffDrivers]);
  const filteredDrivers = useMemo(() => {
    const term = driverSearch.trim().toLowerCase();
    const capabilityFilters = Array.isArray(driverVehicleCapabilityFilters) ? driverVehicleCapabilityFilters : [];
    const filteredByCapability = capabilityFilters.length === 0 ? drivers : drivers.filter(driver => {
      const adminDriver = adminDriversById.get(String(driver?.id || '').trim()) || null;
      const capabilityPrefixes = new Set(buildResolvedVehicleMeta(adminDriver, driver?.vehicle || '').capabilityTokens.map(stripVehicleCapabilityCount).filter(Boolean));
      return capabilityFilters.every(filterKey => capabilityPrefixes.has(filterKey));
    });
    const filtered = !term ? filteredByCapability : filteredByCapability.filter(driver => [driver?.name, driver?.code, driver?.vehicle, driver?.attendant, driver?.live].some(value => String(value || '').toLowerCase().includes(term)));

    const getDriverSortValue = driver => {
      switch (driverSort.key) {
        case 'vehicle':
          return getDriverVehicleMeta(driver).vehicleLabel || driver?.vehicle;
        case 'attendant':
          return driver?.attendant;
        case 'info':
          return driverAssignedTripCountById.get(normalizeDriverId(driver?.id)) || 0;
        case 'live':
          return driver?.live;
        case 'name':
        default:
          return driver?.name;
      }
    };

    return [...filtered].sort((leftDriver, rightDriver) => {
      const leftValue = String(getDriverSortValue(leftDriver) || '').trim();
      const rightValue = String(getDriverSortValue(rightDriver) || '').trim();

      if (!leftValue && !rightValue) return 0;
      if (!leftValue) return 1;
      if (!rightValue) return -1;

      const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
      return driverSort.direction === 'asc' ? result : -result;
    });
  }, [adminDriversById, adminGroupingsById, adminVehiclesById, driverAssignedTripCountById, driverSearch, driverSort.direction, driverSort.key, driverVehicleCapabilityFilters, drivers]);
  const tripOriginalOrderLookup = useMemo(() => new Map(trips.map((trip, index) => [trip.id, index])), [trips]);
  const selectedDriverCandidateTripIds = useMemo(() => new Set(filteredTrips.filter(trip => selectedTripIdSet.has(normalizeTripId(trip.id)) && (!trip.driverId || isTripAssignedToDriver(trip, selectedDriverId))).map(trip => trip.id)), [filteredTrips, selectedDriverId, selectedTripIdSet]);
  const selectedDriverWorkingTrips = useMemo(() => {
    if (!selectedDriver) return [];
    const relevantTrips = filteredTrips.filter(trip => isTripAssignedToDriver(trip, selectedDriver.id) || selectedDriverCandidateTripIds.has(trip.id));
    return sortTripsByPickupTime(relevantTrips);
  }, [filteredTrips, selectedDriver, selectedDriverCandidateTripIds]);

  const routeTrips = useMemo(() => {
    const selectedTripIdSet = new Set(selectedTripIds.map(id => String(id || '').trim()).filter(Boolean));
    const selectedRouteTripIdSet = new Set((Array.isArray(selectedRoute?.tripIds) ? selectedRoute.tripIds : []).map(id => String(id || '').trim()).filter(Boolean));
    const baseTrips = selectedRoute ? trips.filter(trip => selectedRouteTripIdSet.has(String(trip?.id || '').trim())) : selectedDriver ? selectedDriverWorkingTrips : trips.filter(trip => selectedTripIdSet.has(String(trip?.id || '').trim()));
    const scopedTrips = activeDateTripIdSet ? baseTrips.filter(trip => activeDateTripIdSet.has(String(trip?.id || '').trim())) : baseTrips;
    const term = deferredRouteSearch.trim().toLowerCase();
    return sortTripsByPickupTime(scopedTrips.filter(trip => !term || [trip.id, trip.rider, trip.address].some(value => String(value || '').toLowerCase().includes(term))));
  }, [activeDateTripIdSet, deferredRouteSearch, selectedDriver, selectedDriverWorkingTrips, selectedRoute, selectedTripIds, trips]);
  const selectedRoutePanelTripIds = useMemo(() => routeTrips.map(trip => normalizeTripId(trip.id)).filter(Boolean).filter(tripId => selectedTripIdSet.has(tripId)), [routeTrips, selectedTripIdSet]);

  const selectedDriverDayAssignedTripIds = useMemo(() => {
    if (!selectedDriverId || tripDateFilter === 'all') return [];
    return trips.filter(trip => {
      if (!isTripAssignedToDriver(trip, selectedDriverId)) return false;
      return getTripTimelineDateKey(trip, routePlans, trips) === tripDateFilter;
    }).map(trip => normalizeTripId(trip?.id)).filter(Boolean);
  }, [routePlans, selectedDriverId, tripDateFilter, trips]);
  const selectedDriverDayAssignedTripIdsKey = useMemo(() => [...selectedDriverDayAssignedTripIds].sort().join('|'), [selectedDriverDayAssignedTripIds]);

  useEffect(() => {
    if (!activeClosedRouteKey || !isActiveRouteClosed) return;
    setClosedRouteStateByKey(currentState => {
      const currentRouteState = currentState[activeClosedRouteKey];
      if (!currentRouteState || !currentRouteState.closed) return currentState;

      const baselineTripIdSet = new Set((Array.isArray(currentRouteState.baseTripIds) ? currentRouteState.baseTripIds : []).map(normalizeTripId).filter(Boolean));
      const lastSeenTripIdSet = new Set((Array.isArray(currentRouteState.lastSeenTripIds) ? currentRouteState.lastSeenTripIds : currentRouteState.baseTripIds || []).map(normalizeTripId).filter(Boolean));
      const addedByTripId = currentRouteState.addedByTripId && typeof currentRouteState.addedByTripId === 'object' ? currentRouteState.addedByTripId : {};
      const removedByTripId = currentRouteState.removedByTripId && typeof currentRouteState.removedByTripId === 'object' ? currentRouteState.removedByTripId : {};
      const eventLog = Array.isArray(currentRouteState.events) ? currentRouteState.events : [];
      const nextAddedByTripId = {
        ...addedByTripId
      };
      const nextRemovedByTripId = {
        ...removedByTripId
      };
      const nextEvents = [...eventLog];
      const currentTripIdSet = new Set(selectedDriverDayAssignedTripIds.map(normalizeTripId).filter(Boolean));
      let hasChanges = false;

      for (const tripId of currentTripIdSet) {
        const normalizedTripId = normalizeTripId(tripId);
        if (!normalizedTripId || baselineTripIdSet.has(normalizedTripId) || nextAddedByTripId[normalizedTripId] || lastSeenTripIdSet.has(normalizedTripId)) continue;
        nextAddedByTripId[normalizedTripId] = {
          addedBy: operatorDisplayName,
          addedAt: Date.now()
        };
        nextEvents.push({
          id: `trip-added-${normalizedTripId}-${Date.now()}`,
          type: 'trip-added',
          tripId: normalizedTripId,
          by: operatorDisplayName,
          at: Date.now()
        });
        hasChanges = true;
      }

      for (const tripId of lastSeenTripIdSet) {
        const normalizedTripId = normalizeTripId(tripId);
        if (!normalizedTripId || currentTripIdSet.has(normalizedTripId) || nextRemovedByTripId[normalizedTripId]) continue;
        nextRemovedByTripId[normalizedTripId] = {
          removedBy: operatorDisplayName,
          removedAt: Date.now()
        };
        nextEvents.push({
          id: `trip-removed-${normalizedTripId}-${Date.now()}`,
          type: 'trip-removed',
          tripId: normalizedTripId,
          by: operatorDisplayName,
          at: Date.now()
        });
        hasChanges = true;
      }

      if (!hasChanges) return currentState;
      return {
        ...currentState,
        [activeClosedRouteKey]: {
          ...currentRouteState,
          addedByTripId: nextAddedByTripId,
          removedByTripId: nextRemovedByTripId,
          lastSeenTripIds: Array.from(currentTripIdSet),
          events: nextEvents,
          lastUpdatedAt: Date.now()
        }
      };
    });
  }, [activeClosedRouteKey, isActiveRouteClosed, operatorDisplayName, selectedDriverDayAssignedTripIdsKey]);

  const handleToggleClosedRoute = () => {
    if (!selectedDriverId) {
      setStatusMessage('Select a driver before closing route.');
      return;
    }
    if (tripDateFilter === 'all') {
      setStatusMessage('Pick a specific day before closing route.');
      return;
    }

    const routeKey = getClosedRouteKey(selectedDriverId, tripDateFilter);
    if (!routeKey) return;

    const nextIsClosing = !isActiveRouteClosed;
    setClosedRouteStateByKey(currentState => {
      const previousState = currentState[routeKey] || {};
      const previousEvents = Array.isArray(previousState.events) ? previousState.events : [];
      if (nextIsClosing) {
        return {
          ...currentState,
          [routeKey]: {
            closed: true,
            closedBy: operatorDisplayName,
            closedAt: Date.now(),
            driverId: normalizeDriverId(selectedDriverId),
            dateKey: tripDateFilter,
            baseTripIds: selectedDriverDayAssignedTripIds,
            lastSeenTripIds: selectedDriverDayAssignedTripIds,
            addedByTripId: previousState?.addedByTripId && typeof previousState.addedByTripId === 'object' ? previousState.addedByTripId : {},
            removedByTripId: previousState?.removedByTripId && typeof previousState.removedByTripId === 'object' ? previousState.removedByTripId : {},
            events: [...previousEvents, {
              id: `route-closed-${Date.now()}`,
              type: 'route-closed',
              by: operatorDisplayName,
              at: Date.now()
            }],
            lastUpdatedAt: Date.now()
          }
        };
      }

      return {
        ...currentState,
        [routeKey]: {
          ...previousState,
          closed: false,
          reopenedBy: operatorDisplayName,
          reopenedAt: Date.now(),
          events: [...previousEvents, {
            id: `route-reopened-${Date.now()}`,
            type: 'route-reopened',
            by: operatorDisplayName,
            at: Date.now()
          }],
          lastUpdatedAt: Date.now()
        }
      };
    });

    if (nextIsClosing) {
      setStatusMessage(`Closed route enabled for ${selectedDriver?.name || 'driver'} on ${tripDateFilter}.`);
      return;
    }
    setStatusMessage('Closed route disabled.');
  };

  const getTripAddedByLabel = trip => {
    const tripId = normalizeTripId(trip?.id);
    if (!tripId) return '';
    const formatActorValue = (name, initials) => {
      const normalizedName = String(name || '').trim();
      const normalizedInitials = String(initials || '').trim().toUpperCase();
      if (normalizedName && normalizedInitials && normalizedName.toUpperCase() !== normalizedInitials) {
        return `${normalizedName} (${normalizedInitials})`;
      }
      return normalizedName || normalizedInitials;
    };

    const persistedCloneActor = formatActorValue(trip?.clonedBy, trip?.clonedByInitials);
    if (persistedCloneActor) return `Cloned by ${persistedCloneActor}`;

    const persistedCreateActor = formatActorValue(trip?.createdBy || trip?.addedBy, trip?.createdByInitials || trip?.addedByInitials);
    if (persistedCreateActor) return `Created by ${persistedCreateActor}`;

    if (!activeClosedRouteState) return '';
    const addedByTripId = activeClosedRouteState.addedByTripId && typeof activeClosedRouteState.addedByTripId === 'object' ? activeClosedRouteState.addedByTripId : {};
    const entry = addedByTripId[tripId];
    if (!entry) return '';
    const name = String(entry?.addedBy || '').trim() || 'Dispatcher';
    return `Added by ${name}`;
  };

  const routeStops = useMemo(() => {
    if (!showRoute) return [];

    if (selectedTripIds.length > 0) {
      const selectedTripIdSet = new Set(selectedTripIds.map(id => String(id || '').trim()).filter(Boolean));
      const selectedTripsForMap = trips.filter(trip => {
        const tripId = String(trip?.id || '').trim();
        if (!selectedTripIdSet.has(tripId)) return false;
        if (!activeDateTripIdSet) return true;
        return activeDateTripIdSet.has(tripId);
      });
      return sortTripsByPickupTime(selectedTripsForMap).flatMap((trip, index) => {
        const pickupPosition = getTripPickupPosition(trip);
        const dropoffPosition = getTripDropoffPosition(trip);
        const stops = [];
        if (pickupPosition) {
          stops.push({
            key: `${trip.id}-pickup`,
            label: `${index * 2 + 1}`,
            variant: 'pickup',
            position: pickupPosition,
            title: `Pickup ${getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-'}`,
            detail: trip.address
          });
        }
        if (dropoffPosition) {
          stops.push({
            key: `${trip.id}-dropoff`,
            label: `${index * 2 + 2}`,
            variant: 'dropoff',
            position: dropoffPosition,
            title: `Dropoff ${getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-'}`,
            detail: trip.destination || 'Destination pending'
          });
        }
        return stops;
      });
    }

    if (selectedRoute) {
      return routeTrips.flatMap((trip, index) => {
        const pickupPosition = getTripPickupPosition(trip);
        const dropoffPosition = getTripDropoffPosition(trip);
        const stops = [];
        if (pickupPosition) {
          stops.push({
            key: `${trip.id}-pickup`,
            label: `${index * 2 + 1}`,
            variant: 'pickup',
            position: pickupPosition,
            title: `Pickup ${getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-'}`,
            detail: trip.address
          });
        }
        if (dropoffPosition) {
          stops.push({
            key: `${trip.id}-dropoff`,
            label: `${index * 2 + 2}`,
            variant: 'dropoff',
            position: dropoffPosition,
            title: `Dropoff ${getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-'}`,
            detail: trip.destination || 'Destination pending'
          });
        }
        return stops;
      });
    }

    return [];
  }, [activeDateTripIdSet, routeTrips, selectedDriver, selectedRoute, selectedTripIds, selectedDriverCandidateTripIds, showRoute, trips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const driversWithRealLocation = useMemo(() => drivers.filter(driver => driver.hasRealLocation), [drivers]);
  const mapVisibleDriversWithRealLocation = useMemo(() => {
    if (!showInlineMap || !showMapPane) return [];
    return driversWithRealLocation.filter(driver => String(driver?.live || '').trim().toLowerCase() === 'online' || String(driver?.id || '').trim() === String(selectedDriverId || '').trim());
  }, [driversWithRealLocation, selectedDriverId, showInlineMap, showMapPane]);
  const liveVehicleIconByDriverId = useMemo(() => {
    const iconByDriverId = new Map();
    for (const driver of mapVisibleDriversWithRealLocation) {
      iconByDriverId.set(String(driver?.id || '').trim(), createLiveVehicleIcon({
        heading: driver.heading,
        isOnline: driver.live === 'Online',
        vehicleIconScalePercent: driver?.gpsSettings?.vehicleIconScalePercent
      }));
    }
    return iconByDriverId;
  }, [mapVisibleDriversWithRealLocation]);
  const activeInfoTrip = selectedTripIds.length > 0 ? trips.find(trip => selectedTripIdSet.has(normalizeTripId(trip.id))) ?? null : selectedRoute ? routeTrips[0] ?? null : selectedDriver ? trips.find(trip => isTripAssignedToDriver(trip, selectedDriver.id)) ?? null : routeTrips[0] ?? filteredTrips[0] ?? null;
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIdSet.has(id));
  const selectedDriverAssignedTripCount = useMemo(() => selectedDriverId ? trips.filter(trip => trip.driverId === selectedDriverId || trip.secondaryDriverId === selectedDriverId).length : 0, [selectedDriverId, trips]);
  const remainingVisibleTripCount = filteredTrips.length;
  const completedRoutesCount = useMemo(() => {
    if (assignmentProgressTripIdSet.size === 0) return 0;

    const routePlanCount = routePlans.filter(routePlan => {
      if (tripDateFilter !== 'all' && getRouteServiceDateKey(routePlan, trips) !== tripDateFilter) return false;
      const routeTripIds = Array.isArray(routePlan?.tripIds) ? routePlan.tripIds.map(normalizeTripId).filter(Boolean) : [];
      return routeTripIds.some(tripId => assignmentProgressTripIdSet.has(tripId));
    }).length;

    if (routePlanCount > 0) return routePlanCount;

    const visibleAssignedTrips = assignmentProgressTrips.filter(trip => {
      if (tripDateFilter !== 'all' && getTripTimelineDateKey(trip, routePlans, trips) !== tripDateFilter) return false;
      return true;
    });

    const routeIds = new Set(visibleAssignedTrips.map(trip => normalizeTripId(trip?.routeId)).filter(Boolean));
    if (routeIds.size > 0) return routeIds.size;

    return new Set(visibleAssignedTrips.map(trip => normalizeDriverId(trip?.driverId)).filter(Boolean)).size;
  }, [assignmentProgressTripIdSet, assignmentProgressTrips, routePlans, tripDateFilter, trips]);
  const selectedDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const preferredTrip = trips.find(trip => selectedTripIdSet.has(normalizeTripId(trip.id)) && isTripAssignedToDriver(trip, selectedDriver.id));
    if (preferredTrip) return preferredTrip;
    const routeTrip = routeTrips.find(trip => isTripAssignedToDriver(trip, selectedDriver.id));
    if (routeTrip) return routeTrip;
    return trips.find(trip => isTripAssignedToDriver(trip, selectedDriver.id)) ?? null;
  }, [routeTrips, selectedDriver, selectedTripIdSet, trips]);
  const selectedDriverEta = useMemo(() => {
    if (!selectedDriver || !selectedDriver.hasRealLocation || !selectedDriverActiveTrip) return null;
    const miles = getDistanceMiles(selectedDriver.position, getMapTripTargetPosition(selectedDriverActiveTrip));
    return {
      miles,
      label: formatEta(miles)
    };
  }, [getMapTripTargetPosition, selectedDriver, selectedDriverActiveTrip]);
  const selectedDriverRouteHealth = useMemo(() => {
    if (!selectedDriver || selectedDriverWorkingTrips.length === 0) return null;

    const now = Date.now();
    const items = [];
    let previousAvailableAt = selectedDriver.hasRealLocation ? now : null;
    let previousDropoffPosition = selectedDriver.hasRealLocation ? selectedDriver.position : null;

    for (const trip of selectedDriverWorkingTrips) {
      const pickupPosition = getTripPickupPosition(trip);
      const dropoffPosition = getTripDropoffPosition(trip);
      const scheduledStart = Number.isFinite(Number(trip.pickupSortValue)) ? Number(trip.pickupSortValue) : previousAvailableAt;
      const travelMinutes = previousDropoffPosition && pickupPosition ? estimateTravelMinutes(previousDropoffPosition, pickupPosition) : 0;
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
      previousDropoffPosition = dropoffPosition ?? pickupPosition;
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
    if (selectedDriver) return `${selectedDriver.name} Route`;
    if (routeTrips.length > 0) return 'Current route';
    return 'Unnamed route';
  }, [routeName, routeTrips.length, selectedDriver, selectedRoute]);
  const noteModalTrip = useMemo(() => noteModalTripId ? trips.find(trip => trip.id === noteModalTripId) ?? null : null, [noteModalTripId, trips]);
  const tripExcelCompareModalTrip = useMemo(() => {
    if (!tripExcelCompareModalId) return null;
    return trips.find(trip => trip.id === tripExcelCompareModalId) ?? tripExcelCompareModalFallbackTrip ?? null;
  }, [tripExcelCompareModalFallbackTrip, tripExcelCompareModalId, trips]);
  const confirmationSiblingTrips = useMemo(() => confirmationSourceTrip ? getSiblingLegTrips(confirmationSourceTrip, trips) : [], [confirmationSourceTrip, trips]);
  const confirmationRequiresLegChoice = Boolean(confirmationSourceTrip && confirmationSiblingTrips.length > 0);
  const tripUpdateSiblingTrips = useMemo(() => tripUpdateModal ? getSiblingLegTrips(tripUpdateModal, trips) : [], [tripUpdateModal, trips]);
  const tripUpdateSupportsBothLegs = tripUpdateSiblingTrips.length > 0;

  const buildTripConfirmationLine = trip => {
    const pickupTime = getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-';
    const dropoffTime = getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-';
    return [`Trip ID: ${getDisplayTripId(trip) || '-'}`, `Rider: ${trip?.rider || '-'}`, `Phone: ${trip?.patientPhoneNumber || '-'}`, `Pickup Time: ${pickupTime}`, `Pickup Address: ${trip?.address || '-'}`, `Dropoff Time: ${dropoffTime}`, `Dropoff Address: ${trip?.destination || '-'}`, `Leg: ${String(trip?.legLabel || 'AL').trim() || 'AL'}`, `Type: ${getTripMobilityLabel(trip) || '-'}`].join(' | ');
  };

  const buildConfirmationSignalPayload = ({ status, provider, methodCode, message, eventType }) => ({
    status,
    provider,
    methodCode,
    message,
    eventType,
    source: 'trip-dashboard',
    updatedAt: new Date().toISOString()
  });

  const getConfirmationMethodCode = method => {
    if (method === 'whatsapp') return 'W';
    if (method === 'sms') return 'S';
    if (method === 'call') return 'C';
    if (method === 'call-left-message') return 'CL';
    if (method === 'cancelled-by-patient') return 'CP';
    if (method === 'disconnected') return 'DC';
    if (method === 'sms-left-unconfirmed') return 'SL';
    return 'M';
  };

  const getConfirmationMethodLabel = method => {
    if (method === 'whatsapp') return 'WhatsApp';
    if (method === 'sms') return 'SMS';
    if (method === 'call') return 'Call';
    if (method === 'call-left-message') return 'Called and left message';
    if (method === 'cancelled-by-patient') return 'Cancelled by patient';
    if (method === 'disconnected') return 'Disconnected';
    if (method === 'sms-left-unconfirmed') return 'Could not confirm, SMS left (English)';
    return 'Manual';
  };

  const getTripConfirmationDisplayLabel = (trip, blockingState) => {
    const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
    const confirmationCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
    if (confirmationCode === 'U') return 'Unconfirmed';
    if (confirmationCode === 'DC') return 'Disconnected';
    if (['CL', 'SL'].includes(confirmationCode)) return 'Needs Call';
    if (['C', 'S', 'W'].includes(confirmationCode) && (confirmationStatus === 'Not Sent' || confirmationStatus === 'Pending')) return 'Confirmed';
    return confirmationStatus;
  };

  const getTripConfirmationActionLabel = (trip, blockingState) => {
    const confirmationLabel = getTripConfirmationDisplayLabel(trip, blockingState);
    if (confirmationLabel === 'Needs Call') return 'Call Again';
    if (confirmationLabel === 'Disconnected') return 'Disconnected';
    return 'Confirm';
  };

  const getTripConfirmationActionVariant = (trip, blockingState) => {
    const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
    const confirmationLabel = getTripConfirmationDisplayLabel(trip, blockingState);
    if (confirmationStatus === 'Confirmed') return 'success';
    if (confirmationLabel === 'Needs Call') return 'warning';
    if (confirmationLabel === 'Disconnected') return 'secondary';
    return 'outline-success';
  };

  const applyTripConfirmationState = (trip, { status, provider = '', methodCode = '', message = '', eventType = 'manual', noteLine = '' }) => {
    const nowIso = new Date().toISOString();
    const nextNotes = noteLine ? [String(trip?.notes || '').trim(), noteLine].filter(Boolean).join('\n') : undefined;
    updateTripRecord(trip.id, {
      ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
      confirmation: {
        ...(trip.confirmation || {}),
        status,
        provider,
        respondedAt: status === 'Confirmed' ? nowIso : '',
        lastResponseText: message,
        lastResponseCode: methodCode
      },
      confirmationSignal: buildConfirmationSignalPayload({
        status,
        provider,
        methodCode,
        message,
        eventType
      })
    });
  };

  const handleOpenConfirmationMethod = (targetTrips, sourceTrip = null) => {
    if (!Array.isArray(targetTrips) || targetTrips.length === 0) {
      setStatusMessage('Select at least one trip to confirm.');
      return;
    }
    setConfirmationMethodModal(targetTrips);
    setConfirmationMethod('whatsapp');
    setConfirmationSourceTrip(sourceTrip);
    setConfirmationLegScope('single');
  };

  const handleCloseConfirmationMethod = () => {
    setConfirmationMethodModal(null);
    setConfirmationSourceTrip(null);
    setConfirmationLegScope('single');
  };

  const handleManualConfirm = trip => {
    handleOpenConfirmationMethod([trip], trip);
  };

  const handleOpenTripUpdateModal = trip => {
    if (!trip) return;
    setTripUpdateModal(trip);
    setTripUpdateLegScope('single');
    setTripUpdateConfirmMethod('call');
    setTripUpdatePickupTime(normalizeTripTimeDisplay(trip?.scheduledPickup || trip?.pickup || ''));
    setTripUpdateDropoffTime(normalizeTripTimeDisplay(trip?.scheduledDropoff || trip?.dropoff || ''));
    setTripUpdatePickupAddress(String(trip?.address || '').trim());
    setTripUpdateDropoffAddress(String(trip?.destination || '').trim());
    setTripUpdateNote('');
  };

  const handleSaveTripUpdate = async () => {
    if (!tripUpdateModal) return;
    const now = new Date().toISOString();
    const oldPickup = normalizeTripTimeDisplay(tripUpdateModal.scheduledPickup || tripUpdateModal.pickup || '');
    const oldDropoff = normalizeTripTimeDisplay(tripUpdateModal.scheduledDropoff || tripUpdateModal.dropoff || '');
    const nextPickup = normalizeTripTimeDisplay(tripUpdatePickupTime || '');
    const nextDropoff = normalizeTripTimeDisplay(tripUpdateDropoffTime || '');
    const nextPickupAddress = String(tripUpdatePickupAddress || '').trim();
    const nextDropoffAddress = String(tripUpdateDropoffAddress || '').trim();
    const noteText = String(tripUpdateNote || '').trim();
    const methodLabel = getConfirmationMethodLabel(tripUpdateConfirmMethod);
    const isSmsLeftUnconfirmed = tripUpdateConfirmMethod === 'sms-left-unconfirmed';
    const isCallLeftMessage = tripUpdateConfirmMethod === 'call-left-message';
    const isCancelled = tripUpdateConfirmMethod === 'cancelled-by-patient';
    const isDisconnected = tripUpdateConfirmMethod === 'disconnected';
    const nextConfirmationStatus = isCancelled ? 'Cancelled' : isDisconnected ? 'Disconnected' : isSmsLeftUnconfirmed || isCallLeftMessage ? 'Needs Call' : 'Confirmed';
    const detailLines = [`[TRIP UPDATE] ${new Date().toLocaleString()}: ${isCancelled ? 'Cancelled by patient' : isDisconnected ? 'Phone disconnected' : isSmsLeftUnconfirmed ? 'Could not confirm, SMS left (English).' : isCallLeftMessage ? 'Called and left message.' : `Confirmed via ${methodLabel}`}.`];
    if (nextPickup && nextPickup !== oldPickup || nextDropoff && nextDropoff !== oldDropoff) {
      detailLines.push(`[SCHEDULE CHANGE] ${oldPickup || '-'} -> ${nextPickup || oldPickup || '-'} | ${oldDropoff || '-'} -> ${nextDropoff || oldDropoff || '-'}`);
    }
    if (noteText) detailLines.push(`[DISPATCH NOTE] ${noteText}`);
    const targetTrips = tripUpdateLegScope === 'both' ? [tripUpdateModal, ...tripUpdateSiblingTrips] : [tripUpdateModal];

    targetTrips.forEach(targetTrip => {
      const isPrimaryTrip = String(targetTrip?.id || '') === String(tripUpdateModal?.id || '');
      const targetCurrentPickup = normalizeTripTimeDisplay(targetTrip.scheduledPickup || targetTrip.pickup || '');
      const targetCurrentDropoff = normalizeTripTimeDisplay(targetTrip.scheduledDropoff || targetTrip.dropoff || '');
      const targetPickup = isPrimaryTrip ? nextPickup || oldPickup || '' : targetCurrentPickup;
      const targetScheduledPickup = targetPickup;
      const targetDropoff = isPrimaryTrip ? nextDropoff || oldDropoff || '' : targetCurrentDropoff;
      const targetScheduledDropoff = targetDropoff;
      updateTripRecord(targetTrip.id, {
        pickup: targetPickup,
        scheduledPickup: targetScheduledPickup,
        pickupSortValue: isPrimaryTrip ? buildInlineTripTimeSortValue(targetTrip, targetScheduledPickup, routePlans, trips, 'pickupSortValue') : targetTrip.pickupSortValue,
        dropoff: targetDropoff,
        scheduledDropoff: targetScheduledDropoff,
        dropoffSortValue: isPrimaryTrip ? buildInlineTripTimeSortValue(targetTrip, targetScheduledDropoff, routePlans, trips, 'dropoffSortValue') : targetTrip.dropoffSortValue,
        address: nextPickupAddress || targetTrip.address || '',
        destination: nextDropoffAddress || targetTrip.destination || '',
        status: isCancelled ? 'Cancelled' : targetTrip.status,
        notes: [String(targetTrip.notes || '').trim(), ...detailLines].filter(Boolean).join('\n'),
        confirmation: {
          ...(targetTrip.confirmation || {}),
          status: nextConfirmationStatus,
          provider: tripUpdateConfirmMethod,
          respondedAt: isCancelled ? '' : now,
          lastResponseText: isCancelled ? 'Cancelled by patient.' : isSmsLeftUnconfirmed ? 'Could not confirm, SMS left (English).' : isCallLeftMessage ? 'Called and left message.' : isDisconnected ? 'Disconnected.' : `Confirmed via ${methodLabel}`,
          lastResponseCode: getConfirmationMethodCode(tripUpdateConfirmMethod)
        },
        confirmationSignal: buildConfirmationSignalPayload({
          status: nextConfirmationStatus,
          provider: tripUpdateConfirmMethod,
          methodCode: getConfirmationMethodCode(tripUpdateConfirmMethod),
          message: isCancelled ? 'Cancelled by patient.' : isSmsLeftUnconfirmed ? 'Could not confirm, SMS left (English).' : isCallLeftMessage ? 'Called and left message.' : isDisconnected ? 'Disconnected.' : `Confirmed via ${methodLabel}`,
          eventType: 'trip-update'
        })
      });
    });
    setTripUpdateModal(null);
    setTripUpdateLegScope('single');
    setStatusMessage(`Trip ${tripUpdateModal.id} updated.`);
  };

  const handleCancelWithNote = trip => {
    setCancelNoteModal(trip);
    setCancelNoteDraft('');
    setCancelLegScope('single');
  };

  const handleSaveCancelNote = () => {
    if (!cancelNoteModal) return;
    const siblingTrips = getSiblingLegTrips(cancelNoteModal, trips);
    const targetTrips = cancelLegScope === 'both' ? [cancelNoteModal, ...siblingTrips] : [cancelNoteModal];
    const targetTripIds = targetTrips.map(targetTrip => normalizeTripId(targetTrip?.id)).filter(Boolean);
    const cancellationReason = String(cancelNoteDraft || '').trim();

    if (targetTripIds.length === 0) {
      setStatusMessage('No valid trip was found to cancel.');
      return;
    }

    cancelTrips(targetTripIds, {
      source: 'dispatcher-manual',
      reason: cancellationReason || 'Cancelled by dispatcher'
    });

    targetTrips.forEach(targetTrip => {
      applyTripConfirmationState(targetTrip, {
        status: 'Cancelled',
        provider: 'manual',
        methodCode: 'X',
        message: 'Cancelled by dispatcher',
        eventType: 'cancel',
        noteLine: `[CANCELLED] ${new Date().toLocaleString()}: ${cancellationReason || 'Cancelled in Trip Dashboard.'}`
      });
    });
    setCancelNoteModal(null);
    setCancelNoteDraft('');
    setStatusMessage(`${targetTrips.length} trip(s) cancelled.`);
  };

  const handleToggleTripBlock = async trip => {
    const blockingState = tripBlockingMap.get(trip.id) || getTripBlockingState({
      trip,
      optOutList,
      blacklistEntries,
      defaultCountryCode: smsData?.sms?.defaultCountryCode,
      tripDateKey: getTripTimelineDateKey(trip, routePlans, trips)
    });
    if (blockingState.blacklistEntry) {
      const shouldUnblock = window.confirm(`Remove ${trip.rider || 'this patient'} from Black List?`);
      if (!shouldUnblock) return;
      const nextEntries = blacklistEntries.map(entry => entry.id === blockingState.blacklistEntry.id ? {
        ...entry,
        status: 'Resolved',
        updatedAt: new Date().toISOString()
      } : entry);
      await saveBlacklistData({
        version: blacklistData?.version ?? 1,
        entries: nextEntries
      });
      applyTripConfirmationState(trip, {
        status: 'Not Sent',
        provider: '',
        methodCode: 'UB',
        message: 'Removed from Black List by dispatcher',
        eventType: 'unblock'
      });
      setStatusMessage('Passenger removed from Black List.');
      return;
    }
    if (blockingState.optOutEntry) {
      await saveSmsData({
        sms: {
          ...(smsData?.sms || {}),
          optOutList: optOutList.filter(entry => entry.id !== blockingState.optOutEntry.id)
        }
      });
      applyTripConfirmationState(trip, {
        status: 'Not Sent',
        provider: '',
        methodCode: 'UB',
        message: 'Unblocked by dispatcher',
        eventType: 'unblock'
      });
      setStatusMessage('Passenger removed from temporary do-not-confirm list.');
      return;
    }
    handleOpenBlacklistModal(trip);
  };

  const handleSendConfirmation = async () => {
    if (!confirmationMethodModal || confirmationMethodModal.length === 0) {
      setStatusMessage('No trips selected for confirmation.');
      return;
    }
    if (confirmationRequiresLegChoice && !confirmationLegScope) {
      setStatusMessage('Choose one leg or both legs before confirming.');
      return;
    }
    const targetTrips = confirmationSourceTrip && confirmationLegScope === 'both' ? Array.from(new Map([confirmationSourceTrip, ...confirmationSiblingTrips].map(item => [item.id, item])).values()) : confirmationMethodModal;
    setIsSendingConfirmation(true);
    try {
      if (confirmationMethod === 'whatsapp') {
        const message = `CONFIRMATION REQUEST\n\nTrips to confirm:\n${targetTrips.map(buildTripConfirmationLine).join('\n')}\n\nPlease confirm receipt.`;
        const firstTripWithPhone = targetTrips.find(trip => trip.patientPhoneNumber);
        if (firstTripWithPhone) {
          const whatsappResult = openWhatsAppConversation({
            phoneNumber: firstTripWithPhone.patientPhoneNumber,
            message
          });
          if (!whatsappResult.ok && whatsappResult.reason === 'popup-blocked') {
            setStatusMessage('Browser blocked WhatsApp popup. Allow pop-ups for this page.');
          }
        }
        for (const trip of targetTrips) {
          if (trip.patientPhoneNumber) {
            await fetch('/api/extensions/send-message', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                method: 'whatsapp',
                phoneNumber: trip.patientPhoneNumber,
                message: `Hi ${trip.rider}, this is your confirmation detail: ${buildTripConfirmationLine(trip)}.`
              })
            });
          }
          applyTripConfirmationState(trip, {
            status: 'Confirmed',
            provider: 'whatsapp',
            methodCode: 'W',
            message: 'Confirmed via WhatsApp',
            eventType: 'confirm-whatsapp'
          });
        }
      } else if (confirmationMethod === 'sms') {
        const response = await fetch('/api/integrations/sms/send-confirmation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tripIds: targetTrips.map(trip => trip.id),
            selectedColumns: TRIP_CONFIRMATION_OUTPUT_COLUMNS
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || 'Failed to send SMS confirmation');
        targetTrips.forEach(trip => {
          applyTripConfirmationState(trip, {
            status: 'Confirmed',
            provider: 'sms',
            methodCode: 'S',
            message: 'Confirmed via SMS',
            eventType: 'confirm-sms'
          });
        });
      } else {
        targetTrips.forEach(trip => {
          applyTripConfirmationState(trip, {
            status: 'Confirmed',
            provider: 'call',
            methodCode: 'C',
            message: 'Confirmed via Call',
            eventType: 'confirm-call'
          });
        });
      }
      await refreshDispatchState({ forceServer: true });
      handleCloseConfirmationMethod();
      setStatusMessage(`${targetTrips.length} trip(s) confirmed.`);
    } catch (error) {
      setStatusMessage(error?.message || 'Could not send confirmation.');
    } finally {
      setIsSendingConfirmation(false);
    }
  };

  useEffect(() => {
    if (!selectedRouteId) return;
    if (filteredRoutePlans.some(routePlan => routePlan.id === selectedRouteId)) return;
    setSelectedRouteId('');
  }, [filteredRoutePlans, selectedRouteId, setSelectedRouteId]);

  useEffect(() => {
    if (!activeDateTripIdSet) return;
    const selectedIds = selectedTripIds.map(id => String(id || '').trim()).filter(Boolean);
    const prunedSelectedIds = selectedIds.filter(id => activeDateTripIdSet.has(id));
    if (prunedSelectedIds.length !== selectedIds.length) {
      setSelectedTripIds(prunedSelectedIds);
    }
  }, [activeDateTripIdSet, selectedTripIds, setSelectedTripIds]);

  useEffect(() => {
    const fallbackAnchorTrip = aiPlanningScopeTrips[0] ?? null;
    if (!fallbackAnchorTrip) {
      setAiPlannerAnchorTripId('');
      setAiPlannerPreview(null);
      return;
    }

    if (!aiPlanningScopeTrips.some(trip => trip.id === aiPlannerAnchorTripId)) {
      setAiPlannerAnchorTripId(fallbackAnchorTrip.id);
    }
  }, [aiPlannerAnchorTripId, aiPlanningScopeTrips]);

  useEffect(() => {
    if (!aiPlannerAnchorTrip) return;

    const fallbackZip = getPickupZip(aiPlannerAnchorTrip) || getDropoffZip(aiPlannerAnchorTrip) || '';
    if (!aiPlannerStartZip || (aiPlannerZipOptions.length > 0 && !aiPlannerZipOptions.includes(aiPlannerStartZip))) {
      setAiPlannerStartZip(fallbackZip);
    }

    if (!aiPlannerCutoffTime) {
      setAiPlannerCutoffTime(getSuggestedPlannerCutoffTime(aiPlannerAnchorTrip));
    }
  }, [aiPlannerAnchorTrip, aiPlannerCutoffTime, aiPlannerStartZip, aiPlannerZipOptions]);

  useEffect(() => {
    setAiPlannerPreview(currentPreview => {
      if (!currentPreview?.plan) return null;
      if (currentPreview?.serviceDate && currentPreview.serviceDate !== tripDateFilter) return null;
      if (currentPreview?.focusDriverId && selectedDriverId && currentPreview.focusDriverId !== selectedDriverId) return null;
      return currentPreview;
    });
  }, [selectedDriverId, tripDateFilter]);

  const handleOpenTripNote = trip => {
    setNoteModalTripId(trip.id);
    setNoteDraft(getTripDispatchNoteText(trip));
    setTripEditDraft(buildTripEditDraft(trip));
  };

  const handleOpenTripExcelCompare = (trip, event) => {
    event?.stopPropagation?.();

    const resolvedTrip = liveAnnotatedFilteredTripMap.get(String(trip?.id || '').trim()) || trips.find(currentTrip => currentTrip.id === trip?.id) || trip;
    if (!getTripExcelLoaderSnapshot(resolvedTrip)) {
      showNotification({ message: 'Excel Loader snapshot is not available for this trip.', variant: 'warning' });
      return;
    }

    setTripExcelCompareModalId(resolvedTrip.id);
    setTripExcelCompareModalFallbackTrip(resolvedTrip);
  };

  const handleCloseTripNote = () => {
    setNoteModalTripId(null);
    setNoteDraft('');
    setTripEditDraft(buildTripEditDraft(null));
  };

  const handleCloseTripExcelCompare = () => {
    setTripExcelCompareModalId(null);
    setTripExcelCompareModalFallbackTrip(null);
  };

  const handleShiftTripDate = offsetDays => {
    const baseDate = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
    const nextDate = shiftTripDateKey(baseDate, offsetDays);
    if (nextDate) setTripDateFilter(nextDate);
  };

  const handleSaveTripNote = () => {
    if (!noteModalTrip) return;
    const importedNotes = getTripImportedNoteText(noteModalTrip);
    const dispatchNotes = String(noteDraft || '').trim();
    updateTripRecord(noteModalTrip.id, {
      dispatchNotes,
      notes: getUniqueNoteBlocks([importedNotes, dispatchNotes]).join('\n\n'),
      scheduledPickup: tripEditDraft.scheduledPickup,
      actualPickup: tripEditDraft.actualPickup,
      scheduledDropoff: tripEditDraft.scheduledDropoff,
      actualDropoff: tripEditDraft.actualDropoff,
      delay: tripEditDraft.delay,
      lateMinutes: tripEditDraft.delay,
      onTimeStatus: tripEditDraft.onTimeStatus
    });
    setStatusMessage(`Punctuality and note saved for ${getDisplayTripId(noteModalTrip)}.`);
    handleCloseTripNote();
  };

  const handleCloneTrip = trip => {
    if (!trip) return;
    const clonedTripId = cloneTripRecord(trip.id);
    if (!clonedTripId) {
      setStatusMessage(`Unable to clone ${getDisplayTripId(trip)}.`);
      return;
    }
    setTripStatusFilter('all');
    setSelectedTripIds([clonedTripId]);
    setSelectedDriverId(null);
    setSelectedRouteId(null);
    setStatusMessage(`Trip ${getDisplayTripId(trip)} cloned as ${clonedTripId}.`);
  };

  const handleDeleteTrip = trip => {
    if (!trip?.id) return;
    const tripLabel = getDisplayTripId(trip);
    const confirmed = window.confirm(`Delete trip ${tripLabel}? This will remove it from the dashboard and any route that contains it.`);
    if (!confirmed) return;

    deleteTripRecord(trip.id);

    if (noteModalTripId === trip.id) {
      handleCloseTripNote();
    }

    if (tripExcelCompareModalId === trip.id) {
      handleCloseTripExcelCompare();
    }

    setSelectedRouteId(null);
    setStatusMessage(`Trip ${tripLabel} deleted.`);
    showNotification({ message: `Trip ${tripLabel} deleted.`, variant: 'success' });
  };

  const isInlineTripCellEditing = (tripId, columnKey) => inlineTripEditCell?.tripId === tripId && inlineTripEditCell?.columnKey === columnKey;

  const handleStartInlineTripEdit = (trip, columnKey) => {
    if (!trip || !INLINE_EDITABLE_TRIP_COLUMNS.has(columnKey)) return;
    setInlineTripEditCell({
      tripId: trip.id,
      columnKey
    });
    setInlineTripEditValue(getInlineEditableTripValue(trip, columnKey));
  };

  const handleCancelInlineTripEdit = () => {
    setInlineTripEditCell(null);
    setInlineTripEditValue('');
  };

  const handleSaveInlineTripEdit = trip => {
    if (!trip || !inlineTripEditCell?.columnKey) return;
    const currentValue = String(getInlineEditableTripValue(trip, inlineTripEditCell.columnKey) || '').trim();
    const nextValue = String(inlineTripEditValue ?? '').trim();
    if (currentValue === nextValue) {
      handleCancelInlineTripEdit();
      return;
    }

    const updates = buildInlineTripUpdatePayload({
      trip,
      columnKey: inlineTripEditCell.columnKey,
      value: nextValue,
      routePlans,
      trips
    });
    if (!updates) {
      handleCancelInlineTripEdit();
      return;
    }

    updateTripRecord(trip.id, updates);
    setStatusMessage(`${getDisplayTripId(trip)} updated in ${inlineTripEditCell.columnKey}.`);
    handleCancelInlineTripEdit();
  };

  const renderInlineEditableTripCell = ({ trip, columnKey, displayValue, cellStyle, displayStyle, inputType = 'text', placeholder = '', errorDetail = '' }) => {
    const isEditing = isInlineTripCellEditing(trip.id, columnKey);
    return <td
      style={{
        ...cellStyle,
        cursor: 'text'
      }}
      onDoubleClick={() => handleStartInlineTripEdit(trip, columnKey)}
      title={errorDetail ? `${errorDetail} • Double-click to edit` : 'Double-click to edit'}
    >
      {isEditing ? <Form.Control
        size="sm"
        type={inputType}
        autoFocus
        value={inlineTripEditValue}
        placeholder={placeholder}
        onChange={event => setInlineTripEditValue(event.target.value)}
        onBlur={() => handleSaveInlineTripEdit(trip)}
        onClick={stopInputEventPropagation}
        onDoubleClick={stopInputEventPropagation}
        onKeyDown={event => {
          stopInputEventPropagation(event);
          if (event.key === 'Enter') {
            event.preventDefault();
            handleSaveInlineTripEdit(trip);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            handleCancelInlineTripEdit();
          }
        }}
      /> : <span style={{
        borderBottom: '1px dashed rgba(107, 114, 128, 0.5)',
        display: 'inline-block',
        ...displayStyle
      }}>{displayValue || '-'}</span>}
    </td>;
  };

  const groupedFilteredTripRows = useMemo(() => {
    const compareTrips = (leftTrip, rightTrip) => {
      if (tripOrderMode === 'custom') {
        const leftValue = normalizeSortValue(getTripSortValue(leftTrip, tripSort.key, getDriverName));
        const rightValue = normalizeSortValue(getTripSortValue(rightTrip, tripSort.key, getDriverName));
        const customResult = compareNormalizedTripSortValues(leftValue, rightValue, tripSort.direction);
        if (customResult !== 0) return customResult;
      } else {
        const leftAssignedToSelectedDriver = isTripAssignedToDriver(leftTrip, selectedDriverId) ? 1 : 0;
        const rightAssignedToSelectedDriver = isTripAssignedToDriver(rightTrip, selectedDriverId) ? 1 : 0;
        if (leftAssignedToSelectedDriver !== rightAssignedToSelectedDriver) return rightAssignedToSelectedDriver - leftAssignedToSelectedDriver;
      }

      if (tripOrderMode === 'time') {
        const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        if (leftTime !== rightTime) return leftTime - rightTime;
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

    const buildGroupedRows = (trips, sectionKey = 'all') => {
      const groups = trips.reduce((map, trip) => {
        const pickupMinutes = parseTripClockMinutes(getEffectiveTimeText(trip?.scheduledPickup, trip?.pickup));
        const hasTime = Number.isFinite(pickupMinutes);
        const bucketHour = hasTime ? Math.floor(pickupMinutes / 60) : null;
        const bucketLabel = hasTime ? `${String(bucketHour).padStart(2, '0')}:00` : 'No Time';
        const bucketSort = hasTime ? bucketHour : Number.MAX_SAFE_INTEGER;
        if (!map.has(bucketLabel)) {
          map.set(bucketLabel, {
            groupKey: bucketLabel,
            groupSort: bucketSort,
            trips: []
          });
        }
        map.get(bucketLabel).trips.push(trip);
        return map;
      }, new Map());
      return Array.from(groups.values())
        .map(group => ({ ...group, trips: [...group.trips].sort(compareTrips) }))
        .sort((leftGroup, rightGroup) => {
          if (leftGroup.groupSort !== rightGroup.groupSort) return leftGroup.groupSort - rightGroup.groupSort;
          return compareTrips(leftGroup.trips[0], rightGroup.trips[0]);
        })
        .flatMap(group => {
          const rowGroupKey = `${sectionKey}-${group.groupKey}`;
          return [
            {
              type: 'group',
              groupKey: rowGroupKey,
              ridesCount: group.trips.length,
              label: group.trips.length > 1 ? `Hour ${group.groupKey} \u2022 ${group.trips.length} rides` : `Hour ${group.groupKey} \u2022 1 ride`
            },
            ...group.trips.map(trip => ({ type: 'trip', groupKey: rowGroupKey, trip }))
          ];
        });
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

    if (tripOrderMode === 'custom') {
      return sortedTrips.map(trip => ({ type: 'trip', groupKey: 'custom-flat', trip }));
    }

    if (tripDateFilter === 'all') {
      return buildGroupedRows(sortedTrips, 'all');
    }

    if (happenedTrips.length > 0) {
      rows.push({ type: 'section', key: 'happened', label: selectedDateIsPast ? 'What Happened On This Day' : 'Already Happened' });
      rows.push(...buildGroupedRows(happenedTrips, 'happened'));
    }

    if (upcomingTrips.length > 0) {
      rows.push({ type: 'section', key: 'upcoming', label: selectedDateIsFuture ? 'What Will Happen On This Day' : 'Still Pending / Will Happen' });
      rows.push(...buildGroupedRows(upcomingTrips, 'upcoming'));
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

  const tripTableColumnCount = orderedVisibleTripColumns.length + 2 + (showConfirmationTools ? 1 : 0);

  const handleToggleConfirmationTools = () => {
    setShowConfirmationTools(current => {
      const nextValue = !current;
      if (!nextValue) handleCloseConfirmationMethod();
      setStatusMessage(nextValue ? 'Confirmation mode enabled.' : 'Confirmation mode hidden.');
      return nextValue;
    });
  };

  useEffect(() => {
    if (!hasLoadedUserUiPreferences) return;
    if (visibleTripColumns.includes('mobility')) return;
    setDispatcherVisibleTripColumns([...visibleTripColumns, 'mobility']);
  }, [hasLoadedUserUiPreferences, setDispatcherVisibleTripColumns, visibleTripColumns]);

  const handleToggleTripColumn = columnKey => {
    const nextColumns = orderedVisibleTripColumns.includes(columnKey) ? orderedVisibleTripColumns.filter(item => item !== columnKey) : [...orderedVisibleTripColumns, columnKey];
    if (nextColumns.length === 0) {
      setStatusMessage('At least one column must remain visible.');
      return;
    }
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage('Column view updated.');
  };

  const handleShowAllTripColumns = () => {
    setDispatcherVisibleTripColumns(allTripColumnKeys);
    setStatusMessage('All trip columns are now visible.');
  };

  const handleResetTripColumns = () => {
    setDispatcherVisibleTripColumns(DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS);
    setStatusMessage('Trip columns reset to default view.');
  };

  const handleTripColumnDrop = targetColumnKey => {
    if (!draggingTripColumnKey || draggingTripColumnKey === targetColumnKey) return;
    const sourceIndex = orderedVisibleTripColumns.indexOf(draggingTripColumnKey);
    const targetIndex = orderedVisibleTripColumns.indexOf(targetColumnKey);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const nextColumns = [...orderedVisibleTripColumns];
    const [movedColumn] = nextColumns.splice(sourceIndex, 1);
    nextColumns.splice(targetIndex, 0, movedColumn);
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage(`Column order saved: ${draggingTripColumnKey} moved.`);
  };

  const handleTripSelectionToggle = tripId => {
    toggleTripSelection(tripId);
  };

  const handleAssignTrip = tripId => {
    if (!selectedDriverId) {
      setStatusMessage('Select a driver first to assign this trip.');
      return;
    }
    const driver = drivers.find(item => String(item?.id || '').trim() === String(selectedDriverId || '').trim()) || null;
    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: [tripId], trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      showNotification({ message: compatibilityIssue.message, variant: 'danger' });
      return;
    }
    const blockedTrips = countDriverBlockedTrips(driver, [tripId]);
    if (blockedTrips > 0) {
      const message = `${driver.name} has ${getDriverTimeOffLabelForUi(driver)}. Trip ${tripId} cannot be assigned on that date.`;
      setStatusMessage(message);
      showNotification({ message, variant: 'warning' });
      return;
    }
    assignTripsToDriver(selectedDriverId, [tripId]);
    setSelectedTripIds([tripId]);
    setStatusMessage(`Trip ${tripId} assigned.`);
  };

  const handleUnassignTrip = tripId => {
    unassignTrips([tripId]);
    setSelectedTripIds(currentIds => currentIds.filter(id => id !== tripId));
    setStatusMessage(`Trip ${tripId} unassigned.`);
  };

  const openCancelModalForTrips = tripIds => {
    const normalizedTripIds = (Array.isArray(tripIds) ? tripIds : []).map(normalizeTripId).filter(Boolean);
    if (normalizedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to cancel.');
      return;
    }
    setCancelTripIds(normalizedTripIds);
    setCancelReasonDraft('');
    setShowCancelModal(true);
  };

  const handleCloseCancelModal = () => {
    setShowCancelModal(false);
    setCancelTripIds([]);
    setCancelReasonDraft('');
  };

  const handleConfirmCancelTrips = () => {
    const targetTripIds = cancelTripIds.map(normalizeTripId).filter(Boolean);
    if (targetTripIds.length === 0) {
      setStatusMessage('Select at least one trip to cancel.');
      handleCloseCancelModal();
      return;
    }

    try {
      const targetTripIdSet = new Set(targetTripIds);
      const cancellationReason = String(cancelReasonDraft || '').trim();
      setSelectedTripIds(currentIds => currentIds.map(normalizeTripId).filter(id => id && !targetTripIdSet.has(id)));
      setSelectedRouteId(currentRouteId => {
        if (!currentRouteId) return currentRouteId;
        const currentRoute = routePlans.find(routePlan => routePlan.id === currentRouteId);
        if (!currentRoute) return null;
        const remainingTripIds = (Array.isArray(currentRoute.tripIds) ? currentRoute.tripIds : []).map(normalizeTripId).filter(id => id && !targetTripIdSet.has(id));
        return remainingTripIds.length > 0 ? currentRouteId : null;
      });
      cancelTrips(targetTripIds, {
        source: 'dispatcher-manual',
        reason: cancellationReason || 'Cancelled by dispatcher'
      });
      setStatusMessage(`${targetTripIds.length} trip(s) cancelled.`);
    } catch {
      setStatusMessage('No se pudieron cancelar los trips seleccionados. Intenta refrescar y volver a intentar.');
    } finally {
      handleCloseCancelModal();
    }
  };

  const handleCancelTrip = tripId => {
    const normalizedTripId = normalizeTripId(tripId);
    if (!normalizedTripId) {
      setStatusMessage('Trip invalido para cancelar.');
      return;
    }

    openCancelModalForTrips([normalizedTripId]);
  };

  const handleCancelSelectedTrips = () => {
    const targetTripIds = selectedTripIds.map(normalizeTripId).filter(Boolean);
    if (targetTripIds.length === 0) {
      setStatusMessage('Select at least one trip to cancel.');
      return;
    }

    openCancelModalForTrips(targetTripIds);
  };

  const handleReinstateTrip = tripId => {
    reinstateTrips([tripId]);
    setStatusMessage(`Trip ${tripId} reinstated.`);
  };

  const handleReinstateSelectedTrips = () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Select at least one trip to reinstate.');
      return;
    }
    reinstateTrips(selectedTripIds);
    setStatusMessage(`${selectedTripIds.length} trip(s) reinstated.`);
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

  const handleDriverSortChange = columnKey => {
    setDriverSort(currentSort => currentSort.key === columnKey ? {
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
      setStatusMessage(nextMode === 'time' ? 'Trips sorted by time.' : 'Trips in original order.');
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

  const tripHeaderCellStyle = {
    paddingTop: '0.22rem',
    paddingBottom: '0.22rem',
    lineHeight: 1.02,
    fontSize: '0.76rem',
    backgroundColor: tripTableHeaderStyle.backgroundColor,
    color: tripTableHeaderStyle.color,
    borderBottom: tripTableHeaderStyle.borderBottom
  };

  const renderTripHeader = (columnKey, label, width, sortable = true, draggableColumn = false) => {
    const resolvedWidth = columnWidths[columnKey] ?? width;
    return <th
      draggable={draggableColumn}
      onDragStart={draggableColumn ? event => {
        event.dataTransfer.setData('text/plain', columnKey);
        event.dataTransfer.effectAllowed = 'move';
        setDraggingTripColumnKey(columnKey);
      } : undefined}
      onDragOver={draggableColumn ? event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      } : undefined}
      onDrop={draggableColumn ? event => {
        event.preventDefault();
        handleTripColumnDrop(columnKey);
        setDraggingTripColumnKey('');
      } : undefined}
      onDragEnd={draggableColumn ? () => setDraggingTripColumnKey('') : undefined}
      style={resolvedWidth ? {
        ...tripHeaderCellStyle,
        width: resolvedWidth,
        minWidth: resolvedWidth,
        maxWidth: resolvedWidth,
        position: 'relative',
        cursor: draggableColumn ? 'grab' : undefined,
        opacity: draggingTripColumnKey === columnKey ? 0.72 : 1
      } : {
        ...tripHeaderCellStyle,
        position: 'relative',
        cursor: draggableColumn ? 'grab' : undefined,
        opacity: draggingTripColumnKey === columnKey ? 0.72 : 1
      }}>
      {sortable ? <button type="button" onClick={() => handleTripSortChange(columnKey)} className="btn btn-link text-decoration-none text-reset p-0 d-inline-flex align-items-center gap-1 fw-semibold">
          <span>{label}</span>
          <span className="small">{tripSort.key === columnKey ? tripSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
        </button> : <span className="fw-semibold">{label}</span>}
      <span role="presentation" onMouseDown={event => handleColumnResizeStart(event, columnKey)} style={{
        position: 'absolute',
        top: 0,
        right: -5,
        width: 10,
        height: '100%',
        cursor: 'col-resize',
        background: 'linear-gradient(180deg, rgba(90,108,98,0) 0%, rgba(90,108,98,0.2) 30%, rgba(90,108,98,0.2) 70%, rgba(90,108,98,0) 100%)'
      }} />
    </th>;
  };

  const renderDriverHeader = (columnKey, label) => <th className="py-1" style={{ backgroundColor: '#198754', color: '#fff', whiteSpace: columnKey === 'vehicle' ? 'normal' : 'nowrap' }}>
      <div className="d-flex flex-column gap-1">
        <button type="button" onClick={() => handleDriverSortChange(columnKey)} className="btn btn-link text-decoration-none p-0 d-inline-flex align-items-center gap-1" style={{ color: '#fff', fontWeight: 700, justifyContent: 'flex-start' }}>
          <span>{label}</span>
          <span className="small">{driverSort.key === columnKey ? driverSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
        </button>
        {columnKey === 'vehicle' ? <div className="d-flex flex-wrap gap-1">
            {GROUPING_SERVICE_TYPE_OPTIONS.map(filterKey => {
          const active = driverVehicleCapabilityFilters.includes(filterKey);
          return <button key={filterKey} type="button" className="btn btn-sm py-0 px-1" onClick={() => setDriverVehicleCapabilityFilters(current => current.includes(filterKey) ? current.filter(item => item !== filterKey) : [...current, filterKey])} style={{ fontSize: '0.66rem', lineHeight: 1.2, borderColor: active ? '#ffffff' : 'rgba(255,255,255,0.35)', backgroundColor: active ? '#ffffff' : 'transparent', color: active ? '#198754' : '#ffffff', minWidth: filterKey === 'Walker' ? 44 : 28 }}>
                {filterKey}
              </button>;
        })}
          </div> : null}
      </div>
    </th>;

  const handleDriverSelectionChange = nextDriverId => {
    setSelectedDriverId(nextDriverId);
    setSelectedRouteId('');

    if (!nextDriverId) {
      setStatusMessage('Showing all trips again.');
      return;
    }

    const driver = drivers.find(item => item.id === nextDriverId);
    if (!driver) {
      setStatusMessage('Driver not found.');
      return;
    }

    const assignedCount = trips.filter(trip => trip.driverId === nextDriverId || trip.secondaryDriverId === nextDriverId).length;
    const openCount = trips.filter(trip => !trip.driverId && !trip.secondaryDriverId).length;
    const appointmentNote = getDriverTimeOffDateForUi(driver) ? ` ${driver.name} has ${getDriverTimeOffLabelForUi(driver)}.` : '';
    setStatusMessage(`Viewing ${driver.name}: ${assignedCount} assigned and ${openCount} pending.${appointmentNote}`);
  };

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(currentIds => Array.from(new Set([...currentIds.map(normalizeTripId).filter(Boolean), ...visibleTripIds])));
      setStatusMessage('Visible trips selected.');
      return;
    }

    setSelectedTripIds(currentIds => currentIds.map(normalizeTripId).filter(id => id && !visibleTripIds.includes(id)));
    setStatusMessage('Visible trips deselected.');
  };

  const handleCreateRoute = () => {
    if (!routeName.trim()) {
      setStatusMessage('Enter a name for the route.');
      return;
    }
    if (!selectedDriverId) {
      setStatusMessage('Select a driver for the route.');
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
    setStatusMessage('Route created and synced with dispatcher.');
    showNotification({
      message: 'Route created and synced with dispatcher.',
      variant: 'success'
    });
    setRouteName('');
    setRouteNotes('');
  };

  const handlePreviewAiSmartRoute = async providerMode => {
    if (!selectedDriverId) {
      setStatusMessage('Select a driver first.');
      return;
    }
    if (tripDateFilter === 'all') {
      setStatusMessage('Select a specific work day first.');
      return;
    }
    if (!aiPlannerAnchorTripId) {
      setStatusMessage('Select the anchor trip for the smart route.');
      return;
    }
    if (!aiPlannerCutoffTime) {
      setStatusMessage('Select the route cutoff time.');
      return;
    }
    if (aiPlanningScopeTrips.length === 0) {
      setStatusMessage('No trips are available in the pool with current filters.');
      return;
    }

  setAiPlannerMode(providerMode);
    setAiPlannerLoading(true);
    try {
      const response = await fetch('/api/assistant/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pathname: '/trip-dashboard',
          providerMode,
          message: `trip dashboard smart route ${tripDateFilter}`,
          actionRequest: {
            type: 'build-route-plan-from-selection',
            params: {
              serviceDate: tripDateFilter,
              driverId: selectedDriverId,
              anchorTripId: aiPlannerAnchorTripId,
              candidateTripIds: aiPlanningScopeTrips.map(trip => trip.id),
              startZip: aiPlannerStartZip,
              cutoffTime: aiPlannerCutoffTime,
              maxTripCount: Number.parseInt(aiPlannerMaxTrips, 10) || null,
              maxLateMinutes: Number.parseInt(aiPlannerLateToleranceMinutes, 10) || 0
            }
          }
        })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Could not build route preview.');
      setAiPlannerPreview(payload?.action || null);
      const previewTripIds = Array.isArray(payload?.action?.plan?.routes?.[0]?.tripIds) ? payload.action.plan.routes[0].tripIds : [];
      if (previewTripIds.length > 0) {
        setSelectedTripIds(previewTripIds);
        setShowRoute(true);
      }
      setStatusMessage(String(payload?.reply || 'Smart route preview ready.'));
      showNotification({
        message: String(payload?.reply || 'Smart route preview ready.'),
        variant: 'success'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not build route preview.';
      setStatusMessage(message);
      showNotification({ message, variant: 'error' });
    } finally {
      setAiPlannerLoading(false);
    }
  };

  const handleAddAiPlannerRoutePair = () => {
    const pickupCity = aiPlannerRoutePairPickupCity.trim();
    const dropoffCity = aiPlannerRoutePairDropoffCity.trim();
    if (!pickupCity || !dropoffCity) {
      setStatusMessage('Select an origin city and a destination city to add a route pair.');
      return;
    }
    const pairKey = buildAiPlannerRoutePairKey(pickupCity, dropoffCity);
    setAiPlannerRoutePairs(currentPairs => currentPairs.includes(pairKey) ? currentPairs : [...currentPairs, pairKey]);
    setStatusMessage(`Route ${pickupCity} -> ${dropoffCity} added to planner.`);
  };

  const handleRemoveAiPlannerRoutePair = pairKey => {
    setAiPlannerRoutePairs(currentPairs => currentPairs.filter(currentPair => currentPair !== pairKey));
  };

  const handleClearAiPlannerRoutePairs = () => {
    setAiPlannerRoutePairs([]);
    setStatusMessage('Planner city pairs cleared.');
  };

  const handleApplyAiSmartRoute = async () => {
    if (!aiPlannerPreview?.plan) {
      setStatusMessage('Create a smart route preview first.');
      return;
    }

    setAiPlannerLoading(true);
    try {
      const response = await fetch('/api/assistant/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pathname: '/trip-dashboard',
          providerMode: aiPlannerMode,
          message: `apply smart route ${tripDateFilter}`,
          actionRequest: {
            ...aiPlannerPreview,
            type: 'apply-route-plan'
          }
        })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Could not apply smart route.');

      const appliedTripIds = Array.isArray(payload?.action?.plan?.routes?.[0]?.tripIds) ? payload.action.plan.routes[0].tripIds : [];
      await refreshDispatchState({ forceServer: true });
      setAiPlannerPreview(null);
      if (payload?.action?.serviceDate) setTripDateFilter(String(payload.action.serviceDate));
      if (payload?.action?.focusDriverId) setSelectedDriverId(String(payload.action.focusDriverId));
      if (appliedTripIds.length > 0) setSelectedTripIds(appliedTripIds);
      window.dispatchEvent(new CustomEvent('nemt-assistant-action', { detail: payload.action }));
      setStatusMessage(String(payload?.reply || 'Smart route applied.'));
      showNotification({
        message: String(payload?.reply || 'Smart route applied.'),
        variant: 'success'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not apply smart route.';
      setStatusMessage(message);
      showNotification({ message, variant: 'error' });
    } finally {
      setAiPlannerLoading(false);
    }
  };

  const handleClearAiPlannerPreview = () => {
    setAiPlannerPreview(null);
    setStatusMessage('Smart route preview cleared.');
  };

  const handleAssign = driverId => {
    const targetTripIds = [...selectedTripIds];
    if (!driverId || targetTripIds.length === 0) {
      setStatusMessage('Select a driver and at least one trip.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(driverId || '').trim()) || null;
    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: targetTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      showNotification({ message: compatibilityIssue.message, variant: 'danger' });
      return;
    }
    const blockedTrips = countDriverBlockedTrips(driver, targetTripIds);
    if (blockedTrips > 0) {
      const message = `${driver.name} has ${getDriverTimeOffLabelForUi(driver)}. ${blockedTrips} selected trip(s) on that date cannot be assigned.`;
      setStatusMessage(message);
      showNotification({ message, variant: 'warning' });
      return;
    }

    assignTripsToDriver(driverId, targetTripIds);
    removeTripIdsFromSelection(targetTripIds);
    setStatusMessage('Trips assigned to selected driver.');
  };

  const handleAssignSecondary = driverId => {
    const targetTripIds = [...selectedTripIds];
    if (!driverId || targetTripIds.length === 0) {
      setStatusMessage('Select a secondary driver and at least one trip.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(driverId || '').trim()) || null;
    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: targetTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      showNotification({ message: compatibilityIssue.message, variant: 'danger' });
      return;
    }
    const blockedTrips = countDriverBlockedTrips(driver, targetTripIds);
    if (blockedTrips > 0) {
      const message = `${driver.name} has ${getDriverTimeOffLabelForUi(driver)}. ${blockedTrips} selected trip(s) on that date cannot be assigned there.`;
      setStatusMessage(message);
      showNotification({ message, variant: 'warning' });
      return;
    }

    assignTripsToSecondaryDriver(driverId, targetTripIds);
    removeTripIdsFromSelection(targetTripIds);
    setStatusMessage('Trips updated with secondary driver.');
  };

  const handleRoutePanelReassign = () => {
    const targetTripIds = [...selectedRoutePanelTripIds];
    if (!selectedDriverId || targetTripIds.length === 0) {
      setStatusMessage('Select a driver and at least one trip from the route table.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(selectedDriverId || '').trim()) || null;
    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: targetTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      showNotification({ message: compatibilityIssue.message, variant: 'danger' });
      return;
    }
    const blockedTrips = countDriverBlockedTrips(driver, targetTripIds);
    if (blockedTrips > 0) {
      const message = `${driver.name} has ${getDriverTimeOffLabelForUi(driver)}. ${blockedTrips} selected trip(s) on that date cannot be assigned there.`;
      setStatusMessage(message);
      showNotification({ message, variant: 'warning' });
      return;
    }

    assignTripsToDriver(selectedDriverId, targetTripIds);
    removeTripIdsFromSelection(targetTripIds);
    setStatusMessage(`Reassigned ${targetTripIds.length} trip(s) to selected driver.`);
  };

  const handleRoutePanelAssignSecondary = () => {
    const targetTripIds = [...selectedRoutePanelTripIds];
    if (!selectedSecondaryDriverId || targetTripIds.length === 0) {
      setStatusMessage('Select a secondary driver and at least one trip from the route table.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(selectedSecondaryDriverId || '').trim()) || null;
    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: targetTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      showNotification({ message: compatibilityIssue.message, variant: 'danger' });
      return;
    }
    const blockedTrips = countDriverBlockedTrips(driver, targetTripIds);
    if (blockedTrips > 0) {
      const message = `${driver.name} has ${getDriverTimeOffLabelForUi(driver)}. ${blockedTrips} selected trip(s) on that date cannot be assigned there.`;
      setStatusMessage(message);
      showNotification({ message, variant: 'warning' });
      return;
    }

    assignTripsToSecondaryDriver(selectedSecondaryDriverId, targetTripIds);
    removeTripIdsFromSelection(targetTripIds);
    setStatusMessage(`Added secondary driver to ${targetTripIds.length} trip(s).`);
  };

  const handleRoutePanelUnassign = () => {
    const targetTripIds = [...selectedRoutePanelTripIds];
    if (targetTripIds.length === 0) {
      setStatusMessage('Select at least one trip from the route table.');
      return;
    }

    unassignTrips(targetTripIds);
    setStatusMessage(`Unassigned ${targetTripIds.length} trip(s).`);
  };

  const handleUnassign = () => {
    const targetTripIds = [...selectedTripIds];
    if (targetTripIds.length === 0) {
      setStatusMessage('Select at least one trip to remove assignment.');
      return;
    }

    unassignTrips(targetTripIds);
    setStatusMessage('Trips unassigned.');
  };

  const handleLoadRoute = routeId => {
    const route = routePlans.find(item => item.id === routeId);
    if (!route) return;
    setSelectedRouteId(routeId);
    setSelectedDriverId(route.driverId);
    setSelectedTripIds(route.tripIds);
    setStatusMessage(`Route ${route.name} loaded.`);
  };

  const handleToggleRoutePrintColumn = columnKey => {
    const normalizedColumnKey = String(columnKey || '').trim();
    if (!normalizedColumnKey) return;
    setRoutePrintColumns(currentColumns => {
      const normalizedCurrentColumns = normalizeRoutePrintColumns(currentColumns);
      if (normalizedCurrentColumns.includes(normalizedColumnKey)) {
        if (normalizedCurrentColumns.length === 1) return normalizedCurrentColumns;
        return normalizedCurrentColumns.filter(currentColumnKey => currentColumnKey !== normalizedColumnKey);
      }
      const nextColumnSet = new Set([...normalizedCurrentColumns, normalizedColumnKey]);
      return PRINT_COLUMN_OPTIONS.map(option => option.key).filter(optionKey => nextColumnSet.has(optionKey));
    });
  };

  const handleResetRoutePrintColumns = () => {
    setRoutePrintColumns([...DEFAULT_ROUTE_PRINT_COLUMNS]);
    setStatusMessage('Route print columns restored to default office layout.');
  };

  const handlePrintRoute = () => {
    if (routeTrips.length === 0) {
      setStatusMessage('No route available to print yet.');
      return;
    }

    if (routePrintColumns.length === 0) {
      setStatusMessage('Choose at least one print column first.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) {
      setStatusMessage('Could not open print window.');
      return;
    }

    const generatedAt = formatPrintGeneratedAt(new Date());
    printWindow.document.write(buildRoutePrintDocument({
      routeTitle,
      driverName: selectedDriver ? selectedDriver.name : 'No driver selected',
      generatedAt,
      routeTrips,
      printSetup: uiPreferences?.printSetup,
      printColumns: routePrintColumns,
      getTripTypeLabel
    }));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setStatusMessage(`Printing ${routeTitle.toLowerCase()}.`);
  };

  const handleShareRouteWhatsapp = () => {
    const targetDriver = resolveRouteShareDriver({
      selectedDriver,
      selectedRoute,
      routeTrips,
      drivers
    });

    if (!targetDriver) {
      setStatusMessage('Select a driver before sending via WhatsApp.');
      return;
    }
    if (routeTrips.length === 0) {
      setStatusMessage('No route available to send via WhatsApp yet.');
      return;
    }

    const message = [`Hello ${targetDriver.name},`, '', `Your route: ${routeTitle}`, `Total trips: ${routeTrips.length}`, '', routeTrips.map((trip, index) => [`${index + 1}. ${getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-'} - ${getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-'} | ${trip.rider}`,
      `PU: ${trip.address || 'No pickup address'}`,
      `DO: ${trip.destination || 'No dropoff address'}`
    ].join('\n')).join('\n\n')].join('\n');
    const whatsappResult = openWhatsAppConversation({
      phoneNumber: targetDriver.phone,
      message
    });

    if (!whatsappResult.ok) {
      if (whatsappResult.reason === 'missing-phone') {
        setStatusMessage(`Driver ${targetDriver.name} does not have a valid WhatsApp number.`);
        return;
      }

      if (whatsappResult.reason === 'popup-blocked') {
        setStatusMessage('The browser blocked the new WhatsApp tab. Allow pop-ups for this page.');
        return;
      }

      setStatusMessage('Could not open WhatsApp.');
      return;
    }

    setStatusMessage(`Opening WhatsApp in a new tab for ${targetDriver.name}.`);
  };

  useEffect(() => {
    if (!showInlineMap || !showMapPane || !showRoute || routeStops.length < 2) {
      setRouteGeometry([]);
      setRouteMetrics(null);
      return;
    }

    // Drop the previous driver's path immediately so the map never keeps a stale route
    // while the next geometry request is loading.
    setRouteGeometry([]);
    setRouteMetrics(null);

    const abortController = new AbortController();
    const coordinates = routeStops.map(stop => `${stop.position[0]},${stop.position[1]}`).join(';');

    const loadRouteGeometry = async () => {
      try {
        const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinates)}`, {
          signal: abortController.signal
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
  }, [routeStops, showInlineMap, showMapPane, showRoute]);

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
    if (userPreferencesLoading || detailedDashboardHydratedRef.current) return;

    const dashboardPreferences = userPreferences?.tripDashboard || {};
    const resolvedLayoutMode = Object.values(TRIP_DASHBOARD_LAYOUTS).includes(dashboardPreferences.layoutMode) ? dashboardPreferences.layoutMode : TRIP_DASHBOARD_LAYOUTS.focusRight;
    const resolvedPanelView = Object.values(TRIP_DASHBOARD_PANEL_VIEWS).includes(dashboardPreferences.panelView) ? dashboardPreferences.panelView : TRIP_DASHBOARD_PANEL_VIEWS.both;
    const resolvedPanelOrder = Object.values(TRIP_DASHBOARD_PANEL_ORDERS).includes(dashboardPreferences.panelOrder) ? dashboardPreferences.panelOrder : TRIP_DASHBOARD_PANEL_ORDERS.driversFirst;

    setLayoutMode(resolvedLayoutMode);
    setPanelView(resolvedPanelView);
    setPanelOrder(resolvedPanelOrder);

    if (resolvedLayoutMode !== TRIP_DASHBOARD_LAYOUTS.normal) {
      setShowBottomPanels(dashboardPreferences.showBottomPanels !== false);
      setShowMapPane(dashboardPreferences.showMapPane === true);
      setShowDriversPanel(dashboardPreferences.showDriversPanel !== false);
      setShowRoutesPanel(dashboardPreferences.showRoutesPanel !== false);
      setShowTripsPanel(dashboardPreferences.showTripsPanel !== false);
      setRightPanelCollapsed(dashboardPreferences.rightPanelCollapsed === true);
      setShowConfirmationTools(dashboardPreferences.showConfirmationTools === true);
      setTimeDisplayMode(normalizeTripTimeDisplayMode(dashboardPreferences.timeDisplayMode));
      setTripOrderMode(dashboardPreferences.tripOrderMode || 'original');
      setRoutePrintColumns(normalizeRoutePrintColumns(dashboardPreferences.printColumns));
      setColumnSplit(dashboardPreferences.columnSplit ?? TRIP_DASHBOARD_DEFAULT_FOCUS_RIGHT_SPLIT);
      setRowSplit(dashboardPreferences.rowSplit ?? TRIP_DASHBOARD_DEFAULT_ROW_SPLIT);
      setColumnWidths(dashboardPreferences.columnWidths || {});
      setClosedRouteStateByKey(dashboardPreferences.closedRouteStateByKey || {});
    } else {
      setShowMapPane(true);
      setShowBottomPanels(false);
      setShowDriversPanel(true);
      setShowRoutesPanel(true);
      setShowTripsPanel(true);
      setRightPanelCollapsed(true);
      setShowConfirmationTools(false);
      setTimeDisplayMode(TRIP_TIME_DISPLAY_MODES.standard);
      setTripOrderMode('original');
      setRoutePrintColumns(normalizeRoutePrintColumns(dashboardPreferences.printColumns));
      setColumnSplit(94);
      setRowSplit(TRIP_DASHBOARD_DEFAULT_ROW_SPLIT);
      setColumnWidths({});
      setClosedRouteStateByKey(dashboardPreferences.closedRouteStateByKey || {});
    }

    layoutHydratedRef.current = true;
    panelViewHydratedRef.current = true;
    panelOrderHydratedRef.current = true;
    detailedDashboardHydratedRef.current = true;
  }, [userPreferences?.tripDashboard, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading || !detailedDashboardHydratedRef.current) return;
    const serializedState = JSON.stringify(tripDashboardPreferenceState);
    if (lastSavedDetailedDashboardRef.current === serializedState) return;
    if (detailedDashboardSaveTimeoutRef.current) {
      window.clearTimeout(detailedDashboardSaveTimeoutRef.current);
    }
    detailedDashboardSaveTimeoutRef.current = window.setTimeout(() => {
      lastSavedDetailedDashboardRef.current = serializedState;
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          ...tripDashboardPreferenceState
        }
      }).catch(() => {
        lastSavedDetailedDashboardRef.current = '';
      });
    }, 300);

    return () => {
      if (detailedDashboardSaveTimeoutRef.current) {
        window.clearTimeout(detailedDashboardSaveTimeoutRef.current);
      }
    };
  }, [saveUserPreferences, tripDashboardPreferenceState, userPreferences, userPreferencesLoading]);

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
    const handleAssistantAction = event => {
      const detail = event?.detail || {};
      const detailPathname = String(detail?.pathname || detail?.page || '').toLowerCase();
      const isTripDashboardAction = detailPathname.includes('trip-dashboard') || String(detail?.source || '').toLowerCase() === 'trip-dashboard';
      void refreshDispatchState({ forceServer: true });
      if (detail?.serviceDate) setTripDateFilter(String(detail.serviceDate));
      if (isTripDashboardAction && detail?.focusDriverId) setSelectedDriverId(String(detail.focusDriverId));
      const routeTripIds = Array.isArray(detail?.plan?.routes?.[0]?.tripIds) ? detail.plan.routes[0].tripIds : [];
      if (isTripDashboardAction && routeTripIds.length > 0) setSelectedTripIds(routeTripIds);
      if (detail?.type === 'apply-route-plan') {
        setAiPlannerPreview(null);
        setShowRoute(true);
      }
    };
    window.addEventListener('nemt-assistant-action', handleAssistantAction);
    return () => window.removeEventListener('nemt-assistant-action', handleAssistantAction);
  }, [refreshDispatchState]);

  const workspaceHeight = 'calc(100dvh - 12px)';
  const handleTripDashboardLogoff = async () => {
    try {
      if (session?.user?.id) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            userId: session.user.id,
            authSessionId: session.user.authSessionId
          })
        });
      }
    } catch {
    }

    await signOut({ redirect: false });
    if (typeof window !== 'undefined') {
      window.location.assign('/auth/login');
    }
  };

  const isFocusRightLayout = layoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight && showBottomPanels;
  const isStackedLayout = layoutMode === TRIP_DASHBOARD_LAYOUTS.stacked && showBottomPanels;
  const isStandardLayout = !isFocusRightLayout && !isStackedLayout;
  const isPeekPanelMode = false;
  const hasVisibleDockPanels = showDriversPanel || showRoutesPanel;
  const focusRightColumnSplit = clamp(columnSplit, TRIP_DASHBOARD_FOCUS_RIGHT_MIN_SPLIT, TRIP_DASHBOARD_FOCUS_RIGHT_MAX_SPLIT);
  const collapsedPanelWidth = TRIP_DASHBOARD_RIGHT_PANEL_COLLAPSED_WIDTH;
  const columnDividerSize = showTripsPanel && ((isFocusRightLayout && hasVisibleDockPanels) || (showMapPane && !isPeekPanelMode)) ? 12 : 0;
  const rowDividerSize = 0;
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns: isFocusRightLayout ? hasVisibleDockPanels ? `${focusRightColumnSplit}% ${columnDividerSize}px minmax(0, ${100 - focusRightColumnSplit}%)` : '0px 0px minmax(0, 1fr)' : isStackedLayout ? 'minmax(0, 1fr)' : showMapPane ? isPeekPanelMode ? `minmax(0, calc(100% - ${columnDividerSize}px - ${collapsedPanelWidth}px)) ${columnDividerSize}px ${collapsedPanelWidth}px` : `${columnSplit}% ${columnDividerSize}px minmax(0, ${100 - columnSplit}%)` : `0px 0px minmax(0, 1fr)`,
    gridTemplateRows: isFocusRightLayout ? '1fr' : isStackedLayout ? `${rowSplit}% ${rowDividerSize}px minmax(0, ${100 - rowSplit}%)` : showBottomPanels ? `${rowSplit}% ${rowDividerSize}px minmax(0, ${100 - rowSplit}%)` : '1fr 0px 0px',
    width: '100%',
    minWidth: 0,
    height: workspaceHeight,
    minHeight: workspaceHeight,
    position: 'relative'
  };
  const toolbarRowStyle = {
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'hidden',
    overflowY: 'visible',
    flexWrap: 'nowrap',
    paddingBottom: 0
  };
  const dividerBaseStyle = {
    backgroundColor: 'transparent',
    borderRadius: 999,
    position: 'relative',
    zIndex: 30,
    transition: 'background-color 0.15s'
  };

  const handlePopOutDrivers = () => {
    const driversUrl = `/panels/drivers`;
    const payload = {
      selectedDriverId,
      driverSearch,
      filteredDrivers: drivers
    };
    window.localStorage.setItem('__CARE_MOBILITY_DRIVERS_PANEL_STATE__', JSON.stringify(payload));
    const popup = window.open(driversUrl, 'care-mobility-drivers', 'popup=yes,width=900,height=700,resizable=yes,scrollbars=no');
    if (popup) {
      popup.focus();
      setShowDriversPanel(false);
      setDriversWindowOpen(true);
      setStatusMessage('Drivers panel opened in another window.');
      return;
    }
    window.open(driversUrl, '_blank', 'noopener,noreferrer');
    setShowDriversPanel(false);
    setDriversWindowOpen(true);
    setStatusMessage('Drivers panel opened in another tab.');
  };

  const handlePopOutRoutes = () => {
    const routesUrl = `/panels/routes`;
    const payload = {
      selectedDriverId,
      selectedSecondaryDriverId,
      selectedRoutePanelTripIds,
      routeTrips
    };
    window.localStorage.setItem('__CARE_MOBILITY_ROUTES_PANEL_STATE__', JSON.stringify(payload));
    const popup = window.open(routesUrl, 'care-mobility-routes', 'popup=yes,width=900,height=700,resizable=yes,scrollbars=no');
    if (popup) {
      popup.focus();
      setShowRoutesPanel(false);
      setRoutesWindowOpen(true);
      setStatusMessage('Routes panel opened in another window.');
      return;
    }
    window.open(routesUrl, '_blank', 'noopener,noreferrer');
    setShowRoutesPanel(false);
    setRoutesWindowOpen(true);
    setStatusMessage('Routes panel opened in another tab.');
  };

  const handlePopOutTrips = () => {
    const tripsUrl = `/panels/trips`;
    const payload = {
      orderedVisibleTripColumns,
      selectedTripIds,
      tripStatusFilter,
      tripDateFilter
    };
    window.localStorage.setItem('__CARE_MOBILITY_TRIPS_PANEL_STATE__', JSON.stringify(payload));
    const popup = window.open(tripsUrl, 'care-mobility-trips', 'popup=yes,width=1200,height=700,resizable=yes,scrollbars=no');
    if (popup) {
      popup.focus();
      setShowTripsPanel(false);
      setTripsWindowOpen(true);
      setStatusMessage('Trips panel opened in another window.');
      return;
    }
    window.open(tripsUrl, '_blank', 'noopener,noreferrer');
    setShowTripsPanel(false);
    setTripsWindowOpen(true);
    setStatusMessage('Trips panel opened in another tab.');
  };

  const applyLayoutMode = nextLayoutMode => {
    setLayoutMode(nextLayoutMode);

    if (nextLayoutMode === TRIP_DASHBOARD_LAYOUTS.normal) {
      setShowMapPane(true);
      setShowBottomPanels(false);
      setRightPanelCollapsed(false);
      setColumnSplit(TRIP_DASHBOARD_DEFAULT_NORMAL_MAP_SPLIT);
      setRowSplit(68);
      setStatusMessage('Normal layout restored with inline map view.');
      return;
    }

    setShowMapPane(false);
    setShowBottomPanels(true);
    setRightPanelCollapsed(false);

    if (nextLayoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight) {
      setColumnSplit(current => clamp(current, TRIP_DASHBOARD_FOCUS_RIGHT_MIN_SPLIT, TRIP_DASHBOARD_FOCUS_RIGHT_MAX_SPLIT));
      setStatusMessage('Focus Right layout enabled in Trip Dashboard.');
      return;
    }

    setRowSplit(current => clamp(current, 48, 74));
    setStatusMessage('Stacked layout enabled in Trip Dashboard.');
  };

  const handlePanelViewChange = nextView => {
    void nextView;
    setShowBottomPanels(true);
    setPanelView(TRIP_DASHBOARD_PANEL_VIEWS.both);
    if (isStandardLayout && showMapPane) {
      setRightPanelCollapsed(false);
      setColumnSplit(current => clamp(current, 38, 68));
    }
    setStatusMessage('Bottom panels anchored in Both mode.');
  };

  const renderTripDataCell = trip => columnKey => {
    const displayTrip = liveAnnotatedFilteredTripMap.get(String(trip?.id || '').trim()) || trip;
    const tripFieldErrors = liveTripFieldErrorMap.get(String(trip?.id || '').trim()) || new Map();
    const getFieldErrorStyle = key => tripFieldErrors.has(key) ? tripFieldErrorHighlightStyle : null;
    const getFieldErrorDetail = key => tripFieldErrors.get(key) || '';
    switch (columnKey) {
      case 'trip':
        return <td key={`${trip.id}-trip`} style={{ whiteSpace: 'nowrap', ...(getFieldErrorStyle('trip') || {}) }} title={getFieldErrorDetail('trip') || undefined}>
            <div className="fw-semibold">{getDisplayTripId(trip)}</div>
            {!orderedVisibleTripColumns.includes('rider') && trip.rider ? <div className="small text-muted mt-1" style={{ lineHeight: 1.1, whiteSpace: 'normal', maxWidth: 180 }}>{trip.rider}</div> : null}
            {getLegBadge(displayTrip) ? <Badge bg={getLegBadge(displayTrip).variant} className="mt-1 me-1">{getLegBadge(displayTrip).label}</Badge> : null}
            {trip.hasServiceAnimal ? <Badge bg="warning" text="dark" className="mt-1 me-1">🐕 Service Animal</Badge> : null}
          </td>;
      case 'vehicle':
        {
          const vehicleMeta = getTripVehicleMeta(trip);
          const vehicleLabel = vehicleMeta.actualVehicleLabel || vehicleMeta.requestedVehicle || '-';
          const showRequestedVehicle = vehicleMeta.requestedVehicle && vehicleMeta.requestedVehicle !== vehicleMeta.actualVehicleLabel;

        return renderInlineEditableTripCell({
          trip,
          columnKey: 'vehicle',
          displayValue: <div style={vehicleMetaStackStyle}>
              <div className="fw-semibold">{vehicleLabel}</div>
              {vehicleMeta.actualDriverName ? <div className="small text-muted mt-1">Driver: {vehicleMeta.actualDriverName}</div> : null}
              {showRequestedVehicle ? <div className="small text-muted mt-1">Requested: {vehicleMeta.requestedVehicle}</div> : null}
              {vehicleMeta.capabilityTokens.length ? <div className="d-flex flex-wrap gap-1 mt-1">{vehicleMeta.capabilityTokens.map(token => <Badge bg="light" text="dark" className="border" key={`${trip.id}-${token}`}>{token}</Badge>)}</div> : null}
            </div>,
          cellStyle: {
            whiteSpace: 'normal'
          },
          displayStyle: vehicleMetaStackStyle,
          placeholder: 'Ambulatory'
        });
        }
      case 'status':
        return <td key={`${trip.id}-status`} style={{ whiteSpace: 'nowrap' }}>
            <Badge bg={isTripAssignedToSelectedDriver(trip) ? 'success' : getStatusBadge(getEffectiveTripStatus(trip))}>{isTripAssignedToSelectedDriver(trip) ? 'Assigned Here' : getEffectiveTripStatus(trip)}</Badge>
          {trip.missingFromLatestSafeRideImport ? <div className="mt-1"><Badge bg="danger">Removed Since Last Load</Badge></div> : null}
            {trip.routeChangePendingReview ? <div className="mt-1"><Badge bg="warning" text="dark">Address Review</Badge></div> : null}
            {trip.secondaryDriverId ? <div className="mt-1"><Badge bg="warning" text="dark">2 Drivers</Badge></div> : null}
            {getTripAddedByLabel(trip) ? <div className="mt-1"><Badge bg="dark">{getTripAddedByLabel(trip)}</Badge></div> : null}
            {trip.completedByDriverName ? <div className="mt-1"><Badge bg="info" text="dark">Driven by {trip.completedByDriverName}</Badge></div> : null}
            {trip.riderSignatureData || trip.riderSignatureName ? <div className="mt-1"><Badge bg="secondary">Signature captured</Badge></div> : null}
            {trip.riderSignatureData || trip.riderSignatureName ? <RiderSignaturePreview trip={trip} /> : null}
            {trip.safeRideStatus && getEffectiveTripStatus(trip) !== 'Cancelled' ? <div className="small text-muted mt-1">{trip.safeRideStatus}</div> : null}
          </td>;
      case 'driver':
        return <td key={`${trip.id}-driver`} style={{ whiteSpace: 'nowrap' }}><div>{getTripDriverDisplay(trip)}</div>{trip.secondaryDriverId ? <div className="mt-1"><Badge bg="warning" text="dark">2 Drivers</Badge></div> : null}</td>;
      case 'pickup':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'pickup',
          displayValue: getTripDisplayTimeText(trip, 'pickup', timeDisplayMode),
          cellStyle: {
            whiteSpace: 'nowrap',
            ...(getFieldErrorStyle('pickup') || {})
          },
          errorDetail: getFieldErrorDetail('pickup'),
          placeholder: timeDisplayMode === TRIP_TIME_DISPLAY_MODES.military ? '07:40' : '07:40 AM'
        });
      case 'dropoff':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'dropoff',
          displayValue: getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode),
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: timeDisplayMode === TRIP_TIME_DISPLAY_MODES.military ? '08:15' : '08:15 AM'
        });
      case 'miles':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'miles',
          displayValue: trip.miles || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: '12.5'
        });
      case 'rider':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'rider',
          displayValue: (() => {
            const {
              firstName,
              lastName
            } = splitRiderName(trip.rider);
            return [firstName, lastName].filter(Boolean).join(' ');
          })(),
          cellStyle: {
            whiteSpace: 'normal'
          },
          displayStyle: riderNameStackStyle,
          placeholder: 'Nombre del paciente'
        });
      case 'address':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'address',
          displayValue: trip.address,
          cellStyle: {
            ...(getFieldErrorStyle('address') || {})
          },
          displayStyle: addressClampStyle,
          errorDetail: getFieldErrorDetail('address'),
          placeholder: 'Pickup address'
        });
      case 'puZip':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'puZip',
          displayValue: getPickupZip(trip) || '-',
          cellStyle: {
            whiteSpace: 'nowrap',
            ...(getFieldErrorStyle('puZip') || {})
          },
          errorDetail: getFieldErrorDetail('puZip'),
          placeholder: '32808'
        });
      case 'destination':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'destination',
          displayValue: trip.destination || '-',
          cellStyle: {
            ...(getFieldErrorStyle('destination') || {})
          },
          displayStyle: addressClampStyle,
          errorDetail: getFieldErrorDetail('destination'),
          placeholder: 'Dropoff address'
        });
      case 'doZip':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'doZip',
          displayValue: getDropoffZip(trip) || '-',
          cellStyle: {
            whiteSpace: 'nowrap',
            ...(getFieldErrorStyle('doZip') || {})
          },
          errorDetail: getFieldErrorDetail('doZip'),
          placeholder: '32714'
        });
      case 'phone':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'phone',
          displayValue: trip.patientPhoneNumber || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: '(407) 555-0000'
        });
      case 'mobility': {
        const tripTypeLabel = getTripTypeLabel(trip);
        const badgeVariant = tripTypeLabel === 'STR' ? 'danger' : tripTypeLabel === 'W' ? 'warning' : 'success';
        return <td key={`${trip.id}-mobility`} style={{ whiteSpace: 'nowrap' }}>
            <Badge bg={badgeVariant} text={tripTypeLabel === 'W' ? 'dark' : undefined}>{tripTypeLabel}</Badge>
          </td>;
      }
      case 'assistLevel':
        return <td key={`${trip.id}-assist`} style={{ whiteSpace: 'nowrap' }}>
            <div className="d-flex align-items-center gap-1">
              <span>{trip.assistLevel || '-'}</span>
              {getTripCompanionNote(trip) ? <Badge bg="info" text="dark">Companion: Yes</Badge> : null}
            </div>
          </td>;
      case 'serviceAnimal':
        return <td key={`${trip.id}-animal`} style={{ whiteSpace: 'nowrap' }}>{trip.hasServiceAnimal ? <Badge bg="warning" text="dark">🐕 Yes</Badge> : '-'}</td>;
      case 'notes': {
        const noteText = getTripNoteText(trip);
        const hasExcelLoaderSnapshot = Boolean(getTripExcelLoaderSnapshot(trip));
        const notesColumnWidth = columnWidths.notes ?? 182;
        return <td key={`${trip.id}-notes`} style={{ whiteSpace: 'nowrap', textAlign: 'center', width: notesColumnWidth, minWidth: notesColumnWidth, maxWidth: notesColumnWidth }}>
            <div className="d-flex align-items-center justify-content-center gap-1">
              <Button
                variant={noteText ? 'outline-info' : 'outline-secondary'}
                size="sm"
                onClick={() => handleOpenTripNote(trip)}
                title={getTripImportedNoteText(trip) || 'Open imported patient note'}
                style={compactTripActionButtonStyle}
              >
                N
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handleCloneTrip(trip)}
                title="Clone trip"
                style={compactTripActionButtonStyle}
              >
                C
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDeleteTrip(trip)}
                title="Delete trip"
                style={compactTripActionButtonStyle}
              >
                D
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={event => handleOpenTripExcelCompare(trip, event)}
                title={hasExcelLoaderSnapshot ? 'Compare Excel Loader values with current values' : 'Excel Loader snapshot is not available for this trip'}
                style={compactTripActionButtonStyle}
              >
                XL
              </Button>
            </div>
          </td>;
      }
      case 'leg':
        return <td key={`${trip.id}-leg`} style={{ whiteSpace: 'nowrap', ...(getFieldErrorStyle('leg') || {}) }} title={getFieldErrorDetail('leg') || undefined}>{getLegBadge(displayTrip) ? <Badge bg={getLegBadge(displayTrip).variant}>{getLegBadge(displayTrip).label}</Badge> : '-'}</td>;
      case 'punctuality':
        return <td key={`${trip.id}-punctuality`} style={{ whiteSpace: 'nowrap' }}><Badge bg={getTripPunctualityVariant(trip)}>{getTripPunctualityLabel(trip)}</Badge></td>;
      case 'lateMinutes':
        return <td key={`${trip.id}-late`} style={{ whiteSpace: 'nowrap' }}>{getTripLateMinutesDisplay(trip)}</td>;
      case 'confirmation': {
        const blockingState = tripBlockingMap.get(trip.id);
        const confirmationLabel = getTripConfirmationDisplayLabel(trip, blockingState);
        const badgeVariant = confirmationLabel === 'Confirmed'
          ? 'success'
          : confirmationLabel === 'Cancelled'
            ? 'danger'
            : confirmationLabel === 'Needs Call'
              ? 'warning'
              : confirmationLabel === 'Opted Out'
                ? 'danger'
                : 'secondary';
        return <td key={`${trip.id}-confirm`} style={{ whiteSpace: 'nowrap' }}>
            <Badge bg={badgeVariant} text={badgeVariant === 'warning' ? 'dark' : undefined}>{confirmationLabel}</Badge>
          </td>;
      }
      default:
        return null;
    }
  };

  const driverPanelCard = <Card className="h-100 overflow-hidden" data-bs-theme={themeMode}>
      <CardBody className="p-0 d-flex flex-column h-100">
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {!isFocusRightLayout ? <><strong>Drivers: {drivers.length}</strong><span>{liveDrivers} live</span></> : null}
            <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
            setStatusMessage('Opening Dispatcher workspace.');
            router.push('/dispatcher');
          }}>
              Dispatch
            </Button>
            <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
            router.push('/drivers/vehicles');
            setStatusMessage('Opening Vehicles.');
          }}>
              Vehicle
            </Button>
            <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
            refreshDrivers();
            router.push('/drivers');
            setStatusMessage('Opening Drivers.');
          }}>
              Driver
            </Button>
            <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
            refreshDrivers();
            router.push('/drivers');
            setStatusMessage('Opening Users workspace.');
          }}>
              Admin
            </Button>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <Button variant={routeDayOffDrivers.length > 0 ? 'danger' : isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
            setShowDayOffModal(true);
            setStatusMessage(routeDayOffDrivers.length > 0 ? `${routeDayOffDrivers.length} driver(s) have day off on ${activeRouteDateKey}.` : activeTimeOffDrivers.length > 0 ? `Showing ${activeTimeOffDrivers.length} active day-off appointment(s).` : 'No active day-off appointments right now.');
          }}>
              Day Off{routeDayOffDrivers.length > 0 ? ` (${routeDayOffDrivers.length})` : ''}
            </Button>
            {!isFocusRightLayout ? <Form.Control size="sm" value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver" style={{ width: 180 }} /> : null}
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} title="Manage Drivers" aria-label="Manage Drivers" onClick={() => {
            refreshDrivers();
            router.push('/drivers');
            setStatusMessage('Opening Drivers to manage the live roster.');
          }}>
              <IconifyIcon icon="iconoir:settings" />
            </Button>
            <Button variant="danger" size="sm" style={redToolbarButtonStyle} onClick={() => {
            void handleTripDashboardLogoff();
          }} title="Log out" aria-label="Log out">
              Logout
            </Button>
            <Button variant="danger" size="sm" style={redToolbarButtonStyle} onClick={() => setShowDriversPanel(false)} title="Hide drivers panel">✕</Button>
          </div>
        </div>
        <div className="table-responsive flex-grow-1" style={{ minHeight: 0, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable' }}>
          <Table size="sm" bordered striped hover className="align-middle mb-0 small" data-bs-theme={themeMode} style={{ lineHeight: 1.1, fontSize: '0.78rem' }}>
            <thead style={{ backgroundColor: '#198754', color: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                {renderDriverHeader('vehicle', 'Vehicle')}
                {!isFocusRightLayout ? renderDriverHeader('name', 'Driver') : <th className="py-1" style={{ backgroundColor: '#198754', color: '#fff', minWidth: 220 }}>
                    <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                      <button type="button" onClick={() => handleDriverSortChange('name')} className="btn btn-link text-decoration-none p-0 d-inline-flex align-items-center gap-1 flex-shrink-0" style={{ color: '#fff', fontWeight: 700 }}>
                        <span>Driver</span>
                        <span className="small">{driverSort.key === 'name' ? driverSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
                      </button>
                      <Form.Control
                        size="sm"
                        value={driverSearch}
                        onChange={event => setDriverSearch(event.target.value)}
                        placeholder="Search driver"
                        style={{ flex: '0 1 170px', width: 170, minWidth: 120, maxWidth: 170, backgroundColor: 'rgba(15, 23, 42, 0.78)', color: '#f8fafc', borderColor: 'rgba(226, 232, 240, 0.22)' }}
                      />
                    </div>
                  </th>}
                {!isFocusRightLayout ? renderDriverHeader('attendant', 'Attendant') : null}
                {renderDriverHeader('info', 'Trips')}
                {renderDriverHeader('live', 'Live')}
                <th className="py-1" style={{ backgroundColor: '#198754', color: '#fff', borderRight: 'none' }}>#</th>
                <th className="py-1" style={{ width: 60, backgroundColor: '#198754', color: '#fff', borderLeft: 'none' }}>ACT</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.length > 0 ? filteredDrivers.map((driver, index) => {
                const driverVehicleMeta = getDriverVehicleMeta(driver);
                const driverAssignedTripCount = driverAssignedTripCountById.get(normalizeDriverId(driver?.id)) || 0;
                const isTimeOffDriver = Boolean(getDriverTimeOffDateForUi(driver));
                return <tr key={driver.id} className={selectedDriverId === driver.id ? 'table-primary' : ''} style={isTimeOffDriver ? {
                  backgroundColor: '#e5e7eb',
                  color: '#475569'
                } : undefined}>
                  <td className="py-1" style={{ whiteSpace: 'normal', minWidth: 220 }}>
                    <div>{driverVehicleMeta.vehicleLabel || driver.vehicle}</div>
                    {driverVehicleMeta.capabilityTokens.length ? <div className="d-flex flex-wrap gap-1 mt-1">{driverVehicleMeta.capabilityTokens.map(token => <Badge key={`${driver.id}-${token}`} bg="light" text="dark" className="border">{token}</Badge>)}</div> : null}
                  </td>
                  <td className="py-1" style={{ whiteSpace: 'nowrap' }}><div className="fw-semibold">{driver.name}</div>{isTimeOffDriver ? <div className="small mt-1"><Badge bg="secondary">{getDriverTimeOffLabelForUi(driver)}</Badge></div> : null}</td>
                  {!isFocusRightLayout ? <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{driver.attendant}</td> : null}
                  <td className="py-1 text-center" style={{ whiteSpace: 'nowrap', minWidth: 72 }}><Badge bg={driverAssignedTripCount > 0 ? 'primary' : 'secondary'}>{driverAssignedTripCount}</Badge></td>
                  <td className="py-1 text-center" style={{ whiteSpace: 'nowrap' }}>
                    <Badge bg={driver.live === 'Online' ? 'success' : 'secondary'} className="fw-normal" style={driver.live === 'Online' ? undefined : offlineDriverBadgeStyle}>{driver.live || 'Offline'}</Badge>
                  </td>
                  <td className="py-1 text-center fw-bold" style={{ borderRight: 'none' }}>{index + 1}</td>
                  <td className="py-1" style={{ borderLeft: 'none' }}>
                    <div className="d-flex align-items-center justify-content-center">
                      <Form.Check className="trip-dashboard-selector" type="radio" checked={selectedDriverId === driver.id} onChange={() => handleDriverSelectionChange(driver.id)} />
                    </div>
                  </td>
                </tr>;
              }) : <tr>
                  <td colSpan={isFocusRightLayout ? 6 : 7} className="text-center text-muted py-4">No drivers or vehicles loaded.</td>
                </tr>}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>;

  const routePanelCard = <Card className="h-100 overflow-hidden" data-bs-theme={themeMode}>
      <CardBody className="p-0 d-flex flex-column h-100">
        <div className="border-bottom" style={tripDashboardToolbarShellStyle}>
          <div className="p-2">
            <div className="d-flex align-items-start gap-2 flex-nowrap" style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', minWidth: 0, whiteSpace: 'nowrap' }}>
            {renderRouteUtilityButtonsBlock()}
            <Form.Select size="sm" value={selectedSecondaryDriverId} onChange={event => setSelectedSecondaryDriverId(event.target.value)} style={{ width: 150, minWidth: 150, flex: '0 0 150px' }}>
              <option value="">2nd driver</option>
              {drivers.map(driver => <option key={`route-secondary-${driver.id}`} value={driver.id}>{driver.name}{getDriverTimeOffLabelForUi(driver) ? ` (${getDriverTimeOffLabelForUi(driver)})` : ''}</option>)}
            </Form.Select>
            <Button variant="warning" size="sm" style={{ ...greenToolbarButtonStyle, fontWeight: 800, flex: '0 0 auto' }} onClick={handleRoutePanelAssignSecondary} title="Assign 2nd driver" disabled={selectedRoutePanelTripIds.length === 0}>A2</Button>
            <Button variant="danger" size="sm" style={{ ...redToolbarButtonStyle, flex: '0 0 auto' }} onClick={handleRoutePanelUnassign} title="Unassign selected trips" disabled={selectedRoutePanelTripIds.length === 0}>U</Button>
            {isFocusRightLayout && showRoutesPanel ? <Button variant="danger" size="sm" style={{ ...redToolbarButtonStyle, flex: '0 0 auto' }} onClick={() => setShowRoutesPanel(false)} title="Hide routes panel">✕</Button> : null}
            
            </div>
          </div>
        </div>
        <div className="px-3 py-2 border-bottom d-flex align-items-start justify-content-between gap-3 flex-wrap" style={{ backgroundColor: themeMode === 'dark' ? 'rgba(15, 23, 42, 0.78)' : '#f8fafc' }}>
          <div>
            <div className="fw-semibold">Route for {selectedDriver?.name || routeTitle}</div>
            <div className="small text-muted">{routeTrips.length} trip(s) shown</div>
            {getDriverTimeOffDateForUi(selectedDriver) ? <div className="small" style={{ color: '#b45309', fontWeight: 700 }}>{selectedDriver?.name || 'Driver'} has {getDriverTimeOffLabelForUi(selectedDriver)}.</div> : null}
          </div>
        </div>
        <div className="table-responsive flex-grow-1" style={{ minHeight: 0, height: '100%', overflowY: 'auto' }}>
          <Table className="align-middle mb-0" data-bs-theme={themeMode}>
            <thead className={themeMode === 'dark' ? 'table-dark' : 'table-light'}>
              <tr>
                <th>Trip ID</th>
                <th>Type</th>
                <th>Miles</th>
                <th>PU</th>
                <th>DO</th>
                <th>Rider</th>
                <th>Patient Phone</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {routeTrips.length > 0 ? routeTrips.map(trip => (
                <tr key={trip.id} className={selectedTripIdSet.has(normalizeTripId(trip.id)) ? 'table-success' : ''}>
                  <td className="fw-semibold">{getDisplayTripId(trip) || '-'}{getTripAddedByLabel(trip) ? <div className="small mt-1"><Badge bg="dark">{getTripAddedByLabel(trip)}</Badge></div> : null}</td>
                  <td><Badge bg={getTripTypeLabel(trip) === 'STR' ? 'danger' : getTripTypeLabel(trip) === 'W' ? 'warning' : 'success'} text={getTripTypeLabel(trip) === 'W' ? 'dark' : undefined}>{getTripTypeLabel(trip)}</Badge></td>
                  <td>{trip.miles || '-'}</td>
                  <td>{getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-'}</td>
                  <td>{getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-'}</td>
                  <td>{trip.rider}</td>
                  <td>{trip.patientPhoneNumber || '-'}</td>
                  <td>
                    <div className="d-flex align-items-center justify-content-center">
                      <Form.Check className="trip-dashboard-selector" checked={selectedTripIdSet.has(normalizeTripId(trip.id))} onChange={() => toggleTripSelection(trip.id)} />
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">Select a route, a driver, or trips to view the route menu.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>;

  const renderTripMapPanel = () => <Card className="h-100 border-0" style={{ boxShadow: 'none', background: 'transparent' }}>
      <CardBody className="p-0 d-flex flex-column h-100 position-relative">
        {showInlineMap ? <div className="position-relative h-100">
            <Button variant="warning" type="button" onClick={() => {
          setShowMapPane(false);
          setStatusMessage('Map hidden in Trip Dashboard.');
        }} style={yellowMapTabStyle}>
                Hide Map
              </Button>
            <Button variant="success" type="button" onClick={() => applyLayoutMode(TRIP_DASHBOARD_LAYOUTS.focusRight)} style={greenMapTabStyle}>
                Focus Right
              </Button>
            <Button variant="primary" type="button" onClick={() => handlePanelViewChange(TRIP_DASHBOARD_PANEL_VIEWS.both)} style={blueMapTabStyle}>
                Panels Anchored
              </Button>
            <div className="position-absolute top-0 start-0 p-2 d-flex align-items-center gap-2 flex-nowrap" style={{ zIndex: 650, maxWidth: '100%', minHeight: 48, overflowX: 'hidden', overflowY: 'hidden', whiteSpace: 'nowrap' }}>
              <>
                  <Button variant="dark" size="sm" onClick={() => setSelectedTripIds([])}>Clear</Button>
                  <Form.Select size="sm" value={mapCityQuickFilter} onChange={event => setMapCityQuickFilter(event.target.value)} style={mapQuickFilterControlStyle}>
                    <option value="">City</option>
                    {mapQuickCityOptions.map(city => <option key={city} value={city}>{city}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={mapZipQuickFilter} onChange={event => setMapZipQuickFilter(event.target.value)} style={mapQuickZipControlStyle}>
                    <option value="">ZIP Code</option>
                    {mapQuickZipOptions.map(zip => <option key={zip} value={zip}>{zip}</option>)}
                  </Form.Select>
                  <Form.Select size="sm" value={uiPreferences?.mapProvider || 'auto'} onChange={event => setMapProvider(event.target.value)} style={mapQuickFilterControlStyle}>
                    <option value="auto">Map: Auto</option>
                    <option value="openstreetmap">Map: OSM</option>
                    <option value="mapbox" disabled={!hasMapboxConfigured}>Map: Mapbox</option>
                  </Form.Select>
                  <Button variant="dark" size="sm" onClick={() => handlePanelViewChange(TRIP_DASHBOARD_PANEL_VIEWS.both)}>Panels anchored</Button>
                </>
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
                <div className="small">{getTripDisplayTimeText(activeInfoTrip, 'pickup', timeDisplayMode) || '-'}</div>
                <div className="small" style={{ color: '#cbd5e1' }}>{activeInfoTrip.address || 'No pickup address available'}</div>
                <div className="small mt-1">DO {getTripDisplayTimeText(activeInfoTrip, 'dropoff', timeDisplayMode) || '-'}</div>
                <div className="small" style={{ color: '#cbd5e1' }}>{activeInfoTrip.destination || 'No dropoff address available'}</div>
              </div> : null}
            <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} preferCanvas zoomAnimation={false} markerZoomAnimation={false} style={{ height: '100%', width: '100%' }}>
              <TripDashboardMapResizer resizeKey={tripDashboardMapResizeKey} />
              <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} updateWhenZooming={false} />
              <ZoomControl position="bottomleft" />
              {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#2563eb', weight: 4 }} /> : null}
              {selectedDriver?.hasRealLocation && selectedDriverActiveTrip && getMapTripTargetPosition(selectedDriverActiveTrip) ? <Polyline positions={[selectedDriver.position, getMapTripTargetPosition(selectedDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
              {mapVisibleDriversWithRealLocation.map(driver => <Marker key={`trip-dashboard-driver-live-${driver.id}`} position={driver.position} icon={liveVehicleIconByDriverId.get(String(driver?.id || '').trim()) || createLiveVehicleIcon({
            heading: driver.heading,
            isOnline: driver.live === 'Online',
            vehicleIconScalePercent: driver?.gpsSettings?.vehicleIconScalePercent
          })}>
                  <Popup>
                    <div className="fw-semibold">{driver.name}</div>
                    <div className="small text-muted">{driver.live || 'Offline'}</div>
                    <div>{getDriverCheckpoint(driver)}</div>
                  </Popup>
                </Marker>)}
              {selectedTrips.length === 0 ? mapQuickTrips.flatMap(trip => {
            const pickupPosition = getTripPickupPosition(trip);
            const dropoffPosition = getTripDropoffPosition(trip);
            const points = [];
            if (pickupPosition) {
              points.push({
                key: `${trip.id}-pickup-mapquick`,
                tripId: trip.id,
                position: pickupPosition,
                color: '#0ea5e9',
                label: `PU ${getTripDisplayTimeText(trip, 'pickup', timeDisplayMode) || '-'}`
              });
            }
            if (dropoffPosition) {
              points.push({
                key: `${trip.id}-dropoff-mapquick`,
                tripId: trip.id,
                position: dropoffPosition,
                color: '#22c55e',
                label: `DO ${getTripDisplayTimeText(trip, 'dropoff', timeDisplayMode) || '-'}`
              });
            }
            return points;
          }).map(point => <CircleMarker key={point.key} center={point.position} radius={6} pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.85 }} eventHandlers={{
            click: () => {
              toggleTripSelection(point.tripId);
            }
          }}>
                  <Popup>{point.label}</Popup>
                </CircleMarker>) : null}
              {selectedTripMapPoints.map(point => <CircleMarker key={point.key} center={point.position} radius={7} pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.92, weight: 2 }}>
                  <Popup>
                    <div className="fw-semibold">{point.label}</div>
                    <div className="small text-muted">Trip {point.tripId}</div>
                    <div>{point.detail}</div>
                  </Popup>
                </CircleMarker>)}
              {routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                  <Popup>
                    <div className="fw-semibold">{stop.title}</div>
                    <div>{stop.detail}</div>
                  </Popup>
                </Marker>)}
            </MapContainer>
          </div> : null}
      </CardBody>
    </Card>;

  const dockPanelsOrdered = panelOrder === TRIP_DASHBOARD_PANEL_ORDERS.driversFirst ? [{
    key: 'drivers',
    node: driverPanelCard,
    visible: showDriversPanel
  }, {
    key: 'routes',
    node: routePanelCard,
    visible: showRoutesPanel
  }] : [{
    key: 'routes',
    node: routePanelCard,
    visible: showRoutesPanel
  }, {
    key: 'drivers',
    node: driverPanelCard,
    visible: showDriversPanel
  }];

  const dockPanelsVisible = dockPanelsOrdered.filter(panel => panel.visible);
  const tripDashboardMapResizeKey = [showMapPane ? 'open' : 'closed', layoutMode, Math.round(columnSplit), rightPanelCollapsed ? 'collapsed' : 'expanded', showBottomPanels ? 'bottom' : 'solo', showDriversPanel ? 'drivers' : 'no-drivers', showRoutesPanel ? 'routes' : 'no-routes', showTripsPanel ? 'trips' : 'no-trips'].join('|');

  return <>
      {(!showDriversPanel || !showRoutesPanel || !showTripsPanel) && <div style={{
        position: 'fixed',
        top: 12,
        right: 16,
        zIndex: 1200,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(100, 116, 139, 0.35)',
        padding: '8px 12px',
        borderRadius: 8,
        backdropFilter: 'blur(10px)'
      }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>HIDDEN PANELS:</span>
        {!showDriversPanel && <Button variant="outline-success" size="sm" onClick={() => setShowDriversPanel(true)}>📊 Drivers</Button>}
        {!showRoutesPanel && <Button variant="outline-success" size="sm" onClick={() => setShowRoutesPanel(true)}>🗺️ Routes</Button>}
        {!showTripsPanel && <Button variant="outline-success" size="sm" onClick={() => setShowTripsPanel(true)}>📋 Trips</Button>}
      </div>}

      <div ref={workspaceRef} style={workspaceGridStyle}>
        <div style={{ minWidth: 0, minHeight: 0, display: showMapPane && isStandardLayout ? 'block' : 'none' }}>
          {renderTripMapPanel()}
        </div>

        <div onMouseDown={() => showTripsPanel && (showMapPane && !isPeekPanelMode || isFocusRightLayout && hasVisibleDockPanels) ? setDragMode('column') : undefined} style={{
        ...dividerBaseStyle,
        cursor: showMapPane && isPeekPanelMode ? 'default' : 'col-resize',
        gridColumn: 2,
        gridRow: isFocusRightLayout ? 1 : '1 / span 3',
        display: columnDividerSize > 0 ? 'block' : 'none'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 4, backgroundColor: 'rgba(148, 163, 184, 0.9)', boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.28)' }} />
        </div>

        <div style={{
        minWidth: 0,
        minHeight: 0,
        gridColumn: isFocusRightLayout ? 3 : showMapPane ? 3 : isStackedLayout ? 1 : '1 / span 3',
        gridRow: isFocusRightLayout ? '1 / span 3' : 1,
        display: showTripsPanel ? 'block' : 'none'
      }}>
          {isPeekPanelMode ? <Card className="h-100 overflow-hidden">
              <CardBody className="p-0 d-flex justify-content-center align-items-center" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #162236 100%)' }}>
                <Button variant="warning" size="sm" onClick={() => {
                setRightPanelCollapsed(false);
                setColumnSplit(TRIP_DASHBOARD_RIGHT_PANEL_EXPANDED_SPLIT);
                setStatusMessage('Panel derecho abierto a mitad.');
              }} style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                fontWeight: 800,
                letterSpacing: 0.4,
                borderRadius: 999,
                minHeight: 140
              }}>
                  Open Panel
                </Button>
              </CardBody>
            </Card> : <Card className="h-100 border-0" style={{ boxShadow: 'none', background: 'transparent' }}>
            <CardBody className="p-0 d-flex flex-column h-100">
              {(toolbarCollapsed && false) ? <div className="d-flex align-items-center justify-content-between p-2 border-bottom bg-success text-dark gap-2 flex-shrink-0">
                  <button type="button" onClick={() => setToolbarCollapsed(false)} style={{
                borderRadius: 10,
                border: '1px solid rgba(15, 23, 42, 0.25)',
                background: '#fef9c3',
                color: '#111827',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '0.04em',
                padding: '6px 12px'
              }}>
                    Show menu
                  </button>
                  <span className="small fw-semibold">Toolbar hidden</span>
                </div> : <div className="d-flex flex-column align-items-stretch p-3 border-bottom gap-2 flex-shrink-0" style={tripDashboardToolbarShellStyle}>
                {shouldShowPinnedToolbarRecovery ? <div className="d-flex justify-content-end align-items-center gap-2 flex-wrap">
                    {!hasAnyVisibleToolbarBlock ? <Badge bg="danger">Toolbar hidden</Badge> : null}
                    <Button variant="dark" size="sm" onClick={handleResetToolbarLayout}>Restore toolbar</Button>
                    <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" style={toolbarButtonStyle} onClick={() => {
                  setShowToolbarTools(current => !current);
                  setShowColumnPicker(false);
                }}>Toolbar</Button>
                    {showToolbarTools ? <Card className="shadow position-absolute end-0 mt-5" style={{ zIndex: 82, width: 300 }}>
                        <CardBody className="p-3" style={{ color: isDarkTheme ? '#e5e7eb' : '#111827', backgroundColor: isDarkTheme ? '#0f172a' : '#ffffff' }}>
                          <div className="fw-semibold mb-2">Toolbar</div>
                          <div className="small mb-3" style={mutedThemeTextStyle}>Turn each toolbar block on or off.</div>
                          <div className="d-flex flex-column gap-2" style={{ maxHeight: 300, overflowY: 'auto' }}>
                            {TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => <Form.Check key={`toolbar-tools-fallback-${blockId}`} type="switch" id={`toolbar-tools-fallback-switch-${blockId}`} label={TRIP_DASHBOARD_TOOLBAR_BLOCK_LABELS[blockId] || blockId} checked={isToolbarBlockEnabled(blockId)} onChange={event => handleToggleToolbarBlockVisibility(blockId, event.target.checked)} />)}
                          </div>
                        </CardBody>
                      </Card> : null}
                  </div> : null}
                {/* Top toolbar line */}
                <div className="d-flex align-items-center gap-2 small position-relative" style={{
                ...toolbarRowStyle,
                minWidth: isToolbarEditMode ? 'max-content' : 0
              }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row1');
                clearDraggingToolbarBlockIds();
              }}>
                  {topButtonsRowCollapsed ? null : toolbarRow2Order.map(blockId => {
                  const renderedBlock = renderToolbarRow2Block(blockId);
                  const shouldRenderBlock = isToolbarEditMode || isToolbarBlockEnabled(blockId);
                  return <div
                    key={blockId}
                    draggable={isToolbarEditMode}
                    onDragStart={() => {
                    setDraggingToolbarBlockId(null);
                    setDraggingToolbarRow2BlockId(blockId);
                    setDraggingToolbarRow3BlockId(null);
                  }}
                    onDragOver={event => {
                    if (!isToolbarEditMode) return;
                    event.preventDefault();
                  }}
                    onDrop={() => {
                    if (!isToolbarEditMode) return;
                    const draggedBlockId = getActiveDraggedToolbarBlockId();
                    moveToolbarBlockAcrossRows(draggedBlockId, 'row2', blockId);
                  }}
                    onDragEnd={clearDraggingToolbarBlockIds}
                    style={isToolbarEditMode ? {
                    border: '1px dashed rgba(8, 19, 26, 0.55)',
                    borderRadius: 8,
                    padding: '2px 4px',
                    cursor: 'move',
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(8, 19, 26, 0.12)' : 'rgba(255, 255, 255, 0.25)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  } : {
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  >
                      {shouldRenderBlock ? renderedBlock || (isToolbarEditMode ? <Badge bg="secondary">{blockId}</Badge> : null) : null}
                    </div>;
                })}
                  {toolbarRow1Order.map(blockId => {
                  const renderedBlock = renderToolbarRow1Block(blockId);
                  const shouldRenderBlock = isToolbarEditMode || isToolbarBlockEnabled(blockId);
                  return <div
                    key={blockId}
                    draggable={isToolbarEditMode}
                    onDragStart={() => {
                    setDraggingToolbarBlockId(blockId);
                    setDraggingToolbarRow2BlockId(null);
                    setDraggingToolbarRow3BlockId(null);
                  }}
                    onDragOver={event => {
                    if (!isToolbarEditMode) return;
                    event.preventDefault();
                  }}
                    onDrop={() => {
                    if (!isToolbarEditMode) return;
                    const draggedBlockId = getActiveDraggedToolbarBlockId();
                    moveToolbarBlockAcrossRows(draggedBlockId, 'row1', blockId);
                  }}
                    onDragEnd={clearDraggingToolbarBlockIds}
                    style={isToolbarEditMode ? {
                    border: '1px dashed rgba(8, 19, 26, 0.55)',
                    borderRadius: 8,
                    padding: '2px 4px',
                    cursor: 'move',
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(8, 19, 26, 0.12)' : 'rgba(255, 255, 255, 0.25)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  } : {
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  >
                      {shouldRenderBlock ? renderedBlock || (isToolbarEditMode ? <Badge bg="secondary">{blockId}</Badge> : null) : null}
                    </div>;
                })}
                </div>
                
                {/* Bottom toolbar line */}
                <div className="d-flex align-items-center gap-2 small position-relative" style={{
                ...toolbarRowStyle,
                minWidth: isToolbarEditMode ? 'max-content' : 0
              }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row3');
                clearDraggingToolbarBlockIds();
              }}>
                  {toolbarRow3Order.map(blockId => {
                  const renderedBlock = renderToolbarRow3Block(blockId);
                  const shouldRenderBlock = isToolbarEditMode || isToolbarBlockEnabled(blockId);
                  const blockNode = <div
                    key={blockId}
                    draggable={isToolbarEditMode}
                    onDragStart={() => {
                    setDraggingToolbarBlockId(null);
                    setDraggingToolbarRow2BlockId(null);
                    setDraggingToolbarRow3BlockId(blockId);
                  }}
                    onDragOver={event => {
                    if (!isToolbarEditMode) return;
                    event.preventDefault();
                  }}
                    onDrop={() => {
                    if (!isToolbarEditMode) return;
                    const draggedBlockId = getActiveDraggedToolbarBlockId();
                    moveToolbarBlockAcrossRows(draggedBlockId, 'row3', blockId);
                  }}
                    onDragEnd={clearDraggingToolbarBlockIds}
                    style={isToolbarEditMode ? {
                    border: '1px dashed rgba(8, 19, 26, 0.55)',
                    borderRadius: 8,
                    padding: '2px 4px',
                    cursor: 'move',
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(8, 19, 26, 0.12)' : 'rgba(255, 255, 255, 0.25)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  } : {
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  >
                      {shouldRenderBlock ? renderedBlock || (isToolbarEditMode ? <Badge bg="secondary">{blockId}</Badge> : null) : null}
                    </div>;
                  return blockId === 'theme-toggle' ? <div key={`${blockId}-right`} className="ms-auto d-flex align-items-center">{blockNode}</div> : blockNode;
                })}
                </div>
              </div>}
              {aiPlannerCollapsed ? <div className="mx-3 mt-2 mb-2 d-flex align-items-center justify-content-start gap-2 flex-nowrap" style={{
              overflowX: 'hidden',
              overflowY: 'hidden',
              minWidth: 0,
              whiteSpace: 'nowrap',
              backgroundColor: isDarkTheme ? '#151b2b' : '#e8f3e8',
              border: isDarkTheme ? '1px solid rgba(148, 163, 184, 0.12)' : '1px solid rgba(15, 23, 42, 0.12)',
              borderRadius: 10,
              padding: '4px 6px'
            }}>
                  <Button variant="warning" size="sm" onClick={openDetachedMapScreen} style={compactMapToolbarButtonStyle}>
                    Map
                  </Button>
                  <button type="button" onClick={() => setAiPlannerCollapsed(false)} style={aiPlannerCollapsedTriggerStyle}>
                    AI Route
                  </button>
                  {renderStatusFilterBlock()}
                  {renderColumnsButton()}
                  {renderSecondaryToolbarActionBlocks()}
                </div> : <div className="mx-3 mb-3 p-3 rounded-3 border" style={aiPlannerPanelStyle}>
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div>
                      <div className="fw-semibold">AI Smart Route</div>
                      <div className="small" style={mutedThemeTextStyle}>Driver + anchor trip + ZIP + cutoff time. Then Local or GPT builds the route.</div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <Badge bg={aiPlannerMode === 'openai' ? 'primary' : 'secondary'}>{aiPlannerMode === 'openai' ? 'GPT' : 'LOCAL'}</Badge>
                      <Button variant={isDarkTheme ? 'outline-light' : 'light'} size="sm" onClick={() => setAiPlannerCollapsed(true)} style={{ minWidth: 38 }} title="Hide AI Smart Route">
                        <IconifyIcon icon="iconoir:eye-closed" />
                      </Button>
                    </div>
                  </div>

                  {!selectedDriverId || tripDateFilter === 'all' ? <div className="small" style={mutedThemeTextStyle}>Select a driver and a specific day first.</div> : <div className="d-flex flex-column gap-2">
                      <Form.Group>
                    <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Driver</Form.Label>
                        <Form.Control value={selectedDriver?.name || 'No driver selected'} readOnly />
                      </Form.Group>
                      <Form.Group>
                        <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Anchor trip</Form.Label>
                        <Form.Select size="sm" value={aiPlannerAnchorTripId} onChange={event => setAiPlannerAnchorTripId(event.target.value)}>
                          <option value="">Select anchor trip</option>
                          {aiPlanningScopeTrips.map(trip => <option key={`ai-anchor-${trip.id}`} value={trip.id}>{getPlannerTripLabel(trip)}</option>)}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group>
                        <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Start ZIP</Form.Label>
                        <Form.Select size="sm" value={aiPlannerStartZip} onChange={event => setAiPlannerStartZip(event.target.value)}>
                          <option value="">Use anchor trip ZIP</option>
                          {aiPlannerZipOptions.map(zip => <option key={`ai-zip-${zip}`} value={zip}>{zip}</option>)}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group>
                        <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">City</Form.Label>
                        <Form.Select size="sm" value={aiPlannerCityFilter} onChange={event => setAiPlannerCityFilter(event.target.value)}>
                          <option value="">All cities</option>
                          {aiPlannerCityOptions.map(city => <option key={`ai-city-${city}`} value={city}>{city}</option>)}
                        </Form.Select>
                      </Form.Group>
                      <div className="rounded-3 border p-2" style={aiPlannerInnerSectionStyle}>
                        <div className="small text-uppercase fw-semibold mb-2" style={mutedThemeTextStyle}>City route pairs</div>
                        <div className="row g-2">
                          <div className="col-6">
                            <Form.Group>
                              <Form.Label className="small text-muted fw-semibold mb-1">Origin</Form.Label>
                              <Form.Select size="sm" value={aiPlannerRoutePairPickupCity} onChange={event => setAiPlannerRoutePairPickupCity(event.target.value)}>
                                <option value="">Select origin</option>
                                {aiPlannerRoutePairPickupOptions.map(city => <option key={`ai-route-pickup-${city}`} value={city}>{city}</option>)}
                              </Form.Select>
                            </Form.Group>
                          </div>
                          <div className="col-6">
                            <Form.Group>
                              <Form.Label className="small text-muted fw-semibold mb-1">Destination</Form.Label>
                              <Form.Select size="sm" value={aiPlannerRoutePairDropoffCity} onChange={event => setAiPlannerRoutePairDropoffCity(event.target.value)}>
                                <option value="">Select destination</option>
                                {aiPlannerRoutePairDropoffOptions.map(city => <option key={`ai-route-dropoff-${city}`} value={city}>{city}</option>)}
                              </Form.Select>
                            </Form.Group>
                          </div>
                        </div>
                        <div className="row g-2 mt-1">
                          <div className="col-7">
                            <Form.Group>
                              <Form.Label className="small text-muted fw-semibold mb-1">Direction</Form.Label>
                              <Form.Select size="sm" value={aiPlannerRoutePairMode} onChange={event => setAiPlannerRoutePairMode(event.target.value)}>
                                <option value="exact">Exact direction only</option>
                                <option value="both">Auto round-trip pairs</option>
                              </Form.Select>
                            </Form.Group>
                          </div>
                          <div className="col-5 d-flex align-items-end">
                            <Button variant="outline-dark" size="sm" className="w-100" onClick={handleAddAiPlannerRoutePair}>
                              Add pair
                            </Button>
                          </div>
                        </div>
                        {aiPlannerRoutePairs.length > 0 ? <div className="d-flex flex-wrap gap-2 mt-2">
                            {aiPlannerRoutePairs.map(pairKey => <button
                              key={`ai-route-pair-${pairKey}`}
                              type="button"
                              onClick={() => handleRemoveAiPlannerRoutePair(pairKey)}
                              className="btn btn-sm btn-outline-secondary"
                            >
                              {formatAiPlannerRoutePairLabel(pairKey)} x
                            </button>)}
                          </div> : <div className="small mt-2" style={mutedThemeTextStyle}>If you do not add pairs, the planner uses any origin and destination in the pool.</div>}
                        {aiPlannerRoutePairs.length > 0 ? <div className="d-flex justify-content-between align-items-center gap-2 mt-2">
                            <div className="small" style={mutedThemeTextStyle}>Mode: {aiPlannerRoutePairMode === 'both' ? 'auto round-trip pairs' : 'exact direction only'}.</div>
                            <Button variant={isDarkTheme ? 'outline-light' : 'light'} size="sm" onClick={handleClearAiPlannerRoutePairs}>Clear pairs</Button>
                          </div> : null}
                      </div>
                      <div className="row g-2">
                        <div className="col-6">
                          <Form.Group>
                            <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Legs</Form.Label>
                            <Form.Select size="sm" value={aiPlannerLegFilter} onChange={event => setAiPlannerLegFilter(event.target.value)}>
                              <option value="all">All</option>
                              <option value="AL">AL</option>
                              <option value="BL">BL</option>
                              <option value="CL">CL</option>
                            </Form.Select>
                          </Form.Group>
                        </div>
                        <div className="col-6">
                          <Form.Group>
                            <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Type</Form.Label>
                            <Form.Select size="sm" value={aiPlannerTypeFilter} onChange={event => setAiPlannerTypeFilter(event.target.value)}>
                              <option value="all">All</option>
                              <option value="A">A</option>
                              <option value="W">W</option>
                              <option value="STR">STR</option>
                            </Form.Select>
                          </Form.Group>
                        </div>
                      </div>
                      <Form.Group>
                        <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Max trips</Form.Label>
                        <Form.Control size="sm" type="number" min="1" max="200" value={aiPlannerMaxTrips} onChange={event => setAiPlannerMaxTrips(event.target.value)} />
                      </Form.Group>
                      <Form.Group>
                        <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Max late minutes</Form.Label>
                        <Form.Control size="sm" type="number" min="0" max="120" value={aiPlannerLateToleranceMinutes} onChange={event => setAiPlannerLateToleranceMinutes(event.target.value)} />
                      </Form.Group>
                      <Form.Group>
                        <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Cutoff time</Form.Label>
                        <Form.Control size="sm" type="time" value={aiPlannerCutoffTime} onChange={event => setAiPlannerCutoffTime(event.target.value)} />
                      </Form.Group>

                      <div className="d-grid gap-2 mt-1">
                        <Button variant="outline-secondary" size="sm" disabled={aiPlannerLoading} onClick={() => void handlePreviewAiSmartRoute('local')}>
                          {aiPlannerLoading && aiPlannerMode === 'local' ? 'Building local preview...' : 'Local Preview'}
                        </Button>
                        <Button variant="outline-primary" size="sm" disabled={aiPlannerLoading} onClick={() => void handlePreviewAiSmartRoute('openai')}>
                          {aiPlannerLoading && aiPlannerMode === 'openai' ? 'Building GPT preview...' : 'GPT Preview'}
                        </Button>
                        <Button variant="success" size="sm" disabled={aiPlannerLoading || !aiPlannerPreview?.plan} onClick={() => void handleApplyAiSmartRoute()}>
                          {aiPlannerLoading && aiPlannerPreview?.plan ? 'Applying route...' : 'Apply Preview'}
                        </Button>
                        <Button variant={isDarkTheme ? 'outline-light' : 'light'} size="sm" disabled={!aiPlannerPreview?.plan || aiPlannerLoading} onClick={handleClearAiPlannerPreview}>
                          Clear Preview
                        </Button>
                      </div>

                      <div className="small" style={mutedThemeTextStyle}>
                        {selectedTripIds.length > 0 ? `Using ${aiPlanningScopeTrips.length} selected trip(s) as pool.` : `Using ${aiPlanningScopeTrips.length} visible trips from this day as pool.`}
                      </div>
                      {aiPlannerPreview?.plan?.routes?.[0] ? <div className="small" style={mutedThemeTextStyle}>
                          Current preview: {aiPlannerPreview.plan.routes[0].tripIds.length} trip(s).
                        </div> : null}
                      <div className="small" style={mutedThemeTextStyle}>
                        Active filters: {aiPlannerCityFilter || 'all cities'} / {aiPlannerRoutePairs.length > 0 ? aiPlannerRoutePairs.map(formatAiPlannerRoutePairLabel).join(', ') : 'no pairs'} / {aiPlannerRoutePairs.length > 0 ? aiPlannerRoutePairMode === 'both' ? 'round-trip' : 'exact direction' : 'any direction'} / {aiPlannerLegFilter === 'all' ? 'all legs' : aiPlannerLegFilter} / {aiPlannerTypeFilter === 'all' ? 'all types' : aiPlannerTypeFilter} / max {aiPlannerMaxTrips || 'no limit'} / late {aiPlannerLateToleranceMinutes || '0'} min.
                      </div>

                      {aiPlannerPreview?.plan?.routes?.[0] ? <div className="rounded-3 border p-2" style={aiPlannerInnerSectionStyle}>
                          <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                            <div className="fw-semibold small">{aiPlannerPreview.plan.routes[0].name}</div>
                            <Badge bg="dark">{aiPlannerPreview.plan.routes[0].tripIds.length} trips</Badge>
                          </div>
                          <div className="small mb-2" style={mutedThemeTextStyle}>{aiPlannerPreview.plan.routes[0].notes}</div>
                          <div className="d-flex flex-column gap-1" style={{ maxHeight: 132, overflowY: 'auto' }}>
                            {aiPlannerPreview.plan.routes[0].stops.map((stop, index) => <div key={`ai-stop-${stop.id}-${index}`} className="small d-flex justify-content-between gap-2">
                                <span className="fw-semibold">{index + 1}. {stop.rider || stop.id}</span>
                                <span className="text-end" style={mutedThemeTextStyle}>
                                  {stop.estimatedArrivalLabel || '--'}
                                  {' '}→{' '}
                                  {stop.pickup || '--'}
                                  {Number.isFinite(stop.lateMinutes) && stop.lateMinutes > 0 ? ` (${stop.lateMinutes} min late)` : ' (on time)'}
                                </span>
                              </div>)}
                          </div>
                        </div> : null}
                    </div>}
                </div>}
              {showLiveTripScanPanel ? <div className="mx-3 mb-3 rounded-3 border" style={{
              borderColor: isDarkTheme ? 'rgba(45, 212, 191, 0.18)' : 'rgba(16, 185, 129, 0.22)',
              backgroundColor: isDarkTheme ? '#101827' : '#ffffff'
            }}>
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap p-3" style={{
                  background: isDarkTheme ? 'linear-gradient(180deg, #158f71 0%, #11745b 100%)' : 'linear-gradient(180deg, #2fb98a 0%, #1f9f77 100%)',
                  color: '#ffffff',
                  rowGap: '0.9rem',
                  paddingBottom: '1rem'
                }}>
                    <div className="d-flex flex-column gap-2" style={{ minWidth: 0 }}>
                      <strong>System Trip Scanner</strong>
                      <div className="small" style={{ color: 'rgba(255, 255, 255, 0.92)', maxWidth: 760 }}>
                        You can open Excel Loader with scanner here. Nothing enters the tree until you press Import Trips or Load Route.
                      </div>
                      {liveTripScanAttentionGroups.length > 0 ? <div className="d-flex flex-wrap gap-2">
                          {liveTripScanAttentionGroups.map(group => <Button
                              key={`live-scan-${group.rider}-${group.tripId}`}
                              variant="warning"
                              size="sm"
                              onClick={() => handleFocusLiveScanTrip(group.tripId, group.rider)}
                            >
                              {group.rider}{group.count > 1 ? ` (${group.count})` : ''}
                            </Button>)}
                        </div> : <div className="small" style={{ color: 'rgba(255, 255, 255, 0.92)' }}>No riders need attention in the visible system trips.</div>}
                    </div>
                    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                      <Badge bg={liveTripScan?.blockingCount > 0 ? 'danger' : liveTripScan?.warningCount > 0 ? 'warning' : 'light'} text={liveTripScan?.blockingCount > 0 ? undefined : 'dark'}>
                        {liveTripScan?.findingCount || 0}
                      </Badge>
                      {renderScannerConfirmationPanelButtons()}
                      <Button variant="light" size="sm" onClick={() => {
                      setShowTripImportModal(true);
                      setStatusMessage('Excel Loader with scanner opened inside Trip Dashboard. Nothing changes in the tree until you import.');
                    }}>
                        Excel Loader + Scanner
                      </Button>
                      <Button variant="light" size="sm" onClick={handleResetLiveScanFocus}>Reset</Button>
                      <Button variant="light" size="sm" onClick={handleInvertSelectedLiveScanTrips} disabled={selectedVisibleTrips.length === 0}>Invert Selected</Button>
                      <Button variant="light" size="sm" onClick={handleAutoRepairLiveScan}>Auto Repair</Button>
                      <Button variant="light" size="sm" onClick={() => setShowLiveTripScanPanel(false)}>Hide</Button>
                    </div>
                  </div>
                </div> : null}
                  {filteredTrips.length > 0 ? null : null}
              <div ref={tripTableBottomScrollerRef} className="table-responsive flex-grow-1 trip-dashboard-sheet-wrap" onScroll={() => syncTripTableScroll('bottom')} style={{ minHeight: 0, height: '100%', maxHeight: '100%', overflowX: 'auto', overflowY: 'auto', scrollbarGutter: 'auto', scrollbarWidth: 'thin', msOverflowStyle: 'auto', paddingBottom: 0 }}>
                <Table ref={tripTableElementRef} hover className="align-middle mb-0 trip-dashboard-sheet-table" data-bs-theme={themeMode} style={{ whiteSpace: 'nowrap', minWidth: 'max-content', width: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead className={themeMode === 'dark' ? 'table-dark' : ''} style={{ position: 'sticky', top: 0, backgroundColor: tripTableHeaderStyle.backgroundColor, color: tripTableHeaderStyle.color }}>
                    <tr>
                      <th style={{ ...tripHeaderCellStyle, width: 48 }}>
                        <div className="d-flex align-items-center gap-1">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={event => handleSelectAll(event.target.checked)}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 4,
                              border: '1px solid #6b7280',
                              backgroundColor: '#6b7280',
                              accentColor: '#8b5cf6',
                              cursor: 'pointer'
                            }}
                          />
                          <span className="small fw-semibold" style={{ lineHeight: 1 }}>{selectedTripIds.length}</span>
                        </div>
                      </th>
                      {renderTripHeader('act', 'ACT', 56, false)}
                      {hasTripNotesColumn ? renderTripHeader('notes', <span className="d-inline-flex align-items-center gap-1" style={{ whiteSpace: 'nowrap' }}><IconifyIcon icon="iconoir:page-edit" /><span style={{ fontWeight: 700 }}>Notes</span></span>, 148, false) : null}
                      {showConfirmationTools ? renderTripHeader('confirmation-tools', 'Confirm', 158, false) : null}
                      {orderedVisibleTripColumnsWithoutNotes.map(columnKey => {
                        const metadata = tripColumnMeta[columnKey];
                        if (!metadata) return null;
                        return <React.Fragment key={`trip-header-${columnKey}`}>{renderTripHeader(columnKey, metadata.label, metadata.width, metadata.sortable, true)}</React.Fragment>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFilteredTripRows.length > 0 ? groupedFilteredTripRows.filter(row => row.type === 'trip').map(row => <tr key={row.trip.id} className={selectedTripIdSet.has(normalizeTripId(row.trip.id)) ? 'table-primary' : isTripAssignedToSelectedDriver(row.trip) ? 'table-success' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTripIdSet.has(normalizeTripId(row.trip.id))}
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
                        <td style={{ width: columnWidths.act ?? 56, minWidth: columnWidths.act ?? 56, whiteSpace: 'nowrap' }}>
                          <div className="d-flex align-items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                            <Button variant={row.trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" onClick={() => {
                          setSelectedTripIds([row.trip.id]);
                          setSelectedDriverId(row.trip.driverId ?? selectedDriverId);
                          setSelectedRouteId(row.trip.routeId);
                          setStatusMessage(`Trip ${row.trip.id} activo.`);
                        }}>ACT</Button>
                          </div>
                        </td>
                        {hasTripNotesColumn ? renderTripDataCell(row.trip)('notes') : null}
                        {showConfirmationTools ? <td style={{ width: 158, minWidth: 158, maxWidth: 158, whiteSpace: 'nowrap', paddingTop: 4, paddingBottom: 4 }}>
                          <div className="d-flex align-items-center gap-1 flex-nowrap" style={{ width: 'max-content' }}>
                              <Button variant={getTripConfirmationActionVariant(row.trip, tripBlockingMap.get(row.trip.id))} size="sm" onClick={() => handleManualConfirm(row.trip)} style={compactTripActionLabelButtonStyle} title={getTripConfirmationActionLabel(row.trip, tripBlockingMap.get(row.trip.id))}>
                                {String(getTripConfirmationActionLabel(row.trip, tripBlockingMap.get(row.trip.id)) || 'Confirm').slice(0, 2).toUpperCase()}
                              </Button>
                              <Button variant="outline-danger" size="sm" onClick={() => handleCancelWithNote(row.trip)} style={compactTripActionButtonStyle} title="Cancel trip">
                                X
                              </Button>
                              <Button variant="outline-info" size="sm" onClick={() => handleOpenTripUpdateModal(row.trip)} style={compactTripActionButtonStyle} title="Open note and trip update editor">
                                N
                              </Button>
                              <span style={{ width: 26, flex: '0 0 26px' }} />
                              <Button size="sm" style={{ ...compactTripActionLabelButtonStyle, backgroundColor: '#000000', borderColor: '#000000', color: '#ffffff' }} onClick={() => void handleToggleTripBlock(row.trip)} title={getEffectiveConfirmationStatus(row.trip, tripBlockingMap.get(row.trip.id)) === 'Opted Out' ? 'Remove from black list' : 'Add to black list'}>
                                {getEffectiveConfirmationStatus(row.trip, tripBlockingMap.get(row.trip.id)) === 'Opted Out' ? 'RM' : 'BL'}
                              </Button>
                          </div>
                        </td> : null}
                        {orderedVisibleTripColumnsWithoutNotes.map(columnKey => <React.Fragment key={`${row.trip.id}-${columnKey}`}>{renderTripDataCell(row.trip)(columnKey)}</React.Fragment>)}
                      </tr>) : <tr>
                        <td colSpan={tripTableColumnCount} className="text-center text-muted py-4">No activity found for that day. If a route was saved, check the same day in Trip Route to view related trips and drivers.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>}
        </div>

        <div onMouseDown={() => showBottomPanels && !isFocusRightLayout ? setDragMode('row') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'row-resize',
        gridColumn: isStackedLayout ? 1 : '1 / span 3',
        gridRow: 2,
        display: showBottomPanels && !isFocusRightLayout ? 'block' : 'none'
      }}>
          <div className="position-absolute top-50 start-50 translate-middle rounded-pill" style={{ width: 56, height: 6, backgroundColor: '#6b7280' }} />
        </div>

        <div onMouseDown={() => showBottomPanels && isStandardLayout ? setDragMode('both') : undefined} style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: '#58607a',
        border: '3px solid #0f1320',
        position: 'absolute',
        left: `calc(${columnSplit}% - ${columnDividerSize / 2}px)`,
        top: `calc(${rowSplit}% - ${rowDividerSize / 2}px)`,
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        zIndex: 50,
        boxShadow: '0 0 0 2px rgba(88, 96, 122, 0.25)',
        display: showBottomPanels && isStandardLayout ? 'block' : 'none'
      }} />

        {isStandardLayout ? <div style={{
        display: showBottomPanels ? 'grid' : 'none',
        minWidth: 0,
        minHeight: 0,
        gridColumn: '1 / span 3',
        gridRow: 3,
        gridTemplateColumns: dockPanelsVisible.length === 1 ? 'minmax(0, 1fr)' : showMapPane ? `${columnSplit}% minmax(0, ${100 - columnSplit}%)` : '1fr 1fr'
      }}>
            {dockPanelsVisible.length > 0 ? <div style={{ minWidth: 0, minHeight: 0, gridColumn: 1 }}>
                {dockPanelsVisible[0].node}
              </div> : null}
            {dockPanelsVisible.length > 1 ? <>
                <div style={{ minWidth: 0, minHeight: 0, gridColumn: 2 }}>
                  {dockPanelsVisible[1].node}
                </div>
              </> : null}
          </div> : null}

        {isFocusRightLayout ? <div style={{
        display: 'grid',
        minWidth: 0,
        minHeight: 0,
        gridColumn: 1,
        gridRow: 1,
        gridTemplateRows: dockPanelsVisible.length > 1 ? 'minmax(0, 1fr) 0px minmax(0, 1fr)' : 'minmax(0, 1fr)'
      }}>
            {dockPanelsVisible.length > 0 ? <div style={{ minWidth: 0, minHeight: 0, gridRow: 1 }}>
                {dockPanelsVisible[0].node}
              </div> : null}
            {dockPanelsVisible.length > 1 ? <>
                <div style={{ gridRow: 2, display: 'none' }} />
                <div style={{ minWidth: 0, minHeight: 0, gridRow: 3 }}>
                  {dockPanelsVisible[1].node}
                </div>
              </> : null}
          </div> : null}

        {isStackedLayout ? <div style={{
        display: 'grid',
        minWidth: 0,
        minHeight: 0,
        gridColumn: 1,
        gridRow: 3,
        gridTemplateRows: dockPanelsVisible.length > 1 ? 'minmax(0, 1fr) 0px minmax(0, 1fr)' : 'minmax(0, 1fr)'
      }}>
            {dockPanelsVisible.length > 0 ? <div style={{ minWidth: 0, minHeight: 0, gridRow: 1 }}>
                {dockPanelsVisible[0].node}
              </div> : null}
            {dockPanelsVisible.length > 1 ? <>
                <div style={{ gridRow: 2, display: 'none' }} />
                <div style={{ minWidth: 0, minHeight: 0, gridRow: 3 }}>
                  {dockPanelsVisible[1].node}
                </div>
              </> : null}
          </div> : null}

        <ManualTripModal
          show={showManualTripModal}
          onHide={() => setShowManualTripModal(false)}
          onSave={handleCreateManualTrip}
          initialServiceDate={tripDateFilter === 'all' ? getLocalDateKey() : tripDateFilter}
          sourceLabel="Trip Dashboard"
        />

        <Modal show={showTripImportModal} onHide={() => setShowTripImportModal(false)} size="xl" fullscreen="lg-down" centered scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Excel Loader + Scanner</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted mb-3">Load and scan the Excel or CSV directly in Trip Dashboard without opening the separate Excel Loader page. The current tree is not changed until you confirm Import Trips or Load Route.</p>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button variant="success" onClick={handleOpenTripImportPicker} disabled={isImportParsing}>
                {isImportParsing ? 'Reading file...' : 'Browse Excel or CSV'}
              </Button>
              <Button variant="outline-secondary" onClick={() => router.push('/forms-safe-ride-import')}>
                Open Full Excel Loader
              </Button>
            </div>
            <Form.Group className="mb-3">
              <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Choose file</Form.Label>
              <Form.Control
                ref={importFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleTripImportFileChange}
                disabled={isImportParsing}
              />
              <div className="small text-muted mt-2">Pick the `.xlsx`, `.xls`, or `.csv` file from your computer here.</div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="small text-uppercase text-muted fw-semibold mb-1">Or paste local path</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                <Form.Control
                  value={localImportPath}
                  onChange={event => setLocalImportPath(event.target.value)}
                  placeholder="C:\\Users\\cored\\Downloads\\rides_138493_1776166947.csv"
                  disabled={isImportParsing}
                />
                <Button variant="outline-primary" onClick={() => void handleTripImportPathLoad()} disabled={isImportParsing || !String(localImportPath || '').trim()}>
                  {isImportParsing ? 'Reading path...' : 'Load From Path'}
                </Button>
              </div>
              <div className="small text-muted mt-2">Use a full Windows path from Downloads, Desktop, Documents, or this project folder.</div>
            </Form.Group>
            <div className="small text-muted mb-2">{selectedImportFileName ? `Selected file: ${selectedImportFileName}` : 'No file selected.'}</div>
            <div className="small text-muted mb-2">{importedServiceDateKeys.length > 0 ? `Detected service dates: ${importedServiceDateKeys.join(', ')}` : 'Detected service dates: -'}</div>
            <div className="small text-muted mb-3">{importPendingTrips.length > 0 ? `${importPendingTrips.length} trip(s) ready to import.` : 'Choose an import file to load trips here.'}</div>
            {importRoutingChanges.length > 0 ? <Alert variant="warning" className="mb-3">
                <div className="fw-semibold mb-1">Address changes found</div>
                <div className="small mb-2">{importRoutingChanges.length} trip(s) in this file do not match the current system address.</div>
                <Button variant="outline-dark" size="sm" onClick={() => setShowImportRoutingChangeModal(true)}>Review Address Changes</Button>
              </Alert> : null}
            {importScan?.findingCount > 0 ? <Alert variant={importScan.blockingCount > 0 ? 'danger' : 'warning'} className="mb-3">
                <div className="fw-semibold mb-1">File scanner findings</div>
                <div className="small mb-2">Found {importScan.findingCount} issue(s): {importScan.blockingCount} blocking and {importScan.warningCount} warning.</div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {importScan.findings.slice(0, 6).map(finding => <div key={finding.id} className="rounded-3 border bg-white p-2">
                      <div className="d-flex flex-wrap justify-content-between gap-2 mb-1">
                        <div className="fw-semibold">{finding.title}</div>
                        <Badge bg={finding.severity === 'blocking' ? 'danger' : 'warning'}>{finding.severity === 'blocking' ? 'Blocking' : 'Warning'}</Badge>
                      </div>
                      <div className="small text-muted">{finding.detail}</div>
                      {finding.brokerTripIds.length > 0 ? <div className="small mt-1">Trip ID(s): {finding.brokerTripIds.join(', ')}</div> : null}
                      {finding.riderNames.length > 0 ? <div className="small mt-1">Rider(s): {finding.riderNames.join(', ')}</div> : null}
                      {finding.routes.length > 0 ? <div className="small mt-1 d-flex flex-column gap-1">
                          {finding.routes.slice(0, 3).map((route, routeIndex) => <div key={`${finding.id}-route-${routeIndex}`}>
                              {route.brokerTripId || route.rideId || 'Trip'}: {route.fromAddress || '-'} {'->'} {route.toAddress || '-'}
                            </div>)}
                        </div> : null}
                      {finding.serviceDates.length > 0 ? <div className="small text-muted">Date(s): {finding.serviceDates.join(', ')}</div> : null}
                    </div>)}
                </div>
                {importScan.findings.length > 6 ? <div className="small mt-2">Showing the first 6 findings.</div> : null}
              </Alert> : null}
            {importedRouteDriverSummary.usableGroups.length > 0 ? <Alert variant="info" className="mb-3">
                <div className="fw-semibold mb-1">Routes found in file</div>
                <div className="small mb-2">Found {importedRouteDriverSummary.usableGroups.length} route name(s) in the file. Match each route to one of your drivers before pressing Load Route.</div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {importedRouteDriverSummary.usableGroups.map(group => {
                    const selectedAssignment = String(routeImportAssignments[group.key] || '').trim();
                    const exactMatch = findImportedDriverExactMatch(group.label, drivers);
                    return <div key={`route-driver-match-${group.key}`} className="rounded-3 border p-2 bg-white">
                        <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                          <div>
                            <div className="fw-semibold">{group.label}</div>
                            <div className="small text-muted">{group.tripCount} trip(s){group.serviceDates.length > 0 ? ` • ${group.serviceDates.join(', ')}` : ''}</div>
                          </div>
                          <Badge bg={selectedAssignment ? 'success' : exactMatch ? 'primary' : 'warning'}>{selectedAssignment ? 'Matched' : exactMatch ? 'Exact match found' : 'Needs match'}</Badge>
                        </div>
                        <Form.Select size="sm" value={selectedAssignment} onChange={event => setRouteImportAssignments(previousAssignments => ({
                      ...previousAssignments,
                      [group.key]: event.target.value
                    }))}>
                          <option value="">Choose driver...</option>
                          {exactMatch?.id ? <option value={exactMatch.id}>Use exact match: {exactMatch.name}</option> : null}
                          <option value={`${ROUTE_IMPORT_ADD_PREFIX}${group.label}`}>Add new driver: {group.label}</option>
                          {drivers.slice().sort((leftDriver, rightDriver) => String(leftDriver?.name || '').localeCompare(String(rightDriver?.name || ''), undefined, { sensitivity: 'base' })).map(driver => <option key={`route-driver-option-${group.key}-${driver.id}`} value={driver.id}>{driver.name}</option>)}
                        </Form.Select>
                      </div>;
                  })}
                </div>
              </Alert> : null}
            {importPendingTrips.length > 0 && importedRouteDriverSummary.usableGroups.length === 0 ? <Alert variant="warning" className="mb-3">No route or driver names were detected in this file. If this spreadsheet uses another header, I expanded the parser for common driver columns, but this particular file still did not expose a usable route name.</Alert> : null}
            {importedRouteDriverSummary.missingNameTripCount > 0 ? <div className="small text-muted mb-3">{importedRouteDriverSummary.missingNameTripCount} trip(s) in the file do not have a usable route/driver name, so they cannot be auto-routed until you import a file that includes that column.</div> : null}
            {importPendingTrips.length > 0 ? <Alert variant="success" className="mb-0">
                <div className="fw-semibold mb-1">Import ready</div>
                <div>{importPendingTrips.length} trip(s) will be merged into the current local dispatch state.</div>
                <div className="small mt-2">Use <strong>Load Route</strong> after matching the route names above. You can choose an existing driver or add a new one when the imported name is misspelled or missing from your system.</div>
              </Alert> : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowTripImportModal(false)}>Close</Button>
            <Button variant="success" onClick={handleImportTripsIntoDashboard} disabled={importPendingTrips.length === 0 || isImportParsing}>Import Trips</Button>
            <Button variant="primary" onClick={handleLoadRoutesIntoDashboard} disabled={importPendingTrips.length === 0 || isImportParsing || isRouteImporting}>{isRouteImporting ? 'Loading Route...' : 'Load Route'}</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={showImportRoutingChangeModal} onHide={() => setShowImportRoutingChangeModal(false)} size="xl" centered scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Address Change Review</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3">Review every trip where the new import does not match the current system address.</div>
            <div className="table-responsive">
              <Table bordered hover className="align-middle mb-0" data-bs-theme={themeMode}>
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Rider</th>
                    <th>Current Pickup</th>
                    <th>Imported Pickup</th>
                    <th>Current Dropoff</th>
                    <th>Imported Dropoff</th>
                  </tr>
                </thead>
                <tbody>
                  {importRoutingChanges.length > 0 ? importRoutingChanges.map(change => <tr key={`routing-change-${change.id}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{change.rideId || change.brokerTripId || change.id || '-'}</td>
                      <td>{change.rider || '-'}</td>
                      <td style={{ minWidth: 220, whiteSpace: 'normal' }}>
                        <div>{change.currentAddress || '-'}</div>
                        <div className="small text-muted">ZIP: {change.currentFromZipcode || '-'}</div>
                      </td>
                      <td style={{ minWidth: 220, whiteSpace: 'normal' }} className="table-warning">
                        <div>{change.importedAddress || '-'}</div>
                        <div className="small text-muted">ZIP: {change.importedFromZipcode || '-'}</div>
                      </td>
                      <td style={{ minWidth: 220, whiteSpace: 'normal' }}>
                        <div>{change.currentDestination || '-'}</div>
                        <div className="small text-muted">ZIP: {change.currentToZipcode || '-'}</div>
                      </td>
                      <td style={{ minWidth: 220, whiteSpace: 'normal' }} className="table-warning">
                        <div>{change.importedDestination || '-'}</div>
                        <div className="small text-muted">ZIP: {change.importedToZipcode || '-'}</div>
                      </td>
                    </tr>) : <tr>
                      <td colSpan={6} className="text-center text-muted py-4">No address changes are waiting for review.</td>
                    </tr>}
                </tbody>
              </Table>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowImportRoutingChangeModal(false)}>Close</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={showDayOffModal} onHide={() => setShowDayOffModal(false)} size="sm" centered>
          <Modal.Header closeButton>
            <Modal.Title>Day Off List</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3">Route-planner view only. This list helps the person building the route know who is out for the selected day. Fuel approval stays in Dispatcher.</div>
            <div className="rounded border p-2 mb-3" style={{ backgroundColor: '#f8fafc', borderColor: '#dbe4f0' }}>
              <div className="fw-semibold">Route date</div>
              <div className="small text-muted">{activeRouteDateKey || 'No date selected'}</div>
            </div>
            {routeDayOffDrivers.length > 0 ? <div className="mb-3">
                <div className="fw-semibold mb-2">Out on this route date</div>
                <div className="d-flex flex-column gap-2">
                  {routeDayOffDrivers.map(driver => <div key={`route-dayoff-${driver.id}`} className="rounded border p-2" style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}>
                      <div className="d-flex align-items-start justify-content-between gap-2">
                        <div>
                          <div className="fw-semibold">{driver.name}</div>
                          <div className="small text-muted">{driver.vehicle || 'No vehicle'}{driver.attendant ? ` | Attendant: ${driver.attendant}` : ''}</div>
                        </div>
                        <Badge bg="warning" text="dark">{getDriverTimeOffDateForUi(driver)}</Badge>
                      </div>
                      <div className="small mt-2">{String(driver?.timeOffAppointment?.appointmentType || 'Appointment').trim()}</div>
                      {String(driver?.timeOffAppointment?.note || '').trim() ? <div className="small text-muted mt-1">{String(driver.timeOffAppointment.note).trim()}</div> : null}
                    </div>)}
                </div>
              </div> : <Alert variant="success" className="mb-3">No drivers have day off on {activeRouteDateKey}.</Alert>}
            {futureDayOffDrivers.length > 0 ? <div>
                <div className="fw-semibold mb-2">Other active appointments</div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {futureDayOffDrivers.map(driver => <div key={`future-dayoff-${driver.id}`} className="rounded border p-2" style={{ backgroundColor: '#f8fafc', borderColor: '#dbe4f0' }}>
                      <div className="d-flex align-items-start justify-content-between gap-2">
                        <div>
                          <div className="fw-semibold">{driver.name}</div>
                          <div className="small text-muted">{String(driver?.timeOffAppointment?.appointmentType || 'Appointment').trim()}</div>
                        </div>
                        <Badge bg="secondary">{getDriverTimeOffDateForUi(driver)}</Badge>
                      </div>
                    </div>)}
                </div>
              </div> : null}
            {activeTimeOffDrivers.length === 0 ? <Alert variant="light" className="mb-0">No active day-off appointments found.</Alert> : null}
          </Modal.Body>
        </Modal>

        <Modal show={showColumnPicker} onHide={() => setShowColumnPicker(false)} size="xl" centered scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Trip Columns</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ minHeight: '70vh' }}>
            <div className="row g-4">
              <div className="col-12 col-xl-6">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
                  <div>
                    <div className="fw-semibold">Choose what you want to see in the trips table.</div>
                    <div className="small text-muted">Visible now: {orderedVisibleTripColumns.length} of {allTripColumnKeys.length} columns.</div>
                  </div>
                  <Badge bg="secondary">{orderedVisibleTripColumns.length}/{allTripColumnKeys.length}</Badge>
                </div>
                <div className="d-flex gap-3 mb-3 flex-wrap align-items-center">
                  <Form.Check
                    type="checkbox"
                    id="trip-column-picker-all-columns"
                    label="All Columns"
                    checked={isAllTripColumnsSelected}
                    onChange={() => handleShowAllTripColumns()}
                  />
                  <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" onClick={handleResetTripColumns}>Default setup</Button>
                </div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
                  {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={`trip-column-picker-${option.key}`} type="switch" id={`trip-column-picker-${option.key}`} label={option.label} checked={orderedVisibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} />)}
                </div>
              </div>
              <div className="col-12 col-xl-6">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
                  <div>
                    <div className="fw-semibold">Toolbar buttons</div>
                    <div className="small text-muted">Hide or show each Trip Dashboard toolbar block. Hidden buttons stay off after refresh until you enable them again.</div>
                  </div>
                  <Badge bg={hasAnyVisibleToolbarBlock ? 'secondary' : 'danger'}>{TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.filter(blockId => isToolbarBlockEnabled(blockId)).length}/{TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.length}</Badge>
                </div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
                  {TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => <Form.Check key={`trip-toolbar-visibility-${blockId}`} type="switch" id={`trip-toolbar-visibility-${blockId}`} label={TRIP_DASHBOARD_TOOLBAR_BLOCK_LABELS[blockId] || blockId} checked={isToolbarBlockEnabled(blockId)} onChange={event => handleToggleToolbarBlockVisibility(blockId, event.target.checked)} />)}
                </div>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowColumnPicker(false)}>Close</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={showBlacklistModal} onHide={handleCloseBlacklistModal} size="xl" centered scrollable>
          <Modal.Header closeButton>
            <Modal.Title>{blacklistDraftTrip ? 'Add To Black List' : 'Black List'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-3 mb-3">
              <div>
                <div className="fw-semibold">{blacklistDraftTrip ? 'Add this passenger to Black List without leaving Trip Dashboard.' : 'Manage blocked passengers without leaving Trip Dashboard.'}</div>
                <div className="small text-muted">{blacklistDraftTrip ? `Trip: ${blacklistDraftTrip.id} | Rider: ${blacklistDraftTrip.rider || '-'}` : `Active entries: ${activeBlacklistEntries.length} of ${blacklistEntries.length} total.`}</div>
                {blacklistError ? <div className="small text-danger mt-2">{blacklistError}</div> : null}
              </div>
              {!blacklistDraftTrip ? <div className="d-flex gap-2 flex-wrap">
                <Button variant={isDarkTheme ? 'outline-light' : 'outline-dark'} size="sm" onClick={() => void refreshBlacklist()} disabled={blacklistLoading || blacklistSaving}>Refresh</Button>
                <Form.Control size="sm" value={blacklistSearch} onChange={event => setBlacklistSearch(event.target.value)} placeholder="Search name, phone, notes..." style={{ width: 240, maxWidth: '100%' }} />
              </div> : null}
            </div>

            <Row className="g-3 mb-3">
              <Col md={4}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Name</Form.Label>
                <Form.Control value={blacklistDraft.name} onChange={event => setBlacklistDraft(current => ({
                ...current,
                name: event.target.value
              }))} />
              </Col>
              <Col md={3}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Phone</Form.Label>
                <Form.Control value={blacklistDraft.phone} onChange={event => setBlacklistDraft(current => ({
                ...current,
                phone: event.target.value
              }))} />
              </Col>
              <Col md={3}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Category</Form.Label>
                <Form.Select value={blacklistDraft.category} onChange={event => setBlacklistDraft(current => ({
                ...current,
                category: event.target.value
              }))}>
                  {BLACKLIST_CATEGORY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Hold Until</Form.Label>
                <Form.Control type="date" value={blacklistDraft.holdUntil} onChange={event => setBlacklistDraft(current => ({
                ...current,
                holdUntil: event.target.value
              }))} />
              </Col>
              <Col md={12}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Notes</Form.Label>
                <Form.Control as="textarea" rows={2} value={blacklistDraft.notes} onChange={event => setBlacklistDraft(current => ({
                ...current,
                notes: event.target.value
              }))} />
              </Col>
            </Row>

            <div className="d-flex justify-content-end mb-3">
              <Button variant="danger" onClick={() => void handleAddBlacklistEntry()} disabled={blacklistSaving}>{blacklistDraftTrip ? 'Save To Black List' : 'Add To Black List'}</Button>
            </div>

            {!blacklistDraftTrip ? <div className="table-responsive">
              <Table hover className="align-middle mb-0" data-bs-theme={themeMode}>
                <thead className={themeMode === 'dark' ? 'table-dark' : 'table-light'}>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Hold Until</th>
                    <th>Notes</th>
                    <th style={{ width: 180 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlacklistEntries.length > 0 ? filteredBlacklistEntries.map(entry => <tr key={entry.id}>
                      <td className="fw-semibold">{entry.name || '-'}</td>
                      <td>{entry.phone || '-'}</td>
                      <td><Badge bg="secondary">{entry.category || 'Other'}</Badge></td>
                      <td><Badge bg={String(entry?.status || 'Active').trim() === 'Active' ? 'danger' : 'secondary'}>{entry.status || 'Active'}</Badge></td>
                      <td>{entry.holdUntil || '-'}</td>
                      <td style={{ maxWidth: 260, whiteSpace: 'normal' }}>{entry.notes || '-'}</td>
                      <td>
                        <div className="d-flex gap-2">
                          <Button variant="outline-secondary" size="sm" onClick={() => void handleToggleBlacklistEntry(entry.id)} disabled={blacklistSaving}>{String(entry?.status || 'Active').trim() === 'Active' ? 'Resolve' : 'Reopen'}</Button>
                          <Button variant="outline-danger" size="sm" onClick={() => void handleDeleteBlacklistEntry(entry.id)} disabled={blacklistSaving}>Delete</Button>
                        </div>
                      </td>
                    </tr>) : <tr>
                      <td colSpan={7} className="text-center text-muted py-4">{blacklistLoading ? 'Loading Black List...' : 'No Black List entries match the current search.'}</td>
                    </tr>}
                </tbody>
              </Table>
            </div> : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseBlacklistModal}>Close</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={showCancelModal} onHide={handleCloseCancelModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>Cancel Trip{cancelTripIds.length > 1 ? 's' : ''}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-2">
              {cancelTripIds.length} trip{cancelTripIds.length > 1 ? 's' : ''} will be cancelled and unassigned from drivers/routes.
            </div>
            <Form.Label className="small text-uppercase text-muted fw-semibold">Cancellation reason (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              value={cancelReasonDraft}
              onChange={event => setCancelReasonDraft(event.target.value)}
              placeholder="Example: Patient called and cancelled with dispatch (optional)"
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseCancelModal}>Back</Button>
            <Button variant="danger" onClick={handleConfirmCancelTrips}>Cancel Trip{cancelTripIds.length > 1 ? 's' : ''}</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={Boolean(noteModalTrip)} onHide={handleCloseTripNote} centered>
          <Modal.Header closeButton>
            <Modal.Title>Patient Note</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-2">{noteModalTrip ? getDisplayTripId(noteModalTrip) : ''}</div>
            <Form.Label className="small text-uppercase text-muted fw-semibold">Imported patient note</Form.Label>
            <Form.Control as="textarea" rows={8} value={getTripImportedNoteText(noteModalTrip)} readOnly onClick={stopInputEventPropagation} onKeyDown={stopInputEventPropagation} onKeyUp={stopInputEventPropagation} placeholder="No patient note came from the Excel import for this trip." />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseTripNote}>Close</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={Boolean(tripExcelCompareModalTrip)} onHide={handleCloseTripExcelCompare} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>Excel Loader vs Current</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {tripExcelCompareModalTrip ? <>
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <div className="fw-semibold">{tripExcelCompareModalTrip.rider || 'Unknown Rider'}</div>
                    <div className="small text-muted">Trip ID: {getDisplayTripId(tripExcelCompareModalTrip) || '-'}</div>
                  </div>
                  <div className="small text-muted text-lg-end">
                    <div>Source: {getTripExcelLoaderSnapshot(tripExcelCompareModalTrip)?.source || 'Excel Loader'}</div>
                    <div>Template: {getTripExcelLoaderSnapshot(tripExcelCompareModalTrip)?.templateLabel || '-'}</div>
                    <div>Row: {getTripExcelLoaderSnapshot(tripExcelCompareModalTrip)?.rowNumber || '-'}</div>
                  </div>
                </div>

                <div className="table-responsive">
                  <Table bordered hover className="align-middle mb-0" data-bs-theme={themeMode}>
                    <thead>
                      <tr>
                        <th style={{ width: '28%' }}>Field</th>
                        <th style={{ width: '36%' }}>Excel Loader</th>
                        <th style={{ width: '36%' }}>Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildTripExcelComparisonRows(tripExcelCompareModalTrip).map(row => {
                    const changed = row.excelValue !== row.currentValue;
                    return <tr key={row.label}>
                            <td className="fw-semibold">{row.label}</td>
                            <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{row.excelValue}</td>
                            <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} className={changed ? 'table-warning' : undefined}>{row.currentValue}</td>
                          </tr>;
                  })}
                    </tbody>
                  </Table>
                </div>
              </> : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseTripExcelCompare}>Close</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={Boolean(cancelNoteModal)} onHide={() => setCancelNoteModal(null)} centered>
          <Modal.Header closeButton>
            <Modal.Title>Cancel Trip</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-2">Trip: {cancelNoteModal?.id}</div>
            <div className="small text-muted mb-3">Rider: {cancelNoteModal?.rider || '-'}</div>
            {cancelNoteModal && getSiblingLegTrips(cancelNoteModal, trips).length > 0 ? <>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Cancel Scope</Form.Label>
                <Form.Select className="mb-3" value={cancelLegScope} onChange={event => setCancelLegScope(event.target.value)}>
                  <option value="single">Only this leg</option>
                  <option value="both">Both legs</option>
                </Form.Select>
              </> : null}
            <Form.Label className="small text-uppercase text-muted fw-semibold">Cancel Reason</Form.Label>
            <Form.Control as="textarea" rows={4} value={cancelNoteDraft} onChange={event => setCancelNoteDraft(event.target.value)} placeholder="Write the cancellation reason for dispatch..." />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setCancelNoteModal(null)}>Close</Button>
            <Button variant="danger" onClick={handleSaveCancelNote}>Cancel Trip</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={Boolean(confirmationMethodModal)} onHide={handleCloseConfirmationMethod} centered>
          <Modal.Header closeButton>
            <Modal.Title>Send Confirmation</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3 pb-2 border-bottom">
              <strong>{confirmationMethodModal?.length || 0} trip(s) selected</strong>
              {confirmationMethodModal?.length > 0 ? <div className="small mt-2">
                  {confirmationMethodModal.slice(0, 5).map(trip => <div key={trip.id}>{buildTripConfirmationLine(trip)}</div>)}
                  {confirmationMethodModal.length > 5 ? <div className="text-muted">+ {confirmationMethodModal.length - 5} more</div> : null}
                </div> : null}
            </div>
            {confirmationRequiresLegChoice ? <>
                <div className="alert alert-warning small">This trip has another leg. Choose one leg or both.</div>
                <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Leg Scope</Form.Label>
                <Form.Select className="mb-3" value={confirmationLegScope} onChange={event => setConfirmationLegScope(event.target.value)}>
                  <option value="">Choose one option</option>
                  <option value="single">Only this leg ({confirmationSourceTrip?.id})</option>
                  <option value="both">Both legs</option>
                </Form.Select>
              </> : null}
            <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Send Via</Form.Label>
            <div className="d-flex gap-3 mb-3">
              <Form.Check type="radio" label="WhatsApp" name="trip-dashboard-confirmation-method" value="whatsapp" checked={confirmationMethod === 'whatsapp'} onChange={event => setConfirmationMethod(event.target.value)} />
              <Form.Check type="radio" label="SMS" name="trip-dashboard-confirmation-method" value="sms" checked={confirmationMethod === 'sms'} onChange={event => setConfirmationMethod(event.target.value)} />
              <Form.Check type="radio" label="Call" name="trip-dashboard-confirmation-method" value="call" checked={confirmationMethod === 'call'} onChange={event => setConfirmationMethod(event.target.value)} />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseConfirmationMethod} disabled={isSendingConfirmation}>Close</Button>
            <Button variant="primary" onClick={() => void handleSendConfirmation()} disabled={isSendingConfirmation || (confirmationRequiresLegChoice && !confirmationLegScope)}>
              {isSendingConfirmation ? 'Sending...' : `Send via ${confirmationMethod === 'whatsapp' ? 'WhatsApp' : confirmationMethod === 'sms' ? 'SMS' : 'Call'}`}
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal show={Boolean(tripUpdateModal)} onHide={() => setTripUpdateModal(null)} centered size="lg">
          <Modal.Header closeButton>
            <Modal.Title>Trip Update</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-2">Trip: {tripUpdateModal?.id} | Rider: {tripUpdateModal?.rider}</div>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Confirmed Via</Form.Label>
                <Form.Select value={tripUpdateConfirmMethod} onChange={event => setTripUpdateConfirmMethod(event.target.value)}>
                  <option value="call">Call</option>
                  <option value="call-left-message">Called and left message</option>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms-left-unconfirmed">Could not confirm, SMS left (English)</option>
                  <option value="cancelled-by-patient">Cancelled by patient</option>
                  <option value="disconnected">Disconnected</option>
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Pickup Time</Form.Label>
                <Form.Control value={tripUpdatePickupTime} onChange={event => setTripUpdatePickupTime(event.target.value)} placeholder="e.g. 07:30 AM" />
              </Col>
              <Col md={4}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Dropoff Time</Form.Label>
                <Form.Control value={tripUpdateDropoffTime} onChange={event => setTripUpdateDropoffTime(event.target.value)} placeholder="e.g. 08:15 AM" />
              </Col>
              {tripUpdateSupportsBothLegs ? <Col md={12}>
                  <Form.Label className="small text-uppercase text-muted fw-semibold">Apply Confirmation To</Form.Label>
                  <Form.Select value={tripUpdateLegScope} onChange={event => setTripUpdateLegScope(event.target.value)}>
                    <option value="single">Only this leg ({tripUpdateModal?.id})</option>
                    <option value="both">Both legs</option>
                  </Form.Select>
                  <div className="small text-muted mt-1">Confirmation and notes can be applied to both legs. Time changes stay only on the current leg.</div>
                </Col> : null}
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Pickup Address</Form.Label>
                <Form.Control value={tripUpdatePickupAddress} onChange={event => setTripUpdatePickupAddress(event.target.value)} placeholder="Pickup address" />
              </Col>
              <Col md={6}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Dropoff Address</Form.Label>
                <Form.Control value={tripUpdateDropoffAddress} onChange={event => setTripUpdateDropoffAddress(event.target.value)} placeholder="Dropoff address" />
              </Col>
              <Col md={12}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Dispatch Note</Form.Label>
                <Form.Control as="textarea" rows={4} value={tripUpdateNote} onChange={event => setTripUpdateNote(event.target.value)} placeholder="Add a trip update note" />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setTripUpdateModal(null)}>Close</Button>
            <Button variant="primary" onClick={() => void handleSaveTripUpdate()}>Save Update</Button>
          </Modal.Footer>
        </Modal>
        <style jsx global>{`
          .trip-dashboard-sheet-wrap {
            background: #f8fbf8;
            scrollbar-width: thin;
            scrollbar-color: #16a34a transparent;
          }

          .trip-dashboard-sheet-wrap::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }

          .trip-dashboard-sheet-wrap::-webkit-scrollbar-track {
            background: transparent;
          }

          .trip-dashboard-sheet-wrap::-webkit-scrollbar-thumb {
            background: #16a34a;
            border-radius: 999px;
          }

          .trip-dashboard-sheet-wrap::-webkit-scrollbar-corner {
            background: transparent;
          }

          .trip-dashboard-sheet-table thead th {
            position: sticky;
            top: 0;
            z-index: 6;
            background: #d6ead8 !important;
            color: #1f2937;
            border-right: 1px solid #c8d8cb;
            border-bottom: 1px solid #b8ccbc;
            padding-top: 0.22rem;
            padding-bottom: 0.22rem;
          }

          .trip-dashboard-sheet-table tbody td {
            border-right: 1px solid #d2ded5;
            border-bottom: 1px solid #dbe7de;
            background: #ffffff;
            padding-top: 0.22rem;
            padding-bottom: 0.22rem;
            font-size: 0.76rem;
            line-height: 1.08;
          }

          .trip-dashboard-sheet-table tbody .btn.btn-sm,
          .trip-dashboard-sheet-table tbody .form-select.form-select-sm,
          .trip-dashboard-sheet-table tbody .form-control.form-control-sm {
            padding-top: 0.14rem;
            padding-bottom: 0.14rem;
            font-size: 0.72rem;
            line-height: 1.05;
          }

          .trip-dashboard-sheet-table tbody tr:nth-child(even) td {
            background: #f9fcf9;
          }

          .trip-dashboard-selector {
            margin-bottom: 0;
          }

          .trip-dashboard-selector .form-check-input {
            width: 16px;
            height: 16px;
            margin-top: 0;
            cursor: pointer;
            border-width: 2px;
          }

          html[data-bs-theme='dark'] .trip-dashboard-selector .form-check-input {
            background-color: #0f172a;
            border-color: #94a3b8;
            box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25);
          }

          html[data-bs-theme='dark'] .trip-dashboard-selector .form-check-input:checked {
            background-color: #60a5fa;
            border-color: #60a5fa;
          }

          html[data-bs-theme='dark'] .trip-dashboard-selector .form-check-input:focus {
            border-color: #93c5fd;
            box-shadow: 0 0 0 0.2rem rgba(96, 165, 250, 0.35);
          }

          html[data-bs-theme='dark'] .trip-dashboard-sheet-wrap {
            background: #111827;
            scrollbar-color: #22c55e transparent;
          }

          html[data-bs-theme='dark'] .trip-dashboard-sheet-wrap::-webkit-scrollbar-thumb {
            background: #22c55e;
          }

          html[data-bs-theme='dark'] .trip-dashboard-sheet-table thead th {
            background: #1f2937 !important;
            color: #e5e7eb;
            border-right: 1px solid #374151;
            border-bottom: 1px solid #4b5563;
          }

          html[data-bs-theme='dark'] .trip-dashboard-sheet-table tbody td {
            background: #0f172a;
            color: #e5e7eb;
            border-right: 1px solid #1f2937;
            border-bottom: 1px solid #243043;
          }

          html[data-bs-theme='dark'] .trip-dashboard-sheet-table tbody tr:nth-child(even) td {
            background: #111c31;
          }
        `}</style>
      </div>
    </>;
};

export default TripDashboardWorkspace;