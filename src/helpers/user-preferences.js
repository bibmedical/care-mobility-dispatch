import { normalizeDispatcherVisibleTripColumns, normalizeMapProviderPreference, normalizeNemtUiPreferences } from '@/helpers/nemt-dispatch-state';

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
  tripDashboard: {
    row1: [],
    row2: [],
    row3: [],
    toolbarVisibility: {},
    layoutMode: 'normal',
    panelView: 'both',
    panelOrder: 'drivers-first'
  },
  confirmation: {
    outputColumns: []
  },
  dispatcherMessaging: {
    hiddenDriverIds: [],
    chatTheme: 'ocean'
  }
};

const normalizeStringArray = value => Array.from(new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean)));

const normalizeBooleanMap = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, itemValue]) => [String(key || '').trim(), itemValue !== false]));
};

const normalizeConfirmationPreferences = value => ({
  outputColumns: normalizeStringArray(value?.outputColumns)
});

const normalizeDispatcherToolbarPreferences = value => ({
  row1: normalizeStringArray(value?.row1),
  row2: normalizeStringArray(value?.row2),
  row3: normalizeStringArray(value?.row3)
});

const normalizeTripDashboardPreferences = value => ({
  row1: normalizeStringArray(value?.row1),
  row2: normalizeStringArray(value?.row2),
  row3: normalizeStringArray(value?.row3),
  toolbarVisibility: normalizeBooleanMap(value?.toolbarVisibility),
  layoutMode: String(value?.layoutMode || DEFAULT_USER_PREFERENCES.tripDashboard.layoutMode).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.layoutMode,
  panelView: String(value?.panelView || DEFAULT_USER_PREFERENCES.tripDashboard.panelView).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.panelView,
  panelOrder: String(value?.panelOrder || DEFAULT_USER_PREFERENCES.tripDashboard.panelOrder).trim() || DEFAULT_USER_PREFERENCES.tripDashboard.panelOrder
});

const normalizeDispatcherMessagingPreferences = value => ({
  hiddenDriverIds: normalizeStringArray(value?.hiddenDriverIds),
  chatTheme: String(value?.chatTheme || DEFAULT_USER_PREFERENCES.dispatcherMessaging.chatTheme).trim() || DEFAULT_USER_PREFERENCES.dispatcherMessaging.chatTheme
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
      ...patch.dispatcherToolbar
    } : current.dispatcherToolbar,
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