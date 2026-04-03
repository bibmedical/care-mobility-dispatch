import AsyncStorage from '@react-native-async-storage/async-storage';
import { DriverSession } from '../types/driver';

const DRIVER_SESSION_STORAGE_KEY = 'care-mobility-driver-session';
const DRIVER_TRACKING_STORAGE_KEY = 'care-mobility-driver-tracking-enabled';
const DRIVER_NOTIFICATION_MODE_KEY = 'care-mobility-driver-notification-mode';

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