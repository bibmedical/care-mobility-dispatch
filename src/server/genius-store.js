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
  notes,
  submittedByUser,
  submittedByRole,
  source = 'admin'
}) => {
  await runMigrations();

  const normalizedDriverId = normalizeText(driverId);
  const dateKey = normalizeDateKey(serviceDate);
  const normalizedReference = normalizeText(receiptReference);
  const normalizedImageUrl = normalizeText(receiptImageUrl).slice(0, 8000);

  if (!normalizedDriverId) {
    throw new Error('driverId is required.');
  }
  if (!dateKey) {
    throw new Error('serviceDate is required (YYYY-MM-DD).');
  }
  if (!normalizedReference) {
    throw new Error('receiptReference is required.');
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
       notes,
       submitted_by_user,
       submitted_by_role,
       source,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING
       id,
       driver_id AS "driverId",
       service_date AS "serviceDate",
       amount,
       gallons,
       receipt_reference AS "receiptReference",
       receipt_image_url AS "receiptImageUrl",
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
