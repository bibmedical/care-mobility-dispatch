'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useLayoutContext } from '@/context/useLayoutContext';
import { DISPATCH_TRIP_COLUMN_OPTIONS, formatTripDateLabel, getLocalDateKey, getRouteServiceDateKey, getTripLateMinutesDisplay, getTripPunctualityLabel, getTripPunctualityVariant, getTripTimelineDateKey, isTripAssignedToDriver, parseTripClockMinutes, shiftTripDateKey } from '@/helpers/nemt-dispatch-state';
import { buildRoutePrintDocument } from '@/helpers/nemt-print-setup';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { useNemtContext } from '@/context/useNemtContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { getMapTileConfig, hasMapboxConfigured } from '@/utils/map-tiles';
import { openWhatsAppConversation, resolveRouteShareDriver } from '@/utils/whatsapp';
import { divIcon } from 'leaflet';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup } from 'react-leaflet';
import { TileLayer } from 'react-leaflet/TileLayer';
import { ZoomControl } from 'react-leaflet/ZoomControl';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';
import { FixedSizeList as List } from 'react-window';
import { useSession } from 'next-auth/react';

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

const TRIP_COLUMN_MIN_WIDTHS = {
  act: 52,
  notes: 52,
  pickup: 56,
  dropoff: 56,
  miles: 56,
  puZip: 64,
  doZip: 64,
  leg: 52,
  lateMinutes: 68
};

const TRIP_DASHBOARD_LAYOUT_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_LAYOUT__';
const TRIP_DASHBOARD_PANEL_VIEW_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_PANEL_VIEW__';
const TRIP_DASHBOARD_PANEL_ORDER_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_PANEL_ORDER__';
const TRIP_DASHBOARD_DRIVERS_VISIBLE_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_DRIVERS_VISIBLE__';
const TRIP_DASHBOARD_ROUTES_VISIBLE_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_ROUTES_VISIBLE__';
const TRIP_DASHBOARD_TRIPS_VISIBLE_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_TRIPS_VISIBLE__';
const TRIP_DASHBOARD_ROW1_BLOCKS_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_ROW1_BLOCKS__';
const TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS = ['date-controls', 'trip-search', 'driver-assigned', 'action-buttons', 'leg-buttons', 'type-buttons', 'closed-route'];
const TRIP_DASHBOARD_ROW2_BLOCKS_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_ROW2_BLOCKS__';
const TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS = ['show-map', 'peek-panel', 'toolbar-edit', 'columns', 'map-screen', 'layout', 'panels', 'trip-order'];
const TRIP_DASHBOARD_ROW3_BLOCKS_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_ROW3_BLOCKS__';
const TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS = ['driver-select', 'secondary-driver', 'zip-filter', 'route-filter', 'theme-toggle', 'metric-miles', 'metric-duration'];
const TRIP_DASHBOARD_TOOLBAR_VISIBILITY_KEY = '__CARE_MOBILITY_TRIP_DASHBOARD_TOOLBAR_VISIBILITY__';
const MAP_SCREEN_TRIP_DASHBOARD_STATE_KEY = '__CARE_MOBILITY_MAP_SCREEN_TRIP_DASHBOARD_STATE__';
const CLOSED_ROUTE_STATE_KEY = '__CARE_MOBILITY_CLOSED_ROUTE_STATE__';
const TRIP_DASHBOARD_RIGHT_PANEL_COLLAPSED_WIDTH = 56;
const TRIP_DASHBOARD_RIGHT_PANEL_EXPANDED_SPLIT = 50;

const TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS = [...TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS, ...TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS, ...TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS];

const TRIP_DASHBOARD_TOOLBAR_BLOCK_LABELS = {
  'date-controls': 'Date controls',
  'status-filter': 'Status filter',
  'trip-search': 'Search',
  'driver-assigned': 'Assigned',
  'action-buttons': 'Actions',
  'leg-buttons': 'Leg',
  'type-buttons': 'Tipo',
  'closed-route': 'Close route',
  'show-map': 'Show map',
  'peek-panel': 'Panel peek',
  'toolbar-edit': 'Toolbar editor',
  'columns': 'Columns',
  'map-screen': 'Map screen',
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

const looksLikeExcelSerialTime = value => /^\d{4,6}(?:\.\d+)?$/.test(String(value || '').trim());

const getEffectiveTimeText = (scheduledValue, fallbackValue) => {
  const scheduledText = String(scheduledValue || '').trim();
  const fallbackText = String(fallbackValue || '').trim();
  if (looksLikeExcelSerialTime(scheduledText) && fallbackText) return fallbackText;
  return scheduledText || fallbackText;
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
  const searchParams = useSearchParams();
  const isDetachedMapMode = searchParams?.get('detachedMap') === '1';
  const { data: session } = useSession();
  const { changeTheme, themeMode } = useLayoutContext();
  const { data: smsData } = useSmsIntegrationApi();
  const { data: blacklistData } = useBlacklistApi();
  const { data: userPreferences, loading: userPreferencesLoading, saveData: saveUserPreferences } = useUserPreferencesApi();
  const {
    drivers,
    trips,
    routePlans,
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
    cloneTripRecord,
    deleteTripRecord,
    uiPreferences,
    hasLoadedUserUiPreferences,
    setDispatcherVisibleTripColumns,
    setMapProvider
  } = useNemtContext();
  const { showNotification } = useNotificationContext();
  const [routeName, setRouteName] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [tripIdSearch, setTripIdSearch] = useState('');
  const [tripDateFilter, setTripDateFilter] = useState('all');
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
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
  const [driverSort, setDriverSort] = useState({
    key: 'name',
    direction: 'asc'
  });
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
  const [showToolbarTools, setShowToolbarTools] = useState(false);
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
  const [layoutMode, setLayoutMode] = useState(TRIP_DASHBOARD_LAYOUTS.normal);
  const [panelView, setPanelView] = useState(TRIP_DASHBOARD_PANEL_VIEWS.both);
  const [panelOrder, setPanelOrder] = useState(TRIP_DASHBOARD_PANEL_ORDERS.driversFirst);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [tripOrderMode, setTripOrderMode] = useState('original');
  const [tripSort, setTripSort] = useState({
    key: 'pickup',
    direction: 'asc'
  });
  const [columnWidths, setColumnWidths] = useState({});
  const [statusMessage, setStatusMessage] = useState('Trip dashboard ready with map-only view and panel tab.');
  const [closedRouteStateByKey, setClosedRouteStateByKey] = useState({});
  const [columnSplit, setColumnSplit] = useState(58);
  const [rowSplit, setRowSplit] = useState(68);
  const [dragMode, setDragMode] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [routeMetrics, setRouteMetrics] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelTripIds, setCancelTripIds] = useState([]);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');
  const [noteModalTripId, setNoteModalTripId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tripEditDraft, setTripEditDraft] = useState(buildTripEditDraft(null));
  const [inlineTripEditCell, setInlineTripEditCell] = useState(null);
  const [inlineTripEditValue, setInlineTripEditValue] = useState('');
  const [aiPlannerMode, setAiPlannerMode] = useState('local');
  const [aiPlannerAnchorTripId, setAiPlannerAnchorTripId] = useState('');
  const [aiPlannerStartZip, setAiPlannerStartZip] = useState('');
  const [aiPlannerCutoffTime, setAiPlannerCutoffTime] = useState('');
  const [aiPlannerCityFilter, setAiPlannerCityFilter] = useState('');
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
  const [showDriversPanel, setShowDriversPanel] = useState(true);
  const [showRoutesPanel, setShowRoutesPanel] = useState(true);
  const [showTripsPanel, setShowTripsPanel] = useState(true);
  const [driversWindowOpen, setDriversWindowOpen] = useState(false);
  const [routesWindowOpen, setRoutesWindowOpen] = useState(false);
  const [tripsWindowOpen, setTripsWindowOpen] = useState(false);
  const workspaceRef = useRef(null);
  const tripTableTopScrollerRef = useRef(null);
  const tripTableBottomScrollerRef = useRef(null);
  const tripTableElementRef = useRef(null);
  const tripTableScrollSyncRef = useRef(false);
  const lastMapScreenStatePayloadRef = useRef('');
  const detachedMapSnapshotRef = useRef('');
  const layoutHydratedRef = useRef(false);
  const panelViewHydratedRef = useRef(false);
  const panelOrderHydratedRef = useRef(false);
  const lastSavedPanelViewRef = useRef('');
  const lastSavedPanelOrderRef = useRef('');
  const [tripTableScrollWidth, setTripTableScrollWidth] = useState(0);
  const deferredRouteSearch = useDeferredValue(routeSearch);
  const deferredTripIdSearch = useDeferredValue(tripIdSearch);
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
  const offlineDriverBadgeStyle = isDarkTheme
    ? {
      backgroundColor: '#475569',
      color: '#f8fafc',
      border: '1px solid #64748b'
    }
    : undefined;
  const visibleTripColumns = uiPreferences?.dispatcherVisibleTripColumns ?? [];
  const tripColumnMeta = useMemo(() => Object.fromEntries(DISPATCH_TRIP_COLUMN_OPTIONS.map(option => [option.key, {
    label: option.label,
    width: option.key === 'address' || option.key === 'destination' ? 260 : option.key === 'phone' ? 150 : option.key === 'rider' ? 180 : undefined,
    sortable: option.key !== 'notes'
  }])), []);
  const orderedVisibleTripColumns = useMemo(() => visibleTripColumns.filter(columnKey => Boolean(tripColumnMeta[columnKey])), [tripColumnMeta, visibleTripColumns]);
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

  useEffect(() => {
    if (!todayDateKey) return;
    setTripDateFilter(todayDateKey);
    setSelectedTripIds([]);
    setSelectedDriverId(null);
    setSelectedRouteId(null);
  }, [todayDateKey]);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(CLOSED_ROUTE_STATE_KEY);
      if (!rawValue) return;
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      setClosedRouteStateByKey(parsed);
    } catch {
      // Ignore corrupted closed-route local state.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLOSED_ROUTE_STATE_KEY, JSON.stringify(closedRouteStateByKey));
    } catch {
      // Ignore localStorage write errors.
    }
  }, [closedRouteStateByKey]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    const loadToolbarOrder = (storageKey, defaultOrder) => {
      const storedValue = window.localStorage.getItem(storageKey);
      if (!storedValue) return defaultOrder;
      const parsed = JSON.parse(storedValue);
      if (!Array.isArray(parsed)) return defaultOrder;
      const normalized = parsed.filter(blockId => defaultOrder.includes(blockId));
      const missing = defaultOrder.filter(blockId => !normalized.includes(blockId));
      const nextOrder = [...normalized, ...missing];
      return nextOrder.length > 0 ? nextOrder : defaultOrder;
    };

    try {
      setToolbarRow1Order(userPreferences?.tripDashboard?.row1?.length ? userPreferences.tripDashboard.row1 : loadToolbarOrder(TRIP_DASHBOARD_ROW1_BLOCKS_KEY, TRIP_DASHBOARD_ROW1_DEFAULT_BLOCKS));
      setToolbarRow2Order(userPreferences?.tripDashboard?.row2?.length ? userPreferences.tripDashboard.row2 : loadToolbarOrder(TRIP_DASHBOARD_ROW2_BLOCKS_KEY, TRIP_DASHBOARD_ROW2_DEFAULT_BLOCKS));
      setToolbarRow3Order(userPreferences?.tripDashboard?.row3?.length ? userPreferences.tripDashboard.row3 : loadToolbarOrder(TRIP_DASHBOARD_ROW3_BLOCKS_KEY, TRIP_DASHBOARD_ROW3_DEFAULT_BLOCKS));
    } catch {
      // Ignore corrupted local toolbar layout preferences.
    }
  }, [userPreferences?.tripDashboard?.row1, userPreferences?.tripDashboard?.row2, userPreferences?.tripDashboard?.row3, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading) return;
    try {
      const parsed = userPreferences?.tripDashboard?.toolbarVisibility && Object.keys(userPreferences.tripDashboard.toolbarVisibility).length > 0 ? userPreferences.tripDashboard.toolbarVisibility : JSON.parse(window.localStorage.getItem(TRIP_DASHBOARD_TOOLBAR_VISIBILITY_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      const normalized = Object.fromEntries(TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => [blockId, parsed[blockId] !== false]));
      setToolbarBlockVisibility(normalized);
    } catch {
      // Ignore corrupted toolbar visibility preferences.
    }
  }, [userPreferences?.tripDashboard?.toolbarVisibility, userPreferencesLoading]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRIP_DASHBOARD_TOOLBAR_VISIBILITY_KEY, JSON.stringify(toolbarBlockVisibility));
      if (!userPreferencesLoading) {
        void saveUserPreferences({
          ...userPreferences,
          tripDashboard: {
            ...userPreferences?.tripDashboard,
            toolbarVisibility: toolbarBlockVisibility
          }
        });
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
      window.localStorage.setItem(TRIP_DASHBOARD_ROW1_BLOCKS_KEY, JSON.stringify(toolbarRow1Order));
      window.localStorage.setItem(TRIP_DASHBOARD_ROW2_BLOCKS_KEY, JSON.stringify(toolbarRow2Order));
      window.localStorage.setItem(TRIP_DASHBOARD_ROW3_BLOCKS_KEY, JSON.stringify(toolbarRow3Order));
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          row1: toolbarRow1Order,
          row2: toolbarRow2Order,
          row3: toolbarRow3Order
        }
      });
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
      window.localStorage.setItem(TRIP_DASHBOARD_ROW1_BLOCKS_KEY, JSON.stringify(defaultRow1Order));
      window.localStorage.setItem(TRIP_DASHBOARD_ROW2_BLOCKS_KEY, JSON.stringify(defaultRow2Order));
      window.localStorage.setItem(TRIP_DASHBOARD_ROW3_BLOCKS_KEY, JSON.stringify(defaultRow3Order));
      window.localStorage.setItem(TRIP_DASHBOARD_TOOLBAR_VISIBILITY_KEY, JSON.stringify(defaultVisibility));
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          row1: defaultRow1Order,
          row2: defaultRow2Order,
          row3: defaultRow3Order,
          toolbarVisibility: defaultVisibility
        }
      });
      setStatusMessage('Toolbar layout reset.');
    } catch {
      setStatusMessage('Could not reset toolbar layout.');
    }
  };

  const renderToolbarRow1Block = blockId => {
    switch (blockId) {
      case 'date-controls':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleShiftTripDate(-1)} title="Previous day">Previous</Button>
            <Form.Control size="sm" type="date" value={tripDateFilter === 'all' ? '' : tripDateFilter} onChange={event => setTripDateFilter(event.target.value || 'all')} style={{ width: 150 }} />
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => handleShiftTripDate(1)} title="Next day">Next</Button>
            <Button variant={tripDateFilter === todayDateKey ? 'dark' : 'outline-dark'} size="sm" style={tripDateFilter === todayDateKey ? undefined : greenToolbarButtonStyle} onClick={() => setTripDateFilter(todayDateKey)}>Today</Button>
          </div>;
      case 'status-filter':
        return null;
      case 'trip-search':
        return <div className="d-flex align-items-center gap-2 flex-nowrap">
            <Form.Control size="sm" value={tripIdSearch} onChange={event => setTripIdSearch(event.target.value)} placeholder="Search trip, patient, phone, address..." style={{ width: 130 }} />
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
            setTopButtonsRowCollapsed(current => !current);
            setShowToolbarTools(false);
            setShowColumnPicker(false);
          }}>
              {topButtonsRowCollapsed ? 'Show top buttons' : 'Hide top buttons'}
            </Button>
          </div>;
      case 'driver-assigned':
        return selectedDriver ? <Badge bg={themeMode === 'dark' ? 'secondary' : 'light'} text={themeMode === 'dark' ? 'light' : 'dark'}>{selectedDriverAssignedTripCount} assigned</Badge> : null;
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
        return !showMapPane ? <Button variant="warning" size="sm" onClick={() => {
          setShowMapPane(true);
          setStatusMessage('Map visible again in Trip Dashboard.');
        }} style={{
          color: '#5b3b00',
          borderColor: 'rgba(161, 98, 7, 0.48)',
          background: 'linear-gradient(180deg, #fde68a 0%, #fbbf24 100%)',
          fontWeight: 800
        }}>
            Show map
          </Button> : null;
      case 'peek-panel':
        return isStandardLayout && showMapPane ? <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
          setRightPanelCollapsed(true);
          setColumnSplit(94);
          setStatusMessage('Right panel minimized into tab mode.');
        }}>
            Peek panel
          </Button> : null;
      case 'toolbar-edit':
        return null;
      case 'columns':
        return <>
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
            setShowColumnPicker(current => !current);
            setShowToolbarTools(false);
          }}>Columns</Button>
            {showColumnPicker ? <Card className="shadow position-absolute start-0 mt-5" style={{ zIndex: 80, width: 240 }}>
                <CardBody className="p-3 text-dark">
                  <div className="fw-semibold mb-2">Choose what to show</div>
                  <div className="small text-muted mb-3">These changes are saved for next time.</div>
                  <div className="d-flex flex-column gap-2">
                    {DISPATCH_TRIP_COLUMN_OPTIONS.map(option => <Form.Check key={option.key} type="switch" id={`dashboard-column-${option.key}`} label={option.label} checked={visibleTripColumns.includes(option.key)} onChange={() => handleToggleTripColumn(option.key)} />)}
                  </div>
                </CardBody>
              </Card> : null}
          </>;
      case 'map-screen':
        return <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={showInlineMap ? handleOpenMapWindow : () => {
          setShowInlineMap(true);
          setShowMapPane(true);
          if (layoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight) {
            setLayoutMode(TRIP_DASHBOARD_LAYOUTS.normal);
            setShowBottomPanels(true);
            setRightPanelCollapsed(false);
            setColumnSplit(58);
          }
        }}>{showInlineMap ? 'Map screen' : 'Show map here'}</Button>;
      case 'layout':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <span className="fw-semibold small">Layout</span>
            <Button variant={layoutMode === TRIP_DASHBOARD_LAYOUTS.normal ? 'dark' : 'outline-dark'} size="sm" style={layoutMode === TRIP_DASHBOARD_LAYOUTS.normal ? undefined : greenToolbarButtonStyle} onClick={() => applyLayoutMode(TRIP_DASHBOARD_LAYOUTS.normal)}>Normal</Button>
            <Button variant={layoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight ? 'dark' : 'outline-dark'} size="sm" style={layoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight ? undefined : greenToolbarButtonStyle} onClick={() => applyLayoutMode(TRIP_DASHBOARD_LAYOUTS.focusRight)} disabled={!showInlineMap}>Focus right</Button>
            <Button variant={layoutMode === TRIP_DASHBOARD_LAYOUTS.stacked ? 'dark' : 'outline-dark'} size="sm" style={layoutMode === TRIP_DASHBOARD_LAYOUTS.stacked ? undefined : greenToolbarButtonStyle} onClick={() => applyLayoutMode(TRIP_DASHBOARD_LAYOUTS.stacked)}>Stacked</Button>
            <Button variant="outline-danger" size="sm" onClick={() => {
            setShowTripsPanel(false);
            if (!showMapPane) {
              setShowMapPane(true);
            }
            setStatusMessage('Trips panel hidden.');
          }}>✕ Hide Trips</Button>
            {layoutMode !== TRIP_DASHBOARD_LAYOUTS.normal ? <Button variant="warning" size="sm" onClick={() => applyLayoutMode(TRIP_DASHBOARD_LAYOUTS.normal)}>Restore</Button> : null}
          </div>;
      case 'panels':
        return null;
      case 'trip-order':
        return null;
      default:
        return null;
    }
  };

  const renderToolbarRow3Block = blockId => {
    switch (blockId) {
      case 'driver-select':
        return <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => handleDriverSelectionChange(event.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 220 }}>
            <option value="">Select driver</option>
            {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </Form.Select>;
      case 'secondary-driver':
        return <Form.Select size="sm" value={selectedSecondaryDriverId} onChange={event => setSelectedSecondaryDriverId(event.target.value)} style={{ ...compactToolbarSelectBaseStyle, width: 220 }}>
            <option value="">Secondary driver</option>
            {drivers.map(driver => <option key={`secondary-${driver.id}`} value={driver.id}>{driver.name}</option>)}
          </Form.Select>;
      case 'zip-filter':
        return <div className="d-flex align-items-center gap-1 flex-nowrap">
            <span className="fw-semibold small">ZIP</span>
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
            <span className="fw-semibold small">Route</span>
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
        return <Button
          variant="outline-dark"
          size="sm"
          style={greenToolbarButtonStyle}
          onClick={() => changeTheme(themeMode === 'dark' ? 'light' : 'dark')}
          title={themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
          aria-label={themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
            <i className={themeMode === 'dark' ? 'iconoir-sun-light' : 'iconoir-half-moon'} />
          </Button>;
      case 'metric-miles':
        return routeMetrics?.distanceMiles != null ? <Badge bg={themeMode === 'dark' ? 'secondary' : 'light'} text={themeMode === 'dark' ? 'light' : 'dark'}>Miles {routeMetrics.distanceMiles.toFixed(1)}</Badge> : null;
      case 'metric-duration':
        return routeMetrics?.durationMinutes != null ? <Badge bg={themeMode === 'dark' ? 'secondary' : 'light'} text={themeMode === 'dark' ? 'light' : 'dark'}>{formatDriveMinutes(routeMetrics.durationMinutes)}</Badge> : null;
      default:
        return null;
    }
  };
  const cityOptionTrips = useMemo(() => trips.filter(trip => {
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
    const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
    if (tripStatusFilter === 'all') return !isNonOperationalTrip;
    if (tripStatusFilter === 'unassigned') return !trip.driverId && !trip.secondaryDriverId && !isNonOperationalTrip;
    if (tripStatusFilter === 'willcall') return normalizedStatus === 'willcall';
    if (tripStatusFilter === 'block') return confirmationStatus === 'Opted Out';
    if (tripStatusFilter === 'confirm') {
      const confirmCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
      return confirmationStatus === 'Confirmed' || (['C', 'S', 'W'].includes(confirmCode) && (confirmationStatus === 'Not Sent' || confirmationStatus === 'Pending'));
    }
    if (tripStatusFilter === 'unconfirm') return confirmationStatus === 'Not Sent' || String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase() === 'U';
    return normalizedStatus === tripStatusFilter;
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
  }), [deferredTripIdSearch, dropoffZipFilter, pickupZipFilter, riderProfiles, serviceAnimalOnly, todayDateKey, tripDateFilter, tripLegFilter, tripStatusFilter, tripTypeFilter, routePlans, tripBlockingMap, trips, zipFilter]);
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
  const aiPlannerBaseScopeTrips = useMemo(() => {
    const selectedVisibleTrips = sortTripsByPickupTime(filteredTrips.filter(trip => selectedTripIdSet.has(normalizeTripId(trip.id))));
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
  const filteredDrivers = useMemo(() => {
    const term = driverSearch.trim().toLowerCase();
    const filtered = !term ? drivers : drivers.filter(driver => [driver?.name, driver?.code, driver?.vehicle, driver?.attendant, driver?.live].some(value => String(value || '').toLowerCase().includes(term)));

    const getDriverSortValue = driver => {
      switch (driverSort.key) {
        case 'vehicle':
          return driver?.vehicle;
        case 'attendant':
          return driver?.attendant;
        case 'info':
          return driver?.info;
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
  }, [driverSearch, drivers, driverSort.direction, driverSort.key]);
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
    const baseTrips = selectedDriver ? selectedDriverWorkingTrips : selectedRoute ? trips.filter(trip => selectedRouteTripIdSet.has(String(trip?.id || '').trim())) : trips.filter(trip => selectedTripIdSet.has(String(trip?.id || '').trim()));
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

  useEffect(() => {
    if (isDetachedMapMode) return;
    const payload = {
      tripDateFilter,
      selectedTripIds,
      selectedDriverId,
      selectedRouteId,
      activeDateTripIds: activeDateTripIdSet ? Array.from(activeDateTripIdSet) : [],
      routeTripIds: routeTrips.map(trip => String(trip?.id || '').trim()).filter(Boolean).sort((left, right) => left.localeCompare(right))
    };
    const payloadText = JSON.stringify(payload);
    if (lastMapScreenStatePayloadRef.current === payloadText) return;
    lastMapScreenStatePayloadRef.current = payloadText;
    window.localStorage.setItem(MAP_SCREEN_TRIP_DASHBOARD_STATE_KEY, payloadText);
  }, [activeDateTripIdSet, isDetachedMapMode, routeTrips, selectedDriverId, selectedRouteId, selectedTripIds, tripDateFilter]);

  useEffect(() => {
    if (!isDetachedMapMode || typeof window === 'undefined') return;

    const applySnapshot = () => {
      try {
        const raw = window.localStorage.getItem(MAP_SCREEN_TRIP_DASHBOARD_STATE_KEY);
        if (!raw) return;
        if (raw === detachedMapSnapshotRef.current) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        detachedMapSnapshotRef.current = raw;

        const nextTripDateFilter = String(parsed.tripDateFilter || 'all');
        const nextSelectedTripIds = Array.isArray(parsed.selectedTripIds)
          ? parsed.selectedTripIds.map(value => String(value || '').trim()).filter(Boolean)
          : [];
        const nextSelectedDriverId = String(parsed.selectedDriverId || '').trim() || null;
        const nextSelectedRouteId = String(parsed.selectedRouteId || '').trim() || null;

        setTripDateFilter(nextTripDateFilter);
        setSelectedTripIds(nextSelectedTripIds);
        setSelectedDriverId(nextSelectedDriverId);
        setSelectedRouteId(nextSelectedRouteId);
        setShowInlineMap(true);
      } catch {}
    };

    applySnapshot();

    const handleStorage = event => {
      if (event?.key && event.key !== MAP_SCREEN_TRIP_DASHBOARD_STATE_KEY) return;
      applySnapshot();
    };

    window.addEventListener('storage', handleStorage);
    const pollId = window.setInterval(applySnapshot, 2500);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(pollId);
    };
  }, [isDetachedMapMode]);

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
  }, [activeDateTripIdSet, routeTrips, selectedDriver, selectedRoute, selectedTripIds, selectedDriverCandidateTripIds, showRoute, trips]);

  const fallbackRoutePath = useMemo(() => routeStops.map(stop => stop.position), [routeStops]);
  const routePath = routeGeometry.length > 1 ? routeGeometry : fallbackRoutePath;

  const liveDrivers = drivers.filter(driver => driver.live === 'Online').length;
  const driversWithRealLocation = useMemo(() => drivers.filter(driver => driver.hasRealLocation), [drivers]);
  const liveVehicleIconByDriverId = useMemo(() => {
    const iconByDriverId = new Map();
    for (const driver of driversWithRealLocation) {
      iconByDriverId.set(String(driver?.id || '').trim(), createLiveVehicleIcon({
        heading: driver.heading,
        isOnline: driver.live === 'Online',
        vehicleIconScalePercent: driver?.gpsSettings?.vehicleIconScalePercent
      }));
    }
    return iconByDriverId;
  }, [driversWithRealLocation]);
  const activeInfoTrip = selectedTripIds.length > 0 ? trips.find(trip => selectedTripIdSet.has(normalizeTripId(trip.id))) ?? null : selectedRoute ? routeTrips[0] ?? null : selectedDriver ? trips.find(trip => isTripAssignedToDriver(trip, selectedDriver.id)) ?? null : routeTrips[0] ?? filteredTrips[0] ?? null;
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(id => selectedTripIdSet.has(id));
  const selectedDriverAssignedTripCount = useMemo(() => selectedDriverId ? trips.filter(trip => trip.driverId === selectedDriverId || trip.secondaryDriverId === selectedDriverId).length : 0, [selectedDriverId, trips]);
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
    if (selectedDriver) return `${selectedDriver.name} Route`;
    if (routeTrips.length > 0) return 'Current route';
    return 'Unnamed route';
  }, [routeName, routeTrips.length, selectedDriver, selectedRoute]);
  const noteModalTrip = useMemo(() => noteModalTripId ? trips.find(trip => trip.id === noteModalTripId) ?? null : null, [noteModalTripId, trips]);

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
    setSelectedTripIds([clonedTripId]);
    setSelectedDriverId(null);
    setSelectedRouteId(null);
    setStatusMessage(`Trip ${getDisplayTripId(trip)} cloned as ${clonedTripId}.`);
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

  const renderInlineEditableTripCell = ({ trip, columnKey, displayValue, cellStyle, displayStyle, inputType = 'text', placeholder = '' }) => {
    const isEditing = isInlineTripCellEditing(trip.id, columnKey);
    return <td
      style={{
        ...cellStyle,
        cursor: 'text'
      }}
      onDoubleClick={() => handleStartInlineTripEdit(trip, columnKey)}
      title="Double-click to edit"
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

  const tripTableColumnCount = orderedVisibleTripColumns.length + 3;

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
    assignTripsToDriver(selectedDriverId, [tripId]);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
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
    fontSize: '0.76rem'
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

  const renderDriverHeader = (columnKey, label) => <th className="py-1" style={{ backgroundColor: '#198754', color: '#fff', whiteSpace: 'nowrap' }}>
      <button type="button" onClick={() => handleDriverSortChange(columnKey)} className="btn btn-link text-decoration-none p-0 d-inline-flex align-items-center gap-1" style={{ color: '#fff', fontWeight: 700 }}>
        <span>{label}</span>
        <span className="small">{driverSort.key === columnKey ? driverSort.direction === 'asc' ? '↑' : '↓' : '↕'}</span>
      </button>
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
    setStatusMessage(`Viewing ${driver.name}: ${assignedCount} assigned and ${openCount} pending.`);
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

    assignTripsToDriver(driverId, targetTripIds);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
    setStatusMessage('Trips assigned to selected driver.');
  };

  const handleAssignSecondary = driverId => {
    const targetTripIds = [...selectedTripIds];
    if (!driverId || targetTripIds.length === 0) {
      setStatusMessage('Select a secondary driver and at least one trip.');
      return;
    }

    assignTripsToSecondaryDriver(driverId, targetTripIds);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
    setStatusMessage('Trips updated with secondary driver.');
  };

  const handleRoutePanelReassign = () => {
    const targetTripIds = [...selectedRoutePanelTripIds];
    if (!selectedDriverId || targetTripIds.length === 0) {
      setStatusMessage('Select a driver and at least one trip from the route table.');
      return;
    }

    assignTripsToDriver(selectedDriverId, targetTripIds);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
    setStatusMessage(`Reassigned ${targetTripIds.length} trip(s) to selected driver.`);
  };

  const handleRoutePanelAssignSecondary = () => {
    const targetTripIds = [...selectedRoutePanelTripIds];
    if (!selectedSecondaryDriverId || targetTripIds.length === 0) {
      setStatusMessage('Select a secondary driver and at least one trip from the route table.');
      return;
    }

    assignTripsToSecondaryDriver(selectedSecondaryDriverId, targetTripIds);
    if (tripStatusFilter === 'unassigned') setTripStatusFilter('all');
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

  const handlePrintRoute = () => {
    if (routeTrips.length === 0) {
      setStatusMessage('No route available to print yet.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) {
      setStatusMessage('Could not open print window.');
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
    if (userPreferencesLoading || layoutHydratedRef.current) return;

    const storedLayout = window.localStorage.getItem(TRIP_DASHBOARD_LAYOUT_KEY) || userPreferences?.tripDashboard?.layoutMode;
    if (!storedLayout || !Object.values(TRIP_DASHBOARD_LAYOUTS).includes(storedLayout)) {
      setLayoutMode(TRIP_DASHBOARD_LAYOUTS.normal);
      setShowMapPane(true);
      setShowBottomPanels(false);
      setRightPanelCollapsed(true);
      setColumnSplit(94);
      layoutHydratedRef.current = true;
      return;
    }

    setLayoutMode(storedLayout);
    if (storedLayout !== TRIP_DASHBOARD_LAYOUTS.normal) {
      setShowMapPane(false);
      setShowBottomPanels(true);
      setRightPanelCollapsed(false);
      layoutHydratedRef.current = true;
      return;
    }

    setShowMapPane(true);
    setShowBottomPanels(false);
    setRightPanelCollapsed(true);
    setColumnSplit(94);
    layoutHydratedRef.current = true;
  }, [userPreferences?.tripDashboard?.layoutMode, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading || panelViewHydratedRef.current) return;
    const storedPanelView = window.localStorage.getItem(TRIP_DASHBOARD_PANEL_VIEW_KEY) || userPreferences?.tripDashboard?.panelView;
    if (storedPanelView && Object.values(TRIP_DASHBOARD_PANEL_VIEWS).includes(storedPanelView)) {
      setPanelView(storedPanelView);
    } else {
      setPanelView(TRIP_DASHBOARD_PANEL_VIEWS.both);
    }
    panelViewHydratedRef.current = true;
  }, [userPreferences?.tripDashboard?.panelView, userPreferencesLoading]);

  useEffect(() => {
    if (userPreferencesLoading || panelOrderHydratedRef.current) return;
    const storedPanelOrder = window.localStorage.getItem(TRIP_DASHBOARD_PANEL_ORDER_KEY) || userPreferences?.tripDashboard?.panelOrder;
    if (storedPanelOrder && Object.values(TRIP_DASHBOARD_PANEL_ORDERS).includes(storedPanelOrder)) {
      setPanelOrder(storedPanelOrder);
    }
    panelOrderHydratedRef.current = true;
  }, [userPreferences?.tripDashboard?.panelOrder, userPreferencesLoading]);

  useEffect(() => {
    window.localStorage.setItem(TRIP_DASHBOARD_LAYOUT_KEY, layoutMode);
    if (!userPreferencesLoading) {
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          layoutMode
        }
      });
    }
  }, [layoutMode, saveUserPreferences, userPreferences, userPreferencesLoading]);

  useEffect(() => {
    window.localStorage.setItem(TRIP_DASHBOARD_PANEL_VIEW_KEY, panelView);
    if (lastSavedPanelViewRef.current === panelView) return;
    lastSavedPanelViewRef.current = panelView;
    if (!userPreferencesLoading) {
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          panelView
        }
      });
    }
  }, [panelView, saveUserPreferences, userPreferences, userPreferencesLoading]);

  useEffect(() => {
    window.localStorage.setItem(TRIP_DASHBOARD_PANEL_ORDER_KEY, panelOrder);
    if (lastSavedPanelOrderRef.current === panelOrder) return;
    lastSavedPanelOrderRef.current = panelOrder;
    if (!userPreferencesLoading) {
      void saveUserPreferences({
        ...userPreferences,
        tripDashboard: {
          ...userPreferences?.tripDashboard,
          panelOrder
        }
      });
    }
  }, [panelOrder, saveUserPreferences, userPreferences, userPreferencesLoading]);

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

  const workspaceHeight = expanded ? 1120 : 1000;
  const dividerSize = 10;
  const isFocusRightLayout = layoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight && showBottomPanels;
  const isStackedLayout = layoutMode === TRIP_DASHBOARD_LAYOUTS.stacked && showBottomPanels;
  const isStandardLayout = !isFocusRightLayout && !isStackedLayout;
  const isPeekPanelMode = isStandardLayout && showMapPane && rightPanelCollapsed && !showBottomPanels;
  const hasVisibleDockPanels = showDriversPanel || showRoutesPanel;
  const focusRightColumnSplit = clamp(columnSplit, 28, 40);
  const collapsedPanelWidth = TRIP_DASHBOARD_RIGHT_PANEL_COLLAPSED_WIDTH;
  const workspaceGridStyle = {
    display: 'grid',
    gridTemplateColumns: isFocusRightLayout ? hasVisibleDockPanels ? `${focusRightColumnSplit}% ${dividerSize}px minmax(0, ${100 - focusRightColumnSplit}%)` : '0px 0px minmax(0, 1fr)' : isStackedLayout ? 'minmax(0, 1fr)' : showMapPane ? isPeekPanelMode ? `minmax(0, calc(100% - ${dividerSize}px - ${collapsedPanelWidth}px)) ${dividerSize}px ${collapsedPanelWidth}px` : `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)` : `0px 0px minmax(0, 1fr)`,
    gridTemplateRows: isFocusRightLayout ? '1fr' : isStackedLayout ? `${rowSplit}% ${dividerSize}px minmax(0, ${100 - rowSplit}%)` : showBottomPanels ? `${rowSplit}% ${dividerSize}px minmax(0, ${100 - rowSplit}%)` : '1fr 0px 0px',
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
    const mapUrl = `/trip-dashboard?detachedMap=1`;
    const payload = {
      tripDateFilter,
      selectedTripIds,
      selectedDriverId,
      selectedRouteId,
      activeDateTripIds: activeDateTripIdSet ? Array.from(activeDateTripIdSet) : [],
      routeTripIds: routeTrips.map(trip => String(trip?.id || '').trim()).filter(Boolean).sort((left, right) => left.localeCompare(right))
    };
    window.localStorage.setItem('__CARE_MOBILITY_MAP_SCREEN_SOURCE__', 'dashboard');
    window.localStorage.setItem(MAP_SCREEN_TRIP_DASHBOARD_STATE_KEY, JSON.stringify(payload));
    const popup = window.open(mapUrl, 'care-mobility-map', 'popup=yes,width=1600,height=900,resizable=yes,scrollbars=no');
    if (popup) {
      popup.focus();
      setShowInlineMap(false);
      setLayoutMode(TRIP_DASHBOARD_LAYOUTS.focusRight);
      setShowMapPane(false);
      setShowBottomPanels(true);
      setRightPanelCollapsed(false);
      setColumnSplit(current => clamp(current, 28, 40));
      setStatusMessage('Map opened on another screen. Focus Right activated.');
      return;
    }
    window.open(mapUrl, '_blank', 'noopener,noreferrer');
    setShowInlineMap(false);
    setLayoutMode(TRIP_DASHBOARD_LAYOUTS.focusRight);
    setShowMapPane(false);
    setShowBottomPanels(true);
    setRightPanelCollapsed(false);
    setColumnSplit(current => clamp(current, 28, 40));
    setStatusMessage('Map opened in another tab. Focus Right activated.');
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
    if (nextLayoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight && !showInlineMap) {
      setStatusMessage('Focus Right requires inline map. Use Show map here first.');
      return;
    }

    setLayoutMode(nextLayoutMode);

    if (nextLayoutMode === TRIP_DASHBOARD_LAYOUTS.normal) {
      setShowMapPane(true);
      setShowBottomPanels(false);
      setRightPanelCollapsed(true);
      setColumnSplit(94);
      setRowSplit(68);
      setStatusMessage('Normal layout restored with map-only view and panel tab.');
      return;
    }

    setShowMapPane(false);
    setShowBottomPanels(true);
    setRightPanelCollapsed(false);

    if (nextLayoutMode === TRIP_DASHBOARD_LAYOUTS.focusRight) {
      setColumnSplit(current => clamp(current, 28, 40));
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
    switch (columnKey) {
      case 'trip':
        return <td key={`${trip.id}-trip`} style={{ whiteSpace: 'nowrap' }}>
            <div className="fw-semibold">{getDisplayTripId(trip)}</div>
            {!orderedVisibleTripColumns.includes('rider') && trip.rider ? <div className="small text-muted mt-1" style={{ lineHeight: 1.1, whiteSpace: 'normal', maxWidth: 180 }}>{trip.rider}</div> : null}
            {getLegBadge(trip) ? <Badge bg={getLegBadge(trip).variant} className="mt-1 me-1">{getLegBadge(trip).label}</Badge> : null}
            {trip.hasServiceAnimal ? <Badge bg="warning" text="dark" className="mt-1 me-1">🐕 Service Animal</Badge> : null}
          </td>;
      case 'vehicle':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'vehicle',
          displayValue: trip.vehicleType || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: 'Ambulatory'
        });
      case 'status':
        return <td key={`${trip.id}-status`} style={{ whiteSpace: 'nowrap' }}>
            <Badge bg={isTripAssignedToSelectedDriver(trip) ? 'success' : getStatusBadge(getEffectiveTripStatus(trip))}>{isTripAssignedToSelectedDriver(trip) ? 'Assigned Here' : getEffectiveTripStatus(trip)}</Badge>
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
          displayValue: trip.pickup,
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: '07:40 AM'
        });
      case 'dropoff':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'dropoff',
          displayValue: trip.dropoff,
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: '08:15 AM'
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
          cellStyle: {},
          displayStyle: addressClampStyle,
          placeholder: 'Pickup address'
        });
      case 'puZip':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'puZip',
          displayValue: getPickupZip(trip) || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
          placeholder: '32808'
        });
      case 'destination':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'destination',
          displayValue: trip.destination || '-',
          cellStyle: {},
          displayStyle: addressClampStyle,
          placeholder: 'Dropoff address'
        });
      case 'doZip':
        return renderInlineEditableTripCell({
          trip,
          columnKey: 'doZip',
          displayValue: getDropoffZip(trip) || '-',
          cellStyle: {
            whiteSpace: 'nowrap'
          },
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
      case 'mobility':
        return <td key={`${trip.id}-mobility`} style={{ whiteSpace: 'nowrap' }}>{trip.mobilityType || '-'}</td>;
      case 'assistLevel':
        return <td key={`${trip.id}-assist`} style={{ whiteSpace: 'nowrap' }}>
            <div className="d-flex align-items-center gap-1">
              <span>{trip.assistLevel || '-'}</span>
              {getTripCompanionNote(trip) ? <Badge bg="info" text="dark">Companion: Yes</Badge> : null}
            </div>
          </td>;
      case 'serviceAnimal':
        return <td key={`${trip.id}-animal`} style={{ whiteSpace: 'nowrap' }}>{trip.hasServiceAnimal ? <Badge bg="warning" text="dark">🐕 Yes</Badge> : '-'}</td>;
      case 'notes':
        return <td key={`${trip.id}-notes`} style={{ minWidth: 220, maxWidth: 320, whiteSpace: 'normal' }}>{getTripNoteText(trip) || '-'}</td>;
      case 'leg':
        return <td key={`${trip.id}-leg`} style={{ whiteSpace: 'nowrap' }}>{getLegBadge(trip) ? <Badge bg={getLegBadge(trip).variant}>{getLegBadge(trip).label}</Badge> : '-'}</td>;
      case 'punctuality':
        return <td key={`${trip.id}-punctuality`} style={{ whiteSpace: 'nowrap' }}><Badge bg={getTripPunctualityVariant(trip)}>{getTripPunctualityLabel(trip)}</Badge></td>;
      case 'lateMinutes':
        return <td key={`${trip.id}-late`} style={{ whiteSpace: 'nowrap' }}>{getTripLateMinutesDisplay(trip)}</td>;
      case 'confirmation': {
        const blockingState = tripBlockingMap.get(trip.id);
        const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
        const confirmationCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
        const confirmationLabel = confirmationCode === 'U' ? 'Unconfirmed' : ['C', 'S', 'W'].includes(confirmationCode) && (confirmationStatus === 'Not Sent' || confirmationStatus === 'Pending') ? 'Confirmed' : confirmationStatus;
        const badgeVariant = confirmationLabel === 'Confirmed' ? 'success' : confirmationLabel === 'Opted Out' ? 'danger' : 'secondary';
        return <td key={`${trip.id}-confirm`} style={{ whiteSpace: 'nowrap' }}>
            <Badge bg={badgeVariant}>{confirmationLabel}</Badge>
          </td>;
      }
      default:
        return null;
    }
  };

  const handleDetachedMapReset = () => {
    setMapCityQuickFilter('');
    setMapZipQuickFilter('');
    setSelectedTripIds([]);
    setSelectedDriverId(null);
    setSelectedRouteId(null);
    setShowRoute(true);
    router.replace('/trip-dashboard');
  };

  const driverPanelCard = <Card className="h-100 overflow-hidden" data-bs-theme={themeMode}>
      <CardBody className="p-0 d-flex flex-column h-100">
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom bg-success text-dark flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <strong>Drivers: {drivers.length}</strong>
            <span>{liveDrivers} live</span>
          </div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <Form.Control size="sm" value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver" style={{ width: 180 }} />
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
            refreshDrivers();
            router.push('/drivers');
            setStatusMessage('Opening Drivers to manage the live roster.');
          }}>Manage Drivers</Button>
            <Button variant="outline-danger" size="sm" onClick={() => setShowDriversPanel(false)} title="Hide drivers panel">✕ Hide</Button>
          </div>
        </div>
        <div className="table-responsive flex-grow-1" style={{ minHeight: 0, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable' }}>
          <Table size="sm" bordered striped hover className="align-middle mb-0 small" data-bs-theme={themeMode} style={{ lineHeight: 1.1, fontSize: '0.78rem' }}>
            <thead style={{ backgroundColor: '#198754', color: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                {renderDriverHeader('vehicle', 'Vehicle')}
                {renderDriverHeader('name', 'Driver')}
                {!isFocusRightLayout ? renderDriverHeader('attendant', 'Attendant') : null}
                {!isFocusRightLayout ? renderDriverHeader('info', 'Info') : null}
                {renderDriverHeader('live', 'Live')}
                <th className="py-1" style={{ backgroundColor: '#198754', color: '#fff' }}>#</th>
                <th className="py-1" style={{ width: 60, backgroundColor: '#198754', color: '#fff' }}>ACT</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.length > 0 ? filteredDrivers.map((driver, index) => <tr key={driver.id} className={selectedDriverId === driver.id ? 'table-primary' : ''}>
                  <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{driver.vehicle}</td>
                  <td className="py-1" style={{ whiteSpace: 'nowrap' }}><div className="fw-semibold">{driver.name}</div></td>
                  {!isFocusRightLayout ? <td className="py-1" style={{ whiteSpace: 'nowrap' }}>{driver.attendant}</td> : null}
                  {!isFocusRightLayout ? <td className="py-1 small text-truncate" style={{ maxWidth: 220 }}>{driver.info}</td> : null}
                  <td className="py-1 text-center" style={{ whiteSpace: 'nowrap' }}>
                    <Badge bg={driver.live === 'Online' ? 'success' : 'secondary'} className="fw-normal" style={driver.live === 'Online' ? undefined : offlineDriverBadgeStyle}>{driver.live || 'Offline'}</Badge>
                  </td>
                  <td className="py-1 text-center fw-bold">{index + 1}</td>
                  <td className="py-1">
                    <div className="d-flex align-items-center justify-content-center">
                      <Form.Check className="trip-dashboard-selector" type="radio" checked={selectedDriverId === driver.id} onChange={() => setSelectedDriverId(driver.id)} />
                    </div>
                  </td>
                </tr>) : <tr>
                  <td colSpan={isFocusRightLayout ? 5 : 7} className="text-center text-muted py-4">No drivers or vehicles loaded.</td>
                </tr>}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>;

  const routePanelCard = <Card className="h-100 overflow-hidden" data-bs-theme={themeMode}>
      <CardBody className="p-0 d-flex flex-column h-100">
        <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-success text-dark gap-2 flex-wrap">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handlePrintRoute}>Print Route</Button>
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleShareRouteWhatsapp}>WhatsApp</Button>
            <Form.Select size="sm" value={selectedDriverId ?? ''} onChange={event => setSelectedDriverId(event.target.value || null)} style={{ width: 180 }}>
              <option value="">Driver</option>
              {drivers.map(driver => <option key={`route-driver-${driver.id}`} value={driver.id}>{driver.name}</option>)}
            </Form.Select>
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleRoutePanelReassign}>Reassign</Button>
            <Form.Select size="sm" value={selectedSecondaryDriverId} onChange={event => setSelectedSecondaryDriverId(event.target.value)} style={{ width: 180 }}>
              <option value="">2nd driver</option>
              {drivers.map(driver => <option key={`route-secondary-${driver.id}`} value={driver.id}>{driver.name}</option>)}
            </Form.Select>
            <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={handleRoutePanelAssignSecondary}>Assign 2nd</Button>
            <Button variant="outline-danger" size="sm" onClick={handleRoutePanelUnassign} title="Unassign selected trips">U</Button>
            <Badge bg="dark">{selectedRoutePanelTripIds.length} selected</Badge>
            <Button variant="outline-danger" size="sm" onClick={() => setShowRoutesPanel(false)} title="Hide routes panel">✕ Hide</Button>
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
              {routeTrips.length > 0 ? (
                <List
                  height={400}
                  itemCount={routeTrips.length}
                  itemSize={48}
                  width="100%"
                  style={{overflowX: 'hidden'}}
                >
                  {({ index, style }) => {
                    const trip = routeTrips[index];
                    return (
                      <tr key={trip.id} style={style} className={selectedTripIdSet.has(normalizeTripId(trip.id)) ? 'table-success' : ''}>
                        <td className="fw-semibold">{trip.id}{getTripAddedByLabel(trip) ? <div className="small mt-1"><Badge bg="dark">{getTripAddedByLabel(trip)}</Badge></div> : null}</td>
                        <td><Badge bg={getTripTypeLabel(trip) === 'STR' ? 'danger' : getTripTypeLabel(trip) === 'W' ? 'warning' : 'success'} text={getTripTypeLabel(trip) === 'W' ? 'dark' : undefined}>{getTripTypeLabel(trip)}</Badge></td>
                        <td>{trip.miles || '-'}</td>
                        <td>{trip.pickup}</td>
                        <td>{trip.dropoff}</td>
                        <td>{trip.rider}</td>
                        <td>{trip.patientPhoneNumber || '-'}</td>
                        <td>
                          <div className="d-flex align-items-center justify-content-center">
                            <Form.Check className="trip-dashboard-selector" checked={selectedTripIdSet.has(normalizeTripId(trip.id))} onChange={() => toggleTripSelection(trip.id)} />
                          </div>
                        </td>
                      </tr>
                    );
                  }}
                </List>
              ) : (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">Select a route, a driver, or trips to view the route menu.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>;

  const renderTripMapPanel = ({ detached = false } = {}) => <Card className="h-100">
      <CardBody className="p-0 d-flex flex-column h-100 position-relative">
        {showInlineMap ? <div className="position-relative h-100">
            {!detached ? <Button variant="warning" type="button" onClick={() => {
          setShowMapPane(false);
          setStatusMessage('Map hidden in Trip Dashboard.');
        }} style={yellowMapTabStyle}>
                Hide Map
              </Button> : null}
            <div className="position-absolute top-0 start-0 p-2 d-flex align-items-center gap-2 flex-nowrap" style={{ zIndex: 650, maxWidth: '100%', minHeight: 48, overflowX: 'scroll', overflowY: 'hidden', scrollbarGutter: 'stable both-edges', whiteSpace: 'nowrap' }}>
              {detached ? <Button variant="dark" size="sm" onClick={handleDetachedMapReset}>RESET</Button> : <>
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
                  <Button variant="dark" size="sm" onClick={() => {
                setShowBottomPanels(true);
                setPanelView(TRIP_DASHBOARD_PANEL_VIEWS.both);
                if (isStandardLayout && showMapPane) {
                  setRightPanelCollapsed(false);
                  setColumnSplit(current => clamp(current, 38, 68));
                }
                setStatusMessage('Bottom panels anchored.');
              }}>Panels anchored</Button>
                  {!detached ? <Button variant="dark" size="sm" onClick={handleOpenMapWindow}>Pop Out</Button> : null}
                </>}
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
            <MapContainer className="dispatcher-map" center={selectedDriver?.position ?? [28.5383, -81.3792]} zoom={10} zoomControl={false} scrollWheelZoom={!mapLocked} dragging={!mapLocked} doubleClickZoom={!mapLocked} touchZoom={!mapLocked} boxZoom={!mapLocked} keyboard={!mapLocked} preferCanvas zoomAnimation={false} markerZoomAnimation={false} style={{ height: '100%', width: '100%' }}>
              <TileLayer attribution={mapTileConfig.attribution} url={mapTileConfig.url} updateWhenZooming={false} />
              <ZoomControl position="bottomleft" />
              {showRoute && routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: selectedRoute?.color ?? '#2563eb', weight: 4 }} /> : null}
              {selectedDriver?.hasRealLocation && selectedDriverActiveTrip ? <Polyline positions={[selectedDriver.position, getTripTargetPosition(selectedDriverActiveTrip)]} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '8 8' }} /> : null}
              {driversWithRealLocation.map(driver => <Marker key={`trip-dashboard-driver-live-${driver.id}`} position={driver.position} icon={liveVehicleIconByDriverId.get(String(driver?.id || '').trim()) || createLiveVehicleIcon({
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
                </CircleMarker>) : null}
              {routeStops.map(stop => <Marker key={stop.key} position={stop.position} icon={createRouteStopIcon(stop.label, stop.variant)}>
                  <Popup>
                    <div className="fw-semibold">{stop.title}</div>
                    <div>{stop.detail}</div>
                  </Popup>
                </Marker>)}
            </MapContainer>
          </div> : <div className="h-100 d-flex flex-column justify-content-center align-items-center text-center p-4" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #162236 100%)', color: '#f8fafc' }}>
            <div className="fw-semibold fs-5">Map moved to another screen</div>
            <div className="small mt-2" style={{ color: '#cbd5e1', maxWidth: 360 }}>Open the map on the other screen and keep route, trip, and driver management here.</div>
            <div className="d-flex align-items-center gap-2 flex-wrap justify-content-center mt-4">
              <Button variant="light" size="sm" onClick={() => setShowInlineMap(true)}>Show Map Here</Button>
              {!detached ? <Button variant="outline-light" size="sm" onClick={handleOpenMapWindow}>Open Map Window Again</Button> : null}
            </div>
          </div>}
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

  if (isDetachedMapMode) {
    return <div style={{ width: '100vw', height: '100vh', padding: 6, backgroundColor: '#0f172a' }}>
      {renderTripMapPanel({ detached: true })}
    </div>;
  }

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
        display: showTripsPanel && (showMapPane || isFocusRightLayout && hasVisibleDockPanels) ? 'block' : 'none'
      }}>
          <div className="position-absolute start-50 translate-middle-x rounded-pill" style={{ top: 10, bottom: 10, width: 6, backgroundColor: '#6b7280' }} />
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
            </Card> : <Card className="h-100">
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
                </div> : <div className="d-flex flex-column align-items-stretch p-3 border-bottom bg-success text-dark gap-2 flex-shrink-0">
                {shouldShowPinnedToolbarRecovery ? <div className="d-flex justify-content-end align-items-center gap-2 flex-wrap">
                    {!hasAnyVisibleToolbarBlock ? <Badge bg="danger">Toolbar hidden</Badge> : null}
                    <Button variant="dark" size="sm" onClick={handleResetToolbarLayout}>Restore toolbar</Button>
                    <Button variant="outline-dark" size="sm" style={greenToolbarButtonStyle} onClick={() => {
                  setShowToolbarTools(current => !current);
                  setShowColumnPicker(false);
                }}>Toolbar</Button>
                    {showToolbarTools ? <Card className="shadow position-absolute end-0 mt-5" style={{ zIndex: 82, width: 300 }}>
                        <CardBody className="p-3 text-dark">
                          <div className="fw-semibold mb-2">Toolbar</div>
                          <div className="small text-muted mb-3">Turn each toolbar block on or off.</div>
                          <div className="d-flex flex-column gap-2" style={{ maxHeight: 300, overflowY: 'auto' }}>
                            {TRIP_DASHBOARD_ALL_TOOLBAR_BLOCKS.map(blockId => <Form.Check key={`toolbar-tools-fallback-${blockId}`} type="switch" id={`toolbar-tools-fallback-switch-${blockId}`} label={TRIP_DASHBOARD_TOOLBAR_BLOCK_LABELS[blockId] || blockId} checked={isToolbarBlockEnabled(blockId)} onChange={event => handleToggleToolbarBlockVisibility(blockId, event.target.checked)} />)}
                          </div>
                        </CardBody>
                      </Card> : null}
                  </div> : null}
                {/* Row 1: Date selection and trip filters */}
                <div className={`d-flex align-items-center gap-2 ${isToolbarEditMode ? 'flex-nowrap' : 'flex-wrap'}`} style={{ minWidth: isToolbarEditMode ? 'max-content' : 0, overflowX: isToolbarEditMode ? 'auto' : 'visible', overflowY: 'hidden' }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row1');
                clearDraggingToolbarBlockIds();
              }}>
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
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(8, 19, 26, 0.12)' : 'rgba(255, 255, 255, 0.25)'
                  } : undefined}
                  >
                      {shouldRenderBlock ? renderedBlock || (isToolbarEditMode ? <Badge bg="secondary">{blockId}</Badge> : null) : null}
                    </div>;
                })}
                </div>
                
                {/* Row 2: Statistics and main action buttons */}
                {topButtonsRowCollapsed ? null : <div className={`d-flex gap-2 small position-relative ${isToolbarEditMode ? 'flex-nowrap' : 'flex-wrap'}`} style={{ minWidth: isToolbarEditMode ? 'max-content' : 0, overflowX: isToolbarEditMode ? 'auto' : 'visible', overflowY: 'hidden' }} onDragOver={event => {
                if (!isToolbarEditMode) return;
                event.preventDefault();
              }} onDrop={() => {
                if (!isToolbarEditMode) return;
                const draggedBlockId = getActiveDraggedToolbarBlockId();
                moveToolbarBlockAcrossRows(draggedBlockId, 'row2');
                clearDraggingToolbarBlockIds();
              }}>
                  {toolbarRow2Order.map(blockId => {
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
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(8, 19, 26, 0.12)' : 'rgba(255, 255, 255, 0.25)'
                  } : undefined}
                  >
                      {shouldRenderBlock ? renderedBlock || (isToolbarEditMode ? <Badge bg="secondary">{blockId}</Badge> : null) : null}
                    </div>;
                })}
                </div>}
                
                {/* Row 3: Leg/Type filters and misc buttons */}
                <div className={`d-flex gap-2 small position-relative ${isToolbarEditMode ? 'flex-nowrap' : 'flex-wrap'}`} style={{ minWidth: isToolbarEditMode ? 'max-content' : 0, overflowX: isToolbarEditMode ? 'auto' : 'visible', overflowY: 'hidden' }} onDragOver={event => {
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
                  return <div
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
                    backgroundColor: getActiveDraggedToolbarBlockId() === blockId ? 'rgba(8, 19, 26, 0.12)' : 'rgba(255, 255, 255, 0.25)'
                  } : undefined}
                  >
                      {shouldRenderBlock ? renderedBlock || (isToolbarEditMode ? <Badge bg="secondary">{blockId}</Badge> : null) : null}
                    </div>;
                })}
                </div>
              </div>}
              {aiPlannerCollapsed ? <div className="mx-3 mt-2 mb-2 d-flex align-items-center justify-content-start gap-2 flex-wrap">
                  <button type="button" onClick={() => setAiPlannerCollapsed(false)} style={{
                borderRadius: 10,
                border: '1px solid rgba(15, 23, 42, 0.18)',
                background: 'linear-gradient(180deg, #eef2ff 0%, #dbeafe 100%)',
                color: '#1e293b',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '0.06em',
                padding: '6px 12px',
                boxShadow: '0 6px 14px rgba(15, 23, 42, 0.12)'
              }}>
                    AI Route
                  </button>
                  {tripStatusFilter === 'cancelled' ? <Button variant="primary" size="sm" onClick={handleReinstateSelectedTrips}>I</Button> : <>
                      <Button variant="primary" size="sm" onClick={() => handleAssign(selectedDriverId)}>A</Button>
                      <Button variant="warning" size="sm" onClick={() => handleAssignSecondary(selectedSecondaryDriverId)} title="Assign secondary driver">A2</Button>
                      <Button variant="secondary" size="sm" onClick={handleUnassign}>U</Button>
                      <Button variant="danger" size="sm" onClick={handleCancelSelectedTrips}>C</Button>
                    </>}
                  <span className="fw-semibold small ms-1" style={compactToolbarLabelStyle}>Leg</span>
                  <Button variant={tripLegFilter === 'AL' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripLegFilter === 'AL' || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'AL' ? 'all' : 'AL')} title="First leg to appointment">AL</Button>
                  <Button variant={tripLegFilter === 'BL' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripLegFilter === 'BL' || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'BL' ? 'all' : 'BL')} title="Return-leg trips">BL</Button>
                  <Button variant={tripLegFilter === 'CL' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripLegFilter === 'CL' || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setTripLegFilter(current => current === 'CL' ? 'all' : 'CL')} title="Third or connector leg">CL</Button>
                  <span className="fw-semibold small ms-1" style={compactToolbarLabelStyle}>Type</span>
                  <Button variant={tripTypeFilter === 'A' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripTypeFilter === 'A' || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'A' ? 'all' : 'A')} title="Ambulatory">A</Button>
                  <Button variant={tripTypeFilter === 'W' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripTypeFilter === 'W' || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'W' ? 'all' : 'W')} title="Wheelchair">W</Button>
                  <Button variant={tripTypeFilter === 'STR' ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={tripTypeFilter === 'STR' || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setTripTypeFilter(current => current === 'STR' ? 'all' : 'STR')} title="Stretcher">STR</Button>
                  <Button variant={serviceAnimalOnly ? compactToolbarActiveVariant : compactToolbarOutlineVariant} size="sm" style={serviceAnimalOnly || isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={() => setServiceAnimalOnly(current => !current)} title="Service Animal">SA</Button>
                  <Button variant={isActiveRouteClosed ? 'danger' : compactToolbarOutlineVariant} size="sm" style={isActiveRouteClosed ? {
                fontWeight: 700
              } : isDarkTheme ? undefined : greenToolbarButtonStyle} onClick={handleToggleClosedRoute} title="Lock route by driver/day. New trips added later will show who added them.">
                    {isActiveRouteClosed ? 'Route closed' : 'Close route'}
                  </Button>
                  <Form.Select size="sm" value={tripStatusFilter} onChange={event => setTripStatusFilter(event.target.value)} style={{ width: 130, marginLeft: 8 }}>
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
                  </Form.Select>
                </div> : <div className="mx-3 mb-3 p-3 rounded-3 border bg-light-subtle text-dark" style={{ borderColor: 'rgba(15, 23, 42, 0.12)' }}>
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div>
                      <div className="fw-semibold">AI Smart Route</div>
                      <div className="small text-muted">Driver + anchor trip + ZIP + cutoff time. Then Local or GPT builds the route.</div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <Badge bg={aiPlannerMode === 'openai' ? 'primary' : 'secondary'}>{aiPlannerMode === 'openai' ? 'GPT' : 'LOCAL'}</Badge>
                      <Button variant="light" size="sm" onClick={() => setAiPlannerCollapsed(true)} style={{ minWidth: 38 }} title="Hide AI Smart Route">
                        <IconifyIcon icon="iconoir:eye-closed" />
                      </Button>
                    </div>
                  </div>

                  {!selectedDriverId || tripDateFilter === 'all' ? <div className="small text-muted">Select a driver and a specific day first.</div> : <div className="d-flex flex-column gap-2">
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
                      <div className="rounded-3 border p-2 bg-white" style={{ borderColor: 'rgba(15, 23, 42, 0.1)' }}>
                        <div className="small text-uppercase text-muted fw-semibold mb-2">City route pairs</div>
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
                          </div> : <div className="small text-muted mt-2">If you do not add pairs, the planner uses any origin and destination in the pool.</div>}
                        {aiPlannerRoutePairs.length > 0 ? <div className="d-flex justify-content-between align-items-center gap-2 mt-2">
                            <div className="small text-muted">Mode: {aiPlannerRoutePairMode === 'both' ? 'auto round-trip pairs' : 'exact direction only'}.</div>
                            <Button variant="light" size="sm" onClick={handleClearAiPlannerRoutePairs}>Clear pairs</Button>
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
                        <Button variant="light" size="sm" disabled={!aiPlannerPreview?.plan || aiPlannerLoading} onClick={handleClearAiPlannerPreview}>
                          Clear Preview
                        </Button>
                      </div>

                      <div className="small text-muted">
                        {selectedTripIds.length > 0 ? `Using ${aiPlanningScopeTrips.length} selected trip(s) as pool.` : `Using ${aiPlanningScopeTrips.length} visible trips from this day as pool.`}
                      </div>
                      {aiPlannerPreview?.plan?.routes?.[0] ? <div className="small text-muted">
                          Current preview: {aiPlannerPreview.plan.routes[0].tripIds.length} trip(s).
                        </div> : null}
                      <div className="small text-muted">
                        Active filters: {aiPlannerCityFilter || 'all cities'} / {aiPlannerRoutePairs.length > 0 ? aiPlannerRoutePairs.map(formatAiPlannerRoutePairLabel).join(', ') : 'no pairs'} / {aiPlannerRoutePairs.length > 0 ? aiPlannerRoutePairMode === 'both' ? 'round-trip' : 'exact direction' : 'any direction'} / {aiPlannerLegFilter === 'all' ? 'all legs' : aiPlannerLegFilter} / {aiPlannerTypeFilter === 'all' ? 'all types' : aiPlannerTypeFilter} / max {aiPlannerMaxTrips || 'no limit'} / late {aiPlannerLateToleranceMinutes || '0'} min.
                      </div>

                      {aiPlannerPreview?.plan?.routes?.[0] ? <div className="rounded-3 border p-2 bg-white" style={{ borderColor: 'rgba(15, 23, 42, 0.1)' }}>
                          <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                            <div className="fw-semibold small">{aiPlannerPreview.plan.routes[0].name}</div>
                            <Badge bg="dark">{aiPlannerPreview.plan.routes[0].tripIds.length} trips</Badge>
                          </div>
                          <div className="small text-muted mb-2">{aiPlannerPreview.plan.routes[0].notes}</div>
                          <div className="d-flex flex-column gap-1" style={{ maxHeight: 132, overflowY: 'auto' }}>
                            {aiPlannerPreview.plan.routes[0].stops.map((stop, index) => <div key={`ai-stop-${stop.id}-${index}`} className="small d-flex justify-content-between gap-2">
                                <span className="fw-semibold">{index + 1}. {stop.rider || stop.id}</span>
                                <span className="text-muted text-end">
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
                  {filteredTrips.length > 0 ? <div ref={tripTableTopScrollerRef} onScroll={() => syncTripTableScroll('top')} style={{ overflowX: 'scroll', overflowY: 'hidden', height: 20, marginBottom: 6, scrollbarGutter: 'stable', scrollbarWidth: 'thin', borderTop: '1px solid rgba(148, 163, 184, 0.25)', borderBottom: '1px solid rgba(148, 163, 184, 0.25)', backgroundColor: 'rgba(15, 23, 42, 0.35)' }}>
                    <div style={{ width: tripTableScrollWidth > 0 ? tripTableScrollWidth + 40 : 'calc(100% + 40px)', height: 18 }} />
                </div> : null}
              <div ref={tripTableBottomScrollerRef} className="table-responsive flex-grow-1 trip-dashboard-sheet-wrap" onScroll={() => syncTripTableScroll('bottom')} style={{ minHeight: 0, height: '100%', maxHeight: '100%', overflowX: 'auto', overflowY: 'auto', scrollbarGutter: 'stable both-edges', paddingBottom: 8 }}>
                <Table ref={tripTableElementRef} hover className="align-middle mb-0 trip-dashboard-sheet-table" data-bs-theme={themeMode} style={{ whiteSpace: 'nowrap', minWidth: 'max-content', width: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead className={themeMode === 'dark' ? 'table-dark' : 'table-light'} style={{ position: 'sticky', top: 0 }}>
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
                      {renderTripHeader('notes', 'Notes', 56, false)}
                      {orderedVisibleTripColumns.map(columnKey => {
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
                        <td style={{ width: columnWidths.notes ?? 56, minWidth: columnWidths.notes ?? 56, whiteSpace: 'nowrap' }}>
                          <div className="d-flex align-items-center gap-1">
                            <Button variant="outline-secondary" size="sm" onClick={() => handleOpenTripNote(row.trip)} style={{ minWidth: 34, color: getTripNoteText(row.trip) ? '#9ca3af' : '#d1d5db', borderColor: '#6b7280', backgroundColor: 'transparent' }}>
                              N
                            </Button>
                            <Button variant="outline-info" size="sm" onClick={() => handleCloneTrip(row.trip)} title="Clone trip" style={{ minWidth: 34, borderColor: '#38bdf8', color: '#38bdf8', backgroundColor: 'transparent' }}>
                              C
                            </Button>
                            {row.trip.clonedFromTripId ? <Button variant="outline-danger" size="sm" onClick={() => {
                          if (window.confirm(`DELETE COPY ${row.trip.id}\nOriginal: ${row.trip.clonedFromTripId}\nRider: ${row.trip.rider || '-'}\n\nThis cannot be undone. Continue?`)) {
                            deleteTripRecord(row.trip.id);
                            setStatusMessage(`Cloned trip ${row.trip.id} deleted.`);
                          }
                        }} title={`Delete cloned copy ${row.trip.id}`} style={{ minWidth: 34, borderColor: '#ef4444', color: '#ef4444', backgroundColor: 'transparent', fontWeight: 700 }}>
                                D
                              </Button> : null}
                          </div>
                        </td>
                        {orderedVisibleTripColumns.map(columnKey => <React.Fragment key={`${row.trip.id}-${columnKey}`}>{renderTripDataCell(row.trip)(columnKey)}</React.Fragment>)}
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
        left: `calc(${columnSplit}% - ${dividerSize / 2}px)`,
        top: `calc(${rowSplit}% - ${dividerSize / 2}px)`,
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
        gridTemplateColumns: dockPanelsVisible.length === 1 ? 'minmax(0, 1fr)' : showMapPane ? `${columnSplit}% ${dividerSize}px minmax(0, ${100 - columnSplit}%)` : '1fr 1fr'
      }}>
            {dockPanelsVisible.length > 0 ? <div style={{ minWidth: 0, minHeight: 0, gridColumn: 1 }}>
                {dockPanelsVisible[0].node}
              </div> : null}
            {dockPanelsVisible.length > 1 ? <>
                {showMapPane ? <div style={{ gridColumn: 2, backgroundColor: '#2d3448', borderRadius: 999 }} /> : null}
                <div style={{ minWidth: 0, minHeight: 0, gridColumn: showMapPane ? 3 : 2 }}>
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
        gridTemplateRows: dockPanelsVisible.length > 1 ? 'minmax(0, 1fr) 8px minmax(0, 1fr)' : 'minmax(0, 1fr)'
      }}>
            {dockPanelsVisible.length > 0 ? <div style={{ minWidth: 0, minHeight: 0, gridRow: 1 }}>
                {dockPanelsVisible[0].node}
              </div> : null}
            {dockPanelsVisible.length > 1 ? <>
                <div style={{ gridRow: 2, backgroundColor: '#2d3448', borderRadius: 999 }} />
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
        gridTemplateRows: dockPanelsVisible.length > 1 ? 'minmax(0, 1fr) 8px minmax(0, 1fr)' : 'minmax(0, 1fr)'
      }}>
            {dockPanelsVisible.length > 0 ? <div style={{ minWidth: 0, minHeight: 0, gridRow: 1 }}>
                {dockPanelsVisible[0].node}
              </div> : null}
            {dockPanelsVisible.length > 1 ? <>
                <div style={{ gridRow: 2, backgroundColor: '#2d3448', borderRadius: 999 }} />
                <div style={{ minWidth: 0, minHeight: 0, gridRow: 3 }}>
                  {dockPanelsVisible[1].node}
                </div>
              </> : null}
          </div> : null}

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
            <Button variant="outline-info" onClick={() => {
            handleCloneTrip(noteModalTrip);
            handleCloseTripNote();
          }}>Clone Trip</Button>
            <Button variant="secondary" onClick={handleCloseTripNote}>Close</Button>
            <Button variant="primary" onClick={handleSaveTripNote}>Save Trip</Button>
          </Modal.Footer>
        </Modal>
        <style jsx global>{`
          .trip-dashboard-sheet-wrap {
            background: #f8fbf8;
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