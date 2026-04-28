import { normalizeDispatcherVisibleTripColumns, normalizeMapProviderPreference, normalizeNemtUiPreferences } from '@/helpers/nemt-dispatch-state';
import { DEFAULT_ROUTE_PRINT_COLUMNS, normalizeRoutePrintColumns } from '@/helpers/nemt-print-setup';

export const DEFAULT_USER_PREFERENCES = {
  nemtUiPreferences: normalizeNemtUiPreferences(null),
  assistantAvatar: {
    name: '',
    image: '',
    updatedAt: ''
  },
  dispatcherToolbar: {
    row1: [],
    row2: [],
    row3: []
  },
  dispatcherLayout: {
    preset: 'full',
    mapVisible: true,
    tripsVisible: true,
    messagingVisible: true,
    actionsVisible: true
  },
  tripDashboard: {
    storageVersion: 0,
    row1: [],
    row2: [],
    row3: [],
    toolbarVisibility: {},
    layoutMode: 'normal',
    panelView: 'both',
    panelOrder: 'drivers-first',
    showBottomPanels: false,
    showMapPane: true,
    showDriversPanel: true,
    showRoutesPanel: true,
    showTripsPanel: true,
    rightPanelCollapsed: false,
    showConfirmationTools: false,
    timeDisplayMode: '12h',
    tripOrderMode: 'original',
    printColumns: DEFAULT_ROUTE_PRINT_COLUMNS,
    columnSplit: 58,
    rowSplit: 68,
    columnWidths: {},
    closedRouteStateByKey: {}
  },
  confirmation: {
    outputColumns: []
  },
  dispatcherMessaging: {
    hiddenDriverIds: [],
    chatTheme: 'ocean',
    notificationTone: 'classic',
    customNotificationSoundName: '',
    customNotificationSoundDataUrl: ''
  }
};

const normalizeStringArray = value => Array.from(new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean)));

const normalizeBooleanMap = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, itemValue]) => [String(key || '').trim(), itemValue !== false]));
};

const normalizeFiniteNumber = (value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
};

const normalizeNumberMap = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, itemValue]) => {
    const normalizedKey = String(key || '').trim();
    const normalizedValue = Math.round(normalizeFiniteNumber(itemValue, Number.NaN, 24, 640));
    if (!normalizedKey || !Number.isFinite(normalizedValue)) return [];
    return [[normalizedKey, normalizedValue]];
  }));
};

const normalizeObjectMap = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, itemValue]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || !itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) return [];
    return [[normalizedKey, itemValue]];
  }));
};

const normalizeConfirmationPreferences = value => ({
  outputColumns: normalizeStringArray(value?.outputColumns)
});

const normalizeDispatcherToolbarPreferences = value => ({
  row1: normalizeStringArray(value?.row1),
  row2: normalizeStringArray(value?.row2),
  row3: normalizeStringArray(value?.row3),
  toolbarVisibility: normalizeBooleanMap(value?.toolbarVisibility)
});

const normalizeDispatcherLayoutPreferences = value => ({
  preset: String(value?.preset || DEFAULT_USER_PREFERENCES.dispatcherLayout.preset).trim() || DEFAULT_USER_PREFERENCES.dispatcherLayout.preset,
  mapVisible: value?.mapVisible !== false,
  tripsVisible: value?.tripsVisible !== false,
  messagingVisible: value?.messagingVisible !== false,
  actionsVisible: value?.actionsVisible !== false
});

const normalizeTripDashboardPreferences = value => ({
  storageVersion: normalizeFiniteNumber(value?.storageVersion, DEFAULT_USER_PREFERENCES.tripDashboard.storageVersion, 0, 99),
  row1: normalizeStringArray(value?.row1),
  row2: normalizeStringArray(value?.row2),
  row3: normalizeStringArray(value?.row3),
  toolbarVisibility: normalizeBooleanMap(value?.toolbarVisibility),
  layoutMode: String(value?.layoutMode || DEFAULT_USER_PREFERENCES.tripDashboard.layoutMode).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.layoutMode,
  panelView: String(value?.panelView || DEFAULT_USER_PREFERENCES.tripDashboard.panelView).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.panelView,
  panelOrder: String(value?.panelOrder || DEFAULT_USER_PREFERENCES.tripDashboard.panelOrder).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.panelOrder,
  showBottomPanels: value?.showBottomPanels !== false,
  showMapPane: value?.showMapPane === true,
  showDriversPanel: value?.showDriversPanel !== false,
  showRoutesPanel: value?.showRoutesPanel !== false,
  showTripsPanel: value?.showTripsPanel !== false,
  rightPanelCollapsed: value?.rightPanelCollapsed === true,
  showConfirmationTools: value?.showConfirmationTools === true,
  timeDisplayMode: String(value?.timeDisplayMode || DEFAULT_USER_PREFERENCES.tripDashboard.timeDisplayMode).trim() === '24h' ? '24h' : '12h',
  tripOrderMode: String(value?.tripOrderMode || DEFAULT_USER_PREFERENCES.tripDashboard.tripOrderMode).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.tripOrderMode,
  printColumns: normalizeRoutePrintColumns(value?.printColumns),
  columnSplit: normalizeFiniteNumber(value?.columnSplit, DEFAULT_USER_PREFERENCES.tripDashboard.columnSplit, 16, 94),
  rowSplit: normalizeFiniteNumber(value?.rowSplit, DEFAULT_USER_PREFERENCES.tripDashboard.rowSplit, 32, 84),
  columnWidths: normalizeNumberMap(value?.columnWidths),
  closedRouteStateByKey: normalizeObjectMap(value?.closedRouteStateByKey)
});

const normalizeDispatcherMessagingPreferences = value => ({
  hiddenDriverIds: normalizeStringArray(value?.hiddenDriverIds),
  chatTheme: String(value?.chatTheme || DEFAULT_USER_PREFERENCES.dispatcherMessaging.chatTheme).trim() || DEFAULT_USER_PREFERENCES.dispatcherMessaging.chatTheme,
  notificationTone: String(value?.notificationTone || DEFAULT_USER_PREFERENCES.dispatcherMessaging.notificationTone).trim() || DEFAULT_USER_PREFERENCES.dispatcherMessaging.notificationTone,
  customNotificationSoundName: String(value?.customNotificationSoundName || '').trim(),
  customNotificationSoundDataUrl: String(value?.customNotificationSoundDataUrl || '').trim()
});

const normalizeAssistantAvatarPreferences = value => ({
  name: String(value?.name || ''),
  image: String(value?.image || ''),
  updatedAt: String(value?.updatedAt || '')
});

export const normalizeUserPreferences = value => ({
  nemtUiPreferences: {
    ...DEFAULT_USER_PREFERENCES.nemtUiPreferences,
    ...normalizeNemtUiPreferences(value?.nemtUiPreferences)
  },
  assistantAvatar: normalizeAssistantAvatarPreferences(value?.assistantAvatar),
  dispatcherToolbar: normalizeDispatcherToolbarPreferences(value?.dispatcherToolbar),
  dispatcherLayout: normalizeDispatcherLayoutPreferences(value?.dispatcherLayout),
  tripDashboard: normalizeTripDashboardPreferences(value?.tripDashboard),
  confirmation: normalizeConfirmationPreferences(value?.confirmation),
  dispatcherMessaging: normalizeDispatcherMessagingPreferences(value?.dispatcherMessaging)
});

export const mergeUserPreferences = (currentValue, patchValue) => {
  const current = normalizeUserPreferences(currentValue);
  const patch = patchValue && typeof patchValue === 'object' ? patchValue : {};

  return normalizeUserPreferences({
    ...current,
    ...patch,
    nemtUiPreferences: patch.nemtUiPreferences ? {
      ...current.nemtUiPreferences,
      dispatcherVisibleTripColumns: patch.nemtUiPreferences.dispatcherVisibleTripColumns ? normalizeDispatcherVisibleTripColumns(patch.nemtUiPreferences.dispatcherVisibleTripColumns) : current.nemtUiPreferences.dispatcherVisibleTripColumns,
      mapProvider: patch.nemtUiPreferences.mapProvider ? normalizeMapProviderPreference(patch.nemtUiPreferences.mapProvider) : current.nemtUiPreferences.mapProvider,
      timeZone: patch.nemtUiPreferences.timeZone || current.nemtUiPreferences.timeZone,
      printSetup: patch.nemtUiPreferences.printSetup ? patch.nemtUiPreferences.printSetup : current.nemtUiPreferences.printSetup
    } : current.nemtUiPreferences,
    assistantAvatar: patch.assistantAvatar ? {
      ...current.assistantAvatar,
      ...patch.assistantAvatar
    } : current.assistantAvatar,
    dispatcherToolbar: patch.dispatcherToolbar ? {
      ...current.dispatcherToolbar,
      ...patch.dispatcherToolbar,
      toolbarVisibility: patch.dispatcherToolbar.toolbarVisibility ? {
        ...current.dispatcherToolbar.toolbarVisibility,
        ...patch.dispatcherToolbar.toolbarVisibility
      } : current.dispatcherToolbar.toolbarVisibility
    } : current.dispatcherToolbar,
    dispatcherLayout: patch.dispatcherLayout ? {
      ...current.dispatcherLayout,
      ...patch.dispatcherLayout
    } : current.dispatcherLayout,
    tripDashboard: patch.tripDashboard ? {
      ...current.tripDashboard,
      ...patch.tripDashboard,
      toolbarVisibility: patch.tripDashboard.toolbarVisibility ? {
        ...current.tripDashboard.toolbarVisibility,
        ...patch.tripDashboard.toolbarVisibility
      } : current.tripDashboard.toolbarVisibility
    } : current.tripDashboard,
    confirmation: patch.confirmation ? {
      ...current.confirmation,
      ...patch.confirmation
    } : current.confirmation,
    dispatcherMessaging: patch.dispatcherMessaging ? {
      ...current.dispatcherMessaging,
      ...patch.dispatcherMessaging
    } : current.dispatcherMessaging
  });
};