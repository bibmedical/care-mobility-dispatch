const DEFAULT_COUNTRY_CODE = '1';

export const normalizeConfirmationPhone = (value, defaultCountryCode = DEFAULT_COUNTRY_CODE) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
};

export const normalizeConfirmationName = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const parseHoldUntil = value => {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isBlacklistEntryActive = (entry, referenceDate = new Date()) => {
  if (String(entry?.status || '').trim() !== 'Active') return false;
  const holdUntil = parseHoldUntil(entry?.holdUntil);
  if (!holdUntil) return true;
  return referenceDate.getTime() <= holdUntil.getTime();
};

export const findTripOptOutEntry = ({ trip, optOutList, defaultCountryCode = DEFAULT_COUNTRY_CODE }) => {
  const normalizedTripPhone = normalizeConfirmationPhone(trip?.patientPhoneNumber, defaultCountryCode);
  const normalizedRider = normalizeConfirmationName(trip?.rider);

  return (Array.isArray(optOutList) ? optOutList : []).find(entry => {
    const entryPhone = normalizeConfirmationPhone(entry?.phone, defaultCountryCode);
    const entryName = normalizeConfirmationName(entry?.name);
    if (entryPhone && normalizedTripPhone && entryPhone === normalizedTripPhone) return true;
    if (entryName && normalizedRider && entryName === normalizedRider) return true;
    return false;
  }) || null;
};

export const findTripBlacklistEntry = ({ trip, blacklistEntries, defaultCountryCode = DEFAULT_COUNTRY_CODE, referenceDate = new Date() }) => {
  const normalizedTripPhone = normalizeConfirmationPhone(trip?.patientPhoneNumber, defaultCountryCode);
  const normalizedRider = normalizeConfirmationName(trip?.rider);

  return (Array.isArray(blacklistEntries) ? blacklistEntries : []).find(entry => {
    if (!isBlacklistEntryActive(entry, referenceDate)) return false;
    const entryPhone = normalizeConfirmationPhone(entry?.phone, defaultCountryCode);
    const entryName = normalizeConfirmationName(entry?.name);
    if (entryPhone && normalizedTripPhone && entryPhone === normalizedTripPhone) return true;
    if (entryName && normalizedRider && entryName === normalizedRider) return true;
    return false;
  }) || null;
};

export const getTripBlockingState = ({ trip, optOutList, blacklistEntries, defaultCountryCode = DEFAULT_COUNTRY_CODE, referenceDate = new Date() }) => {
  const optOutEntry = findTripOptOutEntry({
    trip,
    optOutList,
    defaultCountryCode
  });
  const blacklistEntry = findTripBlacklistEntry({
    trip,
    blacklistEntries,
    defaultCountryCode,
    referenceDate
  });

  if (blacklistEntry) {
    return {
      isBlocked: true,
      source: 'blacklist',
      optOutEntry,
      blacklistEntry,
      reason: blacklistEntry.notes || `${blacklistEntry.category || 'Black List'} entry is active.`
    };
  }

  if (optOutEntry) {
    return {
      isBlocked: true,
      source: 'optOut',
      optOutEntry,
      blacklistEntry: null,
      reason: optOutEntry.reason || 'Skipped because this patient is on the do-not-confirm list.'
    };
  }

  return {
    isBlocked: false,
    source: null,
    optOutEntry,
    blacklistEntry,
    reason: ''
  };
};

export const getEffectiveConfirmationStatus = (trip, blockingState) => {
  const rawStatus = String(trip?.confirmation?.status || 'Not Sent');
  if (blockingState?.isBlocked && (rawStatus === 'Not Sent' || rawStatus === 'Pending')) return 'Opted Out';
  return rawStatus;
};