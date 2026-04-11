import { randomUUID } from 'crypto';
import { queryRows, queryOne } from '@/server/db';
import { runMigrations } from '@/server/db-schema';
import { getTripBillingAmount } from '@/helpers/nemt-billing';
import { getTripServiceDateKey } from '@/helpers/nemt-dispatch-state';
import { readNemtDispatchState } from '@/server/nemt-dispatch-store';

const toMoney = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
};

const toGallons = value => {
  const gallons = Number(value);
  if (!Number.isFinite(gallons) || gallons < 0) return 0;
  return Math.round(gallons * 1000) / 1000;
};

const normalizeDateKey = value => {
  const key = String(value || '').trim();
  if (!key) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const parsed = new Date(key);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const normalizeText = value => String(value || '').trim();

const getTripTypeCode = trip => {
  const source = `${trip?.los || ''} ${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'STR';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};

export const readGeniusFuelReceipts = async ({ serviceDate = '', driverId = '' } = {}) => {
  await runMigrations();

  const dateKey = normalizeDateKey(serviceDate);
  const normalizedDriverId = normalizeText(driverId);

  const rows = await queryRows(
    `SELECT
       id,
       driver_id AS "driverId",
       service_date AS "serviceDate",
       amount,
       gallons,
       receipt_reference AS "receiptReference",
       receipt_image_url AS "receiptImageUrl",
        payment_card_image_url AS "paymentCardImageUrl",
        payment_card_last4 AS "paymentCardLast4",
      request_vehicle_mileage AS "requestVehicleMileage",
      previous_vehicle_mileage AS "previousVehicleMileage",
      miles_since_last_fuel AS "milesSinceLastFuel",
       vehicle_mileage AS "vehicleMileage",
       notes,
       submitted_by_user AS "submittedByUser",
       submitted_by_role AS "submittedByRole",
       source,
       created_at AS "createdAt"
     FROM genius_fuel_receipts
     WHERE ($1::text = '' OR service_date = $1)
       AND ($2::text = '' OR driver_id = $2)
     ORDER BY created_at DESC`,
    [dateKey, normalizedDriverId]
  );

  return rows;
};

export const createGeniusFuelReceipt = async ({
  driverId,
  serviceDate,
  amount,
  gallons,
  receiptReference,
  receiptImageUrl,
  paymentCardImageUrl,
  paymentCardLast4,
  requestVehicleMileage,
  previousVehicleMileage,
  milesSinceLastFuel,
  vehicleMileage,
  notes,
  submittedByUser,
  submittedByRole,
  source = 'admin'
}) => {
  await runMigrations();

  const normalizedDriverId = normalizeText(driverId);
  const dateKey = normalizeDateKey(serviceDate);
  const normalizedReference = normalizeText(receiptReference);
  const normalizedImageUrl = normalizeText(receiptImageUrl).slice(0, 400000);
  const normalizedPaymentCardImageUrl = normalizeText(paymentCardImageUrl).slice(0, 400000);
  const normalizedPaymentCardLast4 = normalizeText(paymentCardLast4).replace(/\D/g, '').slice(-4);
  const normalizedRequestVehicleMileage = requestVehicleMileage != null && Number.isFinite(Number(requestVehicleMileage)) && Number(requestVehicleMileage) >= 0
    ? Math.round(Number(requestVehicleMileage) * 10) / 10
    : null;
  const normalizedPreviousVehicleMileage = previousVehicleMileage != null && Number.isFinite(Number(previousVehicleMileage)) && Number(previousVehicleMileage) >= 0
    ? Math.round(Number(previousVehicleMileage) * 10) / 10
    : null;
  const normalizedMilesSinceLastFuel = milesSinceLastFuel != null && Number.isFinite(Number(milesSinceLastFuel)) && Number(milesSinceLastFuel) >= 0
    ? Math.round(Number(milesSinceLastFuel) * 10) / 10
    : null;
  const normalizedMileage = vehicleMileage != null && Number.isFinite(Number(vehicleMileage)) && Number(vehicleMileage) >= 0
    ? Math.round(Number(vehicleMileage) * 10) / 10
    : null;

  if (!normalizedDriverId) {
    throw new Error('driverId is required.');
  }
  if (!dateKey) {
    throw new Error('serviceDate is required (YYYY-MM-DD).');
  }
  if (!normalizedReference && !normalizedImageUrl) {
    throw new Error('receiptReference or a receipt photo is required.');
  }

  const row = await queryOne(
    `INSERT INTO genius_fuel_receipts (
       id,
       driver_id,
       service_date,
       amount,
       gallons,
       receipt_reference,
       receipt_image_url,
      payment_card_image_url,
      payment_card_last4,
      request_vehicle_mileage,
      previous_vehicle_mileage,
      miles_since_last_fuel,
       vehicle_mileage,
       notes,
       submitted_by_user,
       submitted_by_role,
       source,
       created_at
     )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
     RETURNING
       id,
       driver_id AS "driverId",
       service_date AS "serviceDate",
       amount,
       gallons,
       receipt_reference AS "receiptReference",
       receipt_image_url AS "receiptImageUrl",
      payment_card_image_url AS "paymentCardImageUrl",
      payment_card_last4 AS "paymentCardLast4",
      request_vehicle_mileage AS "requestVehicleMileage",
      previous_vehicle_mileage AS "previousVehicleMileage",
      miles_since_last_fuel AS "milesSinceLastFuel",
       vehicle_mileage AS "vehicleMileage",
       notes,
       submitted_by_user AS "submittedByUser",
       submitted_by_role AS "submittedByRole",
       source,
       created_at AS "createdAt"`,
    [
      randomUUID(),
      normalizedDriverId,
      dateKey,
      toMoney(amount),
      toGallons(gallons),
      normalizedReference,
      normalizedImageUrl,
      normalizedPaymentCardImageUrl,
      normalizedPaymentCardLast4,
      normalizedRequestVehicleMileage,
      normalizedPreviousVehicleMileage,
      normalizedMilesSinceLastFuel,
      normalizedMileage,
      normalizeText(notes),
      normalizeText(submittedByUser),
      normalizeText(submittedByRole),
      normalizeText(source) || 'admin'
    ]
  );

  return row;
};

export const readGeniusFuelReceiptSummary = async ({ serviceDate = '' } = {}) => {
  await runMigrations();
  const dateKey = normalizeDateKey(serviceDate);

  return await queryRows(
    `SELECT
       driver_id AS "driverId",
       COUNT(*)::int AS "receiptCount",
       COALESCE(SUM(amount), 0)::numeric AS "receiptAmount"
     FROM genius_fuel_receipts
     WHERE ($1::text = '' OR service_date = $1)
     GROUP BY driver_id`,
    [dateKey]
  );
};

export const readGeniusPayoutRuns = async ({ serviceDate = '', driverId = '', limit = 120 } = {}) => {
  await runMigrations();

  const dateKey = normalizeDateKey(serviceDate);
  const normalizedDriverId = normalizeText(driverId);
  const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 120));

  return await queryRows(
    `SELECT
       id,
       service_date AS "serviceDate",
       driver_id AS "driverId",
       gross_amount AS "grossAmount",
       trip_count AS "tripCount",
       wheelchair_count AS "wheelchairCount",
       ambulatory_count AS "ambulatoryCount",
       stretcher_count AS "stretcherCount",
       fuel_receipt_count AS "fuelReceiptCount",
       fuel_total AS "fuelTotal",
       reimburse_allowed AS "reimburseAllowed",
       payload,
       created_by_user AS "createdByUser",
       created_at AS "createdAt"
     FROM genius_payout_runs
     WHERE ($1::text = '' OR service_date = $1)
       AND ($2::text = '' OR driver_id = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [dateKey, normalizedDriverId, normalizedLimit]
  );
};

export const readGeniusPayoutRunById = async payoutId => {
  await runMigrations();
  const normalizedId = normalizeText(payoutId);
  if (!normalizedId) return null;

  return await queryOne(
    `SELECT
       id,
       service_date AS "serviceDate",
       driver_id AS "driverId",
       gross_amount AS "grossAmount",
       trip_count AS "tripCount",
       wheelchair_count AS "wheelchairCount",
       ambulatory_count AS "ambulatoryCount",
       stretcher_count AS "stretcherCount",
       fuel_receipt_count AS "fuelReceiptCount",
       fuel_total AS "fuelTotal",
       reimburse_allowed AS "reimburseAllowed",
       payload,
       created_by_user AS "createdByUser",
       created_at AS "createdAt"
     FROM genius_payout_runs
     WHERE id = $1`,
    [normalizedId]
  );
};

export const createGeniusPayoutRun = async ({
  serviceDate,
  driverId,
  createdByUser
}) => {
  await runMigrations();

  const dateKey = normalizeDateKey(serviceDate);
  const normalizedDriverId = normalizeText(driverId);
  const normalizedCreatedByUser = normalizeText(createdByUser);

  if (!dateKey) {
    throw new Error('serviceDate is required (YYYY-MM-DD).');
  }
  if (!normalizedDriverId) {
    throw new Error('driverId is required.');
  }

  const dispatchState = await readNemtDispatchState();
  const allTrips = Array.isArray(dispatchState?.trips) ? dispatchState.trips : [];
  const scopedTrips = allTrips.filter(trip => {
    const tripDate = getTripServiceDateKey(trip, dispatchState.routePlans, allTrips);
    const tripDriverId = String(trip?.driverId || '').trim();
    return tripDate === dateKey && tripDriverId === normalizedDriverId;
  });

  const tripRows = scopedTrips.map(trip => {
    const amount = getTripBillingAmount(trip);
    return {
      id: String(trip?.brokerTripId || trip?.rideId || trip?.id || '').trim(),
      rider: String(trip?.rider || '').trim() || '-',
      status: String(trip?.safeRideStatus || trip?.status || '').trim() || '-',
      tripType: getTripTypeCode(trip),
      amount
    };
  }).filter(row => row.amount > 0);

  if (tripRows.length === 0) {
    throw new Error('No billable trips found for that driver/date.');
  }

  const fuelReceipts = await readGeniusFuelReceipts({ serviceDate: dateKey, driverId: normalizedDriverId });
  const fuelReceiptCount = fuelReceipts.length;
  const fuelTotal = fuelReceipts.reduce((acc, row) => acc + (Number(row?.amount) || 0), 0);

  const totals = tripRows.reduce((acc, row) => {
    acc.grossAmount += row.amount;
    acc.tripCount += 1;
    if (row.tripType === 'W') acc.wheelchairCount += 1;
    if (row.tripType === 'A') acc.ambulatoryCount += 1;
    if (row.tripType === 'STR') acc.stretcherCount += 1;
    return acc;
  }, {
    grossAmount: 0,
    tripCount: 0,
    wheelchairCount: 0,
    ambulatoryCount: 0,
    stretcherCount: 0
  });

  const payload = {
    serviceDate: dateKey,
    driverId: normalizedDriverId,
    tripRows,
    fuelReceipts: fuelReceipts.map(receipt => ({
      id: receipt.id,
      amount: Number(receipt?.amount) || 0,
      gallons: Number(receipt?.gallons) || 0,
      receiptReference: receipt?.receiptReference || '',
      requestVehicleMileage: receipt?.requestVehicleMileage != null ? Number(receipt.requestVehicleMileage) : null,
      previousVehicleMileage: receipt?.previousVehicleMileage != null ? Number(receipt.previousVehicleMileage) : null,
      milesSinceLastFuel: receipt?.milesSinceLastFuel != null ? Number(receipt.milesSinceLastFuel) : null,
      createdAt: receipt?.createdAt || ''
    }))
  };

  return await queryOne(
    `INSERT INTO genius_payout_runs (
       id,
       service_date,
       driver_id,
       gross_amount,
       trip_count,
       wheelchair_count,
       ambulatory_count,
       stretcher_count,
       fuel_receipt_count,
       fuel_total,
       reimburse_allowed,
       payload,
       created_by_user,
       created_at
     ) VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13,
       NOW()
     )
     RETURNING
       id,
       service_date AS "serviceDate",
       driver_id AS "driverId",
       gross_amount AS "grossAmount",
       trip_count AS "tripCount",
       wheelchair_count AS "wheelchairCount",
       ambulatory_count AS "ambulatoryCount",
       stretcher_count AS "stretcherCount",
       fuel_receipt_count AS "fuelReceiptCount",
       fuel_total AS "fuelTotal",
       reimburse_allowed AS "reimburseAllowed",
       payload,
       created_by_user AS "createdByUser",
       created_at AS "createdAt"`,
    [
      randomUUID(),
      dateKey,
      normalizedDriverId,
      toMoney(totals.grossAmount),
      totals.tripCount,
      totals.wheelchairCount,
      totals.ambulatoryCount,
      totals.stretcherCount,
      fuelReceiptCount,
      toMoney(fuelTotal),
      fuelReceiptCount > 0,
      payload,
      normalizedCreatedByUser
    ]
  );
};

// ── Fuel Requests (driver request → admin approval → driver submits receipt) ──

const FUEL_REQUEST_COLS = `
  id,
  driver_id AS "driverId",
  driver_name AS "driverName",
  status,
  requested_at AS "requestedAt",
  approved_by_user AS "approvedByUser",
  approved_at AS "approvedAt",
  approved_amount AS "approvedAmount",
  transfer_method AS "transferMethod",
  transfer_reference AS "transferReference",
  transfer_notes AS "transferNotes",
  receipt_image_url AS "receiptImageUrl",
  payment_card_image_url AS "paymentCardImageUrl",
  payment_card_last4 AS "paymentCardLast4",
  requested_mileage AS "requestedMileage",
  last_fuel_mileage AS "lastFuelMileage",
  miles_since_last_fuel AS "milesSinceLastFuel",
  gallons,
  vehicle_mileage AS "vehicleMileage",
  receipt_submitted_at AS "receiptSubmittedAt",
  genius_receipt_id AS "geniusReceiptId"
`;

export const createFuelRequest = async ({ driverId, driverName, requestedMileage }) => {
  await runMigrations();
  const normalizedDriverId = normalizeText(driverId);
  const normalizedDriverName = normalizeText(driverName);
  const normalizedRequestedMileage = requestedMileage != null && Number.isFinite(Number(requestedMileage)) && Number(requestedMileage) >= 0
    ? Math.round(Number(requestedMileage) * 10) / 10
    : null;
  if (!normalizedDriverId) throw new Error('driverId is required.');

  if (normalizedRequestedMileage === null) throw new Error('Current mileage is required.');

  const lastFuelRow = await queryOne(
    `SELECT vehicle_mileage AS "vehicleMileage"
     FROM genius_fuel_requests
     WHERE driver_id = $1
       AND status = 'receipt_submitted'
       AND vehicle_mileage IS NOT NULL
     ORDER BY receipt_submitted_at DESC NULLS LAST, requested_at DESC
     LIMIT 1`,
    [normalizedDriverId]
  );

  const lastFuelMileage = lastFuelRow?.vehicleMileage != null
    ? Math.round(Number(lastFuelRow.vehicleMileage) * 10) / 10
    : null;

  if (lastFuelMileage != null && normalizedRequestedMileage < lastFuelMileage) {
    throw new Error(`Current mileage (${normalizedRequestedMileage.toFixed(1)}) cannot be below last fuel mileage (${lastFuelMileage.toFixed(1)}).`);
  }

  const milesSinceLastFuel = lastFuelMileage != null
    ? Math.round((normalizedRequestedMileage - lastFuelMileage) * 10) / 10
    : null;

  return await queryOne(
    `INSERT INTO genius_fuel_requests (
      id,
      driver_id,
      driver_name,
      status,
      requested_at,
      requested_mileage,
      last_fuel_mileage,
      miles_since_last_fuel
    )
     VALUES ($1, $2, $3, 'pending', NOW(), $4, $5, $6)
     RETURNING ${FUEL_REQUEST_COLS}`,
    [
      randomUUID(),
      normalizedDriverId,
      normalizedDriverName,
      normalizedRequestedMileage,
      lastFuelMileage,
      milesSinceLastFuel
    ]
  );
};

export const readFuelRequests = async ({ status = '', limit = 100 } = {}) => {
  await runMigrations();
  const normalizedStatus = normalizeText(status);
  const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  return await queryRows(
    `SELECT ${FUEL_REQUEST_COLS}
     FROM genius_fuel_requests
     WHERE ($1::text = '' OR status = $1)
     ORDER BY requested_at DESC
     LIMIT $2`,
    [normalizedStatus, normalizedLimit]
  );
};

export const readDriverFuelRequests = async ({ driverId, limit = 20 } = {}) => {
  await runMigrations();
  const normalizedDriverId = normalizeText(driverId);
  if (!normalizedDriverId) return [];
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return await queryRows(
    `SELECT ${FUEL_REQUEST_COLS}
     FROM genius_fuel_requests
     WHERE driver_id = $1
     ORDER BY requested_at DESC
     LIMIT $2`,
    [normalizedDriverId, normalizedLimit]
  );
};

export const approveFuelRequest = async ({
  requestId,
  approvedByUser,
  approvedAmount,
  transferMethod,
  transferReference,
  transferNotes
}) => {
  await runMigrations();
  const normalizedId = normalizeText(requestId);
  if (!normalizedId) throw new Error('requestId is required.');
  const row = await queryOne(
    `UPDATE genius_fuel_requests
     SET status = 'approved',
         approved_by_user = $2,
         approved_at = NOW(),
         approved_amount = $3,
         transfer_method = $4,
         transfer_reference = $5,
         transfer_notes = $6
     WHERE id = $1 AND status = 'pending'
     RETURNING ${FUEL_REQUEST_COLS}`,
    [
      normalizedId,
      normalizeText(approvedByUser),
      approvedAmount != null ? toMoney(approvedAmount) : null,
      normalizeText(transferMethod),
      normalizeText(transferReference),
      normalizeText(transferNotes)
    ]
  );
  if (!row) throw new Error('Request not found or already processed.');
  return row;
};

export const submitFuelRequestReceipt = async ({
  requestId,
  receiptImageUrl,
  paymentCardImageUrl,
  paymentCardLast4,
  gallons,
  vehicleMileage
}) => {
  await runMigrations();
  const normalizedId = normalizeText(requestId);
  if (!normalizedId) throw new Error('requestId is required.');
  const normalizedImageUrl = normalizeText(receiptImageUrl).slice(0, 400000);
  if (!normalizedImageUrl) throw new Error('Receipt photo is required.');
  const normalizedPaymentCardImageUrl = normalizeText(paymentCardImageUrl).slice(0, 400000);
  if (!normalizedPaymentCardImageUrl) throw new Error('Payment card photo is required.');
  const normalizedPaymentCardLast4 = normalizeText(paymentCardLast4).replace(/\D/g, '').slice(-4);
  if (!/^\d{4}$/.test(normalizedPaymentCardLast4)) throw new Error('Last 4 card digits are required.');
  const normalizedGallons = toGallons(gallons);
  if (normalizedGallons <= 0) throw new Error('Gallons is required.');
  const normalizedMileage = vehicleMileage != null && Number.isFinite(Number(vehicleMileage)) && Number(vehicleMileage) >= 0
    ? Math.round(Number(vehicleMileage) * 10) / 10
    : null;
  if (normalizedMileage === null) throw new Error('Vehicle mileage is required.');
  const row = await queryOne(
    `UPDATE genius_fuel_requests
     SET status = 'receipt_submitted',
         receipt_image_url = $2,
         payment_card_image_url = $3,
         payment_card_last4 = $4,
         gallons = $5,
         vehicle_mileage = $6,
         receipt_submitted_at = NOW()
     WHERE id = $1 AND status = 'approved'
     RETURNING ${FUEL_REQUEST_COLS}`,
    [
      normalizedId,
      normalizedImageUrl,
      normalizedPaymentCardImageUrl,
      normalizedPaymentCardLast4,
      normalizedGallons,
      normalizedMileage
    ]
  );
  if (!row) throw new Error('Request not found or not in approved status.');
  return row;
};
