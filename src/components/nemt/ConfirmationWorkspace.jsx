'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { useNemtContext } from '@/context/useNemtContext';
import { getTripServiceDateKey, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { getEffectiveConfirmationStatus, getTripBlockingState } from '@/helpers/trip-confirmation-blocking';
import useBlacklistApi from '@/hooks/useBlacklistApi';
import useSmsIntegrationApi from '@/hooks/useSmsIntegrationApi';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { openWhatsAppConversation } from '@/utils/whatsapp';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Modal, Row, Table } from 'react-bootstrap';

const buildSurfaceStyles = isLight => ({
  card: {
    backgroundColor: isLight ? '#ffffff' : '#171b27',
    borderColor: isLight ? '#d5deea' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff',
    borderRadius: 12,
    boxShadow: isLight ? '0 10px 24px rgba(148, 163, 184, 0.12)' : '0 16px 34px rgba(2, 6, 23, 0.24)'
  },
  input: {
    backgroundColor: isLight ? '#f8fbff' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  button: {
    backgroundColor: isLight ? '#f3f7fc' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff',
    padding: '0.18rem 0.55rem',
    fontSize: '0.76rem',
    lineHeight: 1.1
  },
  table: {
    fontSize: '0.78rem',
    lineHeight: 1.08,
    borderCollapse: 'separate',
    borderSpacing: 0
  },
  tableHead: {
    backgroundColor: isLight ? '#f8fafc' : '#172033',
    color: isLight ? '#0f172a' : '#f8fafc',
    fontSize: '0.74rem'
  }
});

const normalizeSignaturePayload = value => {
  if (!value || typeof value !== 'object') return null;
  const width = Number(value.width);
  const height = Number(value.height);
  const points = Array.isArray(value.points)
    ? value.points
      .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
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

const buildPreviewPoints = points => {
  if (!Array.isArray(points) || points.length === 0) return '';
  const maxPreviewPoints = 140;
  const step = Math.max(1, Math.ceil(points.length / maxPreviewPoints));
  const sampled = [];
  for (let index = 0; index < points.length; index += step) sampled.push(points[index]);
  const lastPoint = points[points.length - 1];
  if (sampled.length === 0 || sampled[sampled.length - 1] !== lastPoint) sampled.push(lastPoint);
  return sampled.map(point => `${point.x},${point.y}`).join(' ');
};

const RiderSignaturePreview = ({ trip }) => {
  const payload = normalizeSignaturePayload(trip?.riderSignatureData);
  if (!payload) {
    if (!trip?.riderSignatureName) return null;
    return <div className="small text-muted mt-1">Signed by {trip.riderSignatureName}</div>;
  }
  const polylinePoints = buildPreviewPoints(payload.points);
  if (!polylinePoints) return null;
  return <div className="mt-1">
      <div style={{
      width: 160,
      maxWidth: '100%',
      height: 60,
      border: '1px solid #d0d7e2',
      borderRadius: 8,
      backgroundColor: '#ffffff'
    }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${payload.width} ${payload.height}`} preserveAspectRatio="none">
          <polyline points={polylinePoints} fill="none" stroke="#0f172a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {trip?.riderSignatureName ? <div className="small text-muted mt-1">Signed by {trip.riderSignatureName}</div> : null}
    </div>;
};

const STATUS_VARIANTS = {
  Confirmed: 'success',
  Cancelled: 'danger',
  Disconnected: 'secondary',
  'Needs Call': 'warning',
  Pending: 'primary',
  'Not Sent': 'secondary',
  'Opted Out': 'dark'
};

const DISCONNECTED_BADGE_STYLE = {
  backgroundColor: '#6f42c1',
  color: '#ffffff'
};

const INLINE_CONFIRMATION_EDITABLE_COLUMNS = new Set(['pickup', 'dropoff', 'pickupAddress', 'dropoffAddress']);

const buildConfirmationActor = session => {
  const id = String(session?.user?.id || '').trim();
  const name = String(session?.user?.name || session?.user?.username || session?.user?.email || 'Dispatcher').trim() || 'Dispatcher';
  return { id, name };
};

const BLOCK_REASON_OPTIONS = [
  { value: 'hospital-rehab', label: 'Hospital / Rehab' },
  { value: 'no-company', label: 'Does not want our company' },
  { value: 'patient-request', label: 'Patient Request' },
  { value: 'family-request', label: 'Family Request' },
  { value: 'billing-insurance', label: 'Billing / Insurance issue' },
  { value: 'other', label: 'Other Reason' }
];

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

const CONFIRMATION_OUTPUT_COLUMNS_STORAGE_KEY = '__CARE_CONFIRMATION_OUTPUT_COLUMNS__';
const CONFIRMATION_OUTPUT_COLUMN_OPTIONS = [
  { key: 'tripId', label: 'Trip ID' },
  { key: 'rider', label: 'Rider' },
  { key: 'phone', label: 'Phone' },
  { key: 'pickupTime', label: 'Pickup Time' },
  { key: 'dropoffTime', label: 'Dropoff Time' },
  { key: 'pickupAddress', label: 'PU Address' },
  { key: 'puZip', label: 'PU ZIP' },
  { key: 'dropoffAddress', label: 'DO Address' },
  { key: 'doZip', label: 'DO ZIP' },
  { key: 'miles', label: 'Miles' },
  { key: 'leg', label: 'Leg' },
  { key: 'type', label: 'Type' },
  { key: 'doNotConfirm', label: 'Do Not Confirm' },
  { key: 'hospitalRehab', label: 'Hospital/Rehab' },
  { key: 'confirmation', label: 'Confirmation' },
  { key: 'dispatchStatus', label: 'Dispatch Status' },
  { key: 'reply', label: 'Reply' },
  { key: 'sent', label: 'Sent' },
  { key: 'responded', label: 'Responded' },
  { key: 'internalNotes', label: 'Notes (Print only)' }
];
const DEFAULT_CONFIRMATION_OUTPUT_COLUMNS = ['tripId', 'rider', 'phone', 'pickupTime', 'dropoffTime', 'pickupAddress', 'dropoffAddress', 'miles', 'leg', 'type', 'confirmation', 'dispatchStatus', 'reply'];

const CONFIRMATION_TABLE_SORTABLE_COLUMNS = new Set(['tripId', 'rider', 'phone', 'pickupTime', 'dropoffTime', 'miles', 'leg', 'type']);

const CONFIRMATION_TABLE_COLUMN_WIDTHS = {
  tripId: 120,
  rider: 180,
  phone: 130,
  pickupTime: 110,
  pickupAddress: 180,
  puZip: 95,
  dropoffTime: 110,
  dropoffAddress: 180,
  doZip: 95,
  miles: 90,
  leg: 70,
  type: 70,
  doNotConfirm: 130,
  hospitalRehab: 150,
  confirmation: 130,
  dispatchStatus: 150,
  reply: 180,
  sent: 150,
  responded: 150,
  internalNotes: 180,
  action: 124
};

const normalizeConfirmationOutputColumns = value => {
  const allowedKeys = new Set(CONFIRMATION_OUTPUT_COLUMN_OPTIONS.map(option => option.key));
  const cleaned = Array.isArray(value) ? value.filter(key => allowedKeys.has(key)) : [];
  const unique = Array.from(new Set(cleaned));
  return unique.length > 0 ? unique : [...DEFAULT_CONFIRMATION_OUTPUT_COLUMNS];
};

const getConfirmationSortDirection = (sortOrder, columnKey) => {
  if (sortOrder === `${columnKey}-asc`) return 'asc';
  if (sortOrder === `${columnKey}-desc`) return 'desc';
  return null;
};

const compareConfirmationText = (leftValue, rightValue, direction) => {
  const leftText = String(leftValue || '');
  const rightText = String(rightValue || '');
  return direction === 'asc' ? leftText.localeCompare(rightText) : rightText.localeCompare(leftText);
};

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatAddressForPrint = value => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '-';

  const byComma = text.split(',').map(part => part.trim()).filter(Boolean);
  if (byComma.length > 1) {
    const visible = byComma.slice(0, 3);
    const suffix = byComma.length > 3 ? ' ...' : '';
    return `${visible.join('\n')}${suffix}`;
  }

  const words = text.split(' ').filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= 28) {
      currentLine = nextLine;
      continue;
    }
    if (currentLine) lines.push(currentLine);
    currentLine = word;
    if (lines.length === 3) break;
  }

  if (lines.length < 3 && currentLine) lines.push(currentLine);
  const clamped = lines.slice(0, 3);
  const hasMore = words.join(' ').length > clamped.join(' ').length;
  if (hasMore && clamped.length > 0) clamped[clamped.length - 1] = `${clamped[clamped.length - 1]} ...`;
  return clamped.join('\n');
};

const ZIP_CODE_PATTERN = /\b\d{5}(?:-\d{4})?\b/;

const extractZipCode = (...values) => {
  for (const value of values) {
    const text = String(value || '');
    const match = text.match(ZIP_CODE_PATTERN);
    if (match?.[0]) return match[0];
  }
  return '';
};

const getTripPickupZipValue = trip => trip?.pickupZip || trip?.puZip || extractZipCode(trip?.address) || '-';
const getTripDropoffZipValue = trip => trip?.dropoffZip || trip?.doZip || extractZipCode(trip?.destination) || '-';

const getTripNotesPreview = (value, maxLength = 120) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
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
  const tripId = String(trip?.id || '').trim();
  if (/-2$/.test(tripId)) return 'BL';
  if (/-1$/.test(tripId)) return 'AL';
  return 'CL';
};

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

const parseMilesValue = value => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace(/,/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const miles = Number(match[0]);
  return Number.isFinite(miles) ? miles : null;
};

const getTripMilesValue = trip => {
  const candidates = [trip?.miles, trip?.distanceMiles, trip?.estimatedMiles, trip?.routeMiles, trip?.tripMiles, trip?.distance];
  for (const candidate of candidates) {
    const parsed = parseMilesValue(candidate);
    if (parsed != null) return parsed;
  }
  return null;
};

const getTripMilesDisplay = trip => {
  const miles = getTripMilesValue(trip);
  if (miles == null) return '-';
  return Number(miles.toFixed(2)).toString();
};

const normalizeTripTimeDisplay = value => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const asClockMinutes = parseTripClockMinutes(text);
  if (asClockMinutes != null) return formatMinutesAsClock(asClockMinutes);

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    const spreadsheetMinutes = parseSpreadsheetTimeMinutes(numeric);
    if (spreadsheetMinutes != null) return formatMinutesAsClock(spreadsheetMinutes);
  }

  return text;
};

const getInlineConfirmationFieldValue = (trip, columnKey) => {
  if (columnKey === 'pickup') return normalizeTripTimeDisplay(trip?.scheduledPickup || trip?.pickup || '');
  if (columnKey === 'dropoff') return normalizeTripTimeDisplay(trip?.scheduledDropoff || trip?.dropoff || '');
  if (columnKey === 'pickupAddress') return String(trip?.address || '').trim();
  if (columnKey === 'dropoffAddress') return String(trip?.destination || '').trim();
  return '';
};

const buildConfirmationTimeSortValue = (trip, timeText, fallbackKey) => {
  const parsedMinutes = parseTripClockMinutes(timeText);
  if (parsedMinutes == null) return Number.isFinite(Number(trip?.[fallbackKey])) ? Number(trip[fallbackKey]) : Number.MAX_SAFE_INTEGER;
  const serviceDateKey = getTripServiceDateKey(trip) || new Date().toISOString().slice(0, 10);
  const [year, month, day] = String(serviceDateKey || '').split('-').map(Number);
  if (!year || !month || !day) return Number.isFinite(Number(trip?.[fallbackKey])) ? Number(trip[fallbackKey]) : Number.MAX_SAFE_INTEGER;
  const hours = Math.floor(parsedMinutes / 60);
  const minutes = parsedMinutes % 60;
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
};

const buildScheduleChangeNoteLine = ({ actorName, oldPickup, newPickup, oldDropoff, newDropoff }) => {
  const details = [];
  if (String(oldPickup || '').trim() !== String(newPickup || '').trim()) {
    details.push(`Pickup: ${oldPickup || '-'} -> ${newPickup || '-'}`);
  }
  if (String(oldDropoff || '').trim() !== String(newDropoff || '').trim()) {
    details.push(`Dropoff: ${oldDropoff || '-'} -> ${newDropoff || '-'}`);
  }
  if (details.length === 0) return '';
  return `[SCHEDULE CHANGE] ${new Date().toLocaleString()}: ${actorName} changed ${details.join(' | ')}`;
};

const parseSpreadsheetTimeMinutes = value => {
  if (value == null) return null;
  const raw = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(raw)) return null;

  // Excel-style datetime serial (e.g. 46112.3222) or time-only fraction (e.g. 0.5)
  const fraction = raw >= 1 ? raw - Math.floor(raw) : raw;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) return null;

  const minutes = Math.round(fraction * 24 * 60);
  if (!Number.isFinite(minutes)) return null;
  return Math.min(1439, Math.max(0, minutes));
};

const formatMinutesAsClock = minutes => {
  if (!Number.isFinite(minutes)) return '';
  const safeMinutes = Math.min(1439, Math.max(0, Math.round(minutes)));
  const hours24 = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${suffix}`;
};

const getTripTimeMinutesForFilter = trip => {
  const tripTime = trip?.scheduledPickup || trip?.pickupTime || trip?.appointmentTime || trip?.startTime || trip?.pickup || '';
  const parsedClockMinutes = parseTripClockMinutes(tripTime);
  if (parsedClockMinutes != null) return parsedClockMinutes;

  const parsedSpreadsheetMinutes = parseSpreadsheetTimeMinutes(tripTime);
  if (parsedSpreadsheetMinutes != null) return parsedSpreadsheetMinutes;

  const pickupSortTimestamp = Number(trip?.pickupSortValue);
  if (Number.isFinite(pickupSortTimestamp)) {
    const date = new Date(pickupSortTimestamp);
    if (!Number.isNaN(date.getTime())) return date.getHours() * 60 + date.getMinutes();
  }

  return null;
};

const buildTripDedupKey = trip => {
  const pairKey = getTripPairKey(trip) || String(trip?.id || '').trim();
  const legKey = getTripLegFilterKey(trip);
  const dateKey = getTripServiceDateKey(trip) || '';
  const tripTime = trip?.scheduledPickup || trip?.pickupTime || trip?.appointmentTime || trip?.startTime || trip?.pickup || '';
  const timeKey = parseTripClockMinutes(tripTime);
  const miles = getTripMilesValue(trip);
  const milesKey = miles == null ? '' : String(Number(miles.toFixed(2)));
  return [pairKey, legKey, dateKey, timeKey == null ? '' : String(timeKey), milesKey].join('|');
};

const isTripCompleted = trip => {
  const status = String(trip?.status || '').trim().toLowerCase();
  if (status.includes('complete') || status.includes('completed') || status.includes('done') || status.includes('finished')) return true;
  return Boolean(String(trip?.actualDropoff || '').trim());
};

const isPatientExclusionActiveForDate = (exclusion, dateKey, fallbackDateKey) => {
  if (!exclusion) return false;
  const mode = String(exclusion.mode || '').trim().toLowerCase();
  const targetDate = String(dateKey || fallbackDateKey || '').trim();
  if (mode === 'always') return true;
  if (!targetDate) return false;
  if (mode === 'single-day') return targetDate === String(exclusion.startDate || '').trim();
  if (mode === 'range') {
    const start = String(exclusion.startDate || '').trim();
    const end = String(exclusion.endDate || '').trim();
    if (!start || !end) return false;
    return targetDate >= start && targetDate <= end;
  }
  return false;
};

const ConfirmationWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const surfaceStyles = useMemo(() => buildSurfaceStyles(themeMode === 'light'), [themeMode]);
  const router = useRouter();
  const { data: session } = useSession();
  const { trips, refreshDispatchState, updateTripRecord, deleteTripRecord } = useNemtContext();
  const { data: smsData, saveData: saveSmsData } = useSmsIntegrationApi();
  const { data: blacklistData, saveData: saveBlacklistData } = useBlacklistApi();
  const { data: userPreferences, loading: userPreferencesLoading, saveData: saveUserPreferences } = useUserPreferencesApi();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTripIds, setSelectedTripIds] = useState([]);
  const [customMessage, setCustomMessage] = useState('');
  const [customSending, setCustomSending] = useState(false);
  const [customStatus, setCustomStatus] = useState('');
  const [legFilter, setLegFilter] = useState('all');
  const [rideTypeFilter, setRideTypeFilter] = useState('all');
  const [confirmationSending, setConfirmationSending] = useState(false);
  const [inlineTimeEditCell, setInlineTimeEditCell] = useState(null);
  const [inlineTimeEditValue, setInlineTimeEditValue] = useState('');
  
  // New states for date, time, and manual confirmation
  const [confirmationDate, setConfirmationDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [timeFromFilter, setTimeFromFilter] = useState('02:00');
  const [timeToFilter, setTimeToFilter] = useState('08:00');
  const [primaryFilterMode, setPrimaryFilterMode] = useState('none');
  const [milesMinFilter, setMilesMinFilter] = useState('');
  const [milesMaxFilter, setMilesMaxFilter] = useState('25');
  const [milesSortOrder, setMilesSortOrder] = useState('miles-desc');
  const [isMilesMaxManual, setIsMilesMaxManual] = useState(false);
  const [showDetectedMaxBadge, setShowDetectedMaxBadge] = useState(false);
  const [resultViewMode, setResultViewMode] = useState('trips');
  const [cancelNoteModal, setCancelNoteModal] = useState(null);
  const [cancelNoteDraft, setCancelNoteDraft] = useState('');
  const [cancelLegScope, setCancelLegScope] = useState('single');
  const [blockReasonModalTrip, setBlockReasonModalTrip] = useState(null);
  const [blockReasonType, setBlockReasonType] = useState('other');
  const [blockReasonNote, setBlockReasonNote] = useState('');
  const [pendingHospitalRehabTrip, setPendingHospitalRehabTrip] = useState(null);
  
  // Hospital/Rehab states
  const [hospitalRehabModal, setHospitalRehabModal] = useState(null);
  const [hospitalRehabType, setHospitalRehabType] = useState('Hospital');
  const [hospitalRehabStartDate, setHospitalRehabStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hospitalRehabEndDate, setHospitalRehabEndDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  });
  const [hospitalRehabNotes, setHospitalRehabNotes] = useState('');
  const [hospitalRehabSaving, setHospitalRehabSaving] = useState(false);
  const [hospitalRehabError, setHospitalRehabError] = useState('');
  
  // Confirmation method modal
  const [confirmationMethodModal, setConfirmationMethodModal] = useState(null);
  const [confirmationMethod, setConfirmationMethod] = useState('whatsapp');
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false);
  const [confirmationLegScope, setConfirmationLegScope] = useState('single');
  const [confirmationSourceTrip, setConfirmationSourceTrip] = useState(null);
  const [tripUpdateModal, setTripUpdateModal] = useState(null);
  const [tripUpdateLegScope, setTripUpdateLegScope] = useState('single');
  const [tripUpdateConfirmMethod, setTripUpdateConfirmMethod] = useState('call');
  const [tripUpdatePickupTime, setTripUpdatePickupTime] = useState('');
  const [tripUpdateDropoffTime, setTripUpdateDropoffTime] = useState('');
  const [tripUpdatePickupAddress, setTripUpdatePickupAddress] = useState('');
  const [tripUpdateDropoffAddress, setTripUpdateDropoffAddress] = useState('');
  const [tripUpdateNote, setTripUpdateNote] = useState('');
  const [tripUpdateCompanionNote, setTripUpdateCompanionNote] = useState('');
  const [tripUpdateMobilityNote, setTripUpdateMobilityNote] = useState('');
  const confirmationActor = useMemo(() => buildConfirmationActor(session), [session]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientFromDate, setPatientFromDate] = useState('');
  const [patientToDate, setPatientToDate] = useState('');
  const [selectedPatientKey, setSelectedPatientKey] = useState('');
  const [patientStatusModalOpen, setPatientStatusModalOpen] = useState(false);
  const [patientStatusMode, setPatientStatusMode] = useState('always');
  const [patientStatusStartDate, setPatientStatusStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patientStatusEndDate, setPatientStatusEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patientStatusReason, setPatientStatusReason] = useState('Rehab stay');
  const [patientStatusSourceNote, setPatientStatusSourceNote] = useState('');
  const [showOutputColumnPicker, setShowOutputColumnPicker] = useState(false);
  const [outputColumns, setOutputColumns] = useState([...DEFAULT_CONFIRMATION_OUTPUT_COLUMNS]);
  const [draggingOutputColumnKey, setDraggingOutputColumnKey] = useState(null);
  const outputColumnsHydratedRef = useRef(false);
  const [showRehabBlacklistPanel, setShowRehabBlacklistPanel] = useState(false);
  const resultsSectionRef = useRef(null);

  const optOutList = useMemo(() => (Array.isArray(smsData?.sms?.optOutList) ? smsData.sms.optOutList : EMPTY_ARRAY), [smsData?.sms?.optOutList]);
  const blacklistEntries = useMemo(() => (Array.isArray(blacklistData?.entries) ? blacklistData.entries : EMPTY_ARRAY), [blacklistData?.entries]);
  const groupTemplates = smsData?.sms?.groupTemplates || EMPTY_OBJECT;
  const riderProfiles = smsData?.sms?.riderProfiles || EMPTY_OBJECT;
  const buildPatientProfileKey = trip => {
    const phoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    if (phoneKey) return `phone:${phoneKey}`;
    const riderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    return riderKey ? `rider:${riderKey}` : '';
  };
  const getTripPatientIdentity = trip => ({
    phone: String(trip?.patientPhoneNumber || '').replace(/\D/g, ''),
    rider: String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, ' ')
  });
  const matchesPatientIdentity = (trip, entry) => {
    const tripIdentity = getTripPatientIdentity(trip);
    const entryPhone = String(entry?.phone || '').replace(/\D/g, '');
    const entryName = String(entry?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (tripIdentity.phone && entryPhone && tripIdentity.phone === entryPhone) return true;
    if (tripIdentity.rider && entryName && tripIdentity.rider === entryName) return true;
    return false;
  };
  const getPatientProfileForTrip = trip => {
    const key = buildPatientProfileKey(trip);
    if (!key) return null;
    return riderProfiles[key] || null;
  };
  const getTripRehabHospitalInfo = trip => {
    if (trip?.hospitalStatus) {
      return {
        type: trip.hospitalStatus.type || 'Hospital',
        startDate: trip.hospitalStatus.startDate || '',
        endDate: trip.hospitalStatus.endDate || '',
        notes: trip.hospitalStatus.notes || '',
        source: 'trip'
      };
    }

    const exclusion = getPatientProfileForTrip(trip)?.exclusion || null;
    const matchingMedicalHold = blacklistEntries.find(entry => entry?.status === 'Active' && matchesPatientIdentity(trip, entry) && String(entry?.category || '').toLowerCase().includes('medical'));
    if (!exclusion && !matchingMedicalHold) return null;

    const reasonSource = `${exclusion?.reason || ''} ${exclusion?.sourceNote || ''} ${matchingMedicalHold?.notes || ''}`.toLowerCase();
    const derivedType = reasonSource.includes('rehab') ? 'Rehab' : 'Hospital';
    return {
      type: derivedType,
      startDate: exclusion?.startDate || '',
      endDate: exclusion?.endDate || matchingMedicalHold?.holdUntil || '',
      notes: exclusion?.sourceNote || matchingMedicalHold?.notes || '',
      source: exclusion ? 'patient-rule' : 'blacklist'
    };
  };
  const tripBlockingMap = useMemo(() => new Map(trips.map(trip => [trip.id, getTripBlockingState({
    trip,
    optOutList,
    blacklistEntries,
    defaultCountryCode: smsData?.sms?.defaultCountryCode,
    tripDateKey: getTripServiceDateKey(trip)
  })])), [blacklistEntries, optOutList, smsData?.sms?.defaultCountryCode, trips]);
  const activeGroupTemplate = useMemo(() => {
    if (legFilter !== 'all' && groupTemplates[legFilter]) return groupTemplates[legFilter];
    if (rideTypeFilter !== 'all' && groupTemplates[rideTypeFilter]) return groupTemplates[rideTypeFilter];
    return '';
  }, [groupTemplates, legFilter, rideTypeFilter]);

  const summary = useMemo(() => ({
    total: trips.length,
    pending: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Pending').length,
    confirmed: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Confirmed').length,
    cancelled: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Cancelled').length,
    needsCall: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Needs Call').length,
    notSent: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Not Sent').length,
    optedOut: trips.filter(trip => getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id)) === 'Opted Out').length,
    rehabHospital: trips.filter(trip => Boolean(getTripRehabHospitalInfo(trip))).length,
    blacklisted: blacklistEntries.filter(entry => entry.status === 'Active').length,
    clones: trips.filter(trip => Boolean(trip?.clonedFromTripId)).length
  }), [blacklistEntries, tripBlockingMap, trips]);

  const handleSummaryCardClick = nextStatusFilter => {
    setResultViewMode('trips');
    setStatusFilter(nextStatusFilter);
    window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  const patientHistoryRows = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    const groups = new Map();

    trips.forEach(trip => {
      const rider = String(trip?.rider || '').trim();
      const phone = String(trip?.patientPhoneNumber || '').trim();
      const key = buildPatientProfileKey(trip);
      if (!key || key === '|') return;

      const dateKey = getTripServiceDateKey(trip);
      if (patientFromDate && (!dateKey || dateKey < patientFromDate)) return;
      if (patientToDate && (!dateKey || dateKey > patientToDate)) return;

      if (term) {
        const haystack = [trip.id, rider, phone, trip.address, trip.destination, trip.notes].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return;
      }

      const confirmationStatus = getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id));
      const responseCode = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
      const status = String(trip?.status || '').trim();
      const notes = String(trip?.notes || '').trim();
      const rehabHospitalInfo = getTripRehabHospitalInfo(trip);
      const hospitalType = String(rehabHospitalInfo?.type || '').trim().toLowerCase();
      const isRehab = hospitalType.includes('rehab');
      const isHospital = Boolean(rehabHospitalInfo) && !isRehab;
      const exclusion = riderProfiles[key]?.exclusion || null;
      const excludedNow = isPatientExclusionActiveForDate(exclusion, dateKey, new Date().toISOString().slice(0, 10));

      const current = groups.get(key) || {
        key,
        rider,
        phone,
        totalTrips: 0,
        completedTrips: 0,
        confirmedTrips: 0,
        notConfirmedTrips: 0,
        callConfirmedTrips: 0,
        smsConfirmedTrips: 0,
        whatsappConfirmedTrips: 0,
        rehabTrips: 0,
        hospitalTrips: 0,
        excludedTrips: 0,
        hasTravelled: false,
        notes: [],
        trips: []
      };

      current.totalTrips += 1;
      current.hasTravelled = true;
      if (isTripCompleted(trip)) current.completedTrips += 1;
      if (confirmationStatus === 'Confirmed') current.confirmedTrips += 1;
      else current.notConfirmedTrips += 1;
      if (responseCode === 'C') current.callConfirmedTrips += 1;
      if (responseCode === 'S') current.smsConfirmedTrips += 1;
      if (responseCode === 'W') current.whatsappConfirmedTrips += 1;
      if (isRehab) current.rehabTrips += 1;
      if (isHospital) current.hospitalTrips += 1;
      if (excludedNow) current.excludedTrips += 1;
      if (notes) current.notes.push(`[${dateKey || 'No date'}] ${notes}`);
      current.trips.push({
        id: trip.id,
        dateKey,
        pickup: formatMinutesAsClock(getTripTimeMinutesForFilter(trip)) || trip.scheduledPickup || trip.pickup || '-',
        dropoff: normalizeTripTimeDisplay(trip.scheduledDropoff || trip.dropoff || '') || '-',
        status,
        completion: isTripCompleted(trip) ? 'Completed' : 'Open',
        confirmationStatus,
        responseCode,
        excluded: excludedNow ? 'Excluded' : 'Active',
        rehabHospital: rehabHospitalInfo ? `${rehabHospitalInfo.type || 'Hospital'} until ${rehabHospitalInfo.endDate || '-'}` : '-',
        note: notes || '-'
      });
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.totalTrips - a.totalTrips || a.rider.localeCompare(b.rider));
  }, [blacklistEntries, patientFromDate, patientSearch, patientToDate, riderProfiles, tripBlockingMap, trips]);

  useEffect(() => {
    if (patientHistoryRows.length === 0) {
      if (selectedPatientKey) setSelectedPatientKey('');
      return;
    }

    if (!selectedPatientKey && patientHistoryRows.length === 1) {
      setSelectedPatientKey(patientHistoryRows[0].key);
      return;
    }

    const exists = patientHistoryRows.some(row => row.key === selectedPatientKey);
    if (!exists && selectedPatientKey) setSelectedPatientKey('');
  }, [patientHistoryRows, selectedPatientKey]);

  const selectedPatientHistory = useMemo(() => {
    if (!selectedPatientKey) return null;
    return patientHistoryRows.find(row => row.key === selectedPatientKey) || null;
  }, [patientHistoryRows, selectedPatientKey]);

  const selectedPatientHistoryAnchorTrip = useMemo(() => {
    if (!selectedPatientHistory) return null;
    const selectedHistoryTripIds = new Set((selectedPatientHistory.trips || []).map(item => String(item?.id || '').trim()).filter(Boolean));
    const exactMatch = trips.find(trip => selectedHistoryTripIds.has(String(trip?.id || '').trim()));
    if (exactMatch) return exactMatch;

    const normalizedPhone = String(selectedPatientHistory.phone || '').replace(/\D/g, '');
    const normalizedRider = String(selectedPatientHistory.rider || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return trips.find(trip => {
      const tripPhone = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
      const tripRider = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (normalizedPhone && tripPhone && normalizedPhone === tripPhone) return true;
      if (normalizedRider && tripRider && normalizedRider === tripRider) return true;
      return false;
    }) || null;
  }, [selectedPatientHistory, trips]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (userPreferencesLoading) return;
    if (outputColumnsHydratedRef.current) return;
    try {
      const parsed = userPreferences?.confirmation?.outputColumns?.length ? userPreferences.confirmation.outputColumns : JSON.parse(window.localStorage.getItem(CONFIRMATION_OUTPUT_COLUMNS_STORAGE_KEY) || 'null');
      if (!parsed) {
        outputColumnsHydratedRef.current = true;
        return;
      }
      setOutputColumns(normalizeConfirmationOutputColumns(parsed));
      outputColumnsHydratedRef.current = true;
    } catch {
      setOutputColumns([...DEFAULT_CONFIRMATION_OUTPUT_COLUMNS]);
      outputColumnsHydratedRef.current = true;
    }
  }, [userPreferences?.confirmation?.outputColumns, userPreferencesLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CONFIRMATION_OUTPUT_COLUMNS_STORAGE_KEY, JSON.stringify(outputColumns));
    if (!userPreferencesLoading) {
      void saveUserPreferences({
        ...userPreferences,
        confirmation: {
          ...userPreferences?.confirmation,
          outputColumns
        }
      });
    }
  }, [outputColumns, saveUserPreferences, userPreferences, userPreferencesLoading]);

  const detectedMaxMilesForWindow = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const applyTimeFilter = primaryFilterMode === 'time';
    const fromMinutes = applyTimeFilter && timeFromFilter ? parseTripClockMinutes(timeFromFilter) : null;
    const toMinutes = applyTimeFilter && timeToFilter ? parseTripClockMinutes(timeToFilter) : null;

    const candidateMiles = trips.filter(trip => {
      const blockingState = tripBlockingMap.get(trip.id);
      const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
      if (statusFilter !== 'all' && confirmationStatus !== statusFilter) return false;
      if (legFilter !== 'all' && getTripLegFilterKey(trip) !== legFilter) return false;
      if (rideTypeFilter !== 'all' && getTripTypeLabel(trip) !== rideTypeFilter) return false;

      const tripDateKey = getTripServiceDateKey(trip);
      if (confirmationDate !== 'all' && (!tripDateKey || tripDateKey !== confirmationDate)) return false;

      const tripTimeMinutes = getTripTimeMinutesForFilter(trip);
      const hasTimeFilter = fromMinutes != null || toMinutes != null;
      if (hasTimeFilter) {
        if (tripTimeMinutes == null) return false;
        if (fromMinutes != null && tripTimeMinutes < fromMinutes) return false;
        if (toMinutes != null && tripTimeMinutes > toMinutes) return false;
      }

      const isInHospitalRehab = trip.hospitalStatus && trip.hospitalStatus.startDate <= today && today <= trip.hospitalStatus.endDate;
      if (isInHospitalRehab) return false;

      return getTripMilesValue(trip) != null;
    }).map(trip => getTripMilesValue(trip)).filter(value => value != null);

    if (candidateMiles.length === 0) return null;
    return Math.max(...candidateMiles);
  }, [confirmationDate, legFilter, primaryFilterMode, rideTypeFilter, statusFilter, timeFromFilter, timeToFilter, tripBlockingMap, trips]);

  useEffect(() => {
    if (isMilesMaxManual) return;
    if (detectedMaxMilesForWindow == null) {
      setMilesMaxFilter('');
      return;
    }
    setMilesMaxFilter(String(Number(detectedMaxMilesForWindow.toFixed(2))));
  }, [detectedMaxMilesForWindow, isMilesMaxManual]);

  const baseFilteredTrips = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    const matchedTrips = trips.filter(trip => {
      // Check if trip is in hospital/rehab (should be excluded from normal confirmation)
      const isInHospitalRehab = trip.hospitalStatus && trip.hospitalStatus.startDate <= today && today <= trip.hospitalStatus.endDate;

      const blockingState = tripBlockingMap.get(trip.id);
      const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
      if (statusFilter !== 'all' && confirmationStatus !== statusFilter) return false;
      if (legFilter !== 'all' && getTripLegFilterKey(trip) !== legFilter) return false;
      if (rideTypeFilter !== 'all' && getTripTypeLabel(trip) !== rideTypeFilter) return false;

      if (isInHospitalRehab) return false;

      // Filter by date
      const tripDateKey = getTripServiceDateKey(trip);
      if (confirmationDate !== 'all') {
        if (!tripDateKey || tripDateKey !== confirmationDate) return false;
      }

      const riderProfile = getPatientProfileForTrip(trip);
      const hasActiveBlacklistBlock = blockingState?.source === 'blacklist';
      if (!hasActiveBlacklistBlock && isPatientExclusionActiveForDate(riderProfile?.exclusion, tripDateKey, confirmationDate !== 'all' ? confirmationDate : today)) return false;

      if (!normalizedSearch) return true;
      const haystack = [trip.id, trip.rider, trip.patientPhoneNumber, trip.address, trip.destination, trip.confirmation?.lastResponseText].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    return Array.from(new Map(matchedTrips.map(trip => [String(trip.id), trip])).values());
  }, [confirmationDate, legFilter, rideTypeFilter, search, statusFilter, tripBlockingMap, trips]);

  const timeWindowMatchedTripIds = useMemo(() => {
    const fromMinutes = timeFromFilter ? parseTripClockMinutes(timeFromFilter) : null;
    const toMinutes = timeToFilter ? parseTripClockMinutes(timeToFilter) : null;
    const hasTimeFilter = fromMinutes != null || toMinutes != null;
    if (!hasTimeFilter) return new Set(baseFilteredTrips.map(trip => trip.id));

    return new Set(baseFilteredTrips.filter(trip => {
      const tripTimeMinutes = getTripTimeMinutesForFilter(trip);
      if (tripTimeMinutes == null) return false;
      if (fromMinutes != null && tripTimeMinutes < fromMinutes) return false;
      if (toMinutes != null && tripTimeMinutes > toMinutes) return false;
      return true;
    }).map(trip => trip.id));
  }, [baseFilteredTrips, timeFromFilter, timeToFilter]);

  const existingMilesRows = useMemo(() => {
    const milesMap = new Map();
    baseFilteredTrips.forEach(trip => {
      const milesValue = getTripMilesValue(trip);
      if (milesValue == null) return;
      const key = Number(milesValue.toFixed(2)).toString();
      milesMap.set(key, (milesMap.get(key) || 0) + 1);
    });
    return Array.from(milesMap.entries()).map(([miles, tripsCount]) => ({
      miles: Number(miles),
      tripsCount
    })).sort((a, b) => b.miles - a.miles);
  }, [baseFilteredTrips]);

  const milesOptionValuesDesc = useMemo(() => {
    const values = existingMilesRows.map(item => Number(item.miles.toFixed(2)));
    if (!values.some(value => Math.abs(value - 25) < 0.0001)) values.push(25);
    return Array.from(new Set(values)).sort((a, b) => b - a);
  }, [existingMilesRows]);

  const milesOptionValuesAsc = useMemo(() => [...milesOptionValuesDesc].sort((a, b) => a - b), [milesOptionValuesDesc]);

  const milesRangeMatchedTripIds = useMemo(() => {
    const parsedMin = Number(milesMinFilter);
    const parsedMax = Number(milesMaxFilter);
    const rawMinMiles = milesMinFilter === '' || !Number.isFinite(parsedMin) ? null : parsedMin;
    const rawMaxMiles = milesMaxFilter === '' || !Number.isFinite(parsedMax) ? null : parsedMax;
    const hasMinMiles = Number.isFinite(rawMinMiles);
    const hasMaxMiles = Number.isFinite(rawMaxMiles);
    const minMiles = hasMinMiles && hasMaxMiles ? Math.min(rawMinMiles, rawMaxMiles) : rawMinMiles;
    const maxMiles = hasMinMiles && hasMaxMiles ? Math.max(rawMinMiles, rawMaxMiles) : rawMaxMiles;
    const normalizedMinMiles = Number.isFinite(minMiles) ? Number(minMiles.toFixed(2)) : null;
    const normalizedMaxMiles = Number.isFinite(maxMiles) ? Number(maxMiles.toFixed(2)) : null;
    const epsilon = 0.0001;

    const hasMilesFilter = minMiles != null || maxMiles != null;
    if (!hasMilesFilter) return new Set(baseFilteredTrips.map(trip => trip.id));

    return new Set(baseFilteredTrips.filter(trip => {
      const tripMiles = getTripMilesValue(trip);
      if (tripMiles == null) return false;
      const normalizedTripMiles = Number(tripMiles.toFixed(2));
      if (normalizedMinMiles != null && normalizedTripMiles < normalizedMinMiles - epsilon) return false;
      if (normalizedMaxMiles != null && normalizedTripMiles > normalizedMaxMiles + epsilon) return false;
      return true;
    }).map(trip => trip.id));
  }, [baseFilteredTrips, milesMaxFilter, milesMinFilter]);

  const filteredTrips = useMemo(() => {
    const sourceTrips = primaryFilterMode === 'time' ? baseFilteredTrips.filter(trip => timeWindowMatchedTripIds.has(trip.id)) : primaryFilterMode === 'miles' ? baseFilteredTrips.filter(trip => milesRangeMatchedTripIds.has(trip.id)) : baseFilteredTrips;

    const dedupedTrips = Array.from(new Map(sourceTrips.map(trip => [buildTripDedupKey(trip), trip])).values());

    return [...dedupedTrips].sort((leftTrip, rightTrip) => {
      const leftMiles = getTripMilesValue(leftTrip);
      const rightMiles = getTripMilesValue(rightTrip);
      const leftValue = leftMiles == null ? Number.NEGATIVE_INFINITY : leftMiles;
      const rightValue = rightMiles == null ? Number.NEGATIVE_INFINITY : rightMiles;
      const phoneDirection = getConfirmationSortDirection(milesSortOrder, 'phone');
      const pickupDirection = getConfirmationSortDirection(milesSortOrder, 'pickupTime');
      const dropoffDirection = getConfirmationSortDirection(milesSortOrder, 'dropoffTime');
      const legDirection = getConfirmationSortDirection(milesSortOrder, 'leg');
      const typeDirection = getConfirmationSortDirection(milesSortOrder, 'type');

      if (milesSortOrder === 'miles-asc') return leftValue - rightValue;
      if (milesSortOrder === 'miles-desc') return rightValue - leftValue;
      if (milesSortOrder === 'rider-asc') return String(leftTrip.rider || '').localeCompare(String(rightTrip.rider || ''));
      if (milesSortOrder === 'rider-desc') return String(rightTrip.rider || '').localeCompare(String(leftTrip.rider || ''));
      if (milesSortOrder === 'tripId-asc') return String(leftTrip.id || '').localeCompare(String(rightTrip.id || ''));
      if (milesSortOrder === 'tripId-desc') return String(rightTrip.id || '').localeCompare(String(leftTrip.id || ''));
      if (phoneDirection) return compareConfirmationText(leftTrip.patientPhoneNumber, rightTrip.patientPhoneNumber, phoneDirection);
      if (pickupDirection) {
        const leftPickupMinutes = getTripTimeMinutesForFilter(leftTrip);
        const rightPickupMinutes = getTripTimeMinutesForFilter(rightTrip);
        const normalizedLeftMinutes = leftPickupMinutes == null ? Number.MAX_SAFE_INTEGER : leftPickupMinutes;
        const normalizedRightMinutes = rightPickupMinutes == null ? Number.MAX_SAFE_INTEGER : rightPickupMinutes;
        if (normalizedLeftMinutes !== normalizedRightMinutes) {
          return pickupDirection === 'asc' ? normalizedLeftMinutes - normalizedRightMinutes : normalizedRightMinutes - normalizedLeftMinutes;
        }
        const leftPickupLabel = formatMinutesAsClock(leftPickupMinutes) || leftTrip?.scheduledPickup || leftTrip?.pickup || '-';
        const rightPickupLabel = formatMinutesAsClock(rightPickupMinutes) || rightTrip?.scheduledPickup || rightTrip?.pickup || '-';
        return compareConfirmationText(leftPickupLabel, rightPickupLabel, pickupDirection);
      }
      if (dropoffDirection) {
        const leftDropoffLabel = normalizeTripTimeDisplay(leftTrip?.scheduledDropoff || leftTrip?.dropoff || '-');
        const rightDropoffLabel = normalizeTripTimeDisplay(rightTrip?.scheduledDropoff || rightTrip?.dropoff || '-');
        const leftDropoffMinutes = parseTripClockMinutes(leftDropoffLabel);
        const rightDropoffMinutes = parseTripClockMinutes(rightDropoffLabel);
        const normalizedLeftMinutes = leftDropoffMinutes == null ? Number.MAX_SAFE_INTEGER : leftDropoffMinutes;
        const normalizedRightMinutes = rightDropoffMinutes == null ? Number.MAX_SAFE_INTEGER : rightDropoffMinutes;
        if (normalizedLeftMinutes !== normalizedRightMinutes) {
          return dropoffDirection === 'asc' ? normalizedLeftMinutes - normalizedRightMinutes : normalizedRightMinutes - normalizedLeftMinutes;
        }
        return compareConfirmationText(leftDropoffLabel, rightDropoffLabel, dropoffDirection);
      }
      if (legDirection) return compareConfirmationText(getTripLegFilterKey(leftTrip), getTripLegFilterKey(rightTrip), legDirection);
      if (typeDirection) return compareConfirmationText(getTripTypeLabel(leftTrip), getTripTypeLabel(rightTrip), typeDirection);
      return rightValue - leftValue;
    });
  }, [baseFilteredTrips, milesSortOrder, milesRangeMatchedTripIds, primaryFilterMode, timeWindowMatchedTripIds]);

  const visibleTripIds = useMemo(() => filteredTrips.map(trip => trip.id), [filteredTrips]);
  const allVisibleSelected = visibleTripIds.length > 0 && visibleTripIds.every(tripId => selectedTripIds.includes(tripId));
  const visibleSelectedTripIds = useMemo(() => selectedTripIds.filter(tripId => visibleTripIds.includes(tripId)), [selectedTripIds, visibleTripIds]);

  useEffect(() => {
    const next = selectedTripIds.filter(tripId => visibleTripIds.includes(tripId));
    const hasChanged = next.length !== selectedTripIds.length || next.some((id, index) => id !== selectedTripIds[index]);
    if (hasChanged) setSelectedTripIds(next);
  }, [selectedTripIds, visibleTripIds]);

  const toggleTripSelection = tripId => {
    setSelectedTripIds(current => current.includes(tripId) ? current.filter(id => id !== tripId) : [...current, tripId]);
  };

  const handleConfirmationTableSort = columnKey => {
    setMilesSortOrder(currentSort => getConfirmationSortDirection(currentSort, columnKey) === 'asc' ? `${columnKey}-desc` : `${columnKey}-asc`);
  };

  const handleConfirmationColumnDrop = targetColumnKey => {
    if (!draggingOutputColumnKey || draggingOutputColumnKey === targetColumnKey) return;
    setOutputColumns(current => {
      const sourceIndex = current.indexOf(draggingOutputColumnKey);
      const targetIndex = current.indexOf(targetColumnKey);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const nextColumns = [...current];
      const [movedKey] = nextColumns.splice(sourceIndex, 1);
      nextColumns.splice(targetIndex, 0, movedKey);
      return nextColumns;
    });
    setDraggingOutputColumnKey(null);
  };

  const renderConfirmationHeaderCell = columnKey => {
    const direction = getConfirmationSortDirection(milesSortOrder, columnKey);
    const label = confirmationColumnLabels[columnKey] || columnKey;
    const width = CONFIRMATION_TABLE_COLUMN_WIDTHS[columnKey];
    const isSortable = CONFIRMATION_TABLE_SORTABLE_COLUMNS.has(columnKey);
    return <th
      key={`header-${columnKey}`}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        cursor: 'grab',
        opacity: draggingOutputColumnKey === columnKey ? 0.6 : 1
      }}
      draggable
      onDragStart={() => setDraggingOutputColumnKey(columnKey)}
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault();
        handleConfirmationColumnDrop(columnKey);
      }}
      onDragEnd={() => setDraggingOutputColumnKey(null)}
    >
      {isSortable ? <button type="button" onClick={() => handleConfirmationTableSort(columnKey)} className="btn btn-link text-decoration-none text-reset p-0 d-inline-flex align-items-center gap-1 fw-semibold">
          <span>{label}</span>
          <span className="small">{direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}</span>
        </button> : <span className="fw-semibold">{label}</span>}
    </th>;
  };

  const renderConfirmationDataCell = (trip, columnKey, confirmationStatus, isOptedOut, riderProfile) => {
    switch (columnKey) {
      case 'tripId':
        return <td key={columnKey} className="fw-semibold">{trip.id}</td>;
      case 'rider':
        return <td key={columnKey} style={{ width: CONFIRMATION_TABLE_COLUMN_WIDTHS.rider, minWidth: CONFIRMATION_TABLE_COLUMN_WIDTHS.rider, maxWidth: CONFIRMATION_TABLE_COLUMN_WIDTHS.rider }}>
          <div>{trip.rider}</div>
          {riderProfile?.companion ? <div className="small text-info">Companion: {riderProfile.companion}</div> : null}
          {riderProfile?.mobility ? <div className="small text-warning">Mobility: {riderProfile.mobility}</div> : null}
        </td>;
      case 'phone':
        return <td key={columnKey}>{trip.patientPhoneNumber || '-'}</td>;
      case 'pickupTime':
        return <React.Fragment key={columnKey}>{renderInlineConfirmationTimeCell(trip, 'pickup', getTripDisplayPickupTime(trip))}</React.Fragment>;
      case 'pickupAddress':
        return <React.Fragment key={columnKey}>{renderInlineConfirmationTimeCell(trip, 'pickupAddress', formatAddressForPrint(trip.address))}</React.Fragment>;
      case 'puZip':
        return <td key={columnKey}>{getTripPickupZipValue(trip)}</td>;
      case 'dropoffTime':
        return <React.Fragment key={columnKey}>{renderInlineConfirmationTimeCell(trip, 'dropoff', getTripDisplayDropoffTime(trip))}</React.Fragment>;
      case 'dropoffAddress':
        return <React.Fragment key={columnKey}>{renderInlineConfirmationTimeCell(trip, 'dropoffAddress', formatAddressForPrint(trip.destination))}</React.Fragment>;
      case 'doZip':
        return <td key={columnKey}>{getTripDropoffZipValue(trip)}</td>;
      case 'miles':
        return <td key={columnKey}>{getTripMilesDisplay(trip)}</td>;
      case 'leg':
        return <td key={columnKey}>{getTripLegFilterKey(trip)}</td>;
      case 'type':
        return <td key={columnKey}>{getTripTypeLabel(trip)}</td>;
      case 'doNotConfirm':
        return <td key={columnKey}>{isOptedOut ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>Blocked</Badge> : <Badge bg="success">Allowed</Badge>}</td>;
      case 'hospitalRehab':
        return <td key={columnKey}>
          {trip.hospitalStatus ? <div>
              <Badge bg={isHospitalRehabActive(trip) ? 'warning' : 'secondary'} style={{ color: isHospitalRehabActive(trip) ? '#111827' : '#ffffff' }}>
                {trip.hospitalStatus.type}: {trip.hospitalStatus.endDate}
              </Badge>
              {isHospitalRehabActive(trip) ? <div className="small text-muted mt-1">Active until {trip.hospitalStatus.endDate}</div> : <div className="small text-muted mt-1">Expired</div>}
            </div> : <Button size="sm" variant="outline-secondary" onClick={() => handleOpenHospitalRehabModal(trip)} style={{ minWidth: 100 }}>
              + Rehab Hospital
            </Button>}
        </td>;
      case 'confirmation':
        return <td key={columnKey}>{confirmationStatus === 'Opted Out' ? <Badge style={{ backgroundColor: '#000000', color: '#ffffff' }}>{confirmationStatus}</Badge> : confirmationStatus === 'Disconnected' ? <Badge style={DISCONNECTED_BADGE_STYLE}>{confirmationStatus}</Badge> : <Badge bg={STATUS_VARIANTS[confirmationStatus] || 'secondary'}>{confirmationStatus}</Badge>}{trip.confirmation?.lastResponseCode ? <Badge bg="light" text="dark" className="ms-1">{trip.confirmation.lastResponseCode}</Badge> : null}</td>;
      case 'dispatchStatus':
        return <td key={columnKey}>
            <div>{trip.safeRideStatus || trip.status || '-'}</div>
            {trip.completedByDriverName ? <div className="small text-info mt-1">Driven by {trip.completedByDriverName}</div> : null}
            {trip.riderSignatureData || trip.riderSignatureName ? <Badge bg="secondary" className="mt-1">Signature captured</Badge> : null}
            {trip.riderSignatureData || trip.riderSignatureName ? <RiderSignaturePreview trip={trip} /> : null}
          </td>;
      case 'reply':
        return <td key={columnKey} style={{ maxWidth: 180, whiteSpace: 'normal' }}>{trip.confirmation?.lastResponseText || '-'}</td>;
      case 'sent':
        return <td key={columnKey}>{trip.confirmation?.sentAt ? new Date(trip.confirmation.sentAt).toLocaleString() : '-'}</td>;
      case 'responded':
        return <td key={columnKey}>{trip.confirmation?.respondedAt ? new Date(trip.confirmation.respondedAt).toLocaleString() : '-'}</td>;
      case 'internalNotes':
        return <td key={columnKey} style={{ maxWidth: 180, whiteSpace: 'normal' }} title={String(trip.notes || '').trim() || '-'}>
            {getTripNotesPreview(trip.notes)}
          </td>;
      default:
        return null;
    }
  };

  const handleToggleAllVisible = checked => {
    if (checked) {
      setSelectedTripIds(current => Array.from(new Set([...current, ...visibleTripIds])));
      return;
    }
    setSelectedTripIds(current => current.filter(id => !visibleTripIds.includes(id)));
  };

  const handleToggleOptOut = async trip => {
    const blockingState = tripBlockingMap.get(trip.id) || getTripBlockingState({
      trip,
      optOutList,
      blacklistEntries,
      defaultCountryCode: smsData?.sms?.defaultCountryCode
    });

    if (blockingState.blacklistEntry) {
      setCustomStatus('This patient is blocked by an Active Black List entry. Remove it in Black List to unblock.');
      return;
    }

    if (blockingState.optOutEntry) {
      await saveSmsData({
        sms: {
          ...(smsData?.sms || {}),
          optOutList: optOutList.filter(entry => entry.id !== blockingState.optOutEntry.id)
        }
      });
      updateTripRecord(trip.id, {
        confirmation: {
          ...(trip.confirmation || {}),
          status: 'Not Sent',
          provider: '',
          respondedAt: '',
          lastResponseText: 'Unblocked by dispatcher',
          lastResponseCode: 'UB'
        },
        confirmationSignal: {
          status: 'Not Sent',
          provider: '',
          methodCode: 'UB',
          message: 'Unblocked by dispatcher',
          eventType: 'unblock',
          source: 'confirmation-workspace',
          updatedAt: new Date().toISOString()
        }
      });
      setCustomStatus('Patient removed from temporary do-not-confirm list.');
      return;
    }

    setBlockReasonModalTrip(trip);
    setBlockReasonType('other');
    setBlockReasonNote('');
  };

  const handleConfirmBlockReason = async () => {
    if (!blockReasonModalTrip) return;
    const trip = blockReasonModalTrip;
    const patientKey = buildPatientProfileKey(trip);
    const reasonLabel = BLOCK_REASON_OPTIONS.find(option => option.value === blockReasonType)?.label || 'Other reason';
    const details = blockReasonNote.trim();
    const reasonText = details ? `${reasonLabel}: ${details}` : reasonLabel;

    if (blockReasonType === 'hospital-rehab') {
      setPendingHospitalRehabTrip(trip);
      setBlockReasonModalTrip(null);
      if (details) setHospitalRehabNotes(details);
      setCustomStatus('Complete the Hospital/Rehab modal to finish blocking this patient.');
      return;
    }

    const nowIso = new Date().toISOString();
    const normalizedTripPhone = String(trip.patientPhoneNumber || '').replace(/\D/g, '');
    const normalizedRider = String(trip.rider || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const isSamePatient = entry => {
      const entryPhone = String(entry?.phone || '').replace(/\D/g, '');
      const entryName = String(entry?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (entryPhone && normalizedTripPhone && entryPhone === normalizedTripPhone) return true;
      if (entryName && normalizedRider && entryName === normalizedRider) return true;
      return false;
    };

    const existingIndex = blacklistEntries.findIndex(entry => isSamePatient(entry));
    const nextBlacklistEntries = existingIndex >= 0 ? blacklistEntries.map((entry, index) => {
      if (index !== existingIndex) return entry;
      const mergedNote = [String(entry.notes || '').trim(), `[UPDATED BLOCK] ${reasonText}`].filter(Boolean).join(' | ');
      return {
        ...entry,
        category: blockReasonType === 'hospital-rehab' ? 'Medical Hold' : entry.category || 'Do Not Schedule',
        status: 'Active',
        holdUntil: '',
        notes: mergedNote,
        source: entry.source || 'Confirmation Block',
        updatedAt: nowIso
      };
    }) : [{
      id: `bl-${Date.now()}`,
      name: trip.rider || '',
      phone: trip.patientPhoneNumber || '',
      category: blockReasonType === 'hospital-rehab' ? 'Medical Hold' : 'Do Not Schedule',
      status: 'Active',
      holdUntil: '',
      notes: reasonText,
      source: 'Confirmation Block',
      createdAt: nowIso,
      updatedAt: nowIso
    }, ...blacklistEntries];

    const cleanedOptOutList = optOutList.filter(entry => !isSamePatient(entry));

    const nextRiderProfiles = {
      ...riderProfiles
    };
    if (patientKey && nextRiderProfiles[patientKey]) {
      const nextProfile = {
        ...nextRiderProfiles[patientKey],
        updatedAt: nowIso
      };
      delete nextProfile.exclusion;
      nextRiderProfiles[patientKey] = nextProfile;
    }

    try {
      await Promise.all([
        saveBlacklistData({
          version: blacklistData?.version ?? 1,
          entries: nextBlacklistEntries
        }),
        saveSmsData({
          sms: {
            ...(smsData?.sms || {}),
            optOutList: cleanedOptOutList,
            riderProfiles: nextRiderProfiles
          }
        })
      ]);

      updateTripRecord(trip.id, {
        confirmation: {
          ...(trip.confirmation || {}),
          status: 'Opted Out',
          provider: 'block',
          respondedAt: new Date().toISOString(),
          lastResponseText: `Blocked: ${reasonText}`,
          lastResponseCode: 'B'
        },
        confirmationSignal: {
          status: 'Opted Out',
          provider: 'block',
          methodCode: 'B',
          message: `Blocked: ${reasonText}`,
          eventType: 'block',
          source: 'confirmation-workspace',
          updatedAt: new Date().toISOString()
        },
        notes: [String(trip.notes || '').trim(), `[BLOCK] ${new Date().toLocaleString()}: ${reasonText}`].filter(Boolean).join('\n')
      });

      setBlockReasonModalTrip(null);
      setBlockReasonType('other');
      setBlockReasonNote('');
      setCustomStatus('Patient blocked in Black List. Future trips will stay visible, but confirmation remains blocked until manually removed.');
    } catch (error) {
      setCustomStatus(`Could not block patient: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleSendCustomMessage = async () => {
    if (visibleSelectedTripIds.length === 0) {
      setCustomStatus('Select at least one trip to send a Custom SMS.');
      return;
    }
    if (!customMessage.trim()) {
      setCustomStatus('Escribe el mensaje custom antes de enviarlo.');
      return;
    }
    setCustomSending(true);
    try {
      const response = await fetch('/api/integrations/sms/send-custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tripIds: visibleSelectedTripIds,
          message: customMessage
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to send custom SMS');
      await refreshDispatchState({ forceServer: true });
      setCustomStatus(`Custom SMS enviados: ${payload.sentCount}. Fallidos: ${payload.failedCount}.`);
      setCustomMessage('');
    } catch (error) {
      setCustomStatus(error.message || 'No se pudo mandar el Custom SMS.');
    } finally {
      setCustomSending(false);
    }
  };

  const handleSelectVisible = () => {
    setSelectedTripIds(visibleTripIds);
    setCustomStatus(`${visibleTripIds.length} trip(s) seleccionados del grupo visible.`);
  };

  const handleClearSelection = () => {
    setSelectedTripIds([]);
    setCustomStatus('Seleccion limpia.');
  };

  const handleSendGroupConfirmation = () => {
    if (visibleSelectedTripIds.length === 0) {
      setCustomStatus('Select at least one trip to send a confirmation.');
      return;
    }
    
    // Get the actual trip objects
    const tripsToConfirm = filteredTrips.filter(trip => visibleSelectedTripIds.includes(trip.id));
    if (tripsToConfirm.length === 0) {
      setCustomStatus('No matching trips found for selected IDs.');
      return;
    }
    
    // Open confirmation method modal
    handleOpenConfirmationMethod(tripsToConfirm);
  };

  const selectedOutputColumnOptions = useMemo(() => CONFIRMATION_OUTPUT_COLUMN_OPTIONS.filter(option => outputColumns.includes(option.key)), [outputColumns]);
  const confirmationColumnLabels = useMemo(() => ({
    tripId: 'Trip ID',
    rider: 'Rider',
    phone: 'Phone',
    pickupTime: 'Pickup Time',
    pickupAddress: 'PU Address',
    puZip: 'PU ZIP',
    dropoffTime: 'Dropoff Time',
    dropoffAddress: 'DO Address',
    doZip: 'DO ZIP',
    miles: 'Miles',
    leg: 'Leg',
    type: 'Type',
    doNotConfirm: 'Do Not Confirm',
    hospitalRehab: 'Hospital/Rehab',
    confirmation: 'Confirmation',
    dispatchStatus: 'Dispatch Status',
    reply: 'Reply',
    sent: 'Sent',
    responded: 'Responded',
    internalNotes: 'Notes'
  }), []);
  const confirmationTableColumns = useMemo(() => outputColumns.filter(columnKey => Boolean(confirmationColumnLabels[columnKey])), [confirmationColumnLabels, outputColumns]);
  const confirmationTableColumnCount = 1 + confirmationTableColumns.length;

  const handleToggleOutputColumn = columnKey => {
    setOutputColumns(current => {
      const hasColumn = current.includes(columnKey);
      return hasColumn ? current.filter(key => key !== columnKey) : [...current, columnKey];
    });
  };

  const getOutputColumnValue = (trip, columnKey) => {
    const blockingState = tripBlockingMap.get(trip.id) || { isBlocked: false };
    const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
    switch (columnKey) {
      case 'tripId':
        return trip.id || '-';
      case 'rider':
        return trip.rider || '-';
      case 'phone':
        return trip.patientPhoneNumber || '-';
      case 'pickupTime':
        return getTripDisplayPickupTime(trip) || '-';
      case 'pickupAddress':
        return trip.address || '-';
      case 'puZip':
        return getTripPickupZipValue(trip);
      case 'dropoffAddress':
        return trip.destination || '-';
      case 'doZip':
        return getTripDropoffZipValue(trip);
      case 'miles':
        return getTripMilesDisplay(trip);
      case 'leg':
        return getTripLegFilterKey(trip);
      case 'type':
        return getTripTypeLabel(trip);
      case 'doNotConfirm':
        return blockingState.isBlocked ? 'Blocked' : 'Allowed';
      case 'hospitalRehab':
        return trip.hospitalStatus ? `${trip.hospitalStatus.type || 'Hospital'}: ${trip.hospitalStatus.endDate || '-'}` : '-';
      case 'confirmation':
        return confirmationStatus;
      case 'dispatchStatus':
        return trip.safeRideStatus || trip.status || '-';
      case 'reply':
        return trip.confirmation?.lastResponseText || '-';
      case 'sent':
        return trip.confirmation?.sentAt ? new Date(trip.confirmation.sentAt).toLocaleString() : '-';
      case 'responded':
        return trip.confirmation?.respondedAt ? new Date(trip.confirmation.respondedAt).toLocaleString() : '-';
      case 'internalNotes':
        return String(trip.notes || '').trim() || '-';
      default:
        return '-';
    }
  };

  const buildTripOutputLine = trip => selectedOutputColumnOptions.filter(option => option.key !== 'internalNotes').map(option => `${option.label}: ${getOutputColumnValue(trip, option.key)}`).join(' | ');

  const getOutputCellHtml = (trip, columnKey) => {
    const value = getOutputColumnValue(trip, columnKey);
    if (columnKey === 'pickupAddress' || columnKey === 'dropoffAddress' || columnKey === 'internalNotes') {
      return escapeHtml(formatAddressForPrint(value)).replace(/\n/g, '<br/>');
    }
    return escapeHtml(value);
  };

  const handleLoadGroupTemplate = () => {
    if (!activeGroupTemplate) {
      setCustomStatus('Ese grupo no tiene mensaje predeterminado guardado todavia.');
      return;
    }
    setCustomMessage(activeGroupTemplate);
    setCustomStatus('Mensaje predeterminado del grupo cargado en Custom SMS.');
  };

  const handleManualConfirm = (tripId, trip) => {
    // Open confirmation method modal if trip info available
    if (trip) {
      const currentStatus = getEffectiveConfirmationStatus(trip, tripBlockingMap.get(trip.id));
      if (currentStatus === 'Confirmed') {
        const shouldUnconfirm = window.confirm(`Trip ${trip.id} ya esta confirmado. Quieres marcarlo como UNCONFIRM (Not Sent)?`);
        if (!shouldUnconfirm) return;
        applyTripConfirmationState(trip, {
          status: 'Not Sent',
          provider: '',
          methodCode: 'U',
          message: 'Unconfirmed by dispatcher',
          eventType: 'unconfirm',
          noteLine: `[UNCONFIRM] ${new Date().toLocaleString()}: Dispatcher changed status to Not Sent.`
        });
        setCustomStatus(`Trip ${trip.id} cambiado a Unconfirm (Not Sent).`);
        return;
      }
      setConfirmationSourceTrip(trip);
      setConfirmationLegScope('single');
      handleOpenConfirmationMethod([trip]);
    } else {
      setCustomStatus(`Trip ${tripId} listo para confirmacion manual.`);
    }
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

    targetTrips.forEach(targetTrip => {
      applyTripConfirmationState(targetTrip, {
        status: 'Cancelled',
        provider: 'manual',
        methodCode: 'X',
        message: 'Cancelled by dispatcher',
        eventType: 'cancel',
        noteLine: `[CANCELADO] ${new Date().toLocaleString()}: ${cancelNoteDraft}`
      });
    });

    setCancelNoteModal(null);
    setCancelNoteDraft('');
    setCustomStatus(`${targetTrips.length} trip(s) cancelado(s) con nota.`);
  };

  const exportToPDF = () => {
    const exportTrips = selectedTripIds.length > 0 ? filteredTrips.filter(trip => selectedTripIds.includes(trip.id)) : filteredTrips;

    if (exportTrips.length === 0) {
      setCustomStatus('No hay viajes para exportar con el filtro actual.');
      return;
    }
    if (selectedOutputColumnOptions.length === 0) {
      setCustomStatus('Selecciona al menos una columna para exportar.');
      return;
    }

    let htmlContent = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Confirmation Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 12px; font-size: 24px; }
            .meta { margin-bottom: 16px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; table-layout: auto; }
            th, td { border: 1px solid #d1d5db; padding: 6px; font-size: 11px; text-align: left; vertical-align: top; white-space: nowrap; overflow-wrap: normal; word-break: normal; }
            th { background: #f3f4f6; }
            tr { page-break-inside: avoid; }
            th.col-pickupAddress, td.col-pickupAddress, th.col-dropoffAddress, td.col-dropoffAddress {
              min-width: 190px;
              max-width: 220px;
              white-space: normal;
              line-height: 1.2;
            }
            th.col-internalNotes, td.col-internalNotes {
              min-width: 220px;
              max-width: 280px;
              white-space: normal;
              line-height: 1.2;
            }
            @media print {
              @page { size: A4 landscape; margin: 10mm; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Confirmation Report</h1>
          <div class="meta"><strong>Date:</strong> ${confirmationDate} <br /><strong>Time Range:</strong> ${timeFromFilter} - ${timeToFilter} <br /><strong>Total trips:</strong> ${exportTrips.length}</div>
          <table>
            <thead>
              <tr>${selectedOutputColumnOptions.map(option => `<th class="col-${option.key}">${escapeHtml(option.label)}</th>`).join('')}</tr>
            </thead>
            <tbody>
    `;

    exportTrips.forEach(trip => {
      htmlContent += `<tr>${selectedOutputColumnOptions.map(option => `<td class="col-${option.key}">${getOutputCellHtml(trip, option.key)}</td>`).join('')}</tr>`;
    });

    htmlContent += '</tbody></table></body></html>';
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setCustomStatus('El navegador bloqueo la ventana de impresion. Permite pop-ups para esta pagina.');
      return;
    }
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
    setCustomStatus(`Exportando ${exportTrips.length} viaje(s) a PDF.`);
  };

  const handleOpenHospitalRehabModal = trip => {
    setHospitalRehabModal(trip);
    setHospitalRehabError('');
    if (trip.hospitalStatus) {
      setHospitalRehabType(trip.hospitalStatus.type || 'Hospital');
      setHospitalRehabStartDate(trip.hospitalStatus.startDate);
      setHospitalRehabEndDate(trip.hospitalStatus.endDate);
      setHospitalRehabNotes(trip.hospitalStatus.notes || '');
    } else {
      setHospitalRehabType('Hospital');
      setHospitalRehabStartDate(new Date().toISOString().slice(0, 10));
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setHospitalRehabEndDate(endDate.toISOString().slice(0, 10));
      setHospitalRehabNotes('');
    }
  };

  const handleDeleteClonedTrip = trip => {
    if (!trip?.id) return;
    const confirmed = window.confirm(`DELETE COPY ${trip.id}\nOriginal: ${trip.clonedFromTripId || '-'}\nRider: ${trip.rider || '-'}\n\nCannot be undone. Continue?`);
    if (!confirmed) return;
    deleteTripRecord(trip.id);
    setCustomStatus(`Deleted cloned trip ${trip.id}.`);
  };

  const handleSaveHospitalRehab = async () => {
    if (!hospitalRehabModal) return;
    setHospitalRehabError('');
    if (!hospitalRehabStartDate || !hospitalRehabEndDate) {
      setCustomStatus('Selecciona fecha de inicio y fin para Hospital/Rehab.');
      setHospitalRehabError('Selecciona fecha de inicio y fin para Hospital/Rehab.');
      return;
    }
    if (hospitalRehabEndDate < hospitalRehabStartDate) {
      setCustomStatus('La fecha final no puede ser menor que la fecha inicial.');
      setHospitalRehabError('La fecha final no puede ser menor que la fecha inicial.');
      return;
    }
    setHospitalRehabSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const patientKey = buildPatientProfileKey(hospitalRehabModal);
      const normalizedTripPhone = String(hospitalRehabModal.patientPhoneNumber || '').replace(/\D/g, '');
      const normalizedRider = String(hospitalRehabModal.rider || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const isSamePatient = entry => {
        const entryPhone = String(entry?.phone || '').replace(/\D/g, '');
        const entryName = String(entry?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (entryPhone && normalizedTripPhone && entryPhone === normalizedTripPhone) return true;
        if (entryName && normalizedRider && entryName === normalizedRider) return true;
        return false;
      };

      if (patientKey) {
        const existingProfile = riderProfiles[patientKey] || {};
        await saveSmsData({
          sms: {
            ...(smsData?.sms || {}),
            riderProfiles: {
              ...riderProfiles,
              [patientKey]: {
                ...existingProfile,
                exclusion: {
                  mode: 'range',
                  startDate: hospitalRehabStartDate,
                  endDate: hospitalRehabEndDate,
                  reason: `${hospitalRehabType} stay`,
                  sourceNote: hospitalRehabNotes,
                  updatedAt: nowIso
                },
                updatedAt: nowIso
              }
            }
          }
        });
      }

      const matchingBlacklistIndex = blacklistEntries.findIndex(entry => isSamePatient(entry));
      const nextBlacklistEntries = matchingBlacklistIndex >= 0 ? blacklistEntries.map((entry, index) => {
        if (index !== matchingBlacklistIndex) return entry;
        const mergedNote = [String(entry.notes || '').trim(), `[${hospitalRehabType.toUpperCase()}] ${hospitalRehabNotes}`].filter(Boolean).join(' | ');
        return {
          ...entry,
          category: 'Medical Hold',
          status: 'Active',
          holdUntil: hospitalRehabEndDate,
          notes: mergedNote,
          source: 'Confirmation Hospital/Rehab',
          updatedAt: nowIso
        };
      }) : [{
        id: `bl-${Date.now()}`,
        name: hospitalRehabModal.rider || '',
        phone: hospitalRehabModal.patientPhoneNumber || '',
        category: 'Medical Hold',
        status: 'Active',
        holdUntil: hospitalRehabEndDate,
        notes: `[${hospitalRehabType.toUpperCase()}] ${hospitalRehabNotes}`.trim(),
        source: 'Confirmation Hospital/Rehab',
        createdAt: nowIso,
        updatedAt: nowIso
      }, ...blacklistEntries];

      await saveBlacklistData({
        version: blacklistData?.version ?? 1,
        entries: nextBlacklistEntries
      });

      const siblingTrips = getSiblingLegTrips(hospitalRehabModal, trips);
      const matchingTrips = trips.filter(trip => {
        if (patientKey && buildPatientProfileKey(trip) === patientKey) {
          const serviceDate = getTripServiceDateKey(trip);
          return Boolean(serviceDate) && serviceDate >= hospitalRehabStartDate && serviceDate <= hospitalRehabEndDate;
        }
        return isSamePatient({
          name: trip.rider,
          phone: trip.patientPhoneNumber
        });
      });

      const targetTrips = Array.from(new Map([hospitalRehabModal, ...siblingTrips, ...matchingTrips].map(trip => [String(trip.id || ''), trip])).values()).filter(Boolean);
      targetTrips.forEach(trip => {
        if (!trip?.id) return;
        updateTripRecord(trip.id, {
          status: 'Cancelled',
          hospitalStatus: {
            type: hospitalRehabType,
            startDate: hospitalRehabStartDate,
            endDate: hospitalRehabEndDate,
            notes: hospitalRehabNotes,
            createdAt: nowIso
          },
          confirmation: {
            ...(trip.confirmation || {}),
            status: 'Cancelled',
            provider: 'hospital-rehab',
            respondedAt: nowIso,
            lastResponseText: `${hospitalRehabType} until ${hospitalRehabEndDate}`,
            lastResponseCode: 'HR'
          },
          notes: [String(trip.notes || '').trim(), `[AUTO-CANCEL ${hospitalRehabType.toUpperCase()}] ${new Date().toLocaleString()}: until ${hospitalRehabEndDate}. ${hospitalRehabNotes}`.trim()].filter(Boolean).join('\n')
        });
      });

      await refreshDispatchState({ forceServer: true });
      setCustomStatus(`${targetTrips.length} trip(s) marked ${hospitalRehabType} for ${hospitalRehabModal.rider || 'patient'} through ${hospitalRehabEndDate}, including both legs when they exist. New trips in that range will be auto-hidden unless you filter Cancelled.`);
      setHospitalRehabModal(null);
    } catch (error) {
      const message = error?.message || 'Could not save Hospital/Rehab status.';
      setHospitalRehabError(message);
      setCustomStatus(`Could not save Hospital/Rehab status: ${message}`);
    } finally {
      setHospitalRehabSaving(false);
    }
  };

  const handleRemoveHospitalRehab = async trip => {
    const patientKey = buildPatientProfileKey(trip);
    if (patientKey) {
      const existingProfile = riderProfiles[patientKey] || {};
      const nextProfile = { ...existingProfile };
      delete nextProfile.exclusion;
      await saveSmsData({
        sms: {
          ...(smsData?.sms || {}),
          riderProfiles: {
            ...riderProfiles,
            [patientKey]: nextProfile
          }
        }
      });
    }

    const nextBlacklistEntries = blacklistEntries.map(entry => matchesPatientIdentity(trip, entry) && entry?.status === 'Active' && String(entry?.category || '').toLowerCase().includes('medical') ? {
      ...entry,
      status: 'Removed',
      updatedAt: new Date().toISOString()
    } : entry);
    await saveBlacklistData({
      version: blacklistData?.version ?? 1,
      entries: nextBlacklistEntries
    });

    const matchingTrips = trips.filter(candidate => matchesPatientIdentity(trip, {
      name: candidate?.rider,
      phone: candidate?.patientPhoneNumber
    }));
    matchingTrips.forEach(candidate => {
      updateTripRecord(candidate.id, {
        hospitalStatus: null
      });
    });

    await refreshDispatchState({ forceServer: true });
    setCustomStatus(`Hospital/Rehab status removed for ${trip.rider || trip.id}.`);
  };

  const isHospitalRehabActive = trip => {
    if (!trip.hospitalStatus) return false;
    const today = new Date().toISOString().slice(0, 10);
    return trip.hospitalStatus.startDate <= today && today <= trip.hospitalStatus.endDate;
  };

  const handleOpenConfirmationMethod = trips => {
    setConfirmationMethodModal(trips);
    setConfirmationMethod('whatsapp');
  };

  const handleCloseConfirmationMethod = () => {
    setConfirmationMethodModal(null);
    setConfirmationSourceTrip(null);
    setConfirmationLegScope('single');
  };

  const getMethodCode = method => {
    if (method === 'whatsapp') return 'W';
    if (method === 'sms') return 'S';
    if (method === 'call') return 'C';
    if (method === 'call-left-message') return 'CL';
    if (method === 'cancelled-by-patient') return 'CP';
    if (method === 'disconnected') return 'DC';
    if (method === 'sms-left-unconfirmed') return 'SL';
    return 'M';
  };

  const getMethodLabel = method => {
    if (method === 'whatsapp') return 'WhatsApp';
    if (method === 'sms') return 'SMS';
    if (method === 'call') return 'Call';
    if (method === 'call-left-message') return 'Called and left message';
    if (method === 'cancelled-by-patient') return 'Cancelled by patient';
    if (method === 'disconnected') return 'Disconnected';
    if (method === 'sms-left-unconfirmed') return 'Could not confirm, SMS left (English)';
    return 'Manual';
  };

  const buildConfirmationSignalPayload = ({ status, provider, methodCode, message, eventType }) => ({
    status,
    provider,
    methodCode,
    message,
    eventType,
    source: 'confirmation-workspace',
    updatedAt: new Date().toISOString()
  });

  const getTripConfirmActionLabel = (trip, confirmationStatus) => {
    if (confirmationStatus === 'Confirmed') return 'Unconfirm';
    const code = String(trip?.confirmation?.lastResponseCode || '').trim().toUpperCase();
    if (code) return `Confirm (${code})`;
    return 'Confirm';
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

  const getTripDisplayPickupTime = trip => {
    if (trip?.scheduleChange?.newPickup) return `${trip.scheduleChange.newPickup} (NEW)`;
    const formatted = formatMinutesAsClock(getTripTimeMinutesForFilter(trip));
    if (formatted) return formatted;
    return trip?.scheduledPickup || trip?.pickup || '-';
  };

  const getTripDisplayDropoffTime = trip => {
    if (trip?.scheduleChange?.newDropoff) return `${trip.scheduleChange.newDropoff} (NEW)`;
    return normalizeTripTimeDisplay(trip?.scheduledDropoff || trip?.dropoff || '') || '-';
  };

  const getRiderProfileKey = trip => {
    const phoneKey = String(trip?.patientPhoneNumber || '').replace(/\D/g, '');
    if (phoneKey) return `phone:${phoneKey}`;
    const riderKey = String(trip?.rider || '').trim().toLowerCase().replace(/\s+/g, '-');
    return riderKey ? `rider:${riderKey}` : '';
  };

  const getRiderProfile = trip => {
    const key = getRiderProfileKey(trip);
    if (!key) return null;
    return riderProfiles[key] || null;
  };

  const handleOpenPatientStatusModal = () => {
    if (!selectedPatientHistory) return;
    const currentExclusion = riderProfiles[selectedPatientHistory.key]?.exclusion;
    setPatientStatusMode(currentExclusion?.mode || 'always');
    setPatientStatusStartDate(currentExclusion?.startDate || new Date().toISOString().slice(0, 10));
    setPatientStatusEndDate(currentExclusion?.endDate || new Date().toISOString().slice(0, 10));
    setPatientStatusReason(currentExclusion?.reason || 'Rehab stay');
    setPatientStatusSourceNote(currentExclusion?.sourceNote || '');
    setPatientStatusModalOpen(true);
  };

  const handleSavePatientStatus = async () => {
    if (!selectedPatientHistory) return;
    const nowIso = new Date().toISOString();
    const existingProfile = riderProfiles[selectedPatientHistory.key] || {};
    const nextExclusion = {
      mode: patientStatusMode,
      startDate: patientStatusStartDate,
      endDate: patientStatusMode === 'range' ? patientStatusEndDate : patientStatusMode === 'single-day' ? patientStatusStartDate : '',
      reason: patientStatusReason,
      sourceNote: patientStatusSourceNote,
      updatedAt: nowIso
    };

    await saveSmsData({
      sms: {
        ...(smsData?.sms || {}),
        riderProfiles: {
          ...riderProfiles,
          [selectedPatientHistory.key]: {
            ...existingProfile,
            exclusion: nextExclusion,
            updatedAt: nowIso
          }
        }
      }
    });

    const matchingTrips = trips.filter(trip => buildPatientProfileKey(trip) === selectedPatientHistory.key);
    matchingTrips.forEach(trip => {
      const noteLine = `[PATIENT EXCLUSION] ${new Date().toLocaleString()}: ${patientStatusReason} (${patientStatusMode}). ${patientStatusSourceNote}`;
      updateTripRecord(trip.id, {
        status: 'Cancelled',
        notes: [String(trip.notes || '').trim(), noteLine].filter(Boolean).join('\n')
      });
    });

    setPatientStatusModalOpen(false);
    setCustomStatus(`Patient rule saved for ${selectedPatientHistory.rider}. Mode: ${patientStatusMode}. Applied to ${matchingTrips.length} trip(s).`);
  };

  const handleClearPatientStatus = async () => {
    if (!selectedPatientHistory) return;
    const existingProfile = riderProfiles[selectedPatientHistory.key] || {};
    const nextProfile = {
      ...existingProfile
    };
    delete nextProfile.exclusion;

    await saveSmsData({
      sms: {
        ...(smsData?.sms || {}),
        riderProfiles: {
          ...riderProfiles,
          [selectedPatientHistory.key]: nextProfile
        }
      }
    });

    setCustomStatus(`Patient rule cleared for ${selectedPatientHistory.rider}.`);
  };

  const handleOpenTripUpdateModal = trip => {
    const profile = getRiderProfile(trip);
    setTripUpdateModal(trip);
    setTripUpdateLegScope('single');
    setTripUpdateConfirmMethod('call');
    setTripUpdatePickupTime(normalizeTripTimeDisplay(trip?.scheduledPickup || trip?.pickup || ''));
    setTripUpdateDropoffTime(normalizeTripTimeDisplay(trip?.scheduledDropoff || trip?.dropoff || ''));
    setTripUpdatePickupAddress(String(trip?.address || ''));
    setTripUpdateDropoffAddress(String(trip?.destination || ''));
    setTripUpdateNote('');
    setTripUpdateCompanionNote(String(profile?.companion || ''));
    setTripUpdateMobilityNote(String(profile?.mobility || ''));
  };

  const tripUpdateSiblingTrips = useMemo(() => tripUpdateModal ? getSiblingLegTrips(tripUpdateModal, trips) : EMPTY_ARRAY, [tripUpdateModal, trips]);
  const tripUpdateSupportsBothLegs = tripUpdateSiblingTrips.length > 0;

  const isInlineConfirmationTimeEditing = (tripId, columnKey) => inlineTimeEditCell?.tripId === tripId && inlineTimeEditCell?.columnKey === columnKey;

  const handleStartInlineConfirmationTimeEdit = (trip, columnKey) => {
    if (!trip || !INLINE_CONFIRMATION_EDITABLE_COLUMNS.has(columnKey)) return;
    setInlineTimeEditCell({ tripId: trip.id, columnKey });
    setInlineTimeEditValue(getInlineConfirmationFieldValue(trip, columnKey));
  };

  const handleCancelInlineConfirmationTimeEdit = () => {
    setInlineTimeEditCell(null);
    setInlineTimeEditValue('');
  };

  const handleSaveInlineConfirmationTimeEdit = trip => {
    if (!trip || !inlineTimeEditCell?.columnKey) return;

    const columnKey = inlineTimeEditCell.columnKey;
    const currentValue = String(getInlineConfirmationFieldValue(trip, columnKey) || '').trim();
    const nextValue = String(inlineTimeEditValue || '').trim();

    if (!nextValue || nextValue === currentValue) {
      handleCancelInlineConfirmationTimeEdit();
      return;
    }

    const oldPickup = normalizeTripTimeDisplay(trip?.scheduledPickup || trip?.pickup || '');
    const oldDropoff = normalizeTripTimeDisplay(trip?.scheduledDropoff || trip?.dropoff || '');
    const newPickup = columnKey === 'pickup' ? nextValue : oldPickup;
    const newDropoff = columnKey === 'dropoff' ? nextValue : oldDropoff;
    const nowIso = new Date().toISOString();
    if (columnKey === 'pickup' || columnKey === 'dropoff') {
      const noteLine = buildScheduleChangeNoteLine({
        actorName: confirmationActor.name,
        oldPickup,
        newPickup,
        oldDropoff,
        newDropoff
      });
      const mergedNotes = [String(trip?.notes || '').trim(), noteLine].filter(Boolean).join('\n');

      updateTripRecord(trip.id, {
        notes: mergedNotes,
        ...(columnKey === 'pickup' ? {
          pickup: nextValue,
          scheduledPickup: nextValue,
          pickupSortValue: buildConfirmationTimeSortValue(trip, nextValue, 'pickupSortValue')
        } : {
          dropoff: nextValue,
          scheduledDropoff: nextValue,
          dropoffSortValue: buildConfirmationTimeSortValue(trip, nextValue, 'dropoffSortValue')
        }),
        scheduleChange: {
          oldPickup,
          newPickup,
          oldDropoff,
          newDropoff,
          changedAt: nowIso,
          updatedById: confirmationActor.id,
          updatedByName: confirmationActor.name,
          marker: 'NEW'
        }
      }, {
        action: 'trip-schedule-inline-update',
        source: 'confirmation-workspace',
        actorId: confirmationActor.id,
        actorName: confirmationActor.name,
        summary: `${confirmationActor.name} changed ${columnKey} time on trip ${String(trip.id || '').trim()}`,
        metadata: {
          tripId: String(trip.id || '').trim(),
          field: columnKey,
          oldValue: currentValue,
          newValue: nextValue
        }
      });

      setCustomStatus(`Time updated on trip ${String(trip.id || '').trim()} by ${confirmationActor.name}.`);
    } else {
      updateTripRecord(trip.id, columnKey === 'pickupAddress' ? {
        address: nextValue
      } : {
        destination: nextValue
      }, {
        action: 'trip-address-inline-update',
        source: 'confirmation-workspace',
        actorId: confirmationActor.id,
        actorName: confirmationActor.name,
        summary: `${confirmationActor.name} changed ${columnKey} on trip ${String(trip.id || '').trim()}`,
        metadata: {
          tripId: String(trip.id || '').trim(),
          field: columnKey,
          oldValue: currentValue,
          newValue: nextValue
        }
      });

      setCustomStatus(`Address updated on trip ${String(trip.id || '').trim()} by ${confirmationActor.name}.`);
    }

    handleCancelInlineConfirmationTimeEdit();
  };

  const renderInlineConfirmationTimeCell = (trip, columnKey, displayValue) => {
    const isEditing = isInlineConfirmationTimeEditing(trip.id, columnKey);
    const changedBy = String(trip?.scheduleChange?.updatedByName || '').trim();
    const isAddressField = columnKey === 'pickupAddress' || columnKey === 'dropoffAddress';
    return <td style={{ cursor: 'text', whiteSpace: isAddressField ? 'pre-line' : undefined }} onDoubleClick={() => handleStartInlineConfirmationTimeEdit(trip, columnKey)} title={isAddressField ? 'Double-click to edit address' : 'Double-click to edit time'}>
        {isEditing ? isAddressField ? <Form.Control
          as="textarea"
          rows={3}
          size="sm"
          autoFocus
          value={inlineTimeEditValue}
          placeholder={columnKey === 'pickupAddress' ? 'Pickup address' : 'Dropoff address'}
          onChange={event => setInlineTimeEditValue(event.target.value)}
          onBlur={() => handleSaveInlineConfirmationTimeEdit(trip)}
          onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            handleCancelInlineConfirmationTimeEdit();
          }
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            handleSaveInlineConfirmationTimeEdit(trip);
          }
        }}
        /> : <Form.Control
          size="sm"
          autoFocus
          value={inlineTimeEditValue}
          placeholder="e.g. 07:30 AM"
          onChange={event => setInlineTimeEditValue(event.target.value)}
          onBlur={() => handleSaveInlineConfirmationTimeEdit(trip)}
          onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleSaveInlineConfirmationTimeEdit(trip);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            handleCancelInlineConfirmationTimeEdit();
          }
        }}
        /> : <>
            <span style={{ borderBottom: '1px dashed rgba(107, 114, 128, 0.5)', display: 'inline-block' }}>{displayValue || '-'}</span>
            {changedBy ? <div className="small text-muted mt-1">Changed by {changedBy}</div> : null}
          </>}
      </td>;
  };

  const handleSaveTripUpdate = async () => {
    if (!tripUpdateModal) return;
    const nowIso = new Date().toISOString();
    const methodLabel = getMethodLabel(tripUpdateConfirmMethod);
    const isSmsLeftUnconfirmed = tripUpdateConfirmMethod === 'sms-left-unconfirmed';
    const isCallLeftMessage = tripUpdateConfirmMethod === 'call-left-message';
    const isCancelledByPatient = tripUpdateConfirmMethod === 'cancelled-by-patient';
    const isDisconnected = tripUpdateConfirmMethod === 'disconnected';
    const oldPickup = normalizeTripTimeDisplay(tripUpdateModal.scheduledPickup || tripUpdateModal.pickup || '');
    const oldDropoff = normalizeTripTimeDisplay(tripUpdateModal.scheduledDropoff || tripUpdateModal.dropoff || '');
    const newPickup = String(tripUpdatePickupTime || '').trim();
    const newDropoff = String(tripUpdateDropoffTime || '').trim();
    const pickupChanged = Boolean(newPickup) && newPickup !== oldPickup;
    const dropoffChanged = Boolean(newDropoff) && newDropoff !== oldDropoff;
    const newPickupAddress = String(tripUpdatePickupAddress || '').trim();
    const newDropoffAddress = String(tripUpdateDropoffAddress || '').trim();
    const pickupAddressChanged = newPickupAddress !== String(tripUpdateModal.address || '').trim();
    const dropoffAddressChanged = newDropoffAddress !== String(tripUpdateModal.destination || '').trim();
    const effectivePickup = newPickup || oldPickup;
    const effectiveDropoff = newDropoff || oldDropoff;

    const detailLines = [];
    if (isSmsLeftUnconfirmed) {
      detailLines.push(`[CONFIRMATION] ${new Date().toLocaleString()}: Could not confirm by phone. English SMS was left for follow-up.`);
    } else if (isCallLeftMessage) {
      detailLines.push(`[CONFIRMATION] ${new Date().toLocaleString()}: Called patient and left a message.`);
    } else if (isCancelledByPatient) {
      detailLines.push(`[CONFIRMATION] ${new Date().toLocaleString()}: Trip cancelled by patient.`);
    } else if (isDisconnected) {
      detailLines.push(`[CONFIRMATION] ${new Date().toLocaleString()}: Phone disconnected.`);
    } else {
      detailLines.push(`[CONFIRMATION] ${new Date().toLocaleString()}: Confirmed via ${methodLabel}.`);
    }
    if (pickupChanged || dropoffChanged) {
      detailLines.push(buildScheduleChangeNoteLine({
        actorName: confirmationActor.name,
        oldPickup,
        newPickup: effectivePickup,
        oldDropoff,
        newDropoff: effectiveDropoff
      }));
    }
    if (pickupAddressChanged) detailLines.push(`[ADDRESS UPDATE] PU: ${tripUpdateModal.address || '-'} -> ${newPickupAddress || '-'}`);
    if (dropoffAddressChanged) detailLines.push(`[ADDRESS UPDATE] DO: ${tripUpdateModal.destination || '-'} -> ${newDropoffAddress || '-'}`);
    if (tripUpdateCompanionNote.trim()) detailLines.push(`[PASSENGER NOTE] ${tripUpdateCompanionNote.trim()}`);
    if (tripUpdateMobilityNote.trim()) detailLines.push(`[MOBILITY NOTE] ${tripUpdateMobilityNote.trim()}`);
    if (tripUpdateNote.trim()) detailLines.push(`[DISPATCH NOTE] ${tripUpdateNote.trim()}`);

    const targetTrips = tripUpdateLegScope === 'both' ? [tripUpdateModal, ...tripUpdateSiblingTrips] : [tripUpdateModal];

    targetTrips.forEach(targetTrip => {
      const targetOldPickup = normalizeTripTimeDisplay(targetTrip?.scheduledPickup || targetTrip?.pickup || '');
      const targetOldDropoff = normalizeTripTimeDisplay(targetTrip?.scheduledDropoff || targetTrip?.dropoff || '');
      const isPrimaryTrip = String(targetTrip?.id || '') === String(tripUpdateModal?.id || '');
      const targetPickup = isPrimaryTrip ? effectivePickup : targetOldPickup;
      const targetDropoff = isPrimaryTrip ? effectiveDropoff : targetOldDropoff;
      const targetPickupChanged = isPrimaryTrip && pickupChanged;
      const targetDropoffChanged = isPrimaryTrip && dropoffChanged;
      const targetDetailLines = [...detailLines];
      const targetMergedNotes = [String(targetTrip?.notes || '').trim(), targetDetailLines.join('\n')].filter(Boolean).join('\n');

      updateTripRecord(targetTrip.id, {
        status: isCancelledByPatient ? 'Cancelled' : targetTrip.status,
        pickup: targetPickup,
        scheduledPickup: targetPickup,
        pickupSortValue: buildConfirmationTimeSortValue(targetTrip, targetPickup, 'pickupSortValue'),
        dropoff: targetDropoff,
        scheduledDropoff: targetDropoff,
        dropoffSortValue: buildConfirmationTimeSortValue(targetTrip, targetDropoff, 'dropoffSortValue'),
        address: newPickupAddress || targetTrip.address || '',
        destination: newDropoffAddress || targetTrip.destination || '',
        notes: targetMergedNotes,
        confirmation: {
          ...(targetTrip.confirmation || {}),
          status: isCancelledByPatient ? 'Cancelled' : isDisconnected ? 'Disconnected' : isSmsLeftUnconfirmed || isCallLeftMessage ? 'Needs Call' : 'Confirmed',
          provider: tripUpdateConfirmMethod,
          respondedAt: isCancelledByPatient ? '' : nowIso,
          lastResponseText: isCancelledByPatient ? 'Cancelled by patient.' : isSmsLeftUnconfirmed ? 'Could not confirm, English SMS left.' : isCallLeftMessage ? 'Called and left message.' : isDisconnected ? 'Disconnected.' : `Confirmed via ${methodLabel}`,
          lastResponseCode: getMethodCode(tripUpdateConfirmMethod)
        },
        scheduleChange: targetPickupChanged || targetDropoffChanged ? {
          oldPickup: targetOldPickup,
          newPickup: targetPickup,
          oldDropoff: targetOldDropoff,
          newDropoff: targetDropoff,
          changedAt: nowIso,
          updatedById: confirmationActor.id,
          updatedByName: confirmationActor.name,
          marker: 'NEW'
        } : targetTrip.scheduleChange || null,
        passengerProfile: {
          ...(targetTrip.passengerProfile || {}),
          companion: tripUpdateCompanionNote.trim(),
          mobility: tripUpdateMobilityNote.trim(),
          updatedAt: nowIso
        }
      }, {
        action: targetPickupChanged || targetDropoffChanged ? 'trip-confirmation-schedule-update' : 'trip-confirmation-update',
        source: 'confirmation-workspace',
        actorId: confirmationActor.id,
        actorName: confirmationActor.name,
        summary: targetPickupChanged || targetDropoffChanged ? `${confirmationActor.name} updated confirmation and changed the schedule for trip ${String(targetTrip.id || '').trim()}` : `${confirmationActor.name} updated confirmation for trip ${String(targetTrip.id || '').trim()}`,
        metadata: {
          tripId: String(targetTrip.id || '').trim(),
          method: tripUpdateConfirmMethod,
          oldPickup: targetOldPickup,
          newPickup: targetPickup,
          oldDropoff: targetOldDropoff,
          newDropoff: targetDropoff,
          pickupChanged: targetPickupChanged,
          dropoffChanged: targetDropoffChanged,
          legScope: tripUpdateLegScope
        }
      });
    });

    const riderProfileKey = getRiderProfileKey(tripUpdateModal);
    if (riderProfileKey) {
      await saveSmsData({
        sms: {
          ...(smsData?.sms || {}),
          riderProfiles: {
            ...riderProfiles,
            [riderProfileKey]: {
              companion: tripUpdateCompanionNote.trim(),
              mobility: tripUpdateMobilityNote.trim(),
              latestNote: tripUpdateNote.trim(),
              updatedAt: nowIso
            }
          }
        }
      });
    }

    setCustomStatus(`${targetTrips.length} trip(s) updated by ${confirmationActor.name}. Method: ${methodLabel}${pickupChanged || dropoffChanged ? ' | Schedule marked NEW' : ''}.`);
    setTripUpdateModal(null);
    setTripUpdateLegScope('single');
  };

  const confirmationSiblingTrips = useMemo(() => confirmationSourceTrip ? getSiblingLegTrips(confirmationSourceTrip, trips) : EMPTY_ARRAY, [confirmationSourceTrip, trips]);
  const confirmationRequiresLegChoice = Boolean(confirmationSourceTrip && confirmationSiblingTrips.length > 0);

  const handleSendConfirmation = async () => {
    if (!confirmationMethodModal || confirmationMethodModal.length === 0) {
      setCustomStatus('No trips selected for confirmation.');
      return;
    }

    if (confirmationRequiresLegChoice && !confirmationLegScope) {
      setCustomStatus('Choose whether to confirm only this leg or both legs before sending.');
      return;
    }

    const siblingTrips = confirmationSiblingTrips;
    const targetTrips = confirmationSourceTrip && confirmationLegScope === 'both' ? Array.from(new Map([confirmationSourceTrip, ...siblingTrips].map(item => [item.id, item])).values()) : confirmationMethodModal;
    if (selectedOutputColumnOptions.length === 0) {
      setCustomStatus('Selecciona al menos una columna para enviar.');
      return;
    }

    setIsSendingConfirmation(true);
    try {
      if (confirmationMethod === 'whatsapp') {
        const tripsInfo = targetTrips.map(trip => buildTripOutputLine(trip)).join('\n');

        const message = `CONFIRMATION REQUEST\n\nTrips to confirm:\n${tripsInfo}\n\nPlease confirm receipt.`;
        const firstTripWithPhone = targetTrips.find(trip => trip.patientPhoneNumber);

        if (firstTripWithPhone) {
          const whatsappResult = openWhatsAppConversation({
            phoneNumber: firstTripWithPhone.patientPhoneNumber,
            message
          });

          if (!whatsappResult.ok && whatsappResult.reason === 'popup-blocked') {
            setCustomStatus('El navegador bloqueo la pestaña de WhatsApp. Permite pop-ups para esta pagina.');
          }
        }

        for (const trip of targetTrips) {
          if (trip.patientPhoneNumber) {
            await fetch('/api/extensions/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'whatsapp',
                phoneNumber: trip.patientPhoneNumber,
                message: `Hi ${trip.rider}, this is your confirmation detail: ${buildTripOutputLine(trip)}.`
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

        setCustomStatus(`WhatsApp confirmations sent to ${targetTrips.length} trip(s).`);
      } else if (confirmationMethod === 'sms') {
        // Send SMS in batch
        const response = await fetch('/api/integrations/sms/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripIds: targetTrips.map(t => t.id),
            selectedColumns: outputColumns
          })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to send SMS');
        targetTrips.forEach(trip => {
          applyTripConfirmationState(trip, {
            status: 'Confirmed',
            provider: 'sms',
            methodCode: 'S',
            message: 'Confirmed via SMS',
            eventType: 'confirm-sms'
          });
        });
        
        setCustomStatus(`SMS confirmations sent: ${result.sentCount}. Failed: ${result.failedCount || 0}. Skipped: ${result.skippedCount || 0}.`);
      } else if (confirmationMethod === 'call') {
        targetTrips.forEach(trip => {
          applyTripConfirmationState(trip, {
            status: 'Confirmed',
            provider: 'call',
            methodCode: 'C',
            message: 'Confirmed via Call',
            eventType: 'confirm-call'
          });
        });
        setCustomStatus(`Call confirmations saved for ${targetTrips.length} trip(s).`);
      }
      
      await refreshDispatchState({ forceServer: true });
      handleCloseConfirmationMethod();
    } catch (error) {
      setCustomStatus(`Error sending confirmation: ${error.message}`);
    } finally {
      setIsSendingConfirmation(false);
    }
  };

  return <>
      <PageTitle title="Confirmation" subName="Operations" />

      <Row className="g-3 mb-3">
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('all')} title="Show all trips in results"><CardBody><div className="text-secondary small mb-1">Trips</div><h4 className="mb-0">{summary.total}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('Pending')} title="Filter results to Pending"><CardBody><div className="text-secondary small mb-1">Pending</div><h4 className="mb-0">{summary.pending}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('Confirmed')} title="Filter results to Confirmed"><CardBody><div className="text-secondary small mb-1">Confirmed</div><h4 className="mb-0">{summary.confirmed}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('Cancelled')} title="Filter results to Cancelled"><CardBody><div className="text-secondary small mb-1">Cancelled</div><h4 className="mb-0">{summary.cancelled}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('Needs Call')} title="Filter results to Needs Call"><CardBody><div className="text-secondary small mb-1">Needs Call</div><h4 className="mb-0">{summary.needsCall}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('Not Sent')} title="Filter results to Not Sent"><CardBody><div className="text-secondary small mb-1">Not Sent</div><h4 className="mb-0">{summary.notSent}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card style={{ ...surfaceStyles.card, cursor: 'pointer' }} className="h-100 border" onClick={() => handleSummaryCardClick('Opted Out')} title="Filter results to Opted Out"><CardBody><div className="text-secondary small mb-1">Opted Out</div><h4 className="mb-0">{summary.optedOut}</h4></CardBody></Card>
        </Col>
        <Col md={6} xl={2}>
          <Card
            style={{ ...surfaceStyles.card, cursor: 'pointer', borderColor: summary.rehabHospital > 0 ? '#f59e0b' : undefined }}
            className="h-100 border"
            onClick={() => setShowRehabBlacklistPanel(true)}
            title="Click to see Rehab/Hospital patients and Blacklist"
          >
            <CardBody>
              <div className="text-warning small mb-1 fw-semibold">Rehab / Hospital</div>
              <h4 className="mb-0 text-warning">{summary.rehabHospital}</h4>
              <div className="small text-muted mt-1">Blacklist: {summary.blacklisted} · Copies: {summary.clones}</div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* ── Rehab / Blacklist / Clones panel ─────────────────────────────── */}
      <Modal show={showRehabBlacklistPanel} onHide={() => setShowRehabBlacklistPanel(false)} size="xl" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Rehab / Hospital · Blacklist · Cloned Trips</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Rehab / Hospital section */}
          <h6 className="text-uppercase text-warning fw-bold mb-2">Rehab / Hospital <span className="badge bg-warning text-dark ms-1">{summary.rehabHospital}</span></h6>
          {trips.filter(trip => Boolean(getTripRehabHospitalInfo(trip))).length > 0 ? (
            <div className="table-responsive mb-4">
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Rider</th>
                    <th>Phone</th>
                    <th>Type</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.filter(trip => Boolean(getTripRehabHospitalInfo(trip))).map(trip => {
                    const rehabHospitalInfo = getTripRehabHospitalInfo(trip);
                    return <tr key={trip.id}>
                      <td className="fw-semibold">
                        <div>{trip.id}</div>
                        {trip.clonedFromTripId ? (
                          <div className="mt-1">
                            <Badge bg="info" text="dark">CLONED from {trip.clonedFromTripId}</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td>{trip.rider || '-'}</td>
                      <td>{trip.patientPhoneNumber || '-'}</td>
                      <td><span className="badge bg-warning text-dark">{rehabHospitalInfo?.type || 'Hospital'}</span></td>
                      <td>{rehabHospitalInfo?.startDate || '-'}</td>
                      <td>{rehabHospitalInfo?.endDate || '-'}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'normal' }}>{rehabHospitalInfo?.notes || '-'}</td>
                      <td>
                        <div className="d-flex flex-column gap-1">
                          <Button size="sm" variant="outline-warning" onClick={() => { setShowRehabBlacklistPanel(false); handleRemoveHospitalRehab(trip); }}>Remove RH</Button>
                          <Button size="sm" variant="outline-danger" onClick={() => { if (window.confirm(`DELETE trip ${trip.id}\nRider: ${trip.rider || '-'}\n\nCannot be undone. Continue?`)) { deleteTripRecord(trip.id); } }}>Delete</Button>
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-muted small mb-4">No trips in Rehab/Hospital status right now.</p>}

          {/* Blacklist section */}
          <h6 className="text-uppercase text-danger fw-bold mb-2">Blacklist <span className="badge bg-danger ms-1">{summary.blacklisted}</span></h6>
          {blacklistEntries.filter(entry => entry.status === 'Active').length > 0 ? (
            <div className="table-responsive mb-4">
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Category</th>
                    <th>Hold Until</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blacklistEntries.filter(entry => entry.status === 'Active').map(entry => (
                    <tr key={entry.id}>
                      <td className="fw-semibold">{entry.name || '-'}</td>
                      <td>{entry.phone || '-'}</td>
                      <td><span className="badge bg-danger">{entry.category || 'Blacklist'}</span></td>
                      <td>{entry.holdUntil || 'Indefinite'}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'normal' }}>{entry.notes || '-'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          onClick={async () => {
                            if (!window.confirm(`Remove ${entry.name || 'this entry'} from blacklist?`)) return;
                            const nextEntries = blacklistEntries.map(e => e.id === entry.id ? { ...e, status: 'Removed', updatedAt: new Date().toISOString() } : e);
                            await saveBlacklistData({ version: blacklistData?.version ?? 1, entries: nextEntries });
                          }}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-muted small mb-4">No active blacklist entries.</p>}

          {/* Cloned trips section */}
          <h6 className="text-uppercase text-info fw-bold mb-2">Cloned Trips <span className="badge bg-info text-dark ms-1">{summary.clones}</span></h6>
          {trips.filter(trip => Boolean(trip?.clonedFromTripId)).length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Copy ID</th>
                    <th>Original Trip</th>
                    <th>Rider</th>
                    <th>Phone</th>
                    <th>Pickup</th>
                    <th>Status</th>
                    <th>Cloned By</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.filter(trip => Boolean(trip?.clonedFromTripId)).map(trip => (
                    <tr key={trip.id} style={{ backgroundColor: 'rgba(6,182,212,0.05)' }}>
                      <td className="fw-semibold text-info">{trip.id}</td>
                      <td>{trip.clonedFromTripId}</td>
                      <td>{trip.rider || '-'}</td>
                      <td>{trip.patientPhoneNumber || '-'}</td>
                      <td>{trip.scheduledPickup || trip.pickup || '-'}</td>
                      <td>{trip.status || '-'}</td>
                      <td>{trip.clonedBy || '-'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDeleteClonedTrip(trip)}
                        >
                          🗑 Delete Copy
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-muted small">No cloned trips found.</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRehabBlacklistPanel(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      <Card style={surfaceStyles.card} className="border mb-3 overflow-hidden">
        <CardBody className="p-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 align-items-start align-items-xl-center">
            <div>
              <h5 className="mb-1">Trip Confirmation Center</h5>
              <div className="text-secondary small">Aqui puedes ver que viajes ya recibieron SMS, cuales fueron confirmados, cuales pidieron llamada y cuales se cancelaron por respuesta del paciente.</div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => router.push('/dispatcher')}>Open Dispatcher</Button>
              <Button style={surfaceStyles.button} className="rounded-pill" onClick={() => router.push('/integrations/sms')}>Open SMS Integration</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card style={surfaceStyles.card} className="border mb-3 overflow-hidden">
        <CardBody className="p-3">
          <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-3">
            <div>
              <h5 className="mb-1">Patient History Search</h5>
              <div className="text-secondary small">Busca por paciente y fecha para ver cuantas veces viajo, confirmaciones, rehab/hospital, notas y resultados de viajes completados.</div>
            </div>
            <div className="small text-secondary">{patientHistoryRows.length} patient(s) found</div>
          </div>

          <div className="d-flex flex-column flex-xl-row gap-2 mb-3">
            <Form.Control value={patientSearch} onChange={event => setPatientSearch(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search patient, phone, trip ID or notes" style={{ ...surfaceStyles.input, minWidth: 260 }} />
            <Form.Control type="date" value={patientFromDate} onChange={event => setPatientFromDate(event.target.value)} style={{ ...surfaceStyles.input, width: 170 }} title="From date" />
            <Form.Control type="date" value={patientToDate} onChange={event => setPatientToDate(event.target.value)} style={{ ...surfaceStyles.input, width: 170 }} title="To date" />
            <Button style={surfaceStyles.button} onClick={() => {
              setPatientSearch('');
              setPatientFromDate('');
              setPatientToDate('');
            }}>
              Clear History Filters
            </Button>
          </div>

          {patientHistoryRows.length > 0 ? <>
              <div className="d-flex flex-column flex-xl-row gap-2 mb-3">
                <Form.Select value={selectedPatientKey} onChange={event => setSelectedPatientKey(event.target.value)} style={{ ...surfaceStyles.input, maxWidth: 520 }}>
                  <option value="">Select patient manually</option>
                  {patientHistoryRows.map(row => <option key={row.key} value={row.key}>{row.rider || 'Unknown'} {row.phone ? `• ${row.phone}` : ''} • {row.totalTrips} trip(s)</option>)}
                </Form.Select>
                <Button style={surfaceStyles.button} onClick={() => setSelectedPatientKey('')}>
                  Clear Selected Patient
                </Button>
                <Button style={surfaceStyles.button} onClick={handleOpenPatientStatusModal} disabled={!selectedPatientHistory}>
                  Set Patient Rule
                </Button>
                <Button style={surfaceStyles.button} onClick={() => selectedPatientHistoryAnchorTrip ? handleOpenHospitalRehabModal(selectedPatientHistoryAnchorTrip) : setCustomStatus('No live trip found for this patient to mark Rehab/Hospital.')} disabled={!selectedPatientHistory}>
                  Set Rehab/Hospital
                </Button>
                <Button style={surfaceStyles.button} onClick={handleClearPatientStatus} disabled={!selectedPatientHistory}>
                  Clear Rule
                </Button>
              </div>

              {selectedPatientHistory ? <>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <Badge bg="primary">Trips: {selectedPatientHistory.totalTrips}</Badge>
                    <Badge bg="success">Completed: {selectedPatientHistory.completedTrips}</Badge>
                    <Badge bg="info">Confirmed: {selectedPatientHistory.confirmedTrips}</Badge>
                    <Badge bg="secondary">Not Confirmed: {selectedPatientHistory.notConfirmedTrips}</Badge>
                    <Badge bg="warning">Rehab: {selectedPatientHistory.rehabTrips}</Badge>
                    <Badge bg="dark">Hospital: {selectedPatientHistory.hospitalTrips}</Badge>
                    <Badge bg="danger">Excluded: {selectedPatientHistory.excludedTrips}</Badge>
                    <Badge bg="light" text="dark">Call C: {selectedPatientHistory.callConfirmedTrips}</Badge>
                    <Badge bg="light" text="dark">SMS S: {selectedPatientHistory.smsConfirmedTrips}</Badge>
                    <Badge bg="light" text="dark">WhatsApp W: {selectedPatientHistory.whatsappConfirmedTrips}</Badge>
                    <Badge bg={selectedPatientHistory.hasTravelled ? 'success' : 'secondary'}>{selectedPatientHistory.hasTravelled ? 'Has Travelled' : 'No Trips'}</Badge>
                  </div>

                  <div className="mb-3">
                    <div className="fw-semibold mb-2">All Notes</div>
                    <div className="small p-2 rounded-2" style={{ ...surfaceStyles.input, maxHeight: 140, overflowY: 'auto' }}>
                      {selectedPatientHistory.notes.length > 0 ? selectedPatientHistory.notes.map((note, index) => <div key={`patient-note-${index}`} className="mb-1">{note}</div>) : <div className="text-secondary">No notes found for this patient.</div>}
                    </div>
                  </div>

                  <div className="table-responsive">
                    <Table size="sm" striped hover className="align-middle mb-0 small" style={{ ...surfaceStyles.table, whiteSpace: 'nowrap' }}>
                      <thead style={surfaceStyles.tableHead}>
                        <tr>
                          <th>Date</th>
                          <th>Trip ID</th>
                          <th>Pickup</th>
                          <th>Dropoff</th>
                          <th>Status</th>
                          <th>Completed</th>
                          <th>Confirmation</th>
                          <th>Method</th>
                          <th>Excluded</th>
                          <th>Rehab/Hospital</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPatientHistory.trips.sort((a, b) => String(b.dateKey || '').localeCompare(String(a.dateKey || ''))).map(item => <tr key={`patient-trip-${item.id}-${item.dateKey || 'na'}`}>
                            <td>{item.dateKey || '-'}</td>
                            <td>{item.id}</td>
                            <td>{item.pickup}</td>
                            <td>{item.dropoff}</td>
                            <td>{item.status || '-'}</td>
                            <td>{item.completion}</td>
                            <td>{item.confirmationStatus}</td>
                            <td>{item.responseCode || '-'}</td>
                            <td>{item.excluded}</td>
                            <td style={{ color: themeMode === 'light' ? '#0f172a' : '#e6ecff' }}>{item.rehabHospital}</td>
                            <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{item.note}</td>
                          </tr>)}
                      </tbody>
                    </Table>
                  </div>
                </> : null}
            </> : <div className="text-secondary small">No patient history matches those filters yet.</div>}
        </CardBody>
      </Card>

      <Card ref={resultsSectionRef} style={surfaceStyles.card} className="border overflow-hidden">
        <CardBody className="p-3">
          <div className="border rounded-3 p-3 mb-3" style={surfaceStyles.input}>
            <div className="d-flex flex-column flex-xl-row justify-content-between gap-3 mb-3">
              <div>
                <div className="fw-semibold">Custom SMS</div>
                <div className="small text-secondary">Selecciona trips y manda un mensaje manual. Esto no depende del flujo de confirmacion automatica.</div>
              </div>
              <div className="small text-secondary">{visibleSelectedTripIds.length} selected</div>
            </div>
            <div className="d-flex flex-column flex-xl-row gap-2">
              <Form.Control as="textarea" rows={2} value={customMessage} onChange={event => setCustomMessage(event.target.value)} placeholder="Write a custom SMS for selected patients" style={{ ...surfaceStyles.input, minHeight: 72 }} />
              <Button style={{ ...surfaceStyles.button, minWidth: 170 }} onClick={handleLoadGroupTemplate}>Load Group Template</Button>
              <Button style={{ ...surfaceStyles.button, minWidth: 170 }} onClick={handleSendCustomMessage} disabled={customSending}>{customSending ? 'Sending...' : 'Send Custom SMS'}</Button>
            </div>
            {customStatus ? <div className="small mt-2 text-secondary">{customStatus}</div> : null}
          </div>

          <div className="d-flex flex-column flex-xl-row gap-2 justify-content-between mb-3">
            <div className="d-flex gap-2 flex-wrap">
              <Form.Control type="date" value={confirmationDate} onChange={event => setConfirmationDate(event.target.value)} style={{ ...surfaceStyles.input, width: 140 }} title="Confirmation date" />
              <Form.Select value={primaryFilterMode} onChange={event => setPrimaryFilterMode(event.target.value)} style={{ ...surfaceStyles.input, width: 170 }} title="Primary filter mode">
                <option value="none">No time/miles</option>
                <option value="time">Time only</option>
                <option value="miles">Miles only</option>
              </Form.Select>
              <Form.Control type="time" value={timeFromFilter} onChange={event => setTimeFromFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 120 }} title="Start time" disabled={primaryFilterMode !== 'time'} />
              <Form.Control type="time" value={timeToFilter} onChange={event => setTimeToFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 120 }} title="End time" disabled={primaryFilterMode !== 'time'} />
              <Form.Select value={milesMaxFilter} onChange={event => {
                setMilesMaxFilter(event.target.value);
                setIsMilesMaxManual(true);
              }} style={{ ...surfaceStyles.input, width: 140 }} title="Highest miles (real list)" disabled={primaryFilterMode !== 'miles'}>
                <option value="">Max miles</option>
                {milesOptionValuesDesc.map(value => <option key={`max-mi-${value}`} value={String(value)}>{value} mi</option>)}
              </Form.Select>
              <Form.Select value={milesMinFilter} onChange={event => setMilesMinFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 140 }} title="Lowest miles (real list)" disabled={primaryFilterMode !== 'miles'}>
                <option value="">Min miles</option>
                {milesOptionValuesAsc.map(value => <option key={`min-mi-${value}`} value={String(value)}>{value} mi</option>)}
              </Form.Select>
              <Button style={surfaceStyles.button} onClick={() => {
                setIsMilesMaxManual(false);
              }} title="Auto max miles from loaded trips" disabled={primaryFilterMode !== 'miles'}>
                Auto Max
              </Button>
              <Form.Select value={milesSortOrder} onChange={event => setMilesSortOrder(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }} title="Sort by miles">
                <option value="miles-desc">Miles: High to Low</option>
                <option value="miles-asc">Miles: Low to High</option>
                <option value="rider-asc">Rider: A to Z</option>
                <option value="rider-desc">Rider: Z to A</option>
                <option value="tripId-asc">Trip ID: A to Z</option>
                <option value="tripId-desc">Trip ID: Z to A</option>
                <option value="phone-asc">Phone: A to Z</option>
                <option value="phone-desc">Phone: Z to A</option>
                <option value="pickupTime-asc">Pickup Time: Early to Late</option>
                <option value="pickupTime-desc">Pickup Time: Late to Early</option>
                <option value="dropoffTime-asc">Dropoff Time: Early to Late</option>
                <option value="dropoffTime-desc">Dropoff Time: Late to Early</option>
                <option value="leg-asc">Leg: A to Z</option>
                <option value="leg-desc">Leg: Z to A</option>
                <option value="type-asc">Type: A to Z</option>
                <option value="type-desc">Type: Z to A</option>
              </Form.Select>
              <Button style={surfaceStyles.button} onClick={() => {
                setTimeFromFilter('');
                setTimeToFilter('');
              }} title="Show all hours" disabled={primaryFilterMode !== 'time'}>
                All Day
              </Button>
              <Form.Check
                type="checkbox"
                id="show-detected-max"
                label="Detected max"
                checked={showDetectedMaxBadge}
                onChange={event => setShowDetectedMaxBadge(event.target.checked)}
                className="d-flex align-items-center px-2"
              />
              {showDetectedMaxBadge && primaryFilterMode === 'miles' && detectedMaxMilesForWindow != null ? <Badge bg="info">Detected max {Number(detectedMaxMilesForWindow.toFixed(2))} mi</Badge> : null}
              <Badge bg="light" text="dark">Total shown {filteredTrips.length}</Badge>
              <Form.Select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 220 }}>
                <option value="all">All statuses</option>
                <option value="Not Sent">Not Sent</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Disconnected">Disconnected</option>
                <option value="Needs Call">Needs Call</option>
                <option value="Opted Out">Opted Out</option>
              </Form.Select>
              <Form.Select value={legFilter} onChange={event => setLegFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }}>
                <option value="all">All legs</option>
                <option value="AL">AL</option>
                <option value="BL">BL</option>
                <option value="CL">CL</option>
              </Form.Select>
              <Form.Select value={rideTypeFilter} onChange={event => setRideTypeFilter(event.target.value)} style={{ ...surfaceStyles.input, width: 180 }}>
                <option value="all">All types</option>
                <option value="A">A</option>
                <option value="W">W</option>
                <option value="STR">STR</option>
              </Form.Select>
              <Form.Select value={resultViewMode} onChange={event => setResultViewMode(event.target.value)} style={{ ...surfaceStyles.input, width: 190 }} title="Result view mode">
                <option value="miles">Existing Miles List</option>
                <option value="trips">Trips Table</option>
              </Form.Select>
              <Button style={surfaceStyles.button} onClick={handleSelectVisible}>Select Visible</Button>
              <Button style={surfaceStyles.button} onClick={handleClearSelection}>Clear</Button>
              <div className="position-relative">
                <Button style={surfaceStyles.button} onClick={() => setShowOutputColumnPicker(current => !current)}>Output Columns</Button>
                {showOutputColumnPicker ? <Card className="shadow position-absolute start-0 mt-2" style={{ zIndex: 80, width: 280 }}>
                    <CardBody className="p-3" style={surfaceStyles.card}>
                      <div className="fw-semibold mb-2">Escoge columnas de salida</div>
                      <div className="small text-secondary mb-3">Aplica a Print/PDF/Enviar y se guarda para la proxima vez.</div>
                      <div className="d-flex flex-column gap-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {CONFIRMATION_OUTPUT_COLUMN_OPTIONS.map(option => <Form.Check key={option.key} type="switch" id={`confirmation-output-column-${option.key}`} label={option.label} checked={outputColumns.includes(option.key)} onChange={() => handleToggleOutputColumn(option.key)} />)}
                      </div>
                    </CardBody>
                  </Card> : null}
              </div>
              <Button style={surfaceStyles.button} onClick={handleSendGroupConfirmation} disabled={confirmationSending}>{confirmationSending ? 'Sending...' : 'Send Confirmation'}</Button>
              <Button style={surfaceStyles.button} onClick={exportToPDF} title="Export visible trips to PDF/Print">Export PDF</Button>
              <Form.Control value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.stopPropagation()} placeholder="Search trip, rider, phone or reply" style={{ ...surfaceStyles.input, width: 280, maxWidth: '100%' }} />
            </div>
          </div>

          {resultViewMode === 'miles' ? <div className="border rounded-3 p-3" style={surfaceStyles.input}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="fw-semibold">Existing Miles (from loaded/filtered trips)</div>
                <div className="small text-secondary">{existingMilesRows.length} unique mile value(s)</div>
              </div>
              <div className="table-responsive" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <Table size="sm" striped hover className="align-middle mb-0 small" style={{ ...surfaceStyles.table, whiteSpace: 'nowrap' }}>
                  <thead style={surfaceStyles.tableHead}>
                    <tr>
                      <th>Miles</th>
                      <th>Trips Count</th>
                      <th>Quick Use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingMilesRows.length > 0 ? existingMilesRows.map(item => <tr key={`miles-row-${item.miles}`}>
                        <td>{Number(item.miles.toFixed(2))}</td>
                        <td>{item.tripsCount}</td>
                        <td>
                          <Button size="sm" style={surfaceStyles.button} onClick={() => {
                            setMilesMinFilter('');
                            setMilesMaxFilter(String(Number(item.miles.toFixed(2))));
                            setIsMilesMaxManual(true);
                          }}>
                            Use as Max
                          </Button>
                        </td>
                      </tr>) : <tr>
                        <td colSpan={3} className="text-center text-muted py-4">No miles found for current filters.</td>
                      </tr>}
                  </tbody>
                </Table>
              </div>
            </div> : <div className="table-responsive">
            <Table size="sm" striped hover className="align-middle mb-0 small" style={{ ...surfaceStyles.table, whiteSpace: 'nowrap', width: 'max-content' }}>
              <thead style={surfaceStyles.tableHead}>
                <tr>
                  <th style={{ width: 48 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={event => handleToggleAllVisible(event.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#22c55e' }}
                      title="Select all visible"
                    />
                  </th>
                    {confirmationTableColumns.map(columnKey => renderConfirmationHeaderCell(columnKey))}
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length > 0 ? filteredTrips.map(trip => {
                  const blockingState = tripBlockingMap.get(trip.id) || { isBlocked: false };
                  const confirmationStatus = getEffectiveConfirmationStatus(trip, blockingState);
                  const isOptedOut = blockingState.isBlocked;
                  const riderProfile = getRiderProfile(trip);
                  const tripRowStyle = { borderTop: '2px solid rgba(99,102,241,0.35)' };
                  return <React.Fragment key={trip.id}>
                      <tr style={tripRowStyle}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTripIds.includes(trip.id)}
                            onChange={() => toggleTripSelection(trip.id)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#22c55e' }}
                          />
                        </td>
                        {confirmationTableColumns.map(columnKey => <React.Fragment key={`${trip.id}-${columnKey}`}>{renderConfirmationDataCell(trip, columnKey, confirmationStatus, isOptedOut, riderProfile)}</React.Fragment>)}
                      </tr>
                      <tr>
                        <td colSpan={confirmationTableColumnCount} className="pt-0 border-0" style={{ borderBottom: '2px solid rgba(99,102,241,0.35)' }}>
                          <div className="d-flex gap-1 flex-wrap justify-content-center py-2">
                            <Button size="sm" variant={confirmationStatus === 'Confirmed' ? 'success' : 'outline-success'} onClick={() => handleManualConfirm(trip.id, trip)} title={confirmationStatus === 'Confirmed' ? 'Unconfirm this trip' : 'Confirm via SMS/WhatsApp/Call'} style={{ minWidth: 90 }}>
                              {confirmationStatus === 'Confirmed' ? 'Unconfirm' : 'Confirm'}
                            </Button>
                            <Button size="sm" variant="outline-danger" onClick={() => handleCancelWithNote(trip)} title="Cancel with note" style={{ minWidth: 80 }}>
                              Cancel
                            </Button>
                            <Button size="sm" variant="outline-info" onClick={() => handleOpenTripUpdateModal(trip)} title="Update confirmation, schedule and notes" style={{ minWidth: 80 }}>
                              Update
                            </Button>
                            <Button size="sm" style={{ backgroundColor: '#000000', borderColor: '#000000', color: '#ffffff', minWidth: 72 }} onClick={() => handleToggleOptOut(trip)}>{isOptedOut ? 'Allow' : 'Block'}</Button>
                            <Button
                              size="sm"
                              variant={trip.clonedFromTripId ? 'danger' : 'outline-danger'}
                              title={trip.clonedFromTripId ? `Delete cloned copy (original: ${trip.clonedFromTripId})` : 'Permanently delete this trip'}
                              style={{ minWidth: 72 }}
                              onClick={() => {
                                const label = trip.clonedFromTripId ? `DELETE COPY of ${trip.clonedFromTripId}` : `DELETE trip ${trip.id}`;
                                if (window.confirm(`${label}\nRider: ${trip.rider || '-'}\n\nThis cannot be undone. Continue?`)) {
                                  deleteTripRecord(trip.id);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>;
                }) : <tr>
                    <td colSpan={confirmationTableColumnCount} className="text-center text-muted py-4">No confirmation records match the current filter.</td>
                  </tr>}
              </tbody>
            </Table>
          </div>}
        </CardBody>
      </Card>

      <Modal show={Boolean(cancelNoteModal)} onHide={() => setCancelNoteModal(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Cancel Trip - Add Note</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-2">Trip: {cancelNoteModal?.id}</div>
          <div className="small text-muted mb-2">Rider: {cancelNoteModal?.rider}</div>
          {cancelNoteModal && getSiblingLegTrips(cancelNoteModal, trips).length > 0 ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Cancel Scope</Form.Label>
              <Form.Select className="mb-3" value={cancelLegScope} onChange={event => setCancelLegScope(event.target.value)}>
                <option value="single">Only this leg</option>
                <option value="both">Both legs (A and B)</option>
              </Form.Select>
            </> : null}
          <Form.Label className="small text-uppercase text-muted fw-semibold">Cancel Reason / Note</Form.Label>
          <Form.Control as="textarea" rows={4} value={cancelNoteDraft} onChange={event => setCancelNoteDraft(event.target.value)} placeholder="Write the cancellation reason or note for the dispatcher..." />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setCancelNoteModal(null)}>Close</Button>
          <Button variant="danger" onClick={handleSaveCancelNote}>Cancel Trip</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={Boolean(blockReasonModalTrip)}
        onHide={() => {
          setBlockReasonModalTrip(null);
          setPendingHospitalRehabTrip(null);
        }}
        onExited={() => {
          if (!pendingHospitalRehabTrip) return;
          const trip = pendingHospitalRehabTrip;
          setPendingHospitalRehabTrip(null);
          handleOpenHospitalRehabModal(trip);
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Block Patient - Reason Required</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-2">Trip: {blockReasonModalTrip?.id}</div>
          <div className="small text-muted mb-3">Rider: {blockReasonModalTrip?.rider || '-'}</div>
          <Form.Label className="small text-uppercase text-muted fw-semibold">Reason</Form.Label>
          <Form.Select className="mb-3" value={blockReasonType} onChange={event => setBlockReasonType(event.target.value)}>
            {BLOCK_REASON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Form.Select>
          <Form.Label className="small text-uppercase text-muted fw-semibold">Details</Form.Label>
          <Form.Control as="textarea" rows={3} value={blockReasonNote} onChange={event => setBlockReasonNote(event.target.value)} placeholder="Write details (optional)" />
          <div className="small text-muted mt-2">This will block in Confirmation and create an Active Blacklist entry immediately.</div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setBlockReasonModalTrip(null)}>Close</Button>
          <Button variant="dark" onClick={handleConfirmBlockReason}>Block Patient</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(confirmationMethodModal)} onHide={handleCloseConfirmationMethod} centered>
        <Modal.Header closeButton>
          <Modal.Title>Send Confirmation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3 pb-2 border-bottom">
            <strong>{confirmationMethodModal?.length || 0} trip(s) selected</strong>
            {confirmationMethodModal?.length > 0 && (
              <div className="small mt-2">
                {confirmationMethodModal.slice(0, 5).map(trip => (
                  <div key={trip.id}>{buildTripOutputLine(trip)}</div>
                ))}
                {confirmationMethodModal.length > 5 && <div className="text-muted">+ {confirmationMethodModal.length - 5} more</div>}
              </div>
            )}
          </div>

          {confirmationRequiresLegChoice ? <>
              <div className="alert alert-warning small">
                This trip has another leg. Choose if you want to confirm only this leg or both legs.
              </div>
              <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Leg Scope</Form.Label>
              <Form.Select className="mb-3" value={confirmationLegScope} onChange={event => setConfirmationLegScope(event.target.value)}>
                <option value="">Choose one option</option>
                <option value="single">Only this leg ({confirmationSourceTrip.id})</option>
                <option value="both">Both legs (A and B)</option>
              </Form.Select>
            </> : null}

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Send Via</Form.Label>
          <div className="d-flex gap-3 mb-3">
            <Form.Check
              type="radio"
              label="WhatsApp"
              name="confirmationMethod"
              value="whatsapp"
              checked={confirmationMethod === 'whatsapp'}
              onChange={event => setConfirmationMethod(event.target.value)}
            />
            <Form.Check
              type="radio"
              label="SMS"
              name="confirmationMethod"
              value="sms"
              checked={confirmationMethod === 'sms'}
              onChange={event => setConfirmationMethod(event.target.value)}
            />
            <Form.Check
              type="radio"
              label="Call"
              name="confirmationMethod"
              value="call"
              checked={confirmationMethod === 'call'}
              onChange={event => setConfirmationMethod(event.target.value)}
            />
          </div>

          {confirmationMethod === 'whatsapp' && (
            <div className="alert alert-info small mb-0">
              WhatsApp Web will open. Messages will also be sent via API to each patient's WhatsApp.
            </div>
          )}
          {confirmationMethod === 'sms' && (
            <div className="alert alert-info small mb-0">
              SMS messages will be sent in batch to all {confirmationMethodModal?.length || 0} trips.
            </div>
          )}
          {confirmationMethod === 'call' && (
            <div className="alert alert-info small mb-0">
              This saves a manual call confirmation even if SMS center is not configured.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseConfirmationMethod} disabled={isSendingConfirmation}>Close</Button>
          <Button variant="primary" onClick={handleSendConfirmation} disabled={isSendingConfirmation || (confirmationRequiresLegChoice && !confirmationLegScope)}>
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
                <option value="cancelled-by-patient">Cancelled by patient</option>
                <option value="disconnected">Disconnected</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms-left-unconfirmed">Could not confirm, SMS left (English)</option>
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Pickup Time (New)</Form.Label>
              <Form.Control value={tripUpdatePickupTime} onChange={event => setTripUpdatePickupTime(event.target.value)} placeholder="e.g. 07:30 AM" />
            </Col>
            <Col md={4}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Dropoff Time (New)</Form.Label>
              <Form.Control value={tripUpdateDropoffTime} onChange={event => setTripUpdateDropoffTime(event.target.value)} placeholder="e.g. 08:15 AM" />
            </Col>
            {tripUpdateSupportsBothLegs ? <Col md={12}>
                <Form.Label className="small text-uppercase text-muted fw-semibold">Apply Confirmation To</Form.Label>
                <Form.Select value={tripUpdateLegScope} onChange={event => setTripUpdateLegScope(event.target.value)}>
                  <option value="single">Only this leg ({tripUpdateModal?.id})</option>
                  <option value="both">Both legs (A and B)</option>
                </Form.Select>
                <div className="small text-muted mt-1">Confirmation and notes can be applied to both legs. Time changes stay only on the current leg.</div>
              </Col> : null}
            <Col md={12}>
              <div className="small text-muted">Current pickup: {normalizeTripTimeDisplay(tripUpdateModal?.scheduledPickup || tripUpdateModal?.pickup || '') || '-'} | Current dropoff: {normalizeTripTimeDisplay(tripUpdateModal?.scheduledDropoff || tripUpdateModal?.dropoff || '') || '-'}</div>
            </Col>
            <Col md={6}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Pickup Address</Form.Label>
              <Form.Control value={tripUpdatePickupAddress} onChange={event => setTripUpdatePickupAddress(event.target.value)} placeholder="e.g. 123 Main St, Orlando FL" />
            </Col>
            <Col md={6}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Dropoff Address</Form.Label>
              <Form.Control value={tripUpdateDropoffAddress} onChange={event => setTripUpdateDropoffAddress(event.target.value)} placeholder="e.g. 456 Oak Ave, Orlando FL" />
            </Col>
            <Col md={6}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Companion Note</Form.Label>
              <Form.Control value={tripUpdateCompanionNote} onChange={event => setTripUpdateCompanionNote(event.target.value)} placeholder="Patient goes with companion" />
            </Col>
            <Col md={6}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Mobility Note</Form.Label>
              <Form.Control value={tripUpdateMobilityNote} onChange={event => setTripUpdateMobilityNote(event.target.value)} placeholder="Motorized wheelchair / equipment" />
            </Col>
            <Col md={12}>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Saved Notes</Form.Label>
              <div className="border rounded p-2 small mb-3" style={{ minHeight: 78, whiteSpace: 'pre-wrap', background: '#f8fafc' }}>
                {String(tripUpdateModal?.notes || '').trim() || 'No saved notes yet for this trip.'}
              </div>

              <Form.Label className="small text-uppercase text-muted fw-semibold">Dispatch Note</Form.Label>
              <Form.Control as="textarea" rows={4} value={tripUpdateNote} onChange={event => setTripUpdateNote(event.target.value)} placeholder="Add new note (shown in Dispatcher and related views)" />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setTripUpdateModal(null)}>Close</Button>
          <Button variant="primary" onClick={handleSaveTripUpdate}>Save Update</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={patientStatusModalOpen} onHide={() => setPatientStatusModalOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Patient Rule (Cancel/Exclude)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">Patient: {selectedPatientHistory?.rider || '-'} {selectedPatientHistory?.phone ? `• ${selectedPatientHistory.phone}` : ''}</div>
          <Form.Label className="small text-uppercase text-muted fw-semibold">Duration</Form.Label>
          <Form.Select className="mb-3" value={patientStatusMode} onChange={event => setPatientStatusMode(event.target.value)}>
            <option value="single-day">One Day</option>
            <option value="range">Date Range</option>
            <option value="always">Always</option>
          </Form.Select>

          {patientStatusMode !== 'always' ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold">Start Date</Form.Label>
              <Form.Control className="mb-3" type="date" value={patientStatusStartDate} onChange={event => setPatientStatusStartDate(event.target.value)} />
            </> : null}
          {patientStatusMode === 'range' ? <>
              <Form.Label className="small text-uppercase text-muted fw-semibold">End Date</Form.Label>
              <Form.Control className="mb-3" type="date" value={patientStatusEndDate} onChange={event => setPatientStatusEndDate(event.target.value)} />
            </> : null}

          <Form.Label className="small text-uppercase text-muted fw-semibold">Reason</Form.Label>
          <Form.Control className="mb-3" value={patientStatusReason} onChange={event => setPatientStatusReason(event.target.value)} placeholder="Rehab / Hospital / Requested hold" />

          <Form.Label className="small text-uppercase text-muted fw-semibold">Who Notified / Source</Form.Label>
          <Form.Control as="textarea" rows={3} value={patientStatusSourceNote} onChange={event => setPatientStatusSourceNote(event.target.value)} placeholder="Caller name, relation, details" />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setPatientStatusModalOpen(false)}>Close</Button>
          <Button variant="danger" onClick={handleSavePatientStatus}>Save Rule</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(hospitalRehabModal)} onHide={() => setHospitalRehabModal(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Hospital / Rehab Status</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">Trip: {hospitalRehabModal?.id} | Rider: {hospitalRehabModal?.rider}</div>
          <div className="small text-muted mb-3">Cuando este viaje tenga dos patas, las dos se marcaran como Rehab/Hospital automaticamente.</div>
          
          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Type</Form.Label>
          <Form.Select value={hospitalRehabType} onChange={event => setHospitalRehabType(event.target.value)} className="mb-3">
            <option value="Hospital">Hospital</option>
            <option value="Rehab">Rehabilitation Center</option>
            <option value="Other">Other Medical Facility</option>
          </Form.Select>

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Start Date</Form.Label>
          <Form.Control type="date" value={hospitalRehabStartDate} onChange={event => setHospitalRehabStartDate(event.target.value)} className="mb-3" />

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">End Date (Trip excluded until this date)</Form.Label>
          <Form.Control type="date" value={hospitalRehabEndDate} onChange={event => setHospitalRehabEndDate(event.target.value)} className="mb-3" />

          <Form.Label className="small text-uppercase text-muted fw-semibold mb-2">Notes</Form.Label>
          <Form.Control as="textarea" rows={3} value={hospitalRehabNotes} onChange={event => setHospitalRehabNotes(event.target.value)} placeholder="Recovery notes, facility name, contact info, etc..." />
          {hospitalRehabError ? <div className="small text-danger mt-2">{hospitalRehabError}</div> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setHospitalRehabModal(null)} disabled={hospitalRehabSaving}>Close</Button>
          <Button variant="primary" onClick={handleSaveHospitalRehab} disabled={hospitalRehabSaving}>{hospitalRehabSaving ? 'Saving...' : 'Save Hospital/Rehab Status'}</Button>
        </Modal.Footer>
      </Modal>
    </>;
};

export default ConfirmationWorkspace;