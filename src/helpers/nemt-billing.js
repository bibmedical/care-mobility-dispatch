const BUCKET_RATE_COLUMNS = ['A', 'W', 'EP', 'E8', 'S', 'APEC', 'WPEC', 'GT', 'SGT'];

export const RATE_TABLES = {
  'bucket-pricing': {
    columns: ['Distance (mi)', ...BUCKET_RATE_COLUMNS],
    rows: [{
      label: '00-03',
      values: ['9.50', '19.00', '6.65', '13.30', '60.00', '10.21', '19.75', '6.65', '13.30']
    }, {
      label: '04-06',
      values: ['12.25', '22.00', '8.58', '15.40', '65.00', '13.00', '22.50', '8.58', '15.40']
    }, {
      label: '07-10',
      values: ['16.30', '26.00', '11.41', '18.20', '70.00', '16.25', '26.50', '11.41', '18.20']
    }, {
      label: 'Each Additional Miles',
      values: ['1.63', '1.95', '1.14', '1.37', '2.00', '1.63', '1.95', '1.14', '1.37'],
      selected: true
    }]
  },
  'standard-pricing': {
    columns: ['Distance (mi)', 'A', 'W', 'EP', 'E8', 'S', 'APEC', 'WPEC', 'GT', 'SGT'],
    rows: [{
      label: 'Seating',
      values: ['13.50', '0.00', '0.00', '0.00', '10.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: '1-1',
      values: ['10.00', '3.00', '2.00', '2.00', '1.50', '1.50', '1.50', '1.50', '0.00']
    }, {
      label: '2-2',
      values: ['5.00', '3.00', '2.00', '2.00', '2.00', '2.00', '2.00', '2.00', '0.00']
    }, {
      label: '3-3',
      values: ['3.33', '0.00', '0.00', '0.00', '1.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: '4-4',
      values: ['2.50', '0.00', '0.00', '0.00', '2.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: '5-5',
      values: ['2.00', '0.00', '0.00', '0.00', '3.00', '0.00', '0.00', '0.00', '0.00'],
      selected: true
    }, {
      label: '6-500',
      values: ['2.00', '0.00', '0.00', '0.00', '50.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: 'Each Additional Mile!',
      values: ['2.00', '3.00', '2.00', '2.00', '2.00', '2.00', '2.00', '2.00', '0.00']
    }]
  },
  'los-types': {
    columns: ['LOS', 'Target', 'Switch', 'Free Miles', 'Time Before (PU)', 'Price', 'Time After (PU)', 'Price', 'Escort', 'Attendant'],
    rows: ['A', 'W', 'EP', 'E8', 'S', 'APEC', 'WPEC', 'GT', 'SGT'].map(label => ({
      label,
      values: ['Bucket', '', '', '--:--', '', '--:--', '', '', ''],
      selected: label === 'S'
    }))
  },
  'age-buckets': {
    columns: ['Age Buckets (years)', 'Age Pricing'],
    rows: [{
      label: '0-0',
      values: ['0.00']
    }]
  }
};

const parseMoney = value => {
  const parsedValue = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const getTripLosCode = trip => {
  const source = `${trip?.los || ''} ${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'S';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};

const getRateColumnIndex = losCode => {
  const rateColumnIndex = BUCKET_RATE_COLUMNS.indexOf(losCode);
  return rateColumnIndex >= 0 ? rateColumnIndex : 0;
};

const getTripMiles = trip => {
  const directMiles = Number(trip?.miles);
  if (Number.isFinite(directMiles) && directMiles >= 0) return directMiles;
  const distanceMiles = Number(trip?.distanceMiles);
  if (Number.isFinite(distanceMiles) && distanceMiles >= 0) return distanceMiles;
  return 0;
};

const hasBillingMarker = trip => Boolean(trip?.billingCode || trip?.billingStatus || trip?.claimNumber || trip?.invoiceId || trip?.invoiceNumber || trip?.billedAt || trip?.billable);

export const getTripActualRevenue = trip => {
  for (const field of ['revenue', 'estimatedRevenue', 'fare']) {
    const value = Number(trip?.[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
};

export const estimateTripRevenueFromRates = trip => {
  const miles = getTripMiles(trip);
  const rateRows = RATE_TABLES['bucket-pricing'].rows;
  const rateColumnIndex = getRateColumnIndex(getTripLosCode(trip));
  const additionalRate = parseMoney(rateRows[3]?.values?.[rateColumnIndex]);

  if (miles <= 3) return parseMoney(rateRows[0]?.values?.[rateColumnIndex]);
  if (miles <= 6) return parseMoney(rateRows[1]?.values?.[rateColumnIndex]);
  if (miles <= 10) return parseMoney(rateRows[2]?.values?.[rateColumnIndex]);

  return parseMoney(rateRows[2]?.values?.[rateColumnIndex]) + Math.max(0, Math.ceil(miles - 10)) * additionalRate;
};

export const getTripBillingAmount = trip => {
  const actualRevenue = getTripActualRevenue(trip);
  if (actualRevenue > 0) return actualRevenue;
  if (hasBillingMarker(trip)) return estimateTripRevenueFromRates(trip);
  return 0;
};

export const isTripBillable = trip => getTripBillingAmount(trip) > 0;

export const getTripServiceMinutes = trip => {
  for (const field of ['durationMinutes', 'driveMinutes', 'serviceMinutes']) {
    const value = Number(trip?.[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
};

export const formatMinutesAsHours = totalMinutes => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0.0h';
  return `${(totalMinutes / 60).toFixed(1)}h`;
};