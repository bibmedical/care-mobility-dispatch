import AsyncStorage from '@react-native-async-storage/async-storage';
import { DriverPendingTripAction, DriverSession } from '../types/driver';

const DRIVER_SESSION_STORAGE_KEY = 'care-mobility-driver-session';
const DRIVER_TRACKING_STORAGE_KEY = 'care-mobility-driver-tracking-enabled';
const DRIVER_NOTIFICATION_MODE_KEY = 'care-mobility-driver-notification-mode';
const DRIVER_DEVICE_ID_STORAGE_KEY = 'care-mobility-driver-device-id';
const DRIVER_PENDING_TRIP_ACTIONS_KEY = 'care-mobility-driver-pending-trip-actions';

export type DriverNotificationMode = 'sound' | 'vibrate' | 'silent';

export const readStoredDriverSession = async (): Promise<DriverSession | null> => {
  const rawValue = await AsyncStorage.getItem(DRIVER_SESSION_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    return JSON.parse(rawValue) as DriverSession;
  } catch {
    await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY);
    return null;
  }
};

export const writeStoredDriverSession = async (session: DriverSession) => {
  await AsyncStorage.setItem(DRIVER_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearStoredDriverSession = async () => {
  await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY);
  await AsyncStorage.removeItem(DRIVER_TRACKING_STORAGE_KEY);
};

export const readOrCreateDriverDeviceId = async (): Promise<string> => {
  const existingValue = String(await AsyncStorage.getItem(DRIVER_DEVICE_ID_STORAGE_KEY) || '').trim();
  if (existingValue) return existingValue;

  const nextDeviceId = `driver-device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DRIVER_DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
};

export const readStoredTrackingPreference = async (): Promise<boolean> => {
  const rawValue = await AsyncStorage.getItem(DRIVER_TRACKING_STORAGE_KEY);
  return rawValue === 'true';
};

export const writeStoredTrackingPreference = async (enabled: boolean) => {
  await AsyncStorage.setItem(DRIVER_TRACKING_STORAGE_KEY, enabled ? 'true' : 'false');
};

export const readStoredNotificationMode = async (): Promise<DriverNotificationMode> => {
  const rawValue = await AsyncStorage.getItem(DRIVER_NOTIFICATION_MODE_KEY);
  if (rawValue === 'sound' || rawValue === 'vibrate' || rawValue === 'silent') {
    return rawValue;
  }
  return 'sound';
};

export const writeStoredNotificationMode = async (mode: DriverNotificationMode) => {
  await AsyncStorage.setItem(DRIVER_NOTIFICATION_MODE_KEY, mode);
};

export const readStoredPendingTripActions = async (): Promise<DriverPendingTripAction[]> => {
  const rawValue = await AsyncStorage.getItem(DRIVER_PENDING_TRIP_ACTIONS_KEY);
  if (!rawValue) return [];

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue as DriverPendingTripAction[] : [];
  } catch {
    await AsyncStorage.removeItem(DRIVER_PENDING_TRIP_ACTIONS_KEY);
    return [];
  }
};

export const writeStoredPendingTripActions = async (actions: DriverPendingTripAction[]) => {
  await AsyncStorage.setItem(DRIVER_PENDING_TRIP_ACTIONS_KEY, JSON.stringify(Array.isArray(actions) ? actions : []));
};

export const enqueueStoredPendingTripAction = async (action: DriverPendingTripAction) => {
  const currentActions = await readStoredPendingTripActions();
  await writeStoredPendingTripActions([...currentActions, action]);
};

export const removeStoredPendingTripAction = async (actionId: string) => {
  const normalizedActionId = String(actionId || '').trim();
  if (!normalizedActionId) return;
  const currentActions = await readStoredPendingTripActions();
  await writeStoredPendingTripActions(currentActions.filter(action => String(action?.id || '').trim() !== normalizedActionId));
};

export const clearStoredPendingTripActions = async () => {
  await AsyncStorage.removeItem(DRIVER_PENDING_TRIP_ACTIONS_KEY);
};