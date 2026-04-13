import { SYSTEM_USERS, isDriverRole, normalizePhoneDigits, normalizeAuthValue } from '@/helpers/system-users';

const ORLANDO_CENTER = [28.5383, -81.3792];
const ALERT_WINDOW_DAYS = 30;
const ONLINE_WINDOW_MINUTES = 5;
const ROUTE_ROSTER_DEFAULT_START = '12:00 AM';
const ROUTE_ROSTER_DEFAULT_END = '11:59 PM';
const DRIVER_GPS_DEFAULTS = {
  mapRadiusMeters: 800,
  fgTimeIntervalMs: 5000,
  fgDistanceIntervalMeters: 8,
  bgTimeIntervalMs: 15000,
  bgDistanceIntervalMeters: 12,
  vehicleIconScalePercent: 100,
  vehicleIconSvgPath: ''
};

export const VEHICLE_TYPE_OPTIONS = ['Ambulance', 'Van', 'Sedan'];
export const GROUPING_SERVICE_TYPE_OPTIONS = ['A', 'W', 'WXL', 'EW', 'Walker', 'STR'];
const CAPABILITY_BADGE_ORDER = ['A', 'W', 'WXL', 'EW', 'Walker', 'STR'];
const VEHICLE_FILTER_PRIORITY = ['STR', 'EW', 'WXL', 'W', 'Walker', 'A'];

export const normalizeVehicleType = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return VEHICLE_TYPE_OPTIONS.find(option => option.toLowerCase() === normalized) || '';
};

export const normalizeGroupingServiceType = value => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'a' || normalized === 'ambulatory') return 'A';
  if (normalized === 'w' || normalized === 'manual wheelchair' || normalized === 'wheelchair') return 'W';
  if (normalized === 'wxl' || normalized === 'folding wheelchair' || normalized.includes('xl')) return 'WXL';
  if (normalized === 'ew' || normalized === 'we' || normalized === 'power wheelchair' || normalized.includes('electric')) return 'EW';
  if (normalized === 'walker') return 'Walker';
  if (normalized === 'str' || normalized.includes('stretcher') || normalized.includes('gurney')) return 'STR';
  return '';
};

const clampNumeric = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

export const normalizeDriverGpsSettings = value => {
  const settings = value && typeof value === 'object' ? value : {};
  const rawVehicleIconSvgPath = String(settings.vehicleIconSvgPath || '').trim();
  const normalizedVehicleIconSvgPath = rawVehicleIconSvgPath ? `/${rawVehicleIconSvgPath.replace(/^\/+/, '')}` : '';
  return {
    mapRadiusMeters: clampNumeric(settings.mapRadiusMeters, 100, 5000, DRIVER_GPS_DEFAULTS.mapRadiusMeters),
    fgTimeIntervalMs: clampNumeric(settings.fgTimeIntervalMs, 2000, 30000, DRIVER_GPS_DEFAULTS.fgTimeIntervalMs),
    fgDistanceIntervalMeters: clampNumeric(settings.fgDistanceIntervalMeters, 3, 100, DRIVER_GPS_DEFAULTS.fgDistanceIntervalMeters),
    bgTimeIntervalMs: clampNumeric(settings.bgTimeIntervalMs, 5000, 120000, DRIVER_GPS_DEFAULTS.bgTimeIntervalMs),
    bgDistanceIntervalMeters: clampNumeric(settings.bgDistanceIntervalMeters, 5, 200, DRIVER_GPS_DEFAULTS.bgDistanceIntervalMeters),
    vehicleIconScalePercent: clampNumeric(settings.vehicleIconScalePercent, 70, 200, DRIVER_GPS_DEFAULTS.vehicleIconScalePercent),
    vehicleIconSvgPath: normalizedVehicleIconSvgPath
  };
};

const VEHICLE_SEED = [{
  id: 'veh-1',
  label: 'Ford Transit 2018',
  vin: '1FTYE2CM9JKB06578',
  plate: 'CM-2018-01',
  unitNumber: 'VID-001',
  type: 'Van',
  ambulatoryCapacity: 3,
  wheelchairCapacity: 2,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-2',
  label: 'Toyota Sienna 2018',
  vin: '5TDXZ3DC3JS945582',
  plate: 'CM-2018-02',
  unitNumber: 'VID-002',
  type: 'Ambulance',
  ambulatoryCapacity: 4,
  wheelchairCapacity: 0,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-3',
  label: 'Dodge Gran Caravan 2017',
  vin: '2C4RDGEG2HR710125',
  plate: 'CM-2017-03',
  unitNumber: 'VID-003',
  type: 'Ambulance',
  ambulatoryCapacity: 3,
  wheelchairCapacity: 1,
  stretcherCapacity: 1,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-4',
  label: 'Toyota Corolla 2024 Gris',
  vin: '5YFB4MDE1RP160840',
  plate: 'CM-2024-04',
  unitNumber: 'VID-004',
  type: 'Ambulance',
  ambulatoryCapacity: 3,
  wheelchairCapacity: 0,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-5',
  label: 'Ford Transit 2015',
  vin: '1FBZX2XM7FKB06583',
  plate: 'CM-2015-05',
  unitNumber: 'VID-005',
  type: 'Ambulance',
  ambulatoryCapacity: 4,
  wheelchairCapacity: 2,
  stretcherCapacity: 1,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-6',
  label: 'Ford Transit 2016',
  vin: '1FBZX2CMXGKA45768',
  plate: 'CM-2016-06',
  unitNumber: 'VID-006',
  type: 'Ambulance',
  ambulatoryCapacity: 4,
  wheelchairCapacity: 0,
  stretcherCapacity: 1,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-7',
  label: 'Toyota Corolla Silver 2024',
  vin: '5YFB4MDE7RP186536',
  plate: 'CM-2024-07',
  unitNumber: 'VID-007',
  type: 'Ambulance',
  ambulatoryCapacity: 3,
  wheelchairCapacity: 0,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-8',
  label: 'Ford Transit 2015',
  vin: '1FDZX2CM0FKA27799',
  plate: 'CM-2015-08',
  unitNumber: 'VID-008',
  type: 'Ambulance',
  ambulatoryCapacity: 4,
  wheelchairCapacity: 2,
  stretcherCapacity: 1,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-9',
  label: 'Ford Transit 2021',
  vin: '1FBAK2C86MKA51028',
  plate: 'CM-2021-09',
  unitNumber: 'VID-009',
  type: 'Ambulance',
  ambulatoryCapacity: 5,
  wheelchairCapacity: 0,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-10',
  label: 'Toyota Corolla 2016',
  vin: '5YFBURHEXGP517632',
  plate: 'CM-2016-10',
  unitNumber: 'VID-010',
  type: 'Ambulance',
  ambulatoryCapacity: 2,
  wheelchairCapacity: 0,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-11',
  label: 'Ford Transit 2015',
  vin: '1FBZX2CM3FKA87195',
  plate: 'CM-2015-11',
  unitNumber: 'VID-011',
  type: 'Van',
  ambulatoryCapacity: 3,
  wheelchairCapacity: 2,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}, {
  id: 'veh-12',
  label: 'Ford Transit 2016',
  vin: '1FDZX2CM3GKB23032',
  plate: 'CM-2016-12',
  unitNumber: 'VID-012',
  type: 'Van',
  ambulatoryCapacity: 3,
  wheelchairCapacity: 2,
  stretcherCapacity: 0,
  notes: 'Broker ID is empty'
}];

const GROUPING_SEED = [{
  id: 'grp-1',
  name: 'Dispatch Ready',
  description: 'Drivers with compliant documents and active units.',
  dispatchTag: 'Ready',
  atd: 'ATD-A',
  workHours: '06:00 - 14:00',
  billingCode: 'BILL-READY',
  notes: 'Current dispatch-ready roster',
  status: 'Active'
}, {
  id: 'grp-2',
  name: 'Needs Review',
  description: 'Drivers with expiring docs or pending compliance tasks.',
  dispatchTag: 'Review',
  atd: 'ATD-R',
  workHours: '08:00 - 16:00',
  billingCode: 'BILL-REVIEW',
  notes: 'Needs compliance review',
  status: 'Attention'
}, {
  id: 'grp-3',
  name: 'Onboarding',
  description: 'New drivers waiting on credentials or assignments.',
  dispatchTag: 'Onboarding',
  atd: 'ATD-O',
  workHours: 'Flexible',
  billingCode: 'BILL-NEW',
  notes: 'Awaiting setup',
  status: 'Pending'
}];

const VEHICLE_ASSIGNMENTS = {
  balbino: 'veh-1',
  joel: 'veh-2',
  harold: 'veh-2',
  francisco: 'veh-2',
  toledo: 'veh-2',
  angel: 'veh-2',
  felipe: 'veh-3',
  carlos: 'veh-3',
  care: 'veh-3',
  yanelis: 'veh-4',
  vivi: 'veh-4',
  gabriel: 'veh-4',
  indira: 'veh-4',
  ricardo: 'veh-5',
  lexy: 'veh-5',
  roman: 'veh-5',
  sergio: 'veh-6',
  yosbeny: 'veh-6',
  elieser: 'veh-7',
  lisvany: 'veh-7',
  ernesto: 'veh-8',
  orlando: 'veh-9',
  leandro: 'veh-10',
  fernandez: 'veh-10'
};

const POSITION_OFFSETS = [[0.006, -0.01], [0.012, 0.018], [-0.014, 0.01], [0.02, -0.02], [-0.018, -0.014], [0.009, 0.026], [-0.023, 0.02], [0.016, -0.028], [0.028, 0.005], [-0.03, -0.006], [0.022, 0.017], [-0.011, 0.029]];

const safeDate = value => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toDateKey = value => {
  const date = safeDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getActiveTimeOffAppointment = driver => {
  const appointment = driver?.timeOffAppointment;
  if (!appointment || typeof appointment !== 'object') return null;
  const status = String(appointment.status || 'active').trim().toLowerCase();
  if (status !== 'active') return null;
  const appointmentDate = String(appointment.appointmentDate || '').trim();
  if (!appointmentDate) return null;
  return {
    ...appointment,
    appointmentDate
  };
};

const hasDriverTimeOffOnDate = (driver, referenceDate = new Date()) => {
  const activeAppointment = getActiveTimeOffAppointment(driver);
  if (!activeAppointment) return false;
  return activeAppointment.appointmentDate === toDateKey(referenceDate);
};

export const getCurrentRosterWeekKey = (referenceDate = new Date()) => {
  const nextDate = new Date(referenceDate);
  nextDate.setHours(0, 0, 0, 0);
  nextDate.setDate(nextDate.getDate() - nextDate.getDay());
  return nextDate.toISOString().slice(0, 10);
};

export const normalizeRouteRoster = (value, driver = null) => {
  const fallbackMode = driver?.vehicleId ? 'permanent' : 'off';
  const normalizedMode = ['off', 'weekly', 'permanent'].includes(value?.mode) ? value.mode : fallbackMode;
  return {
    mode: normalizedMode,
    weekKey: value?.weekKey || getCurrentRosterWeekKey(),
    workStart: value?.workStart || ROUTE_ROSTER_DEFAULT_START,
    workEnd: value?.workEnd || ROUTE_ROSTER_DEFAULT_END,
    atd: value?.atd || 'none'
  };
};

export const isDriverOnActiveRoster = (driver, referenceDate = new Date()) => {
  if (hasDriverTimeOffOnDate(driver, referenceDate)) return false;
  const routeRoster = normalizeRouteRoster(driver?.routeRoster, driver);
  if (routeRoster.mode === 'permanent') return true;
  if (routeRoster.mode === 'weekly') return routeRoster.weekKey === getCurrentRosterWeekKey(referenceDate);
  return false;
};

const slugify = value => normalizeAuthValue(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `item-${Date.now()}`;

export const createGeneratedId = prefix => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const buildStableDriverId = driver => `drv-${slugify(driver?.authUserId || driver?.username || driver?.email || getFullName(driver) || driver?.id || 'driver')}`;

export const createBlankDriver = () => ({
  id: createGeneratedId('driver'),
  firstName: '',
  middleInitial: '',
  lastName: '',
  displayName: '',
  username: '',
  email: '',
  phone: '',
  role: 'Driver(Driver)',
  attendantId: '',
  vehicleId: '',
  groupingId: 'grp-3',
  companyName: 'Florida Mobility Group',
  taxId: '',
  brokerId: '',
  notes: '',
  profileStatus: 'Active',
  portalUsername: '',
  portalEmail: '',
  mobilePin: '',
  mfaEnabled: false,
  passwordResetRequired: false,
  backgroundCheckStatus: 'Pending',
  drugScreenStatus: 'Pending',
  cprCertified: false,
  defensiveDrivingCertified: false,
  hipaaCertified: false,
  nemtCertified: false,
  licenseNumber: '',
  licenseClass: '',
  licenseState: 'FL',
  licenseIssueDate: '',
  licenseExpirationDate: '',
  medCardExpirationDate: '',
  chauffeurPermit: '',
  dmvVerified: false,
  insuranceAccredited: false,
  insuranceCarrier: '',
  insurancePolicyNumber: '',
  insuranceExpirationDate: '',
  workersCompPolicyNumber: '',
  workersCompExpirationDate: '',
  taxIdVerified: false,
  w9OnFile: false,
  checkpoint: 'Base dispatch',
  live: 'Offline',
  trackingSource: '',
  trackingLastSeen: '',
  position: ORLANDO_CENTER,
  gpsSettings: normalizeDriverGpsSettings(null),
  routeRoster: normalizeRouteRoster(null),
  documents: {
    profilePhoto: null,
    licenseFront: null,
    licenseBack: null,
    insuranceCertificate: null,
    w9Document: null,
    trainingCertificate: null
  }
});

export const createBlankAttendant = () => ({
  id: createGeneratedId('att'),
  name: '',
  phone: '',
  email: '',
  certification: 'Basic',
  status: 'Active',
  notes: ''
});

export const createBlankVehicle = () => ({
  id: createGeneratedId('veh'),
  label: '',
  vin: '',
  plate: '',
  unitNumber: '',
  type: 'Ambulance',
  ambulatoryCapacity: 0,
  wheelchairCapacity: 0,
  wheelchairXlCapacity: 0,
  wheelchairElectricCapacity: 0,
  walkerCapacity: 0,
  stretcherCapacity: 0,
  imageUrl: '',
  notes: '',
  brokerId: ''
});

export const getVehicleCapabilityTokens = vehicle => {
  if (!vehicle || typeof vehicle !== 'object') return [];

  const ambulatory = Math.max(0, Number(vehicle.ambulatoryCapacity || 0));
  const wheelchair = Math.max(0, Number(vehicle.wheelchairCapacity || 0));
  const wheelchairXl = Math.max(0, Number(vehicle.wheelchairXlCapacity || 0));
  const wheelchairElectric = Math.max(0, Number(vehicle.wheelchairElectricCapacity || 0));
  const walker = Math.max(0, Number(vehicle.walkerCapacity || 0));
  const stretcher = Math.max(0, Number(vehicle.stretcherCapacity || 0));
  const tokens = [];

  if (ambulatory > 0) tokens.push(`A${ambulatory}`);
  if (wheelchair > 0) tokens.push(`W${wheelchair}`);
  if (wheelchairXl > 0) tokens.push(`WXL${wheelchairXl}`);
  if (wheelchairElectric > 0) tokens.push(`EW${wheelchairElectric}`);
  if (walker > 0) tokens.push(`Walker${walker}`);
  if (stretcher > 0) tokens.push(`STR${stretcher}`);

  return tokens.sort((leftToken, rightToken) => {
    const leftPrefix = leftToken.replace(/\d+$/, '');
    const rightPrefix = rightToken.replace(/\d+$/, '');
    return CAPABILITY_BADGE_ORDER.indexOf(leftPrefix) - CAPABILITY_BADGE_ORDER.indexOf(rightPrefix);
  });
};

export const getVehiclePrimaryServiceType = vehicle => {
  const capabilityPrefixes = new Set(getVehicleCapabilityTokens(vehicle).map(token => token.replace(/\d+$/, '')).filter(Boolean));
  return VEHICLE_FILTER_PRIORITY.find(filterKey => capabilityPrefixes.has(filterKey)) || '';
};

export const createBlankGrouping = () => ({
  id: createGeneratedId('grp'),
  name: '',
  vehicleType: '',
  assignedVehicleIds: [],
  description: '',
  dispatchTag: '',
  atd: '',
  workHours: '',
  billingCode: '',
  notes: '',
  status: 'Active'
});

export const getFullName = person => [person.firstName, person.middleInitial, person.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

const getDefaultDriverMobilePin = driver => {
  const configuredPin = String(driver?.mobilePin || '').trim();
  if (configuredPin) return configuredPin;

  const phoneDigits = normalizePhoneDigits(driver?.phone);
  return phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';
};

export const isDriverOnline = driver => {
  if (normalizeAuthValue(driver?.trackingSource) !== 'android') return false;
  const lastSeen = safeDate(driver?.trackingLastSeen);
  if (!lastSeen) return false;
  return Date.now() - lastSeen.getTime() <= ONLINE_WINDOW_MINUTES * 60 * 1000;
};

export const normalizeDriverTracking = driver => ({
  ...driver,
  mobilePin: getDefaultDriverMobilePin(driver),
  routeRoster: normalizeRouteRoster(driver?.routeRoster, driver),
  trackingSource: driver?.trackingSource || '',
  trackingLastSeen: driver?.trackingLastSeen || '',
  live: isDriverOnline(driver) ? 'Online' : 'Offline',
  checkpoint: isDriverOnline(driver) ? driver?.checkpoint || 'Android GPS active' : driver?.checkpoint || 'Waiting signal'
});

const getSeedPosition = index => {
  const offset = POSITION_OFFSETS[index % POSITION_OFFSETS.length];
  return [ORLANDO_CENTER[0] + offset[0], ORLANDO_CENTER[1] + offset[1]];
};

const buildDriverSeed = () => {
  const driverUsers = SYSTEM_USERS.filter(user => isDriverRole(user.role));
  return driverUsers.map((user, index) => {
    const firstName = user.firstName;
    const lastName = user.lastName;
    const vehicleId = VEHICLE_ASSIGNMENTS[normalizeAuthValue(user.username)] || '';
    const groupId = vehicleId ? 'grp-1' : 'grp-3';
    return {
      ...createBlankDriver(),
      id: `drv-${slugify(`${user.username}-${user.id}`)}`,
      firstName,
      middleInitial: user.middleInitial,
      lastName,
      displayName: getFullName({ firstName, middleInitial: user.middleInitial, lastName }),
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      portalUsername: user.username,
      portalEmail: user.email,
      vehicleId,
      groupingId: groupId,
      checkpoint: vehicleId ? 'Vehicle ready' : 'Needs assignment',
      live: 'Offline',
      trackingSource: '',
      trackingLastSeen: '',
      position: getSeedPosition(index),
      routeRoster: normalizeRouteRoster({ mode: vehicleId ? 'permanent' : 'off' }, { vehicleId }),
      notes: vehicleId ? 'Imported from roster' : 'Pending vehicle assignment',
      profileStatus: groupId === 'grp-1' ? 'Active' : 'Pending',
      backgroundCheckStatus: groupId === 'grp-1' ? 'Clear' : 'Pending',
      drugScreenStatus: groupId === 'grp-1' ? 'Clear' : 'Pending',
      cprCertified: groupId === 'grp-1',
      defensiveDrivingCertified: groupId === 'grp-1',
      hipaaCertified: groupId === 'grp-1',
      nemtCertified: groupId === 'grp-1',
      licenseNumber: `DL-${String(index + 1).padStart(6, '0')}`,
      licenseClass: vehicleId?.includes('veh-4') || vehicleId?.includes('veh-10') ? 'C' : 'E',
      licenseIssueDate: '2025-01-01',
      licenseExpirationDate: '2027-12-31',
      medCardExpirationDate: '2027-09-30',
      dmvVerified: true,
      insuranceAccredited: true,
      insuranceCarrier: 'Progressive Commercial',
      insurancePolicyNumber: `POL-${1000 + index}`,
      insuranceExpirationDate: '2026-12-31',
      workersCompPolicyNumber: `WC-${1000 + index}`,
      workersCompExpirationDate: '2026-11-30',
      taxId: '59-0000000',
      taxIdVerified: true,
      w9OnFile: true
    };
  });
};

export const buildInitialAdminData = () => ({
  version: 3,
  drivers: buildDriverSeed(),
  attendants: [],
  vehicles: VEHICLE_SEED.map(vehicle => ({ ...vehicle })),
  groupings: GROUPING_SEED.map(grouping => ({ ...grouping }))
});

const getAssignedVehicleTypesForGrouping = (groupingId, state) => {
  const groupings = Array.isArray(state?.groupings) ? state.groupings : [];
  const vehicles = Array.isArray(state?.vehicles) ? state.vehicles : [];
  const grouping = groupings.find(item => String(item?.id || '') === String(groupingId || ''));
  const assignedVehicleIds = Array.isArray(grouping?.assignedVehicleIds) ? grouping.assignedVehicleIds.map(id => String(id)) : [];
  return vehicles.filter(vehicle => assignedVehicleIds.includes(String(vehicle?.id || ''))).map(getVehicleCapabilityTokens).flat();
};

export const vehicleSupportsServiceType = (vehicle, serviceType) => {
  const normalizedServiceType = normalizeGroupingServiceType(serviceType);
  if (!normalizedServiceType) return true;
  const tokens = new Set(getVehicleCapabilityTokens(vehicle).map(token => token.replace(/\d+$/, '')));
  return tokens.has(normalizedServiceType);
};

export const getGroupingVehicleType = (grouping, state) => {
  const explicitType = normalizeGroupingServiceType(grouping?.vehicleType);
  if (explicitType) return explicitType;
  return '';
};

export const normalizeGroupingRecord = (grouping, state) => ({
  ...grouping,
  vehicleType: normalizeGroupingServiceType(grouping?.vehicleType),
  assignedVehicleIds: Array.isArray(grouping?.assignedVehicleIds) ? grouping.assignedVehicleIds.filter(Boolean).map(id => String(id)) : []
});

export const getDocumentAlerts = driver => {
  const alerts = [];
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + ALERT_WINDOW_DAYS);

  const pushDateAlert = (value, label) => {
    const date = safeDate(value);
    if (!date) return;
    if (date < now) {
      alerts.push({ severity: 'danger', text: `${label} expired on ${value}` });
      return;
    }
    if (date <= threshold) {
      alerts.push({ severity: 'warning', text: `${label} expires on ${value}` });
    }
  };

  if (!driver.documents?.licenseFront || !driver.documents?.licenseBack) alerts.push({ severity: 'warning', text: 'License photos not uploaded' });
  if (!driver.documents?.insuranceCertificate) alerts.push({ severity: 'warning', text: 'Insurance certificate missing' });
  if (!driver.w9OnFile || !driver.documents?.w9Document) alerts.push({ severity: 'warning', text: 'W9 / tax document missing' });
  pushDateAlert(driver.licenseExpirationDate, 'Driver license');
  pushDateAlert(driver.medCardExpirationDate, 'Medical card');
  pushDateAlert(driver.insuranceExpirationDate, 'Insurance policy');
  pushDateAlert(driver.workersCompExpirationDate, 'Workers comp');
  return alerts;
};

export const getUpcomingLicenseAlerts = (drivers, windowDays = 7) => {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + windowDays);

  return (Array.isArray(drivers) ? drivers : []).flatMap(driver => {
    const licenseDate = safeDate(driver?.licenseExpirationDate);
    if (!licenseDate || licenseDate < now || licenseDate > threshold) return [];
    return [{
      driverId: driver.id,
      driverName: getFullName(driver) || driver?.displayName || driver?.username || 'Unnamed driver',
      licenseNumber: driver?.licenseNumber || 'No license number',
      expirationDate: driver?.licenseExpirationDate
    }];
  }).sort((left, right) => String(left.expirationDate).localeCompare(String(right.expirationDate)));
};

export const getUpcomingDocumentExpirations = (drivers, windowDays = 7) => {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + windowDays);
  const documentFields = [{
    key: 'licenseExpirationDate',
    label: 'Driver License'
  }, {
    key: 'medCardExpirationDate',
    label: 'Medical Card'
  }, {
    key: 'insuranceExpirationDate',
    label: 'Insurance Policy'
  }, {
    key: 'workersCompExpirationDate',
    label: 'Workers Comp'
  }];

  return (Array.isArray(drivers) ? drivers : []).flatMap(driver => documentFields.flatMap(field => {
    const expirationDate = safeDate(driver?.[field.key]);
    if (!expirationDate || expirationDate < now || expirationDate > threshold) return [];
    return [{
      driverId: driver.id,
      driverName: getFullName(driver) || driver?.displayName || driver?.username || 'Unnamed driver',
      documentLabel: field.label,
      licenseNumber: driver?.licenseNumber || 'No license number',
      expirationDate: driver?.[field.key]
    }];
  })).sort((left, right) => String(left.expirationDate).localeCompare(String(right.expirationDate)));
};

export const validateDriver = (driver, state) => {
  const errors = [];
  const assignedVehicle = state.vehicles.find(vehicle => vehicle.id === driver.vehicleId);
  const assignedGrouping = state.groupings.find(grouping => grouping.id === driver.groupingId);
  if (!driver.firstName.trim()) errors.push('First Name is required.');
  if (!driver.lastName.trim()) errors.push('Last Name is required.');
  if (normalizePhoneDigits(driver.phone).length < 10) errors.push('Phone must include at least 10 digits.');
  if (driver.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driver.email)) errors.push('Email format is invalid.');
  if (isDriverRole(driver.role) && !driver.vehicleId) errors.push('Driver must be assigned to a vehicle.');
  if (isDriverRole(driver.role) && !driver.licenseNumber.trim()) errors.push('Driver license number is required.');
  if (isDriverRole(driver.role) && !driver.licenseExpirationDate) errors.push('Driver license expiration date is required.');
  if (driver.vehicleId && !state.vehicles.some(vehicle => vehicle.id === driver.vehicleId)) errors.push('Assigned vehicle does not exist.');
  if (driver.attendantId && !state.attendants.some(attendant => attendant.id === driver.attendantId)) errors.push('Assigned attendant does not exist.');
  if (driver.groupingId && !state.groupings.some(grouping => grouping.id === driver.groupingId)) errors.push('Grouping does not exist.');
  if (assignedGrouping && assignedVehicle) {
    const groupingVehicleType = getGroupingVehicleType(assignedGrouping, state);
    if (groupingVehicleType && !vehicleSupportsServiceType(assignedVehicle, groupingVehicleType)) {
      errors.push(`Vehicle ${assignedVehicle.label || assignedVehicle.id} does not support grouping type ${groupingVehicleType}.`);
    }
  }
  return errors;
};

export const validateVehicle = (vehicle, state) => {
  const errors = [];
  if (!vehicle.label.trim()) errors.push('Vehicle label is required.');
  if (!vehicle.vin.trim()) errors.push('VIN is required.');
  if (vehicle.ambulatoryCapacity < 0 || vehicle.wheelchairCapacity < 0 || vehicle.wheelchairXlCapacity < 0 || vehicle.wheelchairElectricCapacity < 0 || vehicle.walkerCapacity < 0 || vehicle.stretcherCapacity < 0) errors.push('Vehicle capacities cannot be negative.');
  if (Number(vehicle.ambulatoryCapacity || 0) <= 0 && Number(vehicle.wheelchairCapacity || 0) <= 0 && Number(vehicle.wheelchairXlCapacity || 0) <= 0 && Number(vehicle.wheelchairElectricCapacity || 0) <= 0 && Number(vehicle.walkerCapacity || 0) <= 0 && Number(vehicle.stretcherCapacity || 0) <= 0) errors.push('Select at least one vehicle capability: A, W, WXL, EW, Walker, or STR.');
  return errors;
};

export const validateAttendant = attendant => {
  const errors = [];
  if (!attendant.name.trim()) errors.push('Attendant name is required.');
  if (attendant.phone && normalizePhoneDigits(attendant.phone).length < 10) errors.push('Attendant phone must include at least 10 digits.');
  return errors;
};

export const validateGrouping = (grouping, state) => {
  const errors = [];
  if (!grouping.name.trim()) errors.push('Grouping name is required.');
  if (!normalizeGroupingServiceType(grouping.vehicleType)) errors.push('Grouping type is required.');
  if (state) {
    const groupingVehicleType = normalizeGroupingServiceType(grouping.vehicleType);
    const assignedVehicleIds = Array.isArray(grouping.assignedVehicleIds) ? grouping.assignedVehicleIds.map(id => String(id)) : [];
    state.vehicles.filter(vehicle => assignedVehicleIds.includes(String(vehicle.id || ''))).forEach(vehicle => {
      if (groupingVehicleType && !vehicleSupportsServiceType(vehicle, groupingVehicleType)) {
        errors.push(`Vehicle ${vehicle.label || vehicle.id} does not support ${groupingVehicleType}.`);
      }
    });
  }
  return errors;
};

export const buildDriversRows = state => state.drivers.map((driver, index) => {
  const vehicle = state.vehicles.find(item => item.id === driver.vehicleId);
  const alerts = getDocumentAlerts(driver);
  return {
    id: driver.id,
    order: index + 1,
    info: `LFM: ${driver.lastName}, ${driver.firstName}`,
    assignment: vehicle?.label || 'Unassigned vehicle',
    notes: [...alerts.slice(0, 2).map(alert => alert.text), driver.notes || '', driver.brokerId ? `Broker ID ${driver.brokerId}` : 'Broker ID is empty'].filter(Boolean).join(' | '),
    alertCount: alerts.length,
    raw: driver
  };
});

export const buildAttendantsRows = state => state.attendants.map((attendant, index) => {
  const assignedDrivers = state.drivers.filter(driver => driver.attendantId === attendant.id).map(getFullName).filter(Boolean);
  return {
    id: attendant.id,
    order: index + 1,
    name: attendant.name,
    phone: attendant.phone,
    certification: attendant.certification,
    assignedDrivers: assignedDrivers.join(', ') || 'No drivers assigned',
    notes: attendant.notes || 'No notes',
    raw: attendant
  };
});

export const buildVehiclesRows = state => state.vehicles.map((vehicle, index) => {
  const assignedDrivers = state.drivers.filter(driver => driver.vehicleId === vehicle.id).map(driver => `${driver.lastName}, ${driver.firstName}`.replace(/^,\s*/, '')).filter(Boolean);
  return {
    id: vehicle.id,
    order: index + 1,
    info: `VID: ${vehicle.label}\nVIN: ${vehicle.vin}`,
    capacity: {
      type: vehicle.type,
      ambulatory: vehicle.ambulatoryCapacity,
      wheelchair: vehicle.wheelchairCapacity,
      wheelchairXl: vehicle.wheelchairXlCapacity,
      wheelchairElectric: vehicle.wheelchairElectricCapacity,
      walker: vehicle.walkerCapacity,
      stretcher: vehicle.stretcherCapacity,
      supportsAmbulatory: Number(vehicle.ambulatoryCapacity || 0) > 0,
      supportsWheelchair: Number(vehicle.wheelchairCapacity || 0) > 0,
      supportsWheelchairXl: Number(vehicle.wheelchairXlCapacity || 0) > 0,
      supportsWheelchairElectric: Number(vehicle.wheelchairElectricCapacity || 0) > 0,
      supportsWalker: Number(vehicle.walkerCapacity || 0) > 0,
      supportsStretcher: Number(vehicle.stretcherCapacity || 0) > 0
    },
    assignment: assignedDrivers.length > 0 ? `${assignedDrivers.length} driver(s)` : 'Open vehicle',
    driverNames: assignedDrivers.join('; ') || 'No driver assigned',
    notes: vehicle.notes || 'No notes',
    raw: vehicle
  };
});

export const buildGroupingRows = state => state.groupings.map((grouping, index) => {
  const groupedDrivers = state.drivers.filter(driver => driver.groupingId === grouping.id);
  const assignedVehicleIds = Array.isArray(grouping?.assignedVehicleIds) ? grouping.assignedVehicleIds.filter(Boolean).map(id => String(id)) : [];
  const assignedVehicles = state.vehicles.filter(vehicle => assignedVehicleIds.includes(String(vehicle?.id || '')));
  const vehicleCount = Array.isArray(grouping?.assignedVehicleIds) ? new Set(grouping.assignedVehicleIds.filter(Boolean)).size : new Set(groupedDrivers.map(driver => driver.vehicleId).filter(Boolean)).size;
  const groupingVehicleType = getGroupingVehicleType(grouping, state);
  return {
    id: grouping.id,
    order: index + 1,
    group: grouping.name,
    drivers: groupedDrivers.length,
    vehicles: vehicleCount,
    vehicleLabels: assignedVehicles.map(vehicle => vehicle.label || vehicle.unitNumber || vehicle.id).filter(Boolean),
    notes: [`Type: ${groupingVehicleType || 'Unspecified'}`, grouping.notes || grouping.description || 'No notes'].filter(Boolean).join(' | '),
    raw: grouping
  };
});

export const mapAdminDataToDispatchDrivers = state => {
  const sourceDrivers = state.drivers.filter(driver => isDriverRole(driver.role));
  const rosterDrivers = sourceDrivers.filter(driver => isDriverOnActiveRoster(driver));
  const visibleDrivers = rosterDrivers.length > 0 ? rosterDrivers : sourceDrivers;

  return visibleDrivers.map((driver, index) => {
  const normalizedDriver = normalizeDriverTracking(driver);
  const vehicle = state.vehicles.find(item => item.id === normalizedDriver.vehicleId);
  const attendant = state.attendants.find(item => item.id === normalizedDriver.attendantId);
  const grouping = state.groupings.find(item => item.id === normalizedDriver.groupingId);
  const alerts = getDocumentAlerts(normalizedDriver);
  const isLiveTracking = isDriverOnline(normalizedDriver);
  const activeTimeOffAppointment = getActiveTimeOffAppointment(normalizedDriver);
  const normalizedPosition = Array.isArray(normalizedDriver.position) && normalizedDriver.position.length === 2
    ? normalizedDriver.position.map(value => Number(value))
    : [];
  const hasValidPosition = normalizedPosition.length === 2 && Number.isFinite(normalizedPosition[0]) && Number.isFinite(normalizedPosition[1]);
  return {
    id: normalizedDriver.id,
    code: vehicle?.unitNumber || `DRV-${String(index + 1).padStart(3, '0')}`,
    vehicle: vehicle?.label || 'Pending vehicle',
    name: getFullName(normalizedDriver),
    nickname: normalizedDriver.username || normalizedDriver.firstName,
    phone: normalizedDriver.phone || '',
    checkpoint: normalizedDriver.checkpoint || 'Base dispatch',
    attendant: attendant?.name || 'Not Set',
    info: activeTimeOffAppointment
      ? `Time Off: ${activeTimeOffAppointment.appointmentType || 'Appointment'} on ${activeTimeOffAppointment.appointmentDate}`
      : alerts[0]?.text || normalizedDriver.notes || grouping?.dispatchTag || 'Ready',
    live: isLiveTracking ? 'Online' : 'Offline',
    group: grouping?.name || 'Ungrouped',
    routeRoster: normalizedDriver.routeRoster,
    timeOffAppointment: activeTimeOffAppointment,
    position: hasValidPosition ? normalizedPosition : ORLANDO_CENTER,
    hasRealLocation: hasValidPosition,
    gpsSettings: normalizeDriverGpsSettings(normalizedDriver?.gpsSettings),
    gpsAreaRadiusMeters: normalizeDriverGpsSettings(normalizedDriver?.gpsSettings).mapRadiusMeters,
    trackingSource: normalizedDriver.trackingSource || '',
    trackingLastSeen: normalizedDriver.trackingLastSeen || '',
    heading: normalizedDriver.heading == null ? null : Number(normalizedDriver.heading),
    speed: normalizedDriver.speed == null ? null : Number(normalizedDriver.speed),
    accuracy: normalizedDriver.accuracy == null ? null : Number(normalizedDriver.accuracy)
  };
  });
};
