'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import DispatcherMessagingPanel from '@/components/nemt/DispatcherMessagingPanel';
import { useNemtContext } from '@/context/useNemtContext';
import { useLayoutContext } from '@/context/useLayoutContext';
import { getDriverColor } from '@/helpers/nemt-driver-colors';
import { findTripAssignmentCompatibilityIssue } from '@/helpers/nemt-trip-assignment';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { DISPATCH_TRIP_COLUMN_OPTIONS, getLocalDateKey, getRouteServiceDateKey, getTripLateMinutesDisplay, getTripMobilityLabel, getTripPunctualityLabel, getTripPunctualityVariant, getTripTimelineDateKey, isTripAssignedToDriver, parseTripClockMinutes, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { buildRoutePrintDocument, formatPrintGeneratedAt } from '@/helpers/nemt-print-setup';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import { openWhatsAppConversation, resolveRouteShareDriver } from '@/utils/whatsapp';
import { divIcon } from 'leaflet';
import { useRouter } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';

const TRIP_COLUMN_MIN_WIDTHS = {
  pickup: 56,
  dropoff: 56,
  miles: 56,
  puZip: 64,
  doZip: 64,
  leg: 52,
  lateMinutes: 68
};

const DISPATCHER_ROW1_DEFAULT_BLOCKS = ['status-filter', 'date-controls', 'trip-search', 'day-summary', 'route-actions'];
const DISPATCHER_ROW2_DEFAULT_BLOCKS = ['stats', 'actions', 'columns'];
const DISPATCHER_ROW3_DEFAULT_BLOCKS = ['table-view-mode', 'metric-miles', 'metric-duration'];
const ALL_DISPATCHER_TOOLBAR_BLOCKS = Array.from(new Set([...DISPATCHER_ROW1_DEFAULT_BLOCKS, ...DISPATCHER_ROW2_DEFAULT_BLOCKS, ...DISPATCHER_ROW3_DEFAULT_BLOCKS]));
const canonicalizeToolbarBlockId = value => String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');

const DISPATCHER_TOOLBAR_BLOCK_LABELS = {
  'status-filter': 'Status filter',
  'date-controls': 'Date controls',
  'trip-search': 'Search',
  'day-summary': 'Day summary',
  'route-actions': 'Route actions',
  'stats': 'Stats',
  'actions': 'Actions',
  'columns': 'Columns',
  'table-view-mode': 'Table view mode',
  'metric-miles': 'Miles metric',
  'metric-duration': 'Duration metric'
};

const buildDispatcherHelpButton = (router, setStatusMessage, buttonStyle) => <Button variant="outline-dark" size="sm" style={buttonStyle} onClick={() => {
  setStatusMessage('Opening Help workspace.');
  router.push('/help');
}}>
    Help
  </Button>;

const DISPATCHER_TABLE_VIEW_MODES = [{
  value: 'default',
  label: 'Default'
}, {
  value: 'no-time-miles',
  label: 'No time/miles'
}, {
  value: 'time-only',
  label: 'Time only'
}, {
  value: 'miles-only',
  label: 'Miles only'
}];

const DISPATCHER_TABLE_VIEW_MODE_COLUMNS = {
  'no-time-miles': ['rider', 'address', 'puZip', 'destination', 'doZip', 'mobility'],
  'time-only': ['rider', 'pickup', 'address', 'puZip', 'dropoff', 'destination', 'doZip', 'mobility'],
  'miles-only': ['rider', 'address', 'puZip', 'destination', 'doZip', 'miles', 'mobility']
};

const normalizeDispatcherToolbarRows = (row1Value, row2Value, row3Value) => {
  const normalizeRow = value => (Array.isArray(value) ? value : []).map(item => canonicalizeToolbarBlockId(item)).filter(Boolean);
  const seen = new Set();
  const row1 = [];
  const row2 = [];
  const row3 = [];

  const appendUnique = (targetRow, blockId) => {
    if (!ALL_DISPATCHER_TOOLBAR_BLOCKS.includes(blockId) || seen.has(blockId)) return;
    seen.add(blockId);
    targetRow.push(blockId);
  };

  normalizeRow(row1Value).forEach(blockId => appendUnique(row1, blockId));
  normalizeRow(row2Value).forEach(blockId => appendUnique(row2, blockId));
  normalizeRow(row3Value).forEach(blockId => appendUnique(row3, blockId));

  for (const blockId of ALL_DISPATCHER_TOOLBAR_BLOCKS) {
    if (seen.has(blockId)) continue;
    if (DISPATCHER_ROW1_DEFAULT_BLOCKS.includes(blockId)) {
      row1.push(blockId);
      continue;
    }
    if (DISPATCHER_ROW2_DEFAULT_BLOCKS.includes(blockId)) {
      row2.push(blockId);
      continue;
    }
    row3.push(blockId);
  }

  return { row1, row2, row3 };
};

const DISPATCHER_LAYOUT_PRESETS = [
  {
    id: 'full',
    label: 'Full workspace',
    description: 'Map, trips, messages, and actions visible.',
    panels: {
      mapVisible: true,
      tripsVisible: true,
      messagingVisible: true,
      actionsVisible: true
    }
  },
  {
    id: 'dispatch-focus',
    label: 'Dispatch focus',
    description: 'Trips and messages only.',
    panels: {
      mapVisible: false,
      tripsVisible: true,
      messagingVisible: true,
      actionsVisible: false
    }
  },
  {
    id: 'map-trips',
    label: 'Map and trips',
    description: 'Keep the map and trip board only.',
    panels: {
      mapVisible: true,
      tripsVisible: true,
      messagingVisible: false,
      actionsVisible: false
    }
  },
  {
    id: 'map-messages',
    label: 'Map and messages',
    description: 'Follow drivers while keeping chat open.',
    panels: {
      mapVisible: true,
      tripsVisible: false,
      messagingVisible: true,
      actionsVisible: false
    }
  }
];

const DEFAULT_DISPATCHER_LAYOUT = {
  preset: 'full',
  mapVisible: true,
  tripsVisible: true,
  messagingVisible: true,
  actionsVisible: true
};

const getDispatcherPresetPanels = presetId => DISPATCHER_LAYOUT_PRESETS.find(preset => preset.id === presetId)?.panels || null;

const resolveDispatcherLayoutPreset = layout => {
  const matchedPreset = DISPATCHER_LAYOUT_PRESETS.find(preset => ['mapVisible', 'tripsVisible', 'messagingVisible', 'actionsVisible'].every(key => Boolean(layout?.[key]) === Boolean(preset.panels[key])));
  return matchedPreset?.id || 'custom';
};

const normalizeDispatcherLayout = value => {
  const nextLayout = {
    preset: String(value?.preset || DEFAULT_DISPATCHER_LAYOUT.preset).trim() || DEFAULT_DISPATCHER_LAYOUT.preset,
    mapVisible: typeof value?.mapVisible === 'boolean' ? value.mapVisible : DEFAULT_DISPATCHER_LAYOUT.mapVisible,
    tripsVisible: typeof value?.tripsVisible === 'boolean' ? value.tripsVisible : DEFAULT_DISPATCHER_LAYOUT.tripsVisible,
    messagingVisible: typeof value?.messagingVisible === 'boolean' ? value.messagingVisible : DEFAULT_DISPATCHER_LAYOUT.messagingVisible,
    actionsVisible: typeof value?.actionsVisible === 'boolean' ? value.actionsVisible : DEFAULT_DISPATCHER_LAYOUT.actionsVisible
  };

  if (!nextLayout.mapVisible && !nextLayout.tripsVisible && !nextLayout.messagingVisible && !nextLayout.actionsVisible) {
    return { ...DEFAULT_DISPATCHER_LAYOUT };
  }

  return {
    ...nextLayout,
    preset: resolveDispatcherLayoutPreset(nextLayout)
  };
};

const greenToolbarButtonStyle = {
  color: '#08131a',
  borderColor: 'rgba(8, 19, 26, 0.35)',
  backgroundColor: 'transparent'
};

const buildDispatcherSurfaceStyles = isDarkMode => ({
  card: {
    background: isDarkMode ? 'linear-gradient(180deg, #0f172a 0%, #111827 100%)' : '#ffffff',
    border: isDarkMode ? '1px solid rgba(71, 85, 105, 0.72)' : '1px solid #d5deea',
    color: isDarkMode ? '#e5eefc' : '#0f172a',
    boxShadow: isDarkMode ? '0 16px 34px rgba(2, 6, 23, 0.28)' : '0 10px 24px rgba(148, 163, 184, 0.16)',
    borderRadius: 12,
    overflow: 'hidden'
  },
  header: {
    background: isDarkMode ? 'linear-gradient(180deg, rgba(17, 24, 39, 0.98) 0%, rgba(15, 23, 42, 0.96) 100%)' : '#f8fafc',
    borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.6)' : '#dbe3ef',
    color: isDarkMode ? '#e5eefc' : '#0f172a'
  },
  select: {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    color: isDarkMode ? '#e5eefc' : '#0f172a',
    borderColor: isDarkMode ? 'rgba(100, 116, 139, 0.7)' : '#cbd5e1'
  },
  button: {
    color: isDarkMode ? '#dbeafe' : '#0f172a',
    borderColor: isDarkMode ? 'rgba(96, 165, 250, 0.45)' : '#cbd5e1',
    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.58)' : '#f8fafc',
    padding: '0.18rem 0.55rem',
    fontSize: '0.76rem',
    lineHeight: 1.1
  },
  table: {
    '--bs-table-bg': isDarkMode ? '#0f172a' : '#ffffff',
    '--bs-table-striped-bg': isDarkMode ? '#162033' : '#f8fafc',
    '--bs-table-hover-bg': isDarkMode ? '#172237' : '#f1f5f9',
    '--bs-table-color': isDarkMode ? '#e5eefc' : '#0f172a',
    '--bs-table-border-color': isDarkMode ? 'rgba(71, 85, 105, 0.55)' : '#dbe3ef',
    fontSize: '0.78rem',
    lineHeight: 1.08,
    borderCollapse: 'separate',
    borderSpacing: 0
  },
  tableHead: {
    backgroundColor: isDarkMode ? '#172033' : '#f8fafc',
    color: isDarkMode ? '#f8fafc' : '#0f172a',
    fontSize: '0.74rem'
  },
  groupRow: {
    backgroundColor: isDarkMode ? '#172033' : '#eef4ff'
  },
  groupLabelColor: isDarkMode ? '#93c5fd' : '#475569',
  rowSelected: {
    backgroundColor: isDarkMode ? '#102a43' : '#dbeafe',
    color: isDarkMode ? '#eff6ff' : '#0f172a'
  },
  rowAssigned: {
    backgroundColor: isDarkMode ? '#123524' : '#dcfce7',
    color: isDarkMode ? '#ecfdf5' : '#14532d'
  },
  rowDefault: {
    backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
    color: isDarkMode ? '#e5eefc' : '#0f172a'
  },
  emptyText: isDarkMode ? '#94a3b8' : '#64748b'
});

const logSystemActivity = async (eventLabel, target = '', metadata = null) => {
  try {
    await fetch('/api/system-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventLabel, target, metadata })
    });
  } catch (error) {
    console.error('Error recording system activity:', error);
  }
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

const FollowDriverMapController = ({ enabled, position, zoom = 14 }) => {
  const map = useMap();
  const lastPositionRef = useRef('');

  useEffect(() => {
    if (!enabled || !Array.isArray(position) || position.length !== 2) return;
    const normalizedPosition = position.map(value => Number(value));
    if (normalizedPosition.some(value => !Number.isFinite(value))) return;
    const positionKey = normalizedPosition.map(value => value.toFixed(6)).join(',');
    if (lastPositionRef.current === positionKey) return;
    lastPositionRef.current = positionKey;
    map.setView(normalizedPosition, Math.max(map.getZoom(), zoom), {
      animate: false
    });
  }, [enabled, map, position, zoom]);

  return null;
};

const FocusDriverMapController = ({ request, zoom = 14 }) => {
  const map = useMap();
  const lastRequestKeyRef = useRef('');

  useEffect(() => {
    const position = Array.isArray(request?.position) ? request.position : null;
    if (!position || position.length !== 2) return;
    const normalizedPosition = position.map(value => Number(value));
    if (normalizedPosition.some(value => !Number.isFinite(value))) return;
    const requestKey = String(request?.key || normalizedPosition.join(','));
    if (lastRequestKeyRef.current === requestKey) return;
    lastRequestKeyRef.current = requestKey;
    map.setView(normalizedPosition, Math.max(map.getZoom(), zoom), {
      animate: false
    });
  }, [map, request, zoom]);

  return null;
};

const PauseFollowOnMapInteractionController = ({ enabled, onPause }) => {
  useMapEvents({
    dragstart: () => {
      if (!enabled) return;
      onPause();
    },
    zoomstart: () => {
      if (!enabled) return;
      onPause();
    }
  });

  return null;
};

const DispatchMapInteractionController = ({ enabled }) => {
  const map = useMap();

  useEffect(() => {
    if (enabled) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      return;
    }

    map.dragging.disable();
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
  }, [enabled, map]);

  return null;
};

const getStatusBadge = status => {
  if (status === 'Assigned') return 'primary';
  if (status === 'In Progress') return 'success';
  if (status === 'Accepted') return 'success';
  if (status === 'En Route') return 'success';
  if (status === 'Arrived Pickup') return 'warning';
  if (status === 'Patient Onboard') return 'success';
  if (status === 'To Destination') return 'success';
  if (status === 'Arrived Destination') return 'warning';
  if (status === 'Completed') return 'success';
  if (status === 'WillCall') return 'danger';
  if (status === 'Cancelled') return 'danger';
  return 'secondary';
};

const getConfirmationBadgeVariant = confirmationStatus => {
  if (confirmationStatus === 'Confirmed') return 'success';
  if (confirmationStatus === 'Opted Out') return 'danger';
  return 'secondary';
};

const getDispatcherConfirmationLabel = (trip, blockingState) => {
  const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
  const confirmationCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();

  if (confirmationCode === 'U') return 'Unconfirmed';
  if (['C', 'S', 'W'].includes(confirmationCode) && (confirmationStatus === 'Not Sent' || confirmationStatus === 'Pending')) {
    return 'Confirmed';
  }

  return confirmationStatus;
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

const COORDINATE_LIKE_TEXT = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

const getDriverMapLocationLabel = driver => {
  const checkpoint = String(driver?.checkpoint || '').trim();
  if (checkpoint && !COORDINATE_LIKE_TEXT.test(checkpoint)) return checkpoint;
  if (String(driver?.live || '').trim().toLowerCase() === 'online') return 'Live location';
  if (Array.isArray(driver?.position) && driver.position.length === 2) return 'Last known location';
  return 'Location unavailable';
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

const formatRemainingEta = minutesOrMiles => {
  if (!Number.isFinite(minutesOrMiles)) return 'ETA unavailable';
  if (minutesOrMiles <= 0) return 'Arriving now';
  return `${formatDriveMinutes(minutesOrMiles)} left`;
};

const sortTripsByPickupTime = items => [...items].sort((leftTrip, rightTrip) => {
  const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(leftTrip.id).localeCompare(String(rightTrip.id));
});

const normalizeTripId = tripId => String(tripId || '').trim();
const normalizeDriverId = driverId => String(driverId || '').trim();
const normalizeRouteId = routeId => String(routeId || '').trim();

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

const INLINE_EDITABLE_TRIP_COLUMNS = new Set(['pickup', 'dropoff', 'rider', 'address', 'puZip', 'destination', 'doZip', 'phone', 'miles', 'vehicle']);

const getInlineEditableTripValue = (trip, columnKey) => {
  switch (columnKey) {
    case 'pickup':
      return String(trip?.pickup || '').trim();
    case 'dropoff':
      return String(trip?.dropoff || '').trim();
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

const getTripSortValue = (trip, sortKey, getDriverName) => {
  switch (sortKey) {
    case 'trip':
      return trip.brokerTripId || trip.id;
    case 'status':
      return getEffectiveTripStatus(trip);
    case 'confirmation':
      return String(trip?.confirmation?.status || '').trim();
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

const getTripTypeLabel = getTripMobilityLabel;

const getEffectivePickupTimeText = trip => {
  const scheduledPickup = String(trip?.scheduledPickup || '').trim();
  const pickup = String(trip?.pickup || '').trim();
  const scheduledLooksLikeExcelSerial = /^\d{4,6}(?:\.\d+)?$/.test(scheduledPickup);
  if (scheduledLooksLikeExcelSerial && pickup) return pickup;
  return scheduledPickup || pickup;
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
  const normalizedDriverStatus = String(trip?.driverTripStatus || '').trim();
  const normalizedDriverStatusToken = normalizedDriverStatus.toLowerCase().replace(/\s+/g, '');
  if (['cancelled', 'canceled'].includes(normalizedStatusToken)) return 'Cancelled';
  if (normalizedOverride === 'off') return normalizedStatusToken === 'willcall' ? 'Unassigned' : normalizedStatus || 'Unassigned';
  if (normalizedOverride === 'manual') return 'WillCall';
  if (normalizedStatusToken === 'willcall') return 'WillCall';
  if (hasWillCallPickupMarker(trip)) return 'WillCall';
  if (getTripLegFilterKey(trip) !== 'AL' && hasMissingTripTime(trip)) return 'WillCall';
  if (normalizedDriverStatus && ['accepted', 'enroute', 'arrivedpickup', 'patientonboard', 'todestination', 'arriveddestination', 'completed'].includes(normalizedDriverStatusToken)) {
    return normalizedDriverStatus;
  }
  return normalizedStatus || 'Unassigned';
};

const stopInputEventPropagation = event => {
  event.stopPropagation();
};

const getTripTravelState = trip => String(trip?.driverTripStatus || trip?.status || '').trim().toLowerCase().replace(/[^a-z]/g, '');

const isTripEnRoute = trip => {
  const travelState = getTripTravelState(trip);
  return travelState === 'enroute' || travelState === 'inprogress';
};

const getSelectedDriverEtaTarget = trip => {
  const travelState = getTripTravelState(trip);

  if (travelState === 'inprogress') {
    return {
      stage: 'dropoff',
      label: 'Heading to Dropoff',
      shortLabel: 'To Dropoff',
      position: trip?.destinationPosition ?? trip?.position,
      detail: trip?.destination || 'Destination pending',
      color: '#2563eb'
    };
  }

  return {
    stage: 'pickup',
    label: 'Heading to Pickup',
    shortLabel: 'To Pickup',
    position: trip?.position,
    detail: trip?.address || 'Pickup pending',
    color: '#16a34a'
  };
};

const getTripTargetPosition = trip => getSelectedDriverEtaTarget(trip)?.position ?? trip?.position;

const DEFAULT_VEHICLE_ICON_URL = '/assets/gpscars/car-19.svg';
const VEHICLE_VARIANT_TOTAL = 20;

const getVehicleVariantIndex = key => {
  const text = String(key || '').trim();
  if (!text) return 0;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return Math.abs(hash) % VEHICLE_VARIANT_TOTAL;
};

const getVehicleVariantUrl = key => `/assets/gpscars/car-${String(getVehicleVariantIndex(key) + 1).padStart(2, '0')}.svg`;

const resolveVehicleIconUrl = () => DEFAULT_VEHICLE_ICON_URL;

const createDriverMapIcon = ({ isSelected, isOnline }) => divIcon({
  className: 'driver-map-icon-shell',
  html: `<div style="width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${isSelected ? '#f59e0b' : isOnline ? '#16a34a' : '#475569'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:16px;line-height:1;">&#128663;</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -16]
});

const createLiveVehicleIcon = ({ heading = 0, isOnline = false, vehicleIconScalePercent = 100 }) => {
  const normalizedHeading = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const normalizedScale = clamp(Number(vehicleIconScalePercent) || 100, 70, 200);
  const shellSize = Math.round(60 * normalizedScale / 100);
  const bodyWidth = Math.round(34 * normalizedScale / 100);
  const bodyHeight = Math.round(48 * normalizedScale / 100);
  const imageSizePercent = Math.round(clamp(132 * normalizedScale / 100, 110, 190));
  const vehicleVariantUrl = resolveVehicleIconUrl();
  return divIcon({
    className: 'driver-live-vehicle-icon-shell',
    html: `<div style="width:${shellSize}px;height:${shellSize}px;display:flex;align-items:center;justify-content:center;transform: rotate(${normalizedHeading}deg);filter: drop-shadow(0 6px 16px rgba(15,23,42,0.28));opacity:${isOnline ? '1' : '0.82'};"><div style="width:${bodyWidth}px;height:${bodyHeight}px;overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${vehicleVariantUrl}" alt="car" style="width:${imageSizePercent}%;height:${imageSizePercent}%;object-fit:cover;filter:${isOnline ? 'none' : 'grayscale(0.9)'};" onerror="this.onerror=null;this.src='${DEFAULT_VEHICLE_ICON_URL}';" /></div></div>`,
    iconSize: [shellSize, shellSize],
    iconAnchor: [Math.round(shellSize / 2), Math.round(shellSize / 2)],
    popupAnchor: [0, -Math.round(shellSize * 0.4)]
  });
};

const createRouteStopIcon = (label, variant = 'pickup') => divIcon({
  className: 'route-stop-icon-shell',
  html: `<div style="width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${variant === 'pickup' ? '#16a34a' : '#2563eb'};border:2px solid #ffffff;box-shadow:0 6px 18px rgba(15,23,42,0.28);color:#ffffff;font-size:13px;font-weight:700;line-height:1;">${label}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

const DispatcherWorkspace = () => {
  const router = useRouter();
  const { themeMode } = useLayoutContext();
  const isDarkMode = themeMode === 'dark';
  const dispatcherSurfaceStyles = useMemo(() => buildDispatcherSurfaceStyles(isDarkMode), [isDarkMode]);
  const { data: adminData } = useNemtAdminApi();
  const { data: smsData } = useSmsIntegrationApi();
  const { data: blacklistData, saveData: saveBlacklistData } = useBlacklistApi();
  const { data: userPreferences, loading: userPreferencesLoading, saveData: saveUserPreferences } = useUserPreferencesApi();
  const {
    drivers,
    trips,
    routePlans,
    selectedDriverId,
    setSelectedDriverId,
    uiPreferences,
    assignTripsToDriver,
    assignTripsToSecondaryDriver,
    unassignTrips,
    cancelTrips,
    reinstateTrips,
    refreshDrivers,
    refreshDispatchState,
    getDriverName,
    sendTripNotification,
    updateTripNotes,
    updateTripRecord,
    setDispatcherVisibleTripColumns,
    setMapProvider
  } = useNemtContext();
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [tripIdSearch, setTripIdSearch] = useState('');
  const [tripLegFilter, setTripLegFilter] = useState('all');
  const [tripTypeFilter, setTripTypeFilter] = useState('all');
  const [serviceAnimalOnly, setServiceAnimalOnly] = useState(false);
  const [tripDateFilter, setTripDateFilter] = useState(() => getLocalDateKey());
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [isManualDriverScope, setIsManualDriverScope] = useState(false);
  const [followSelectedDriver, setFollowSelectedDriver] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedSecondaryDriverId, setSelectedSecondaryDriverId] = useState('');
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
  const [showInlineMap, setShowInlineMap] = useState(true);
  const [mapLocked, setMapLocked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [isRoutePanelCollapsed, setIsRoutePanelCollapsed] = useState(false);
  const [isToolbarEditMode, setIsToolbarEditMode] = useState(false);
  const [toolbarRow1Order, setToolbarRow1Order] = useState(DISPATCHER_ROW1_DEFAULT_BLOCKS);
  const [toolbarRow2Order, setToolbarRow2Order] = useState(DISPATCHER_ROW2_DEFAULT_BLOCKS);
  const [toolbarRow3Order, setToolbarRow3Order] = useState(DISPATCHER_ROW3_DEFAULT_BLOCKS);
  const [toolbarBlockVisibility, setToolbarBlockVisibility] = useState(() => Object.fromEntries(ALL_DISPATCHER_TOOLBAR_BLOCKS.map(blockId => [blockId, true])));
  const [dispatcherLayout, setDispatcherLayout] = useState(DEFAULT_DISPATCHER_LAYOUT);
  const [dispatcherTableViewMode, setDispatcherTableViewMode] = useState('default');
  const [rightPanelMode, setRightPanelMode] = useState('default');
  const [cancelledDetailMode, setCancelledDetailMode] = useState('names');
  const [draggingToolbarBlockId, setDraggingToolbarBlockId] = useState(null);
  const [draggingToolbarRow2BlockId, setDraggingToolbarRow2BlockId] = useState(null);
  const [draggingToolbarRow3BlockId, setDraggingToolbarRow3BlockId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Dispatcher listo.');
  const adminDriversById = useMemo(() => new Map((Array.isArray(adminData?.drivers) ? adminData.drivers : []).map(driver => [String(driver?.id || '').trim(), driver])), [adminData?.drivers]);
  const adminVehiclesById = useMemo(() => new Map((Array.isArray(adminData?.vehicles) ? adminData.vehicles : []).map(vehicle => [String(vehicle?.id || '').trim(), vehicle])), [adminData?.vehicles]);
  const [columnSplit, setColumnSplit] = useState(50);
  const [rowSplit, setRowSplit] = useState(50);
  const [dragMode, setDragMode] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [selectedDriverRouteGeometry, setSelectedDriverRouteGeometry] = useState([]);
  const [selectedDriverRouteMetrics, setSelectedDriverRouteMetrics] = useState(null);
  const [mapFocusRequest, setMapFocusRequest] = useState(null);
  const [tripOrderMode, setTripOrderMode] = useState('time');
  const [quickReassignDriverId, setQuickReassignDriverId] = useState('');
  const [noteModalTripId, setNoteModalTripId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTripIds, setCancelTripIds] = useState([]);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');
  const [tripEditDraft, setTripEditDraft] = useState(buildTripEditDraft(null));
  const [inlineTripEditCell, setInlineTripEditCell] = useState(null);
  const [inlineTripEditValue, setInlineTripEditValue] = useState('');
  const [tripSort, setTripSort] = useState({
    key: 'pickup',
    direction: 'asc'
  });

  useEffect(() => {
    setSelectedDriverId(null);
    setIsManualDriverScope(false);
    setSelectedSecondaryDriverId('');
    setDropoffZipFilter('');
    setDoCityFilter('');
  }, []);

  const [columnWidths, setColumnWidths] = useState({});
  const [draggingTripColumnKey, setDraggingTripColumnKey] = useState(null);
  const workspaceRef = useRef(null);
  const tripTableTopScrollerRef = useRef(null);
  const tripTableBottomScrollerRef = useRef(null);
  const tripTableElementRef = useRef(null);
  const tripTableScrollSyncRef = useRef(false);
  const hasHydratedDefaultLayoutRef = useRef(false);
  const toolbarVisibilityHydratedRef = useRef(false);
  const lastSavedToolbarVisibilityRef = useRef('');
  const skipNextToolbarVisibilitySaveRef = useRef(false);
  const [tripTableScrollWidth, setTripTableScrollWidth] = useState(0);
  const [tripTableScrollLeft, setTripTableScrollLeft] = useState(0);
  const [tripTableMaxScrollLeft, setTripTableMaxScrollLeft] = useState(0);
  const dispatcherTableViewBackupRef = useRef(null);
  const deferredRouteSearch = useDeferredValue(routeSearch);
  const optOutList = useMemo(() => Array.isArray(smsData?.sms?.optOutList) ? smsData.sms.optOutList : [], [smsData?.sms?.optOutList]);
  const riderProfiles = useMemo(() => smsData?.sms?.riderProfiles || {}, [smsData?.sms?.riderProfiles]);
  const blacklistEntries = useMemo(() => Array.isArray(blacklistData?.entries) ? blacklistData.entries : [], [blacklistData?.entries]);
  const tripBlockingMap = useMemo(() => new Map(trips.map(trip => [trip.id, getTripBlockingState({
    trip,
    optOutList,
    blacklistEntries,
    defaultCountryCode: smsData?.sms?.defaultCountryCode,
    tripDateKey: getTripTimelineDateKey(trip, routePlans, trips)
  })])), [blacklistEntries, optOutList, routePlans, smsData?.sms?.defaultCountryCode, trips]);

  const toggleTripSelection = tripId => {
    const normalizedTripId = normalizeTripId(tripId);
    if (!normalizedTripId) return;
    setSelectedTripIds(currentTripIds => {
      const currentIds = currentTripIds.map(normalizeTripId).filter(Boolean);
      return currentIds.includes(normalizedTripId) ? currentIds.filter(id => id !== normalizedTripId) : [...currentIds, normalizedTripId];
    });
  };

  const syncTripTableScroll = source => {
    if (tripTableScrollSyncRef.current) return;
    const topNode = tripTableTopScrollerRef.current;
    const bottomNode = tripTableBottomScrollerRef.current;
    if (!bottomNode) return;
    tripTableScrollSyncRef.current = true;
    if (source === 'top') {
      const nextLeft = topNode?.scrollLeft || 0;
      bottomNode.scrollLeft = nextLeft;
      setTripTableScrollLeft(nextLeft);
    } else {
      const nextLeft = bottomNode.scrollLeft;
      if (topNode) topNode.scrollLeft = nextLeft;
      setTripTableScrollLeft(nextLeft);
    }
    setTripTableMaxScrollLeft(Math.max(0, bottomNode.scrollWidth - bottomNode.clientWidth));
    window.requestAnimationFrame(() => {
      tripTableScrollSyncRef.current = false;
    });
  };

  const selectedDriver = useMemo(() => {
    const normalizedSelectedDriverId = normalizeDriverId(selectedDriverId);
    if (!normalizedSelectedDriverId) return null;
    return drivers.find(driver => normalizeDriverId(driver?.id) === normalizedSelectedDriverId) ?? null;
  }, [drivers, selectedDriverId]);
  const selectedDriverColor = useMemo(() => getDriverColor(selectedDriver?.id || selectedDriver?.name), [selectedDriver]);
  const selectedRoute = useMemo(() => {
    const normalizedSelectedRouteId = normalizeRouteId(selectedRouteId);
    if (!normalizedSelectedRouteId) return null;
    return routePlans.find(routePlan => normalizeRouteId(routePlan?.id) === normalizedSelectedRouteId) ?? null;
  }, [routePlans, selectedRouteId]);
  const dispatchTimeZone = uiPreferences?.timeZone;
  const todayDateKey = useMemo(() => getLocalDateKey(new Date(), dispatchTimeZone), [dispatchTimeZone]);
  const daySummaryMetrics = useMemo(() => {
    const targetDateKey = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
    const dayTrips = trips.filter(trip => getTripTimelineDateKey(trip, routePlans, trips) === targetDateKey);
    const cancelled = dayTrips.filter(trip => getEffectiveTripStatus(trip) === 'Cancelled').length;
    const completedByDrivers = dayTrips.filter(trip => String(getEffectiveTripStatus(trip)).trim().toLowerCase() === 'completed' && (trip?.driverId || trip?.secondaryDriverId)).length;
    return {
      dateKey: targetDateKey,
      total: dayTrips.length,
      cancelled,
      completedByDrivers
    };
  }, [routePlans, todayDateKey, tripDateFilter, trips]);
  const cancelledSummaryTrips = useMemo(() => trips.filter(trip => getTripTimelineDateKey(trip, routePlans, trips) === daySummaryMetrics.dateKey && getEffectiveTripStatus(trip) === 'Cancelled'), [daySummaryMetrics.dateKey, routePlans, trips]);
  const dayRoutesByDriverTrips = useMemo(() => trips.filter(trip => getTripTimelineDateKey(trip, routePlans, trips) === daySummaryMetrics.dateKey && (normalizeDriverId(trip?.driverId) || normalizeDriverId(trip?.secondaryDriverId))), [daySummaryMetrics.dateKey, routePlans, trips]);
  const resetDispatcherSelectionScope = () => {
    setSelectedTripIds([]);
    setSelectedRouteId('');
    setSelectedDriverId(null);
    setIsManualDriverScope(false);
  };
  const exitCancelledPanelMode = (message = 'Vista normal de viajes restaurada.') => {
    setRightPanelMode('default');
    setCancelledDetailMode('names');
    resetDispatcherSelectionScope();
    setStatusMessage(message);
  };
  const mapTileConfig = useMemo(() => getMapTileConfig(uiPreferences?.mapProvider), [uiPreferences?.mapProvider]);

  useEffect(() => {
    setTripDateFilter(todayDateKey);
    setSelectedTripIds([]);
    setSelectedRouteId(null);
  }, [todayDateKey]);

  useEffect(() => {
    if (!selectedDriverId) return;
    const normalizedSelectedDriverId = normalizeDriverId(selectedDriverId);
    if (drivers.some(driver => normalizeDriverId(driver?.id) === normalizedSelectedDriverId)) return;
    setSelectedDriverId(null);
    setIsManualDriverScope(false);
  }, [drivers, selectedDriverId]);

  useEffect(() => {
    if (selectedDriver?.hasRealLocation) return;
    setFollowSelectedDriver(false);
  }, [selectedDriver]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    try {
      const loadedRow1 = userPreferences?.dispatcherToolbar?.row1?.length ? userPreferences.dispatcherToolbar.row1 : DISPATCHER_ROW1_DEFAULT_BLOCKS;
      const loadedRow2 = userPreferences?.dispatcherToolbar?.row2?.length ? userPreferences.dispatcherToolbar.row2 : DISPATCHER_ROW2_DEFAULT_BLOCKS;
      const loadedRow3 = userPreferences?.dispatcherToolbar?.row3?.length ? userPreferences.dispatcherToolbar.row3 : DISPATCHER_ROW3_DEFAULT_BLOCKS;
      const normalizedRows = normalizeDispatcherToolbarRows(loadedRow1, loadedRow2, loadedRow3);
      setToolbarRow1Order(normalizedRows.row1);
      setToolbarRow2Order(normalizedRows.row2);
      setToolbarRow3Order(normalizedRows.row3);
    } catch {
      // Ignore corrupted local toolbar layout preferences.
    }
  }, [userPreferences?.dispatcherToolbar?.row1, userPreferences?.dispatcherToolbar?.row2, userPreferences?.dispatcherToolbar?.row3, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    try {
      const parsed = userPreferences?.dispatcherToolbar?.toolbarVisibility && Object.keys(userPreferences.dispatcherToolbar.toolbarVisibility).length > 0
        ? userPreferences.dispatcherToolbar.toolbarVisibility
        : {};
      const parsedVisibility = !parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        ? {}
        : Object.fromEntries(Object.entries(parsed).map(([key, value]) => [canonicalizeToolbarBlockId(key), value]));
      const normalized = Object.fromEntries(ALL_DISPATCHER_TOOLBAR_BLOCKS.map(blockId => [blockId, parsedVisibility[blockId] !== false]));
      lastSavedToolbarVisibilityRef.current = JSON.stringify(normalized);
      toolbarVisibilityHydratedRef.current = true;
      skipNextToolbarVisibilitySaveRef.current = true;
      setToolbarBlockVisibility(normalized);
    } catch {
      // Ignore corrupted toolbar visibility preferences.
    }
  }, [userPreferences?.dispatcherToolbar?.toolbarVisibility, userPreferencesLoading]);

  useEffect(() => {
    try {
      const serializedToolbarVisibility = JSON.stringify(toolbarBlockVisibility);
      if (!toolbarVisibilityHydratedRef.current) return;
      if (skipNextToolbarVisibilitySaveRef.current) {
        skipNextToolbarVisibilitySaveRef.current = false;
        return;
      }
      if (lastSavedToolbarVisibilityRef.current === serializedToolbarVisibility) return;
      lastSavedToolbarVisibilityRef.current = serializedToolbarVisibility;
      if (!userPreferencesLoading) {
        void saveUserPreferences({
          ...userPreferences,
          dispatcherToolbar: {
            ...userPreferences?.dispatcherToolbar,
            row1: toolbarRow1Order,
            row2: toolbarRow2Order,
            row3: toolbarRow3Order,
            toolbarVisibility: toolbarBlockVisibility
          }
        }).catch(() => {});
      }
    } catch {
      // Ignore localStorage write errors.
    }
  }, [saveUserPreferences, toolbarBlockVisibility, toolbarRow1Order, toolbarRow2Order, toolbarRow3Order, userPreferences, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    const baseLayout = normalizeDispatcherLayout(userPreferences?.dispatcherLayout);
    const nextLayout = hasHydratedDefaultLayoutRef.current ? baseLayout : normalizeDispatcherLayout({
      ...baseLayout,
      mapVisible: true,
      tripsVisible: true,
      messagingVisible: true,
      actionsVisible: true
    });
    setDispatcherLayout(nextLayout);
    hasHydratedDefaultLayoutRef.current = true;
  }, [userPreferences?.dispatcherLayout, userPreferencesLoading]);

  const persistDispatcherLayout = nextValue => {
    const normalizedLayout = normalizeDispatcherLayout(nextValue);
    setDispatcherLayout(normalizedLayout);
    void saveUserPreferences({
      ...userPreferences,
      dispatcherLayout: normalizedLayout
    }).catch(() => {});
    return normalizedLayout;
  };

  const applyDispatcherLayoutPreset = presetId => {
    const presetPanels = getDispatcherPresetPanels(presetId);
    if (!presetPanels) return;
    persistDispatcherLayout({
      preset: presetId,
      ...presetPanels
    });
    setStatusMessage(`Layout cambiado a ${DISPATCHER_LAYOUT_PRESETS.find(preset => preset.id === presetId)?.label || 'custom'}.`);
  };

  const toggleDispatcherLayoutPanel = panelKey => {
    const currentPanels = {
      mapVisible: dispatcherLayout.mapVisible,
      tripsVisible: dispatcherLayout.tripsVisible,
      messagingVisible: dispatcherLayout.messagingVisible,
      actionsVisible: dispatcherLayout.actionsVisible
    };
    const nextPanels = {
      ...currentPanels,
      [panelKey]: !currentPanels[panelKey]
    };

    if (!Object.values(nextPanels).some(Boolean)) {
      setStatusMessage('Debe quedar al menos un bloque visible.');
      return;
    }

    const nextLayout = persistDispatcherLayout({
      ...dispatcherLayout,
      ...nextPanels,
      preset: 'custom'
    });
    const panelLabels = {
      mapVisible: 'mapa',
      tripsVisible: 'trips',
      messagingVisible: 'mensajes',
      actionsVisible: 'acciones'
    };
    setStatusMessage(`Bloque de ${panelLabels[panelKey]} ${nextLayout[panelKey] ? 'visible' : 'oculto'}.`);
  };

  const handleSmsPanelsToggle = () => {
    const shouldShowBottomPanels = !dispatcherLayout.messagingVisible && !dispatcherLayout.actionsVisible;
    const nextLayout = persistDispatcherLayout({
      ...dispatcherLayout,
      messagingVisible: shouldShowBottomPanels,
      actionsVisible: shouldShowBottomPanels,
      preset: 'custom'
    });
    setStatusMessage(nextLayout.messagingVisible ? 'Paneles inferiores visibles (SMS + acciones).' : 'Paneles inferiores ocultos.');
  };

  const handleRestoreLayout = () => {
    const normalizedRows = normalizeDispatcherToolbarRows(DISPATCHER_ROW1_DEFAULT_BLOCKS, DISPATCHER_ROW2_DEFAULT_BLOCKS, DISPATCHER_ROW3_DEFAULT_BLOCKS);
    setToolbarRow1Order(normalizedRows.row1);
    setToolbarRow2Order(normalizedRows.row2);
    setToolbarRow3Order(normalizedRows.row3);
    const restoredLayout = persistDispatcherLayout(DEFAULT_DISPATCHER_LAYOUT);
    void saveUserPreferences({
      ...userPreferences,
      dispatcherLayout: restoredLayout,
      dispatcherVisibleTripColumns: DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS,
      dispatcherToolbar: {
        row1: normalizedRows.row1,
        row2: normalizedRows.row2,
        row3: normalizedRows.row3
      }
    }).catch(() => {});
    setDispatcherVisibleTripColumns(DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS);
    dispatcherTableViewBackupRef.current = null;
    setDispatcherTableViewMode('default');
    setStatusMessage('Dispatcher restaurado a fábrica: 4 bloques + mapa, columnas originales, control de mapa reintegrado.');
  };

  const handleDispatcherTableViewModeChange = nextMode => {
    const normalizedMode = String(nextMode || 'default').trim().toLowerCase();
    if (!DISPATCHER_TABLE_VIEW_MODES.some(option => option.value === normalizedMode)) return;
    if (normalizedMode === dispatcherTableViewMode) return;

    if (normalizedMode === 'default') {
      const backup = dispatcherTableViewBackupRef.current;
      if (backup?.layout) {
        persistDispatcherLayout(backup.layout);
      }
      if (Array.isArray(backup?.columns) && backup.columns.length > 0) {
        setDispatcherVisibleTripColumns(backup.columns);
      }
      dispatcherTableViewBackupRef.current = null;
      setDispatcherTableViewMode('default');
      setStatusMessage('Vista de tabla restaurada a tu configuracion anterior.');
      return;
    }

    if (!dispatcherTableViewBackupRef.current) {
      dispatcherTableViewBackupRef.current = {
        layout: {
          preset: dispatcherLayout.preset,
          mapVisible: dispatcherLayout.mapVisible,
          tripsVisible: dispatcherLayout.tripsVisible,
          messagingVisible: dispatcherLayout.messagingVisible,
          actionsVisible: dispatcherLayout.actionsVisible
        },
        columns: [...orderedVisibleTripColumns]
      };
    }

    const nextColumns = DISPATCHER_TABLE_VIEW_MODE_COLUMNS[normalizedMode] || dispatcherTableViewBackupRef.current?.columns || DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS;
    persistDispatcherLayout({
      ...dispatcherLayout,
      mapVisible: false,
      tripsVisible: true,
      messagingVisible: false,
      actionsVisible: false,
      preset: 'custom'
    });
    setDispatcherVisibleTripColumns(nextColumns);
    setDispatcherTableViewMode(normalizedMode);
    setStatusMessage(`Modo ${DISPATCHER_TABLE_VIEW_MODES.find(option => option.value === normalizedMode)?.label || normalizedMode} activado.`);
  };

  const hiddenDispatcherPanels = [{
    key: 'mapVisible',
    label: 'Map'
  }, {
    key: 'tripsVisible',
    label: 'Trips'
  }, {
    key: 'messagingVisible',
    label: 'SMS'
  }, {
    key: 'actionsVisible',
    label: 'Actions'
  }].filter(item => !dispatcherLayout[item.key]);

  const hasHiddenDispatcherPanels = hiddenDispatcherPanels.length > 0 && Object.values(dispatcherLayout).slice(1).some(Boolean);
  const isToolbarBlockEnabled = blockId => toolbarBlockVisibility[canonicalizeToolbarBlockId(blockId)] !== false;
  const hasAnyVisibleToolbarBlock = ALL_DISPATCHER_TOOLBAR_BLOCKS.some(blockId => isToolbarBlockEnabled(blockId));
  const shouldShowToolbarRecovery = !isToolbarBlockEnabled('columns') || !hasAnyVisibleToolbarBlock;

  const handleToggleToolbarBlockVisibility = (blockId, enabled) => {
    const normalizedBlockId = canonicalizeToolbarBlockId(blockId);
    setToolbarBlockVisibility(current => ({
      ...current,
      [normalizedBlockId]: enabled
    }));
  };

  const moveToolbarRow1Block = (fromBlockId, toBlockId) => {
    const normalizedFromBlockId = canonicalizeToolbarBlockId(fromBlockId);
    const normalizedToBlockId = canonicalizeToolbarBlockId(toBlockId);
    if (!normalizedFromBlockId || !normalizedToBlockId || normalizedFromBlockId === normalizedToBlockId) return;
    setToolbarRow1Order(currentOrder => {
      const fromIndex = currentOrder.findIndex(blockId => canonicalizeToolbarBlockId(blockId) === normalizedFromBlockId);
      const toIndex = currentOrder.findIndex(blockId => canonicalizeToolbarBlockId(blockId) === normalizedToBlockId);
      if (fromIndex === -1 || toIndex === -1) return currentOrder;
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, moved);
      return nextOrder;
    });
  };

  const moveToolbarRow2Block = (fromBlockId, toBlockId) => {
    const normalizedFromBlockId = canonicalizeToolbarBlockId(fromBlockId);
    const normalizedToBlockId = canonicalizeToolbarBlockId(toBlockId);
    if (!normalizedFromBlockId || !normalizedToBlockId || normalizedFromBlockId === normalizedToBlockId) return;
    setToolbarRow2Order(currentOrder => {
      const fromIndex = currentOrder.findIndex(blockId => canonicalizeToolbarBlockId(blockId) === normalizedFromBlockId);
      const toIndex = currentOrder.findIndex(blockId => canonicalizeToolbarBlockId(blockId) === normalizedToBlockId);
      if (fromIndex === -1 || toIndex === -1) return currentOrder;
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, moved);
      return nextOrder;
    });
  };

  const moveToolbarRow3Block = (fromBlockId, toBlockId) => {
    const normalizedFromBlockId = canonicalizeToolbarBlockId(fromBlockId);
    const normalizedToBlockId = canonicalizeToolbarBlockId(toBlockId);
    if (!normalizedFromBlockId || !normalizedToBlockId || normalizedFromBlockId === normalizedToBlockId) return;
    setToolbarRow3Order(currentOrder => {
      const fromIndex = currentOrder.findIndex(blockId => canonicalizeToolbarBlockId(blockId) === normalizedFromBlockId);
      const toIndex = currentOrder.findIndex(blockId => canonicalizeToolbarBlockId(blockId) === normalizedToBlockId);
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
    const normalizedFromBlockId = canonicalizeToolbarBlockId(fromBlockId);
    const normalizedTargetBlockId = canonicalizeToolbarBlockId(targetBlockId);
    if (!normalizedFromBlockId || !targetRow) return;

    const nextRow1 = toolbarRow1Order.filter(currentId => canonicalizeToolbarBlockId(currentId) !== normalizedFromBlockId);
    const nextRow2 = toolbarRow2Order.filter(currentId => canonicalizeToolbarBlockId(currentId) !== normalizedFromBlockId);
    const nextRow3 = toolbarRow3Order.filter(currentId => canonicalizeToolbarBlockId(currentId) !== normalizedFromBlockId);

    const insertInto = row => {
      if (!normalizedTargetBlockId) {
        row.push(normalizedFromBlockId);
        return;
      }
      const targetIndex = row.findIndex(currentId => canonicalizeToolbarBlockId(currentId) === normalizedTargetBlockId);
      if (targetIndex === -1) {
        row.push(normalizedFromBlockId);
        return;
      }
      row.splice(targetIndex, 0, normalizedFromBlockId);
    };

    if (targetRow === 'row1') insertInto(nextRow1);
    if (targetRow === 'row2') insertInto(nextRow2);
    if (targetRow === 'row3') insertInto(nextRow3);

    const normalizedRows = normalizeDispatcherToolbarRows(nextRow1, nextRow2, nextRow3);
    setToolbarRow1Order(normalizedRows.row1);
    setToolbarRow2Order(normalizedRows.row2);
    setToolbarRow3Order(normalizedRows.row3);
  };

  const handleSaveToolbarLayout = () => {
    const normalizedRows = normalizeDispatcherToolbarRows(toolbarRow1Order, toolbarRow2Order, toolbarRow3Order);
    setToolbarRow1Order(normalizedRows.row1);
    setToolbarRow2Order(normalizedRows.row2);
    setToolbarRow3Order(normalizedRows.row3);
    try {
      void saveUserPreferences({
        ...userPreferences,
        dispatcherToolbar: {
          row1: normalizedRows.row1,
          row2: normalizedRows.row2,
          row3: normalizedRows.row3,
          toolbarVisibility: toolbarBlockVisibility
        },
        dispatcherLayout: DEFAULT_DISPATCHER_LAYOUT,
        dispatcherVisibleTripColumns: DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS
      }).catch(() => {});
      setStatusMessage('Dispatcher layout restaurado a valores de fábrica.');
      applyDispatcherLayoutPreset('full');
      setDispatcherVisibleTripColumns(DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS);
    } catch {
      setStatusMessage('No se pudo restaurar el dispatcher layout.');
    } finally {
      setIsToolbarEditMode(false);
      clearDraggingToolbarBlockIds();
    }
  };

  const handleRestoreDispatcherLayout = () => {
    const defaultRow1Order = [...DISPATCHER_ROW1_DEFAULT_BLOCKS];
    const defaultRow2Order = [...DISPATCHER_ROW2_DEFAULT_BLOCKS];
    const defaultRow3Order = [...DISPATCHER_ROW3_DEFAULT_BLOCKS];
    const defaultVisibility = Object.fromEntries(ALL_DISPATCHER_TOOLBAR_BLOCKS.map(blockId => [blockId, true]));
    setToolbarRow1Order(defaultRow1Order);
    setToolbarRow2Order(defaultRow2Order);
    setToolbarRow3Order(defaultRow3Order);
    setToolbarBlockVisibility(defaultVisibility);
    setIsToolbarEditMode(false);
    clearDraggingToolbarBlockIds();
    try {
      void saveUserPreferences({
        ...userPreferences,
        dispatcherToolbar: {
          row1: defaultRow1Order,
          row2: defaultRow2Order,
          row3: defaultRow3Order,
          toolbarVisibility: defaultVisibility
        }
      }).catch(() => {});
      setStatusMessage('Dispatcher toolbar layout reseteado.');
    } catch {
      setStatusMessage('No se pudo resetear el dispatcher toolbar layout.');
    }
  };

  const getPreferredRouteIdForDriver = driverId => {
    const normalizedDriverId = String(driverId || '').trim();
    if (!normalizedDriverId) return '';
    const targetDateKey = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
    const candidateRoutes = routePlans.filter(routePlan => {
      const primaryDriverId = String(routePlan?.driverId || '').trim();
      const secondaryDriverId = String(routePlan?.secondaryDriverId || '').trim();
      return primaryDriverId === normalizedDriverId || secondaryDriverId === normalizedDriverId;
    });
    if (candidateRoutes.length === 0) return '';

    const sameDayRoutes = candidateRoutes.filter(routePlan => getRouteServiceDateKey(routePlan, trips) === targetDateKey);
    const preferredRoutes = sameDayRoutes.length > 0 ? sameDayRoutes : candidateRoutes;

    return [...preferredRoutes].sort((leftRoute, rightRoute) => {
      const leftDate = String(getRouteServiceDateKey(leftRoute, trips) || '').trim();
      const rightDate = String(getRouteServiceDateKey(rightRoute, trips) || '').trim();
      if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
      return (Array.isArray(rightRoute?.tripIds) ? rightRoute.tripIds.length : 0) - (Array.isArray(leftRoute?.tripIds) ? leftRoute.tripIds.length : 0);
    })[0]?.id || '';
  };

  const handleToggleRoutePanel = () => {
    if (!dispatcherLayout.actionsVisible) {
      setDispatcherLayout(currentLayout => ({
        ...currentLayout,
        actionsVisible: true,
        preset: 'custom'
      }));
      setIsRoutePanelCollapsed(false);
      setStatusMessage('Panel de ruta visible.');
      return;
    }

    setIsRoutePanelCollapsed(currentValue => {
      const nextValue = !currentValue;
      setStatusMessage(nextValue ? 'Panel de ruta oculto.' : 'Panel de ruta visible.');
      return nextValue;
    });
  };

  const renderRouteToolbarActions = () => <div className="d-flex align-items-center gap-1 flex-nowrap">
      <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handlePrintRoute} disabled={mapLocked}>Print Route</Button>
      <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleShareRouteWhatsapp} disabled={mapLocked}>WhatsApp</Button>
      <Form.Select size="sm" value={quickReassignDriverId} onChange={event => setQuickReassignDriverId(event.target.value)} disabled={mapLocked} style={{ width: 210 }}>
        <option value="">Reassign to driver</option>
        {quickReassignDrivers.map(driver => <option key={`toolbar-${driver.id}`} value={driver.id}>{driver.name}{String(driver?.live || '').trim().toLowerCase() === 'online' ? '' : ' (offline)'}</option>)}
      </Form.Select>
      <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleQuickReassignSelectedTrips} disabled={mapLocked || !quickReassignDriverId}>Reassign</Button>
    </div>;

  const renderToolbarRow1Block = blockId => {
    switch (canonicalizeToolbarBlockId(blockId)) {
      case 'trip-summary':
        return <>
            <strong>Trips</strong>
            <Badge bg="light" text="dark">{assignedTripsCount}/{trips.length}</Badge>
          </>;
      case 'status-filter':
        return <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ width: 130 }}>
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="inprogress">In progress</option>
            <option value="completed">Completed</option>
            <option value="willcall">WillCall</option>
            <option value="confirm">Confirmed</option>
            <option value="unconfirm">Unconfirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="block">Blocked</option>
          </Form.Select>;
      case 'date-controls':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Button variant="outline-dark" size="sm" onClick={() => handleShiftTripDate(-1)} title="Previous day" style={greenToolbarButtonStyle}>Prev</Button>
            <Form.Control size="sm" type="date" value={tripDateFilter === 'all' ? '' : tripDateFilter} onChange={event => setTripDateFilter(event.target.value || todayDateKey)} style={{ width: 150 }} title="Filter trips by date" />
            <Button variant="outline-dark" size="sm" onClick={() => handleShiftTripDate(1)} title="Next day" style={greenToolbarButtonStyle}>Next</Button>
            <Button variant="outline-dark" size="sm" onClick={() => setTripDateFilter(todayDateKey)} title="Today" style={greenToolbarButtonStyle}>Today</Button>
          </div>;
      case 'trip-search':
        return <Form.Control size="sm" value={tripIdSearch} onChange={event => setTripIdSearch(event.target.value)} placeholder="Search trip, rider, phone, address..." disabled={mapLocked} style={{ width: 220 }} />;
      case 'driver-select':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => handleDriverSelectionChange(event.target.value)} disabled={mapLocked} style={{ width: 220 }}>
              <option value="">Select driver</option>
              {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
            </Form.Select>
            <Button variant={selectedDriverId ? 'outline-dark' : 'dark'} size="sm" onClick={() => handleDriverSelectionChange('')} disabled={mapLocked} style={selectedDriverId ? greenToolbarButtonStyle : undefined}>All drivers</Button>
            {selectedDriver?.hasRealLocation ? <Button variant={followSelectedDriver ? 'warning' : 'outline-dark'} size="sm" onClick={() => setFollowSelectedDriver(current => !current)} disabled={mapLocked} style={followSelectedDriver ? undefined : greenToolbarButtonStyle}>{followSelectedDriver ? 'Following' : 'Follow'}</Button> : null}
          </div>;
      case 'secondary-driver':
        return <Form.Select size="sm" value={selectedSecondaryDriverId} onChange={event => setSelectedSecondaryDriverId(event.target.value)} disabled={mapLocked} style={{ width: 220 }}>
            <option value="">Second driver</option>
            {drivers.map(driver => <option key={`secondary-${driver.id}`} value={driver.id}>{driver.name}</option>)}
          </Form.Select>;
      case 'driver-assigned':
        return selectedDriver ? <Badge bg="light" text="dark">{selectedDriverAssignedTripCount} assigned</Badge> : null;
      case 'selected-count':
        return null;
      case 'day-summary':
        return null;
      case 'route-actions':
        return null;
      default:
        return null;
    }
  };

  const renderToolbarRow2Block = blockId => {
    switch (canonicalizeToolbarBlockId(blockId)) {
      case 'stats':
        return <div className="d-flex align-items-center gap-2 flex-nowrap">
            <Badge bg="primary">{filteredTrips.length} trips</Badge>
            <Badge bg="secondary">{liveDrivers} live</Badge>
            <div className="d-flex align-items-center" style={{ border: '1px solid rgba(8,19,26,0.25)', borderRadius: 6, overflow: 'hidden' }} title={`Day summary for ${daySummaryMetrics.dateKey}`}>
              <div className="px-2 py-1" style={{ backgroundColor: '#e2e8f0', minWidth: 74 }}>
                <div className="small text-muted" style={{ lineHeight: 1 }}>Total</div>
                <div className="fw-semibold" style={{ lineHeight: 1.1 }}>{daySummaryMetrics.total}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextMode = isCancelledPanelMode ? 'default' : 'cancelled';
                  if (nextMode === 'cancelled') {
                    resetDispatcherSelectionScope();
                    setRightPanelMode('cancelled');
                    setCancelledDetailMode('names');
                    setStatusMessage(`Mostrando ${daySummaryMetrics.cancelled} trip(s) cancelados en el panel derecho.`);
                    return;
                  }
                  exitCancelledPanelMode();
                }}
                className="px-2 py-1 border-start text-start"
                style={{ backgroundColor: isCancelledPanelMode ? '#fecaca' : '#fee2e2', minWidth: 94, border: 'none', color: '#08131a', boxShadow: isCancelledPanelMode ? 'inset 0 0 0 2px rgba(127,29,29,0.18)' : 'none' }}
              >
                <div className="small text-muted" style={{ lineHeight: 1 }}>Cancelled</div>
                <div className="fw-semibold" style={{ lineHeight: 1.1 }}>{daySummaryMetrics.cancelled}</div>
              </button>
              <div className="px-2 py-1 border-start" style={{ backgroundColor: '#dcfce7', minWidth: 104 }}>
                <div className="small text-muted" style={{ lineHeight: 1 }}>Completed</div>
                <div className="fw-semibold" style={{ lineHeight: 1.1 }}>{daySummaryMetrics.completedByDrivers}</div>
              </div>
            </div>
          </div>;
      case 'toolbar-edit':
        return null;
      case 'columns':
        return <div className="d-inline-flex flex-column align-items-start">
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowColumnPicker(true)} disabled={mapLocked}>
              Columns
            </Button>
          </div>;
      case 'trip-order':
        return null;
      case 'actions':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleAssign(selectedDriverId)}
              disabled={mapLocked || !selectedDriverId || selectedTripIds.length === 0}
              title="Asignar viajes seleccionados al chofer principal"
            >
              A
            </Button>
            <Button
              variant="warning"
              size="sm"
              onClick={() => handleAssignSecondary(selectedSecondaryDriverId)}
              disabled={mapLocked || !selectedSecondaryDriverId || selectedTripIds.length === 0}
              title="Asignar segundo chofer a los viajes seleccionados"
            >
              A2
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUnassign}
              disabled={mapLocked || selectedTripIds.length === 0}
              title="Desasignar viajes seleccionados"
            >
              U
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleCancelSelectedTrips}
              disabled={mapLocked || selectedTripIds.length === 0}
              title="Cancelar viajes seleccionados"
            >
              C
            </Button>
            <Button
              variant="dark"
              size="sm"
              onClick={handleBlockSelectedTrips}
              disabled={mapLocked || selectedTripIds.length === 0}
              title="Block selected trips as rehab or hospital"
            >
              B
            </Button>
          </div>;
      case 'leg-buttons':
        return null;
      case 'type-buttons':
        return null;
      default:
        return null;
    }
  };

  const renderHelpButton = () => buildDispatcherHelpButton(router, setStatusMessage, greenToolbarButtonStyle);

  const renderToolbarRow3Block = blockId => {
    switch (canonicalizeToolbarBlockId(blockId)) {
      case 'zip-filter':
        return null;
      case 'route-filter':
        return null;
      case 'table-view-mode':
        return null;
      case 'metric-miles':
        return routeMetrics?.distanceMiles != null ? <Badge bg="light" text="dark">Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null;
      case 'metric-duration':
        return routeMetrics?.durationMinutes != null ? <Badge bg="light" text="dark">{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null;
      default:
        return null;
    }
  };

  const renderToolbarBlock = blockId => renderToolbarRow1Block(blockId) || renderToolbarRow2Block(blockId) || renderToolbarRow3Block(blockId);

  const activeDateTripIdSet = useMemo(() => {
    if (tripDateFilter === 'all') return null;
    return new Set(trips.filter(trip => getTripTimelineDateKey(trip, routePlans, trips) === tripDateFilter).map(trip => String(trip?.id || '').trim()).filter(Boolean));
  }, [tripDateFilter, routePlans, trips]);

  const hasSelectedTrips = selectedTripIds.length > 0;
  const isTripAssignedToSelectedDriver = trip => isTripAssignedToDriver(trip, selectedDriverId);
  const getTripDriverDisplay = trip => {
    const primaryDriverName = getDriverName(trip?.driverId);
    const hasPrimary = Boolean(trip?.driverId);
    const hasSecondary = Boolean(trip?.secondaryDriverId);
    if (!hasPrimary && !hasSecondary) return '-';
    if (!hasSecondary) return primaryDriverName;
    const secondaryDriverName = getDriverName(trip.secondaryDriverId);
    if (!hasPrimary) return secondaryDriverName;
    return `${primaryDriverName} + ${secondaryDriverName}`;
  };
  const getTripPatientProfileKey = trip => {
    const phoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    if (phoneKey) return `phone:${phoneKey}`;
    const riderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    return riderKey ? `rider:${riderKey}` : '';
  };
  const isPatientExclusionActiveForTripDate = (trip, tripDateKey) => {
    const profileKey = getTripPatientProfileKey(trip);
    if (!profileKey) return false;
    const exclusion = riderProfiles?.[profileKey]?.exclusion;
    if (!exclusion || !tripDateKey) return false;
    const mode = String(exclusion.mode || '').trim().toLowerCase();
    if (mode === 'always') return true;
    if (mode === 'single-day') return tripDateKey === String(exclusion.startDate || '').trim();
    if (mode === 'range') {
      const start = String(exclusion.startDate || '').trim();
      const end = String(exclusion.endDate || '').trim();
      if (!start || !end) return false;
      return tripDateKey >= start && tripDateKey <= end;
    }
    return false;
  };

  const cityOptionTrips = useMemo(() => trips.filter(trip => {
    const tripDateKey = getTripTimelineDateKey(trip, routePlans, trips);
    const normalizedStatus = String(getEffectiveTripStatus(trip) || '').toLowerCase().replace(/\s+/g, '');
    const blockingState = tripBlockingMap.get(trip.id);
    const hasActiveBlacklistBlock = blockingState?.source === 'blacklist';
    const autoExcluded = !hasActiveBlacklistBlock && isPatientExclusionActiveForTripDate(trip, tripDateKey);
    const effectiveStatus = autoExcluded ? 'cancelled' : normalizedStatus;
    const hasActiveHospitalRehab = Boolean(trip?.hospitalStatus?.startDate) && Boolean(trip?.hospitalStatus?.endDate) && todayDateKey >= String(trip.hospitalStatus.startDate) && todayDateKey <= String(trip.hospitalStatus.endDate);
    const isNonOperationalTrip = ['cancelled', 'canceled', 'rehab'].includes(effectiveStatus) || hasActiveHospitalRehab;
    const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
    const confirmationLabel = getDispatcherConfirmationLabel(trip, blockingState);
    const matchesStatus = tripStatusFilter === 'all' ? true : tripStatusFilter === 'unassigned' ? !trip.driverId && !trip.secondaryDriverId && !isNonOperationalTrip : tripStatusFilter === 'block' ? confirmationStatus === 'Opted Out' : tripStatusFilter === 'confirm' ? confirmationLabel === 'Confirmed' : tripStatusFilter === 'unconfirm' ? confirmationLabel === 'Not Sent' || confirmationLabel === 'Unconfirmed' : effectiveStatus === tripStatusFilter;
    if (!matchesStatus) return false;
    if (tripDateFilter !== 'all' && tripDateKey !== tripDateFilter) return false;
    return true;
  }).filter(trip => {
    if (tripLegFilter === 'all') return true;
    return getTripLegFilterKey(trip) === tripLegFilter;
  }).filter(trip => {
    if (tripTypeFilter === 'all') return true;
    return getTripMobilityLabel(trip) === tripTypeFilter;
  }).filter(trip => {
    if (!serviceAnimalOnly) return true;
    return Boolean(trip?.hasServiceAnimal);
  }).filter(trip => {
    const searchValue = tripIdSearch.trim().toLowerCase();
    if (!searchValue) return true;
    const tokens = searchValue.split(/\s+/).filter(Boolean);
    const haystack = [trip.id, trip.brokerTripId, trip.rideId, trip.rider, trip.patientFirstName, trip.patientLastName, trip.patientName, trip.patientPhoneNumber, trip.address, trip.destination, getPickupZip(trip), getDropoffZip(trip), getPickupCity(trip), getDropoffCity(trip), trip.notes, trip.status, trip.safeRideStatus].filter(Boolean).join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
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
  }), [dropoffZipFilter, pickupZipFilter, riderProfiles, selectedDriverId, todayDateKey, tripIdSearch, tripLegFilter, tripStatusFilter, tripTypeFilter, tripDateFilter, routePlans, tripBlockingMap, trips, zipFilter]);
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
  const isCancelledPanelMode = rightPanelMode === 'cancelled';
  const isCancelledRoutesMode = isCancelledPanelMode && cancelledDetailMode === 'routes';
  const tripTableTrips = useMemo(() => isCancelledPanelMode ? isCancelledRoutesMode ? dayRoutesByDriverTrips : cancelledSummaryTrips : filteredTrips, [cancelledSummaryTrips, dayRoutesByDriverTrips, filteredTrips, isCancelledPanelMode, isCancelledRoutesMode]);
  const activeDispatcherContextTokens = useMemo(() => {
    const tokens = [];
    tokens.push(isCancelledPanelMode ? isCancelledRoutesMode ? 'Mode: Day trips by driver' : 'Mode: Cancelled' : 'Mode: Normal');
    tokens.push(`Date: ${tripDateFilter === 'all' ? daySummaryMetrics.dateKey : tripDateFilter}`);
    if (tripStatusFilter !== 'all') tokens.push(`Status: ${tripStatusFilter}`);
    if (selectedDriver?.name) tokens.push(`Driver: ${selectedDriver.name}`);
    if (selectedRoute?.name) tokens.push(`Route: ${selectedRoute.name}`);
    if (selectedTripIds.length > 0) tokens.push(`Selected: ${selectedTripIds.length}`);
    return tokens;
  }, [daySummaryMetrics.dateKey, isCancelledPanelMode, isCancelledRoutesMode, selectedDriver?.name, selectedRoute?.name, selectedTripIds.length, tripDateFilter, tripStatusFilter]);
  const hasScopedDispatcherContext = isCancelledPanelMode || tripStatusFilter !== 'all' || Boolean(selectedDriverId) || Boolean(selectedRouteId) || selectedTripIds.length > 0;
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
  const visibleTripIds = tripTableTrips.map(trip => normalizeTripId(trip.id)).filter(Boolean);
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const tripColumnMeta = useMemo(() => DISPATCH_TRIP_COLUMN_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.key] = option;
    return accumulator;
  }, {}), []);
  const orderedVisibleTripColumns = useMemo(() => visibleTripColumns.filter(columnKey => Boolean(tripColumnMeta[columnKey])), [tripColumnMeta, visibleTripColumns]);
  const filteredDrivers = drivers;
  const tripOriginalOrderLookup = useMemo(() => new Map(trips.map((trip, index) => [trip.id, index])), [trips]);
  const selectedDriverAssignedTripCount = useMemo(() => {
    const normalizedSelectedDriverId = normalizeDriverId(selectedDriverId);
    if (!normalizedSelectedDriverId) return 0;
    return trips.filter(trip => normalizeDriverId(trip?.driverId) === normalizedSelectedDriverId || normalizeDriverId(trip?.secondaryDriverId) === normalizedSelectedDriverId).length;
  }, [selectedDriverId, trips]);
  const groupedFilteredTripRows = useMemo(() => {
    const compareTrips = (leftTrip, rightTrip) => {
      if (isCancelledPanelMode && !isCancelledRoutesMode) {
        const leftRider = String(leftTrip?.rider || '').trim().toLowerCase();
        const rightRider = String(rightTrip?.rider || '').trim().toLowerCase();
        if (leftRider !== rightRider) return leftRider.localeCompare(rightRider);
        const leftTime = leftTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        const rightTime = rightTrip.pickupSortValue ?? Number.MAX_SAFE_INTEGER;
        if (leftTime !== rightTime) return leftTime - rightTime;
        return String(leftTrip.id || '').localeCompare(String(rightTrip.id || ''));
      }

      const leftAssignedToSelectedDriver = isTripAssignedToDriver(leftTrip, selectedDriverId) ? 1 : 0;
      const rightAssignedToSelectedDriver = isTripAssignedToDriver(rightTrip, selectedDriverId) ? 1 : 0;
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

    if (isCancelledRoutesMode) {
      const groups = tripTableTrips.reduce((map, trip) => {
        const primaryDriverId = normalizeDriverId(trip?.driverId);
        const secondaryDriverId = normalizeDriverId(trip?.secondaryDriverId);
        const groupDriverId = primaryDriverId || secondaryDriverId;
        const groupDriverName = primaryDriverId ? getDriverName(primaryDriverId) : secondaryDriverId ? getDriverName(secondaryDriverId) : '';
        const groupLabel = String(groupDriverName || trip?.driverName || trip?.secondaryDriverName || 'Unassigned').trim() || 'Unassigned';
        const groupKey = String(groupDriverId || groupLabel).trim().toLowerCase();
        if (!map.has(groupKey)) map.set(groupKey, {
          label: groupLabel,
          trips: []
        });
        map.get(groupKey).trips.push(trip);
        return map;
      }, new Map());

      return Array.from(groups.entries()).map(([groupKey, groupValue]) => ({
        groupKey,
        label: groupValue.label,
        trips: sortTripsByPickupTime(groupValue.trips)
      })).sort((leftGroup, rightGroup) => leftGroup.label.localeCompare(rightGroup.label)).flatMap(group => [{
        type: 'group',
        groupKey: group.groupKey,
        ridesCount: group.trips.length,
        label: group.trips.length > 1 ? `${group.label} • ${group.trips.length} rides` : `${group.label} • 1 ride`
      }, ...group.trips.map(trip => ({
        type: 'trip',
        groupKey: group.groupKey,
        trip
      }))]);
    }

    if (isCancelledPanelMode) {
      return [...tripTableTrips].sort(compareTrips).map(trip => ({
        type: 'trip',
        groupKey: 'cancelled',
        trip
      }));
    }

    const groups = tripTableTrips.reduce((map, trip) => {
      const pickupMinutes = parseTripClockMinutes(getEffectivePickupTimeText(trip));
      const hasTime = Number.isFinite(pickupMinutes);
      const bucketHour = hasTime ? Math.floor(pickupMinutes / 60) : null;
      const bucketLabel = hasTime ? `${String(bucketHour).padStart(2, '0')}:00` : 'No Time';
      if (!map.has(bucketLabel)) map.set(bucketLabel, []);
      map.get(bucketLabel).push(trip);
      return map;
    }, new Map());

    return Array.from(groups.entries()).map(([groupKey, groupTrips]) => ({
      groupKey,
      trips: [...groupTrips].sort(compareTrips)
    })).sort((leftGroup, rightGroup) => compareTrips(leftGroup.trips[0], rightGroup.trips[0])).flatMap(group => [{
      type: 'group',
      groupKey: group.groupKey,
      ridesCount: group.trips.length,
      label: group.trips.length > 1 ? `Hour ${group.groupKey} • ${group.trips.length} rides` : `Hour ${group.groupKey} • 1 ride`
    }, ...group.trips.map(trip => ({
      type: 'trip',
      groupKey: group.groupKey,
      trip
    }))]);
  }, [getDriverName, isCancelledPanelMode, isCancelledRoutesMode, selectedDriverId, tripOrderMode, tripOriginalOrderLookup, tripSort.direction, tripSort.key, tripTableTrips]);

  const routeTrips = useMemo(() => {
    const selectedTripIdSet = new Set(selectedTripIds.map(id => String(id || '').trim()).filter(Boolean));
    const selectedRouteTripIdSet = new Set((Array.isArray(selectedRoute?.tripIds) ? selectedRoute.tripIds : []).map(id => String(id || '').trim()).filter(Boolean));
    const hasDriverScope = Boolean(selectedDriver);
    const baseTrips = selectedRoute
      ? trips.filter(trip => selectedRouteTripIdSet.has(String(trip?.id || '').trim()))
      : hasDriverScope
        ? trips.filter(trip => isTripAssignedToDriver(trip, selectedDriver.id))
      : trips.filter(trip => selectedTripIdSet.has(String(trip?.id || '').trim()));
    const scopedTrips = activeDateTripIdSet ? baseTrips.filter(trip => activeDateTripIdSet.has(String(trip?.id || '').trim())) : baseTrips;
    const term = deferredRouteSearch.trim().toLowerCase();
    return sortTripsByPickupTime(scopedTrips.filter(trip => !term || [trip.id, trip.rider, trip.address].some(value => String(value || '').toLowerCase().includes(term))));
  }, [activeDateTripIdSet, deferredRouteSearch, selectedDriver, selectedRoute, selectedTripIds, trips]);

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
      return sortTripsByPickupTime(selectedTripsForMap).flatMap((trip, index) => [{
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
  }, [activeDateTripIdSet, routeTrips, selectedRoute, selectedTripIds, showRoute, trips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const assignedTripsCount = trips.filter(trip => trip.status === 'Assigned').length;
  const activeInfoTrip = useMemo(() => {
    if (selectedTripIds.length > 0) {
      return trips.find(trip => selectedTripIdSet.has(normalizeTripId(trip.id))) ?? null;
    }

    if (selectedRoute) {
      return routeTrips[0] ?? null;
    }

    if (isManualDriverScope && selectedDriver) {
      return routeTrips[0] ?? null;
    }

    return null;
  }, [isManualDriverScope, routeTrips, selectedDriver, selectedRoute, selectedTripIdSet, selectedTripIds.length, trips]);
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIdSet.has(id));
  const showCancelledDetailControls = !isCancelledPanelMode;
  const tripTableColumnCount = orderedVisibleTripColumns.length + (showCancelledDetailControls ? 5 : 0);
  const selectedDriverSelectedTrip = useMemo(() => {
    if (!selectedDriver) return null;
    return trips.find(trip => selectedTripIdSet.has(normalizeTripId(trip.id)) && isTripAssignedToDriver(trip, selectedDriver.id)) ?? null;
  }, [selectedDriver, selectedTripIdSet, trips]);
  const selectedDriverActiveTrip = useMemo(() => {
    if (!selectedDriver) return null;
    const selectedEnRouteTrip = selectedDriverSelectedTrip && isTripEnRoute(selectedDriverSelectedTrip) ? selectedDriverSelectedTrip : null;
    if (selectedEnRouteTrip) return selectedEnRouteTrip;
    if (!isManualDriverScope) return null;
    const routeTrip = routeTrips.find(trip => isTripAssignedToDriver(trip, selectedDriver.id) && isTripEnRoute(trip));
    if (routeTrip) return routeTrip;
    return null;
  }, [isManualDriverScope, routeTrips, selectedDriver, selectedDriverSelectedTrip, trips]);
  const selectedDriverEtaTrip = useMemo(() => {
    if (!selectedDriver) return null;
    if (selectedDriverSelectedTrip) return selectedDriverSelectedTrip;
    if (selectedDriverActiveTrip) return selectedDriverActiveTrip;
    return null;
  }, [selectedDriver, selectedDriverActiveTrip, selectedDriverSelectedTrip]);
  const selectedDriverEta = useMemo(() => {
    if (!dispatcherLayout.mapVisible || !selectedDriver || !selectedDriver.hasRealLocation || !selectedDriverEtaTrip) return null;
    const target = getSelectedDriverEtaTarget(selectedDriverEtaTrip);
    const miles = selectedDriverRouteMetrics?.distanceMiles ?? getDistanceMiles(selectedDriver.position, target?.position);
    const remainingMinutes = selectedDriverRouteMetrics?.durationMinutes;
    return {
      target,
      miles,
      label: remainingMinutes != null ? formatRemainingEta(remainingMinutes) : formatEta(miles)
    };
  }, [dispatcherLayout.mapVisible, selectedDriver, selectedDriverEtaTrip, selectedDriverRouteMetrics]);
  const driverEtaPreviewById = useMemo(() => {
    const etaByDriver = new Map();
    drivers.forEach(driver => {
      if (!driver?.hasRealLocation || !Array.isArray(driver.position) || driver.position.length !== 2) return;
      const activeTrip = trips.find(trip => isTripAssignedToDriver(trip, driver.id) && isTripEnRoute(trip));
      if (!activeTrip) return;
      const target = getSelectedDriverEtaTarget(activeTrip);
      if (!Array.isArray(target?.position) || target.position.length !== 2) return;
      const miles = getDistanceMiles(driver.position, target.position);
      etaByDriver.set(String(driver.id || '').trim(), {
        etaLabel: formatEta(miles),
        rider: String(activeTrip?.rider || '').trim(),
        tripId: String(activeTrip?.brokerTripId || activeTrip?.id || '').trim(),
        targetLabel: String(target?.label || '').trim()
      });
    });
    return etaByDriver;
  }, [drivers, trips]);
  const driverSequencePreviewById = useMemo(() => {
    const previewByDriver = new Map();
    const scopedTrips = activeDateTripIdSet ? trips.filter(trip => activeDateTripIdSet.has(String(trip?.id || '').trim())) : trips;

    drivers.forEach(driver => {
      const driverId = String(driver?.id || '').trim();
      if (!driverId) return;
      const assignedTrips = sortTripsByPickupTime(scopedTrips.filter(trip => {
        if (!isTripAssignedToDriver(trip, driverId)) return false;
        const effectiveStatus = String(getEffectiveTripStatus(trip) || '').trim().toLowerCase();
        return effectiveStatus !== 'cancelled';
      }));
      if (assignedTrips.length === 0) return;

      const currentTrip = assignedTrips.find(trip => isTripEnRoute(trip)) || assignedTrips.find(trip => String(getEffectiveTripStatus(trip) || '').trim().toLowerCase() !== 'completed') || assignedTrips[0];
      if (!currentTrip) return;

      const target = getSelectedDriverEtaTarget(currentTrip);
      const stageLabel = target?.stage === 'dropoff' ? 'DO' : 'PU';
      const timeLabel = target?.stage === 'dropoff' ? currentTrip?.dropoff : currentTrip?.pickup;
      previewByDriver.set(driverId, {
        tripId: String(currentTrip?.brokerTripId || currentTrip?.id || '').trim(),
        rider: String(currentTrip?.rider || '').trim(),
        stageLabel,
        timeLabel: String(timeLabel || '').trim() || '--',
        targetLabel: String(target?.label || '').trim(),
        targetDetail: String(target?.detail || '').trim()
      });
    });

    return previewByDriver;
  }, [activeDateTripIdSet, drivers, trips]);
  const driversWithRealLocation = useMemo(() => drivers.filter(driver => driver.hasRealLocation), [drivers]);
  const nonSelectedDriversWithRealLocation = useMemo(() => {
    if (selectedDriverId) return [];
    return driversWithRealLocation.filter(driver => String(driver?.id || '').trim() !== String(selectedDriverId || '').trim() && String(driver?.live || '').trim().toLowerCase() === 'online');
  }, [driversWithRealLocation, selectedDriverId]);
  const mapVisibleDriversWithRealLocation = useMemo(() => {
    if (!selectedDriver?.hasRealLocation) return nonSelectedDriversWithRealLocation;
    return [selectedDriver, ...nonSelectedDriversWithRealLocation];
  }, [nonSelectedDriversWithRealLocation, selectedDriver]);
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
  const quickReassignDrivers = useMemo(() => {
    return [...drivers].sort((leftDriver, rightDriver) => {
      const leftOnline = String(leftDriver?.live || '').trim().toLowerCase() === 'online' ? 1 : 0;
      const rightOnline = String(rightDriver?.live || '').trim().toLowerCase() === 'online' ? 1 : 0;
      if (leftOnline !== rightOnline) return rightOnline - leftOnline;
      return String(leftDriver?.name || '').localeCompare(String(rightDriver?.name || ''));
    });
  }, [drivers]);
  const noteModalTrip = useMemo(() => noteModalTripId ? trips.find(trip => trip.id === noteModalTripId) ?? null : null, [noteModalTripId, trips]);

  useEffect(() => {
    if (!activeDateTripIdSet) return;

    const selectedIds = selectedTripIds.map(id => String(id || '').trim()).filter(Boolean);
    const prunedSelectedIds = selectedIds.filter(id => activeDateTripIdSet.has(id));
    if (prunedSelectedIds.length !== selectedIds.length) {
      setSelectedTripIds(prunedSelectedIds);
    }

    if (selectedRouteId) {
      const selectedRouteDate = getRouteServiceDateKey(selectedRoute, trips);
      if (selectedRouteDate && selectedRouteDate !== tripDateFilter) {
        setSelectedRouteId('');
      }
    }
  }, [activeDateTripIdSet, selectedRoute, selectedRouteId, selectedTripIds, setSelectedRouteId, setSelectedTripIds, tripDateFilter, trips]);

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

  const isInlineTripCellEditing = (tripId, columnKey) => inlineTripEditCell?.tripId === tripId && inlineTripEditCell?.columnKey === columnKey;

  const handleStartInlineTripEdit = (trip, columnKey) => {
    if (mapLocked || !trip || !INLINE_EDITABLE_TRIP_COLUMNS.has(columnKey)) return;
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
    if (mapLocked || !trip || !inlineTripEditCell?.columnKey) return;
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
    setStatusMessage(`${getDisplayTripId(trip)} actualizado en ${inlineTripEditCell.columnKey}.`);
    handleCancelInlineTripEdit();
  };

  const renderInlineEditableTripCell = ({ trip, columnKey, displayValue, cellStyle, displayStyle, inputType = 'text', placeholder = '', textColor }) => {
    const isEditing = isInlineTripCellEditing(trip.id, columnKey);
    return <td
      style={{
        ...cellStyle,
        color: textColor,
        cursor: mapLocked ? 'not-allowed' : 'text',
        opacity: mapLocked ? 0.5 : 1
      }}
      onDoubleClick={() => handleStartInlineTripEdit(trip, columnKey)}
      title={mapLocked ? 'Unlock para editar' : 'Doble clic para editar'}
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
        color: textColor,
        ...displayStyle
      }}>{displayValue || '-'}</span>}
    </td>;
  };

  const getCancelledRoutesTripTextColor = trip => {
    if (!isCancelledRoutesMode) return undefined;
    const status = getEffectiveTripStatus(trip);
    if (status === 'Cancelled') return '#b91c1c';
    if (status === 'Completed') return '#15803d';
    return undefined;
  };

  const handleToggleTripColumn = columnKey => {
    const nextColumns = orderedVisibleTripColumns.includes(columnKey) ? orderedVisibleTripColumns.filter(item => item !== columnKey) : [...orderedVisibleTripColumns, columnKey];
    if (nextColumns.length === 0) {
      setStatusMessage('Debe quedar al menos una columna visible.');
      return;
    }
    setDispatcherVisibleTripColumns(nextColumns);
    setStatusMessage('Vista de columnas actualizada.');
  };

  const allTripColumnKeys = DISPATCH_TRIP_COLUMN_OPTIONS.map(option => option.key);

  const handleShowAllTripColumns = () => {
    setDispatcherVisibleTripColumns(allTripColumnKeys);
    setStatusMessage('Todas las columnas visibles.');
  };

  const handleResetTripColumns = () => {
    setDispatcherVisibleTripColumns(DEFAULT_DISPATCHER_VISIBLE_TRIP_COLUMNS);
    setStatusMessage('Columnas restauradas a default.');
  };

  const handleTripColumnDrop = targetColumnKey => {
    if (!draggingTripColumnKey || draggingTripColumnKey === targetColumnKey) return;
    const sourceIndex = orderedVisibleTripColumns.indexOf(draggingTripColumnKey);
    const targetIndex = orderedVisibleTripColumns.indexOf(targetColumnKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextColumns = [...orderedVisibleTripColumns];
    const [movedKey] = nextColumns.splice(sourceIndex, 1);
    nextColumns.splice(targetIndex, 0, movedKey);
    setDispatcherVisibleTripColumns(nextColumns);
    setDraggingTripColumnKey(null);
    setStatusMessage('Orden de columnas actualizado.');
  };

  const renderTripDataCell = trip => columnKey => {
    const textColor = getCancelledRoutesTripTextColor(trip);
    switch (columnKey) {
      case 'trip':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>
            <div className="fw-semibold">{getDisplayTripId(trip)}</div>
            {getLegBadge(trip) ? <Badge bg={getLegBadge(trip).variant} className="mt-1 me-1">{getLegBadge(trip).label}</Badge> : null}
            {trip.hasServiceAnimal ? <Badge bg="warning" text="dark" className="mt-1 me-1">🐕 Service Animal</Badge> : null}
            {!orderedVisibleTripColumns.includes('mobility') && trip.mobilityType ? <Badge bg="light" text="dark" className="mt-1 border">{trip.mobilityType}</Badge> : null}
          </td>;
      case 'status':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>
            <Badge bg={isTripAssignedToSelectedDriver(trip) ? 'success' : getStatusBadge(getEffectiveTripStatus(trip))}>{isTripAssignedToSelectedDriver(trip) ? 'Assigned Here' : getEffectiveTripStatus(trip)}</Badge>
            {trip.secondaryDriverId ? <div className="mt-1"><Badge bg="warning" text="dark">2 Drivers</Badge></div> : null}
            {trip.safeRideStatus && getEffectiveTripStatus(trip) !== 'Cancelled' ? <div className="small text-muted mt-1">{trip.safeRideStatus}</div> : null}
          </td>;
      case 'confirmation': {
        const blockingState = tripBlockingMap.get(trip.id);
        const confirmationLabel = getDispatcherConfirmationLabel(trip, blockingState);
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>
            <Badge bg={getConfirmationBadgeVariant(confirmationLabel === 'Unconfirmed' ? 'Not Sent' : confirmationLabel)}>{confirmationLabel}</Badge>
          </td>;
      }
      case 'driver':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>
            <div>{getTripDriverDisplay(trip)}</div>
            {trip.secondaryDriverId ? <div className="mt-1"><Badge bg="warning" text="dark">2 Drivers</Badge></div> : null}
          </td>;
      case 'pickup':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.pickup,
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: '07:40 AM'
        });
      case 'dropoff':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.dropoff,
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: '08:15 AM'
        });
      case 'miles':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.miles || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: '12.5'
        });
      case 'rider':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
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
          textColor,
          placeholder: 'Nombre del paciente'
        });
      case 'address':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.address,
          cellStyle: {},
          displayStyle: addressClampStyle,
          textColor,
          placeholder: 'Pickup address'
        });
      case 'puZip':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: getPickupZip(trip) || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: '32808'
        });
      case 'destination':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.destination || '-',
          cellStyle: {},
          displayStyle: addressClampStyle,
          textColor,
          placeholder: 'Dropoff address'
        });
      case 'doZip':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: getDropoffZip(trip) || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: '32714'
        });
      case 'phone':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.patientPhoneNumber || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: '(407) 555-0000'
        });
      case 'vehicle':
        return renderInlineEditableTripCell({
          trip,
          columnKey,
          displayValue: trip.vehicleType || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          textColor,
          placeholder: 'Ambulatory'
        });
      case 'mobility':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>{trip.mobilityType || '-'}</td>;
      case 'assistLevel':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>{trip.assistLevel || '-'}</td>;
      case 'serviceAnimal':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap' }}>{trip.hasServiceAnimal ? <Badge bg="warning" text="dark">🐕 Yes</Badge> : '-'}</td>;
      case 'notes':
        return <td key={columnKey} style={{ minWidth: 220, maxWidth: 320, whiteSpace: 'normal', color: textColor }}>{getTripNoteText(trip) || '-'}</td>;
      case 'leg':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>{getLegBadge(trip) ? <Badge bg={getLegBadge(trip).variant}>{getLegBadge(trip).label}</Badge> : '-'}</td>;
      case 'punctuality':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap' }}><Badge bg={getTripPunctualityVariant(trip)}>{getTripPunctualityLabel(trip)}</Badge></td>;
      case 'lateMinutes':
        return <td key={columnKey} style={{ whiteSpace: 'nowrap', color: textColor }}>{getTripLateMinutesDisplay(trip)}</td>;
      default:
        return null;
    }
  };

  const handleSelectAll = checked => {
    if (checked) {
      setSelectedTripIds(currentIds => Array.from(new Set([...currentIds.map(normalizeTripId).filter(Boolean), ...visibleTripIds])));
      setStatusMessage('Trips visibles seleccionados.');
      return;
    }
    setSelectedTripIds(currentIds => currentIds.map(normalizeTripId).filter(id => id && !visibleTripIds.includes(id)));
    setStatusMessage('Trips visibles deseleccionados.');
  };

  const handleShiftTripDate = offsetDays => {
    const baseDate = tripDateFilter === 'all' ? todayDateKey : tripDateFilter;
    const nextDate = shiftTripDateKey(baseDate, offsetDays);
    if (nextDate) setTripDateFilter(nextDate);
  };

  const handleTripSelectionToggle = tripId => {
    const trip = trips.find(item => item.id === tripId);
    const isSelecting = !selectedTripIdSet.has(normalizeTripId(tripId));

    toggleTripSelection(tripId);

    if (isSelecting && trip?.driverId) {
      setSelectedDriverId(normalizeDriverId(trip.driverId) || null);
      setIsManualDriverScope(false);
      setStatusMessage(`SMS listo con ${getDriverName(trip.driverId)} para el trip ${trip.id}.`);
    }
  };

  const handleAssign = driverId => {
    const targetTripIds = [...selectedTripIds];
    if (!driverId || targetTripIds.length === 0) {
      setStatusMessage('Selecciona chofer y al menos un trip.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(driverId || '').trim());
    if (!driver) {
      setStatusMessage('El chofer seleccionado ya no esta disponible. Recarga la lista.');
      return;
    }

    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: targetTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      return;
    }

    assignTripsToDriver(driverId, targetTripIds);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
    setStatusMessage(`${targetTripIds.length} trip(s) asignados a ${driver.name}.`);
  };

  const handleAssignSecondary = driverId => {
    const targetTripIds = [...selectedTripIds];
    if (!driverId || targetTripIds.length === 0) {
      setStatusMessage('Escoge segundo chofer y al menos un trip.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(driverId || '').trim());
    if (!driver) {
      setStatusMessage('El segundo chofer ya no esta disponible.');
      return;
    }

    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: targetTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      return;
    }

    assignTripsToSecondaryDriver(driverId, targetTripIds);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
    setStatusMessage(`${targetTripIds.length} trip(s) actualizados con segundo chofer: ${driver.name}.`);
  };

  const handleAssignTrip = tripId => {
    if (!selectedDriverId) {
      setStatusMessage('Primero escoge un chofer para asignar este trip.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(selectedDriverId || '').trim());
    if (!driver) {
      setStatusMessage('El chofer seleccionado no esta disponible.');
      return;
    }

    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: [tripId], trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      return;
    }

    assignTripsToDriver(selectedDriverId, [tripId]);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
    setSelectedTripIds([tripId]);
    setStatusMessage(`Trip ${tripId} asignado a ${driver.name}.`);
  };

  const handleQuickReassignSelectedTrips = () => {
    if (!quickReassignDriverId || selectedTripIds.length === 0) {
      setStatusMessage('Escoge un chofer y al menos un trip abajo para reasignar.');
      return;
    }

    const driver = drivers.find(item => String(item?.id || '').trim() === String(quickReassignDriverId || '').trim());
    if (!driver) {
      setStatusMessage('Ese chofer ya no esta disponible.');
      return;
    }

    const compatibilityIssue = findTripAssignmentCompatibilityIssue({ driver, tripIds: selectedTripIds, trips, adminDriversById, adminVehiclesById });
    if (compatibilityIssue) {
      setStatusMessage(compatibilityIssue.message);
      return;
    }

    const selectedCount = selectedTripIds.length;
    assignTripsToDriver(quickReassignDriverId, selectedTripIds);
    setSelectedTripIds([]);
    setSelectedDriverId(quickReassignDriverId);
    setIsManualDriverScope(true);
    setSelectedRouteId('');
    setQuickReassignDriverId('');
    setStatusMessage(`${selectedCount} trip(s) reasignados a ${driver.name}.`);
  };

  const handleDriverSelectionChange = nextDriverId => {
    const normalizedDriverId = String(nextDriverId || '').trim();
    const preferredRouteId = getPreferredRouteIdForDriver(normalizedDriverId);
    const driver = drivers.find(item => String(item?.id || '').trim() === normalizedDriverId) || null;
    setSelectedDriverId(normalizedDriverId || null);
    setIsManualDriverScope(Boolean(normalizedDriverId));
    setSelectedRouteId(preferredRouteId || '');
    setIsRoutePanelCollapsed(false);

    if (!normalizedDriverId) {
      setFollowSelectedDriver(false);
      setMapFocusRequest(null);
      setStatusMessage('Mostrando todos los trips otra vez.');
      return;
    }

    if (!driver) {
      setStatusMessage('Chofer no encontrado.');
      return;
    }

    setFollowSelectedDriver(false);
    if (Array.isArray(driver?.position) && driver.position.length === 2) {
      setMapFocusRequest({
        key: `${normalizedDriverId}-${Date.now()}`,
        position: driver.position
      });
    }

    const assignedCount = trips.filter(trip => trip.driverId === normalizedDriverId || trip.secondaryDriverId === normalizedDriverId).length;
    const openCount = trips.filter(trip => !trip.driverId && !trip.secondaryDriverId).length;
    setStatusMessage(preferredRouteId ? `Viendo ${driver.name}: ${assignedCount} asignados, ${openCount} pendientes y ruta cargada.` : `Viendo ${driver.name}: ${assignedCount} asignados y ${openCount} pendientes.`);
  };

  const handleUnassign = () => {
    const targetTripIds = [...selectedTripIds];
    if (targetTripIds.length === 0) {
      setStatusMessage('Select at least one trip to remove assignment.');
      return;
    }
    unassignTrips(targetTripIds);
    setStatusMessage('Trips desasignados.');
  };

  const handleUnassignTrip = tripId => {
    unassignTrips([tripId]);
    setSelectedTripIds(currentIds => currentIds.filter(id => id !== tripId));
    setStatusMessage(`Trip ${tripId} desasignado.`);
  };

  const handleBlockSelectedTrips = async () => {
    if (selectedTripIds.length === 0) {
      setStatusMessage('Selecciona al menos un trip para bloquear.');
      return;
    }

    const response = String(window.prompt('Block selected trips as: rehab or hospital', 'rehab') || '').trim().toLowerCase();
    if (!response) return;

    const blockType = response.startsWith('h') ? 'hospital' : response.startsWith('r') ? 'rehab' : '';
    if (!blockType) {
      setStatusMessage('Valor invalido. Usa rehab o hospital.');
      return;
    }

    const endDate = shiftTripDateKey(todayDateKey, 14) || todayDateKey;
    const nowIso = new Date().toISOString();
    selectedTripIds.forEach(tripId => {
      updateTripRecord(tripId, {
        hospitalStatus: {
          type: blockType,
          startDate: todayDateKey,
          endDate,
          reason: blockType === 'hospital' ? 'Blocked to hospital by dispatcher' : 'Blocked to rehab by dispatcher'
        }
      });
    });

    const selectedTrips = selectedTripIds.map(tripId => trips.find(trip => String(trip?.id || '').trim() === String(tripId || '').trim())).filter(Boolean);
    if (selectedTrips.length > 0) {
      const existingEntries = Array.isArray(blacklistData?.entries) ? blacklistData.entries : [];
      const nextEntries = [...existingEntries];
      const holdLabel = blockType === 'hospital' ? 'HOSPITAL' : 'REHAB';

      selectedTrips.forEach(trip => {
        const normalizedTripPhone = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
        const normalizedTripName = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const matchingIndex = nextEntries.findIndex(entry => {
          const entryPhone = String(entry?.phone || '').replace(/\D/g, '');
          const entryName = String(entry?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          if (entryPhone && normalizedTripPhone && entryPhone === normalizedTripPhone) return true;
          if (entryName && normalizedTripName && entryName === normalizedTripName) return true;
          return false;
        });

        const noteText = `[${holdLabel}] Blocked from Dispatcher until ${endDate}`;
        if (matchingIndex >= 0) {
          const existingEntry = nextEntries[matchingIndex];
          const mergedNotes = [String(existingEntry?.notes || '').trim(), noteText].filter(Boolean).join(' | ');
          nextEntries[matchingIndex] = {
            ...existingEntry,
            category: 'Medical Hold',
            status: 'Active',
            holdUntil: endDate,
            notes: mergedNotes,
            source: 'Dispatcher Block',
            updatedAt: nowIso
          };
          return;
        }

        nextEntries.unshift({
          id: `bl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          name: String(trip?.rider || '').trim(),
          phone: String(trip?.patientPhoneNumber || '').trim(),
          category: 'Medical Hold',
          status: 'Active',
          holdUntil: endDate,
          notes: noteText,
          source: 'Dispatcher Block',
          createdAt: nowIso,
          updatedAt: nowIso
        });
      });

      try {
        await saveBlacklistData({
          version: blacklistData?.version ?? 1,
          entries: nextEntries
        });
      } catch {
        setStatusMessage(`Trips bloqueados como ${blockType}, pero no se pudo guardar blacklist.`);
        return;
      }
    }

    setStatusMessage(`${selectedTripIds.length} trip(s) bloqueados como ${blockType}.`);
  };

  const openCancelModalForTrips = tripIds => {
    const normalizedTripIds = (Array.isArray(tripIds) ? tripIds : []).map(id => String(id || '').trim()).filter(Boolean);
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
    const reason = String(cancelReasonDraft || '').trim();
    cancelTrips(cancelTripIds, {
      source: 'dispatcher-manual',
      reason
    });
    setStatusMessage(`${cancelTripIds.length} trip(s) cancelados.`);
    handleCloseCancelModal();
  };

  const handleCancelTrip = tripId => {
    openCancelModalForTrips([tripId]);
  };

  const handleCancelSelectedTrips = () => {
    openCancelModalForTrips(selectedTripIds);
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

    const currentStatus = getEffectiveTripStatus(trip);
    const isAutoWillCallCandidate = getTripLegFilterKey(trip) !== 'AL' && hasMissingTripTime(trip);
    const updatePayload = currentStatus === 'WillCall' ? {
      status: 'Unassigned',
      willCallOverride: isAutoWillCallCandidate ? 'off' : null
    } : {
      status: 'WillCall',
      willCallOverride: 'manual'
    };
    updateTripRecord(tripId, updatePayload);
    const nextActionLabel = updatePayload.status === 'WillCall' ? 'Marked trip as WillCall' : 'Removed trip from WillCall';
    void logSystemActivity(nextActionLabel, `Trip ${tripId}`, {
      tripId,
      rider: trip.rider || '',
      nextStatus: updatePayload.status,
      driverId: trip.driverId || ''
    });

    if (updatePayload.status === 'WillCall') {
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
    const generatedAt = formatPrintGeneratedAt(new Date());
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

  const renderTripHeader = (columnKey, label, width, draggableColumn = false) => {
    const resolvedWidth = columnWidths[columnKey] ?? width;
    return <th
      style={resolvedWidth ? {
        width: resolvedWidth,
        minWidth: resolvedWidth,
        maxWidth: resolvedWidth,
        position: 'relative',
        cursor: draggableColumn ? 'grab' : undefined,
        opacity: draggingTripColumnKey === columnKey ? 0.55 : 1
      } : {
        position: 'relative',
        cursor: draggableColumn ? 'grab' : undefined,
        opacity: draggingTripColumnKey === columnKey ? 0.55 : 1
      }}
      draggable={draggableColumn && !mapLocked}
      onDragStart={event => {
        if (!draggableColumn || mapLocked) return;
        event.dataTransfer.setData('text/plain', columnKey);
        event.dataTransfer.effectAllowed = 'move';
        setDraggingTripColumnKey(columnKey);
      }}
      onDragOver={event => {
        if (!draggableColumn || mapLocked) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={event => {
        if (!draggableColumn || mapLocked) return;
        event.preventDefault();
        handleTripColumnDrop(columnKey);
      }}
      onDragEnd={() => {
        if (!draggableColumn) return;
        setDraggingTripColumnKey(null);
      }}
    >
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
          signal: abortController.signal
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
    if (!dispatcherLayout.mapVisible || !selectedDriver?.hasRealLocation || !selectedDriverEtaTrip) {
      setSelectedDriverRouteGeometry([]);
      setSelectedDriverRouteMetrics(null);
      return;
    }

    const target = getSelectedDriverEtaTarget(selectedDriverEtaTrip);
    const targetPosition = Array.isArray(target?.position) ? target.position : null;
    if (!Array.isArray(selectedDriver.position) || !targetPosition || targetPosition.length !== 2) {
      setSelectedDriverRouteGeometry([]);
      setSelectedDriverRouteMetrics(null);
      return;
    }

    const abortController = new AbortController();
    const coordinates = `${selectedDriver.position[0]},${selectedDriver.position[1]};${targetPosition[0]},${targetPosition[1]}`;

    const loadSelectedDriverRoute = async () => {
      try {
        const response = await fetch(`/api/maps/route?coordinates=${encodeURIComponent(coordinates)}`, {
          signal: abortController.signal
        });
        if (!response.ok) throw new Error('Routing service unavailable');
        const payload = await response.json();
        const geometry = Array.isArray(payload?.geometry) ? payload.geometry : [];
        if (geometry.length < 2) throw new Error('No drivable route found');
        setSelectedDriverRouteGeometry(geometry);
        setSelectedDriverRouteMetrics({
          distanceMiles: Number.isFinite(payload?.distanceMiles) ? payload.distanceMiles : null,
          durationMinutes: Number.isFinite(payload?.durationMinutes) ? payload.durationMinutes : null,
          isFallback: Boolean(payload?.isFallback)
        });
      } catch {
        if (abortController.signal.aborted) return;
        setSelectedDriverRouteGeometry([selectedDriver.position, targetPosition]);
        setSelectedDriverRouteMetrics(null);
      }
    };

    loadSelectedDriverRoute();

    return () => {
      abortController.abort();
    };
  }, [dispatcherLayout.mapVisible, selectedDriver, selectedDriverEtaTrip]);

  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = event => {
      if (!workspaceRef.current) return;
      const bounds = workspaceRef.current.getBoundingClientRect();
      const nextColumnSplit = clamp((event.clientX - bounds.left) / bounds.width * 100, 28, 72);
      const nextRowSplit = clamp((event.clientY - bounds.top) / bounds.height * 100, 24, 82);

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
      const maxScrollLeft = Math.max(0, (scrollContainer?.scrollWidth || 0) - (scrollContainer?.clientWidth || 0));
      setTripTableMaxScrollLeft(maxScrollLeft);
      setTripTableScrollLeft(Math.min(scrollContainer?.scrollLeft || 0, maxScrollLeft));
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
  }, [columnWidths, groupedFilteredTripRows, visibleTripColumns, dispatcherLayout.actionsVisible, dispatcherLayout.mapVisible, dispatcherLayout.messagingVisible, dispatcherLayout.tripsVisible, expanded]);

  useEffect(() => {
    const handleAssistantAction = () => refreshDispatchState({ forceServer: true });
    window.addEventListener('nemt-assistant-action', handleAssistantAction);
    return () => window.removeEventListener('nemt-assistant-action', handleAssistantAction);
  }, [refreshDispatchState]);

  const workspaceHeight = 'calc(100dvh - 12px)';
  const workspaceHeightNoBottomPanels = 'calc(100dvh - 12px)';
  const dividerSize = 10;
  const inlineMapVisible = dispatcherLayout.mapVisible && showInlineMap;
  const actionsPanelVisible = dispatcherLayout.actionsVisible && !isRoutePanelCollapsed && !isCancelledPanelMode;
  const hasLeftColumn = inlineMapVisible || dispatcherLayout.messagingVisible;
  const hasRightColumn = dispatcherLayout.tripsVisible || actionsPanelVisible;
  const hasTopRow = inlineMapVisible || dispatcherLayout.tripsVisible;
  const hasBottomRow = dispatcherLayout.messagingVisible || actionsPanelVisible;
  const hasColumnSplit = hasLeftColumn && hasRightColumn;
  const hasRowSplit = inlineMapVisible && dispatcherLayout.messagingVisible || dispatcherLayout.tripsVisible && actionsPanelVisible;
  const rightOnlySplitMode = !inlineMapVisible && dispatcherLayout.tripsVisible && actionsPanelVisible;
  const effectiveRowSplit = rightOnlySplitMode ? 70 : rowSplit;
  const gridTemplateColumns = hasColumnSplit ? `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)` : hasLeftColumn ? '1fr 0px 0px' : '0px 0px 1fr';
  const gridTemplateRows = hasRowSplit ? `${effectiveRowSplit}% ${dividerSize}px minmax(0, ${100 - effectiveRowSplit}%)` : hasTopRow ? '1fr 0px 0px' : hasBottomRow ? '0px 0px 1fr' : '1fr 0px 0px';
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns,
    gridTemplateRows,
    height: hasRowSplit ? workspaceHeight : workspaceHeightNoBottomPanels,
    minHeight: hasRowSplit ? workspaceHeight : workspaceHeightNoBottomPanels,
    position: 'relative'
  };
  const mapPanelGridRow = dispatcherLayout.messagingVisible ? 1 : '1 / span 3';
  const messagingPanelGridRow = inlineMapVisible ? 3 : '1 / span 3';
  const tripsPanelGridRow = actionsPanelVisible ? 1 : '1 / span 3';
  const actionsPanelGridRow = dispatcherLayout.tripsVisible ? 3 : '1 / span 3';
  const dividerBaseStyle = {
    backgroundColor: '#2d3448',
    borderRadius: 999,
    position: 'relative',
    zIndex: 30,
    transition: 'background-color 0.15s'
  };
  const compactControlButtonStyle = {
    padding: '0.18rem 0.45rem',
    fontSize: '0.68rem',
    lineHeight: 1.05
  };
  const mapPanelPositionStyle = {
    gridColumn: 1,
    gridRow: mapPanelGridRow
  };

  const handleInlineMapToggle = () => {
    setShowInlineMap(current => {
      const nextValue = !current;
      setStatusMessage(nextValue ? 'Mapa pequeno visible.' : 'Mapa pequeno oculto.');
      return nextValue;
    });
  };

  const mapInteractionLocked = mapLocked;

  const renderDispatchMapPanel = () => <Card className="h-100 overflow-hidden" style={dispatcherSurfaceStyles.card}>
      <CardBody className="p-0">
        {showInlineMap ? <div className="position-relative h-100">
          <div className="position-absolute top-0 start-0 p-2" style={{ zIndex: 650 }}>
            <Button variant="dark" size="sm" onClick={() => {
            setStatusMessage('Returning to Route Planner.');
            router.push('/trip-dashboard');
          }}>
              Route Planner
            </Button>
          </div>
          <MapContainer className="dispatcher-map" center={[28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapInteractionLocked} dragging={!mapInteractionLocked} doubleClickZoom={!mapInteractionLocked} touchZoom={!mapInteractionLocked} boxZoom={!mapInteractionLocked} keyboard={!mapInteractionLocked} preferCanvas zoomAnimation={false} markerZoomAnimation={false} style={{ height: '100%', width: '100%', cursor: mapInteractionLocked ? 'not-allowed' : 'grab' }}>
            <DispatcherMapResizer resizeKey={`${dispatcherLayout.mapVisible}-${dispatcherLayout.tripsVisible}-${dispatcherLayout.messagingVisible}-${dispatcherLayout.actionsVisible}-${columnSplit}-${rowSplit}-${selectedTripIds.join(',')}-inline`} />
            <DispatchMapInteractionController enabled={!mapInteractionLocked} />
            <FocusDriverMapController request={mapFocusRequest} />
            <FollowDriverMapController enabled={followSelectedDriver && Boolean(selectedDriver?.hasRealLocation)} position={selectedDriver?.position} />
            <PauseFollowOnMapInteractionController enabled={followSelectedDriver && !mapInteractionLocked} onPause={() => {
            setFollowSelectedDriver(false);
            setStatusMessage('Auto-follow paused. You can pan and zoom the map freely.');
          }} />
            <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} updateWhenZooming={false} />
            <ZoomControl position="bottomleft" />
            {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#2563eb', weight: 4 }} /> : null}
            {selectedDriver?.hasRealLocation && selectedDriverEtaTrip && selectedDriverEta ? <>
                <Polyline positions={selectedDriverRouteGeometry.length > 1 ? selectedDriverRouteGeometry : [selectedDriver.position, getTripTargetPosition(selectedDriverEtaTrip)]} pathOptions={{ color: selectedDriverColor, weight: 4, dashArray: selectedDriverRouteGeometry.length > 1 && selectedDriverRouteMetrics?.isFallback !== true ? undefined : '10 8', opacity: 0.95 }} />
                <Marker position={getTripTargetPosition(selectedDriverEtaTrip)} icon={createRouteStopIcon(selectedDriverEta?.target?.stage === 'dropoff' ? 'DO' : 'PU', selectedDriverEta?.target?.stage === 'dropoff' ? 'dropoff' : 'pickup')}>
                  <Popup>
                    <div className="fw-semibold">{selectedDriverEta?.target?.label || 'Trip target'}</div>
                    <div>{selectedDriverEtaTrip.rider}</div>
                    <div className="small text-muted">{selectedDriverEta?.target?.detail || 'Location pending'}</div>
                  </Popup>
                </Marker>
              </> : null}
            {selectedDriver?.hasRealLocation ? <Circle center={selectedDriver.position} radius={Math.max(100, Number(selectedDriver.gpsAreaRadiusMeters) || 800)} pathOptions={{ color: selectedDriverColor, weight: 2, opacity: 0.35, fillOpacity: 0.05 }} /> : null}
            {selectedDriver?.hasRealLocation ? <Marker position={selectedDriver.position} icon={liveVehicleIconByDriverId.get(String(selectedDriver?.id || '').trim()) || createLiveVehicleIcon({
            heading: selectedDriver.heading,
            isOnline: selectedDriver.live === 'Online',
            vehicleIconScalePercent: selectedDriver?.gpsSettings?.vehicleIconScalePercent
          })}>
                <Tooltip direction="top" offset={[0, -10]} opacity={1} sticky>
                  <div className="fw-semibold">{selectedDriver.name}</div>
                  <div>{getDriverMapLocationLabel(selectedDriver)}</div>
                  <div className="small text-muted">Left to arrive: {selectedDriverEta?.label || driverEtaPreviewById.get(String(selectedDriver?.id || '').trim())?.etaLabel || 'ETA unavailable'}</div>
                  <div className="small text-muted">Patient: {selectedDriverEtaTrip?.rider || driverEtaPreviewById.get(String(selectedDriver?.id || '').trim())?.rider || 'Not assigned'}</div>
                </Tooltip>
              </Marker> : null}
            {nonSelectedDriversWithRealLocation.map(driver => <Circle key={`driver-area-${driver.id}`} center={driver.position} radius={Math.max(100, Number(driver.gpsAreaRadiusMeters) || 800)} pathOptions={{ color: getDriverColor(driver.id || driver.name), weight: 1.5, opacity: 0.25, fillOpacity: 0.03 }} />)}
            {nonSelectedDriversWithRealLocation.map(driver => <Marker key={`driver-live-${driver.id}`} position={driver.position} icon={liveVehicleIconByDriverId.get(String(driver?.id || '').trim()) || createLiveVehicleIcon({
            heading: driver.heading,
            isOnline: driver.live === 'Online',
            vehicleIconScalePercent: driver?.gpsSettings?.vehicleIconScalePercent
          })}>
                <Tooltip direction="top" offset={[0, -10]} opacity={1} sticky>
                  <div className="fw-semibold">{driver.name}</div>
                  <div className="small text-muted">Left to arrive: {driverEtaPreviewById.get(String(driver.id || '').trim())?.etaLabel || 'ETA unavailable'}</div>
                  <div className="small text-muted">Patient: {driverEtaPreviewById.get(String(driver.id || '').trim())?.rider || 'Not assigned'}</div>
                  <div>{getDriverMapLocationLabel(driver)}</div>
                  <div className="small text-muted">{driver.live}</div>
                </Tooltip>
              </Marker>)}
            {!hasSelectedTrips ? mapQuickTrips.flatMap(trip => {
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
              </CircleMarker>) : null}
            {hasSelectedTrips ? routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                <Popup>
                  <div className="fw-semibold">{stop.title}</div>
                  <div>{stop.detail}</div>
                </Popup>
              </Marker>) : null}
            {hasSelectedTrips ? filteredTrips.filter(trip => selectedTripIdSet.has(normalizeTripId(trip.id))).map(trip => <CircleMarker key={trip.id} center={trip.position} radius={10} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9 }} eventHandlers={{
              click: () => toggleTripSelection(trip.id)
            }}>
                <Popup>{`${trip.brokerTripId || trip.id} | ${trip.legLabel || 'Ride'} | ${trip.rider} | ${trip.pickup}`}</Popup>
              </CircleMarker>) : null}
          </MapContainer>
        </div> : <div className="h-100 d-flex flex-column justify-content-center align-items-center text-center p-4" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #162236 100%)', color: '#f8fafc' }}>
            <div className="fw-semibold fs-5">Mapa oculto en dispatcher</div>
            <div className="small mt-2" style={{ color: '#cbd5e1', maxWidth: 360 }}>Activa Show Map para volver a usar el mismo mapa conectado del panel.</div>
            <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center mt-4">
              <Button variant="light" size="sm" onClick={() => setShowInlineMap(true)}>Show Map Here</Button>
            </div>
          </div>}
      </CardBody>
    </Card>;

  return <>
      {hasHiddenDispatcherPanels ? <div style={{
      position: 'fixed',
      top: 54,
      right: 16,
      zIndex: 1200,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(100, 116, 139, 0.35)',
      padding: '4px 8px',
      borderRadius: 8,
      backdropFilter: 'blur(10px)'
    }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>PANELS:</span>
          {hiddenDispatcherPanels.map(panel => <Button key={panel.key} variant="outline-success" size="sm" onClick={() => toggleDispatcherLayoutPanel(panel.key)} style={compactControlButtonStyle}>{panel.label}</Button>)}
        </div> : null}
      <div ref={workspaceRef} style={workspaceGridStyle}>
        <div style={{ minWidth: 0, minHeight: 0, display: inlineMapVisible ? 'block' : 'none', ...mapPanelPositionStyle }}>
          {renderDispatchMapPanel()}
        </div>

        <div onMouseDown={() => hasColumnSplit ? setDragMode('column') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'col-resize',
        gridColumn: 2,
        gridRow: '1 / span 3',
        display: hasColumnSplit ? 'block' : 'none'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 6, backgroundColor: '#6b7280' }} />
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: dispatcherLayout.tripsVisible ? 'block' : 'none', gridColumn: 3, gridRow: tripsPanelGridRow }}>
          <Card className="h-100 overflow-hidden" style={dispatcherSurfaceStyles.card}>
            <CardBody className="p-0 d-flex flex-column h-100">
              {shouldShowToolbarRecovery ? <div className="d-flex justify-content-end align-items-center gap-2 px-2 pt-2 flex-wrap">
                  {!hasAnyVisibleToolbarBlock ? <Badge bg="danger">Toolbar hidden</Badge> : null}
                  <Button variant="dark" size="sm" onClick={handleRestoreDispatcherLayout}>Restore toolbar</Button>
                  <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => setShowColumnPicker(true)}>Show menu</Button>
                </div> : null}
              <div className="d-flex flex-column align-items-stretch px-2 py-2 border-bottom bg-success text-dark gap-2 flex-shrink-0">
                {/* Row 1: Trip filters and selection */}
                <div className="d-flex align-items-center gap-2 flex-nowrap" style={{ minWidth: 'max-content', overflowX: 'auto', overflowY: 'hidden' }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row1');
                clearDraggingToolbarBlockIds();
              }}>
                  {toolbarRow1Order.filter(blockId => isToolbarEditMode || isToolbarBlockEnabled(blockId)).map(blockId => <div
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
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(34, 197, 94, 0.18)' : 'rgba(15, 23, 42, 0.72)'
                  } : undefined}
                  >
                      {renderToolbarBlock(blockId) || isToolbarEditMode ? renderToolbarBlock(blockId) || <Badge bg="secondary">{blockId}</Badge> : null}
                    </div>)}
                </div>
                
                {/* Row 2: Statistics and main action buttons */}
                <div className="d-flex gap-2 small flex-nowrap position-relative" style={{ minWidth: 'max-content', overflowX: 'visible', overflowY: 'visible' }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row2');
                clearDraggingToolbarBlockIds();
              }}>
                  {toolbarRow2Order.filter(blockId => isToolbarEditMode || isToolbarBlockEnabled(blockId)).map(blockId => <div
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
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(34, 197, 94, 0.18)' : 'rgba(15, 23, 42, 0.72)'
                  } : undefined}
                  >
                      {renderToolbarBlock(blockId) || isToolbarEditMode ? renderToolbarBlock(blockId) || <Badge bg="secondary">{blockId}</Badge> : null}
                    </div>)}
                  <div>
                    {renderHelpButton()}
                  </div>
                </div>
                
                {/* Row 3: Leg/Type filters and misc buttons */}
                <div className="d-flex gap-2 small flex-nowrap position-relative" style={{ minWidth: 'max-content', overflowX: 'auto', overflowY: 'hidden' }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row3');
                clearDraggingToolbarBlockIds();
              }}>
                  {toolbarRow3Order.filter(blockId => isToolbarEditMode || isToolbarBlockEnabled(blockId)).map(blockId => <div
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
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(34, 197, 94, 0.18)' : 'rgba(15, 23, 42, 0.72)'
                  } : undefined}
                  >
                      {renderToolbarBlock(blockId) || isToolbarEditMode ? renderToolbarBlock(blockId) || <Badge bg="secondary">{blockId}</Badge> : null}
                    </div>)}
                </div>
              </div>
                  <div className="d-flex justify-content-between align-items-center gap-2 px-2 py-2 border-bottom flex-wrap" style={{
                  backgroundColor: isCancelledPanelMode ? 'rgba(127, 29, 29, 0.08)' : 'rgba(15, 23, 42, 0.05)'
                }}>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {activeDispatcherContextTokens.map(token => <Badge key={token} bg={isCancelledPanelMode ? 'danger' : 'secondary'}>{token}</Badge>)}
                    </div>
                    {hasScopedDispatcherContext ? <Button variant="outline-dark" size="sm" onClick={() => {
                  exitCancelledPanelMode('Vista limpiada y restaurada.');
                  setTripStatusFilter('all');
                  setTripDateFilter(todayDateKey);
                }}>
                        Reset view
                      </Button> : null}
                  </div>
                  {isCancelledPanelMode ? <div className="d-flex justify-content-between align-items-center gap-2 px-2 py-2 border-bottom" style={{ backgroundColor: 'rgba(127, 29, 29, 0.08)' }}>
                      <div className="d-flex align-items-center gap-3 flex-wrap">
                        <div className="d-flex flex-column gap-1">
                          <strong>{isCancelledRoutesMode ? 'Day Trips By Driver' : 'Cancelled Trips'}</strong>
                          <span className="small text-muted">{isCancelledRoutesMode ? `${dayRoutesByDriverTrips.length} trip(s) for ${daySummaryMetrics.dateKey}` : `${cancelledSummaryTrips.length} trip(s) for ${daySummaryMetrics.dateKey}`}</span>
                        </div>
                        <Button variant="outline-dark" size="sm" onClick={() => {
                      const nextMode = isCancelledRoutesMode ? 'names' : 'routes';
                      resetDispatcherSelectionScope();
                      setCancelledDetailMode(nextMode);
                      setStatusMessage(nextMode === 'routes' ? 'Mostrando viajes del dia agrupados por chofer.' : 'Mostrando cancelados ordenados por nombre.');
                    }}>{isCancelledRoutesMode ? 'By Names' : 'By Driver'}</Button>
                      </div>
                      <Button variant="outline-danger" size="sm" onClick={() => {
                    exitCancelledPanelMode();
                  }}>Back to trips</Button>
                    </div> : null}
                  {tripTableTrips.length > 0 ? <div ref={tripTableTopScrollerRef} style={{ width: '100%', marginBottom: 4, padding: '2px 0 4px', borderTop: '1px solid rgba(148, 163, 184, 0.25)', borderBottom: '1px solid rgba(148, 163, 184, 0.25)', backgroundColor: 'rgba(15, 23, 42, 0.35)' }}>
                    <input type="range" min={0} max={Math.max(1, tripTableMaxScrollLeft)} value={Math.min(tripTableScrollLeft, Math.max(1, tripTableMaxScrollLeft))} onChange={event => {
                    const nextLeft = Number(event.target.value) || 0;
                    const bottomNode = tripTableBottomScrollerRef.current;
                    const topNode = tripTableTopScrollerRef.current;
                    if (bottomNode) bottomNode.scrollLeft = nextLeft;
                    if (topNode) topNode.scrollLeft = nextLeft;
                    setTripTableScrollLeft(nextLeft);
                  }} style={{ width: '100%', accentColor: '#22c55e' }} aria-label="Horizontal table scroll" />
                </div> : null}
              <div ref={tripTableBottomScrollerRef} className="table-responsive flex-grow-1" onScroll={() => syncTripTableScroll('bottom')} style={{ minHeight: 0, maxHeight: '100%', position: 'relative', overflowX: groupedFilteredTripRows.length > 0 ? 'auto' : 'hidden', overflowY: 'auto', scrollbarGutter: 'stable both-edges', paddingBottom: 8 }}>
                {mapLocked && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45, borderRadius: '4px', backdropFilter: 'blur(1px)' }}>
                  <div style={{ backgroundColor: 'rgba(15,23,42,0.95)', color: '#fff', padding: '16px 32px', borderRadius: '8px', textAlign: 'center', border: '2px solid #ef4444', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>🔒 PANEL LOCKED</div>
                    <div style={{ fontSize: '12px', color: '#d1d5db' }}>Click "Unlock" to make changes</div>
                  </div>
                </div>}
                <Table ref={tripTableElementRef} size="sm" hover className="align-middle mb-0 small" data-bs-theme={themeMode} style={{ ...dispatcherSurfaceStyles.table, whiteSpace: 'nowrap', minWidth: groupedFilteredTripRows.length > 0 ? 'max-content' : '100%', width: groupedFilteredTripRows.length > 0 ? 'max-content' : '100%', opacity: mapLocked ? 0.6 : 1 }}>
                  <colgroup>
                    {showCancelledDetailControls ? <>
                        <col style={{ width: 48, minWidth: 48, maxWidth: 48 }} />
                        <col style={{ width: 56, minWidth: 56, maxWidth: 56 }} />
                        <col style={{ width: 56, minWidth: 56, maxWidth: 56 }} />
                        <col style={{ width: 56, minWidth: 56, maxWidth: 56 }} />
                        <col style={{ width: 56, minWidth: 56, maxWidth: 56 }} />
                      </> : null}
                    {orderedVisibleTripColumns.map(columnKey => {
                    const metadata = tripColumnMeta[columnKey];
                    const fallbackWidth = columnKey === 'address' || columnKey === 'destination' ? 260 : undefined;
                    const resolvedWidth = columnWidths[columnKey] ?? metadata?.width ?? fallbackWidth;
                    return <col key={`trip-col-${columnKey}`} style={resolvedWidth ? {
                      width: resolvedWidth,
                      minWidth: resolvedWidth,
                      maxWidth: resolvedWidth
                    } : undefined} />;
                  })}
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, ...dispatcherSurfaceStyles.tableHead }}>
                    <tr>
                      {showCancelledDetailControls ? <>
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
                          <th style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>WC</th>
                          <th style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>Alert</th>
                        </> : null}
                      {orderedVisibleTripColumns.map(columnKey => {
                    const metadata = tripColumnMeta[columnKey];
                    if (!metadata) return null;
                    const fallbackWidth = columnKey === 'address' || columnKey === 'destination' ? 260 : undefined;
                    const headerWidth = columnWidths[columnKey] ?? metadata.width ?? fallbackWidth;
                    return <React.Fragment key={`header-${columnKey}`}>
                          {renderTripHeader(columnKey, metadata.label, headerWidth, true)}
                        </React.Fragment>;
                  })}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFilteredTripRows.length > 0 ? groupedFilteredTripRows.map(row => row.type === 'group' ? <tr key={`group-${row.groupKey}`} style={dispatcherSurfaceStyles.groupRow}>
                        <td colSpan={tripTableColumnCount} className="small fw-semibold text-uppercase" style={{ color: '#374151' }}>{row.label}</td>
                      </tr> : <tr key={row.trip.id} onClick={() => {
                        if (mapLocked) return;
                        setSelectedTripIds([row.trip.id]);
                        setSelectedRouteId(normalizeRouteId(row.trip.routeId) || '');
                        setStatusMessage(`Trip ${row.trip.id} seleccionado.`);
                      }} style={{
                        ...(selectedTripIdSet.has(normalizeTripId(row.trip.id)) ? dispatcherSurfaceStyles.rowSelected : isTripAssignedToSelectedDriver(row.trip) ? dispatcherSurfaceStyles.rowAssigned : dispatcherSurfaceStyles.rowDefault),
                        color: isCancelledRoutesMode ? (getEffectiveTripStatus(row.trip) === 'Cancelled' ? '#b91c1c' : getEffectiveTripStatus(row.trip) === 'Completed' ? '#15803d' : undefined) : undefined,
                        cursor: mapLocked ? 'not-allowed' : 'pointer'
                      }}>
                        {showCancelledDetailControls ? <>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedTripIdSet.has(normalizeTripId(row.trip.id))}
                                onClick={event => event.stopPropagation()}
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
                                <Button variant={row.trip.status === 'Assigned' ? 'success' : 'outline-secondary'} size="sm" disabled={mapLocked} onClick={event => {
                              event.stopPropagation();
                              setSelectedTripIds([row.trip.id]);
                              setSelectedDriverId(normalizeDriverId(row.trip.driverId ?? selectedDriverId) || null);
                              setSelectedRouteId(normalizeRouteId(row.trip.routeId) || '');
                              if (row.trip.driverId && !dispatcherLayout.messagingVisible) {
                                persistDispatcherLayout({
                                  ...dispatcherLayout,
                                  messagingVisible: true,
                                  preset: 'custom'
                                });
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
                              {(getTripLegFilterKey(row.trip) !== 'AL' || getEffectiveTripStatus(row.trip) === 'WillCall') ? <Button variant={getEffectiveTripStatus(row.trip) === 'WillCall' ? 'danger' : 'outline-secondary'} size="sm" disabled={mapLocked} onClick={() => handleToggleWillCall(row.trip.id)} title={getEffectiveTripStatus(row.trip) === 'WillCall' ? 'Remove WillCall' : 'Mark as WillCall'} style={{ minWidth: 40, opacity: mapLocked ? 0.5 : 1 }}>
                                  WC
                                </Button> : <span style={{ display: 'inline-block', minWidth: 40 }} />}
                            </td>
                            <td style={{ width: 56, minWidth: 56, whiteSpace: 'nowrap' }}>
                              {row.trip.driverId ? <Button variant="outline-info" size="sm" disabled={mapLocked} onClick={() => {
                                sendTripNotification({
                                  driverId: row.trip.driverId,
                                  driverName: row.trip.driverName,
                                  tripId: row.trip.id,
                                  tripRiderId: row.trip.riderId,
                                  tripRiderName: row.trip.riderName
                                });
                                setStatusMessage(`Notification sent to driver for ${row.trip.riderName || 'trip'}`);
                              }} title="Send notification to driver about this trip" style={{ minWidth: 40, opacity: mapLocked ? 0.5 : 1 }}>
                                  🔔
                                </Button> : <span style={{ display: 'inline-block', minWidth: 40 }} />}
                            </td>
                          </> : null}
                        {orderedVisibleTripColumns.map(columnKey => <React.Fragment key={`${row.trip.id}-${columnKey}`}>{renderTripDataCell(row.trip)(columnKey)}</React.Fragment>)}
                      </tr>) : <tr>
                        <td colSpan={tripTableColumnCount} className="text-center py-4" style={{ color: dispatcherSurfaceStyles.emptyText }}>{isCancelledPanelMode ? 'No cancelled trips for the selected day.' : 'No trips loaded. Waiting for your real trips.'}</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div onMouseDown={() => hasRowSplit && !isCancelledPanelMode ? setDragMode('row') : undefined} style={{
        ...dividerBaseStyle,
        cursor: 'row-resize',
        gridColumn: rightOnlySplitMode ? 3 : '1 / span 3',
        gridRow: 2,
        display: hasRowSplit && !isCancelledPanelMode ? 'block' : 'none'
      }}>
          <div className="position-absolute top-50 start-50 translate-middle rounded-pill" style={{ width: 56, height: 6, backgroundColor: '#6b7280' }} />
        </div>

        <div onMouseDown={() => hasRowSplit && hasColumnSplit && !isCancelledPanelMode ? setDragMode('both') : undefined} style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: '#58607a',
        border: '3px solid #0f1320',
        position: 'absolute',
        left: `calc(${columnSplit}% - ${dividerSize / 2}px)`,
        top: `calc(${effectiveRowSplit}% - ${dividerSize / 2}px)`,
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        zIndex: 50,
        boxShadow: '0 0 0 2px rgba(88, 96, 122, 0.25)',
        display: hasRowSplit && hasColumnSplit && !isCancelledPanelMode ? 'block' : 'none'
      }} />

        <div style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', display: dispatcherLayout.messagingVisible ? 'block' : 'none', gridColumn: 1, gridRow: messagingPanelGridRow }}>
          <Card className="h-100 overflow-hidden" style={dispatcherSurfaceStyles.card}>
            <CardBody className="p-0 h-100">
              <DispatcherMessagingPanel hideThreadList drivers={filteredDrivers} driverSequencePreviewById={driverSequencePreviewById} selectedDriverId={selectedDriverId} setSelectedDriverId={nextDriverId => {
              const normalizedDriverId = String(nextDriverId || '').trim();
              if (rightPanelMode === 'cancelled') {
                setRightPanelMode('default');
                setCancelledDetailMode('names');
              }
              setIsManualDriverScope(false);
              setSelectedDriverId(normalizedDriverId || null);
              setSelectedRouteId(getPreferredRouteIdForDriver(normalizedDriverId) || '');
              setIsRoutePanelCollapsed(false);
            }} onLocateDriver={driverId => {
              const normalizedDriverId = String(driverId || '').trim();
              const driver = drivers.find(item => String(item?.id || '').trim() === normalizedDriverId) || null;
              if (rightPanelMode === 'cancelled') {
                setRightPanelMode('default');
                setCancelledDetailMode('names');
              }
              setIsManualDriverScope(false);
              setSelectedDriverId(normalizedDriverId || null);
              setSelectedRouteId(getPreferredRouteIdForDriver(normalizedDriverId) || '');
              setIsRoutePanelCollapsed(false);
              setFollowSelectedDriver(false);
              if (Array.isArray(driver?.position) && driver.position.length === 2) {
                setMapFocusRequest({
                  key: `${normalizedDriverId}-${Date.now()}`,
                  position: driver.position
                });
              }
              setStatusMessage(dispatcherLayout.mapVisible ? `Driver ${normalizedDriverId} centered on the map.` : `Driver ${normalizedDriverId} selected. Open the map manually when you want to view it.`);
            }} onOpenLayout={() => {
              setShowLayoutModal(true);
            }} openFullChat={() => {
              refreshDrivers();
              router.push('/driver-chat');
              setStatusMessage('Opening full driver messaging panel.');
            }} />
            </CardBody>
          </Card>
        </div>

        <div style={{ minWidth: 0, minHeight: 0, display: actionsPanelVisible ? 'block' : 'none', gridColumn: 3, gridRow: actionsPanelGridRow }}>
          <Card className="h-100 overflow-hidden" style={dispatcherSurfaceStyles.card}>
            <CardBody className="p-0 d-flex flex-column h-100">
              <div className="d-flex justify-content-between align-items-center px-2 py-2 border-bottom gap-2 flex-wrap" style={dispatcherSurfaceStyles.header}>
                <div className="d-flex flex-column gap-1">
                  <strong>{selectedRoute?.name || (selectedDriver ? `Route for ${selectedDriver.name}` : 'Route details')}</strong>
                  <span className="small text-muted">{routeTrips.length} trip(s) shown</span>
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                  {renderRouteToolbarActions()}
                </div>
              </div>
              <div className="table-responsive flex-grow-1" style={{ minHeight: 0 }}>
                <Table size="sm" striped hover className="align-middle mb-0 small" data-bs-theme={themeMode} style={dispatcherSurfaceStyles.table}>
                  <thead style={dispatcherSurfaceStyles.tableHead}>
                    <tr>
                      <th style={{ width: 48 }} />
                      <th>Rider</th>
                      <th>Type</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeTrips.length > 0 ? routeTrips.map(trip => <tr key={trip.id} onClick={() => {
                      if (mapLocked) return;
                      setSelectedTripIds([trip.id]);
                      setStatusMessage(`Trip ${trip.id} seleccionado.`);
                    }} style={{
                      ...(selectedTripIdSet.has(normalizeTripId(trip.id)) ? dispatcherSurfaceStyles.rowAssigned : dispatcherSurfaceStyles.rowDefault),
                      cursor: mapLocked ? 'not-allowed' : 'pointer'
                    }}>
                        <td>
                          <div className="d-flex align-items-center gap-1">
                            <Form.Check checked={selectedTripIdSet.has(normalizeTripId(trip.id))} onClick={event => event.stopPropagation()} onChange={() => handleTripSelectionToggle(trip.id)} disabled={mapLocked} />
                            <Badge bg={getEffectiveTripStatus(trip) === 'Assigned' ? 'primary' : getStatusBadge(getEffectiveTripStatus(trip))}>{getEffectiveTripStatus(trip) === 'Assigned' ? 'A' : getEffectiveTripStatus(trip) === 'WillCall' ? 'WC' : 'U'}</Badge>
                          </div>
                        </td>
                        <td className="fw-semibold">{trip.rider}</td>
                        <td>{getTripTypeLabel(trip)}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.patientPhoneNumber || '-'}</td>
                      </tr>) : <tr>
                        <td colSpan={6} className="text-center py-4" style={{ color: dispatcherSurfaceStyles.emptyText }}>Selecciona una ruta, un chofer o trips para ver el menu de ruta.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </div>

        <Modal show={showColumnPicker} onHide={() => setShowColumnPicker(false)} size="xl" centered scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Trip Columns</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ minHeight: '72vh' }}>
            <div className="row g-4">
              <div className="col-12 col-xl-6">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
                  <div>
                    <div className="fw-semibold">Choose what you want to see in Dispatcher.</div>
                    <div className="small text-muted">Visible now: {orderedVisibleTripColumns.length} of {allTripColumnKeys.length} columns.</div>
                  </div>
                  <Badge bg="secondary">{orderedVisibleTripColumns.length}/{allTripColumnKeys.length}</Badge>
                </div>
                <div className="d-flex gap-2 mb-3 flex-wrap">
                  <Button variant="success" size="sm" onClick={handleShowAllTripColumns}>All columns</Button>
                  <Button variant="outline-dark" size="sm" onClick={handleResetTripColumns}>Default</Button>
                </div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '54vh', overflowY: 'auto', paddingRight: 4 }}>
                  {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={`dispatcher-column-modal-${option.key}`} type="switch" id={`dispatcher-column-modal-${option.key}`} label={option.label} checked={orderedVisibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} disabled={mapLocked} />)}
                </div>
              </div>
              <div className="col-12 col-xl-6">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
                  <div>
                    <div className="fw-semibold">Toolbar buttons</div>
                    <div className="small text-muted">Hide or show each Dispatcher toolbar block. Hidden blocks stay hidden after refresh until you enable them again.</div>
                  </div>
                  <Badge bg={hasAnyVisibleToolbarBlock ? 'secondary' : 'danger'}>{ALL_DISPATCHER_TOOLBAR_BLOCKS.filter(blockId => isToolbarBlockEnabled(blockId)).length}/{ALL_DISPATCHER_TOOLBAR_BLOCKS.length}</Badge>
                </div>
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '54vh', overflowY: 'auto', paddingRight: 4 }}>
                  {ALL_DISPATCHER_TOOLBAR_BLOCKS.map(blockId => <Form.Check key={`dispatcher-toolbar-visibility-${blockId}`} type="switch" id={`dispatcher-toolbar-visibility-${blockId}`} label={DISPATCHER_TOOLBAR_BLOCK_LABELS[blockId] || blockId} checked={isToolbarBlockEnabled(blockId)} onChange={event => handleToggleToolbarBlockVisibility(blockId, event.target.checked)} />)}
                </div>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowColumnPicker(false)}>Close</Button>
          </Modal.Footer>
        </Modal>

        <Modal show={showLayoutModal} onHide={() => setShowLayoutModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>Dispatcher Layout</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3">Hide or restore any block. Your layout is saved to your user preferences.</div>
            <div className="d-flex flex-column gap-2">
              {DISPATCHER_LAYOUT_PRESETS.map(preset => <button
                type="button"
                key={preset.id}
                onClick={() => applyDispatcherLayoutPreset(preset.id)}
                className="btn btn-sm text-start"
                style={{
                  border: preset.id === dispatcherLayout.preset ? '1px solid #0f766e' : '1px solid #d1d5db',
                  backgroundColor: preset.id === dispatcherLayout.preset ? '#123247' : '#0f172a',
                  color: '#e5eefc'
                }}
              >
                <div className="fw-semibold">{preset.label}</div>
                <div className="small text-muted">{preset.description}</div>
              </button>)}
            </div>
            <div className="mt-4 border-top pt-3">
              <div className="small text-uppercase text-muted fw-semibold mb-2">Custom visibility</div>
              <div className="d-flex flex-column gap-2">
                {[{
                key: 'mapVisible',
                label: 'Map'
              }, {
                key: 'tripsVisible',
                label: 'Trips'
              }, {
                key: 'messagingVisible',
                label: 'Messaging'
              }, {
                key: 'actionsVisible',
                label: 'Actions'
              }].map(item => <button
                key={item.key}
                type="button"
                onClick={() => toggleDispatcherLayoutPanel(item.key)}
                className="btn btn-sm d-flex justify-content-between align-items-center"
                style={{
                  border: '1px solid #d1d5db',
                  backgroundColor: dispatcherLayout[item.key] ? '#123524' : '#0f172a',
                  color: '#e5eefc'
                }}
              >
                <span>{item.label}</span>
                <Badge bg={dispatcherLayout[item.key] ? 'success' : 'secondary'}>{dispatcherLayout[item.key] ? 'Visible' : 'Hidden'}</Badge>
              </button>)}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => applyDispatcherLayoutPreset('full')}>Restore full workspace</Button>
            <Button variant="dark" onClick={() => setShowLayoutModal(false)}>Close</Button>
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

export default DispatcherWorkspace;