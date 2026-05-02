import { buildMobileCorsPreflightResponse, jsonWithMobileCors } from '@/server/mobile-api-cors';
import { authorizeMobileDriverRequest } from '@/server/mobile-driver-auth';
import { readNemtDispatchState, writeNemtDispatchState } from '@/server/nemt-dispatch-store';
import { listDriverTripRequests, upsertDriverTripRequest } from '@/server/driver-trip-request-store';

const generateRequestId = () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const generateTripId = () => `manual-trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const DEFAULT_TRIP_BASE_PRICE = Number.isFinite(Number(process.env.DRIVER_TRIP_BASE_PRICE)) ? Number(process.env.DRIVER_TRIP_BASE_PRICE) : 25;
const DEFAULT_TRIP_PRICE_PER_MILE = Number.isFinite(Number(process.env.DRIVER_TRIP_PRICE_PER_MILE)) ? Number(process.env.DRIVER_TRIP_PRICE_PER_MILE) : 2;

const sanitizeText = value => String(value || '').trim().slice(0, 500);
const toMoney = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return Math.max(0, Number(fallback) || 0);
  return Number(parsed.toFixed(2));
};
const normalizeDateToIsoKey = value => {
  const text = sanitizeText(value, 80);
  if (!text) return '';
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const month = String(slashMatch[1]).padStart(2, '0');
    const day = String(slashMatch[2]).padStart(2, '0');
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const buildApprovedDispatchTrip = (request, pricing = {}) => {
  const tripId = generateTripId();
  const serviceDate = normalizeDateToIsoKey(request?.requestedDate) || normalizeDateToIsoKey(new Date().toISOString());
  const scheduledPickup = sanitizeText(request?.requestedTime, 40) || 'ASAP';
  const scheduledDropoff = scheduledPickup;
  const rider = sanitizeText(request?.passengerName, 200) || 'Patient';
  const basePrice = toMoney(pricing?.basePrice, DEFAULT_TRIP_BASE_PRICE);
  const pricePerMile = toMoney(pricing?.pricePerMile, DEFAULT_TRIP_PRICE_PER_MILE);
  const miles = Number.isFinite(Number(request?.miles)) ? Number(request.miles) : 0;
  const estimatedRevenue = Number((basePrice + Math.max(0, miles) * pricePerMile).toFixed(2));

  return {
    id: tripId,
    rideId: `M-${Date.now().toString().slice(-6)}`,
    brokerTripId: `MANUAL-${Date.now().toString().slice(-8)}`,
    rider,
    serviceDate,
    pickup: scheduledPickup,
    dropoff: scheduledDropoff,
    scheduledPickup,
    scheduledDropoff,
    address: sanitizeText(request?.pickupAddress, 500),
    destination: sanitizeText(request?.dropoffAddress, 500),
    notes: [
      'Manual trip created from driver request.',
      request?.notes ? `Driver note: ${sanitizeText(request.notes, 800)}` : '',
      request?.passengerPhone ? `Phone: ${sanitizeText(request.passengerPhone, 80)}` : ''
    ].filter(Boolean).join(' '),
    patientPhoneNumber: sanitizeText(request?.passengerPhone, 80),
    status: 'Scheduled',
    driverId: sanitizeText(request?.driverId, 120),
    driverName: sanitizeText(request?.driverName, 200),
    source: 'driver-trip-request',
    requestedByDriver: true,
    requestedTripId: sanitizeText(request?.id, 120),
    billingPricingModel: 'base-plus-mile',
    billingBasePrice: basePrice,
    billingPricePerMile: pricePerMile,
    estimatedRevenue,
    revenue: estimatedRevenue,
    billingStatus: 'Pending Completion',
    billingCode: 'BILL-NEW',
    billable: true,
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    confirmedByDispatcherAt: new Date().toISOString()
  };
};

// ---- GET: list created requests log (for web audit) ----
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'created';

  const filtered = await listDriverTripRequests(status);

  return jsonWithMobileCors(request, { ok: true, requests: filtered, total: filtered.length });
}

// ---- POST: driver creates a trip directly (no approval flow) ----
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const driverId = sanitizeText(body?.driverId);
  const driverName = sanitizeText(body?.driverName);
  if (!driverId) {
    return jsonWithMobileCors(request, { ok: false, error: 'driverId is required.' }, { status: 400 });
  }

  const authResult = await authorizeMobileDriverRequest(request, driverId);
  if (authResult.response) {
    return jsonWithMobileCors(request, { ok: false, error: 'Driver session expired. Please sign in again.' }, { status: 401 });
  }

  const sessionDriverId = sanitizeText(authResult.session?.driverId || driverId);
  const sessionDriverName = sanitizeText(authResult.session?.driverName || driverName);

  const passengerName = sanitizeText(body?.passengerName);
  const pickupAddress = sanitizeText(body?.pickupAddress);
  const dropoffAddress = sanitizeText(body?.dropoffAddress);
  const requestedDate = sanitizeText(body?.requestedDate);
  const requestedTime = sanitizeText(body?.requestedTime);

  if (!passengerName || !pickupAddress || !dropoffAddress || !requestedDate || !requestedTime) {
    return jsonWithMobileCors(request, { ok: false, error: 'passengerName, pickupAddress, dropoffAddress, requestedDate and requestedTime are required.' }, { status: 400 });
  }

  const newRequest = {
    id: generateRequestId(),
    driverId: sessionDriverId,
    driverName: sessionDriverName || driverName,
    passengerName,
    passengerPhone: sanitizeText(body?.passengerPhone),
    pickupAddress,
    dropoffAddress,
    requestedDate,
    requestedTime,
    notes: sanitizeText(body?.notes),
    requestedAt: sanitizeText(body?.requestedAt) || new Date().toISOString(),
    status: 'created',
    reviewedAt: sanitizeText(body?.requestedAt) || new Date().toISOString(),
    reviewedBy: 'driver-self',
    reviewNote: 'Created directly by driver. No dispatch approval required.',
    linkedTripId: ''
  };

  const dispatchState = await readNemtDispatchState({ includePastDates: true });
  const currentTrips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];
  const createdTrip = buildApprovedDispatchTrip(newRequest, {
    basePrice: body?.basePrice,
    pricePerMile: body?.pricePerMile
  });
  createdTrip.notes = [
    createdTrip.notes,
    `Created by driver: ${sanitizeText(sessionDriverName, 200) || sessionDriverId}`
  ].filter(Boolean).join(' ');
  createdTrip.createdByDriverName = sanitizeText(sessionDriverName, 200) || sessionDriverId;
  createdTrip.createdByDriverId = sessionDriverId;
  createdTrip.driverId = sessionDriverId;
  createdTrip.driverName = sanitizeText(sessionDriverName, 200) || sanitizeText(driverName, 200);
  createdTrip.assignedDriverName = sanitizeText(sessionDriverName, 200) || sanitizeText(driverName, 200);
  createdTrip.driverCreated = true;
  createdTrip.dispatchApprovalRequired = false;
  createdTrip.dispatchApprovalStatus = 'not-required';

  await writeNemtDispatchState({
    ...dispatchState,
    trips: [createdTrip, ...currentTrips]
  });

  const createdLog = {
    ...newRequest,
    linkedTripId: createdTrip.id
  };
  await upsertDriverTripRequest(createdLog);

  return jsonWithMobileCors(request, {
    ok: true,
    requestId: createdLog.id,
    tripId: createdTrip.id,
    status: 'created',
    message: 'Trip created by driver and synced to web dispatch.'
  });
}

// ---- PATCH: no longer used (direct create flow) ----
export async function PATCH(request) {
  return jsonWithMobileCors(request, {
    ok: false,
    error: 'Approval flow is disabled. Trips are created directly by driver via POST.'
  }, { status: 410 });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}
