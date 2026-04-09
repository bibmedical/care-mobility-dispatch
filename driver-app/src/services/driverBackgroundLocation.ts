import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DRIVER_APP_CONFIG } from '../config/driverAppConfig';
import { readStoredDriverSession } from './driverSessionStorage';

export const BACKGROUND_LOCATION_TASK = 'care-mobility-driver-background-location';

const postLocationUpdate = async (driverId: string, location: Location.LocationObject) => {
  const session = await readStoredDriverSession();
  if (!session?.sessionToken || !session?.deviceId) return;

  await fetch(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-driver-device-id': session.deviceId,
      'x-driver-session-token': session.sessionToken
    },
    body: JSON.stringify({
      driverId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
      timestamp: location.timestamp
    })
  });
};

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations?: Location.LocationObject[] }>) => {
    if (error) return;

    const locations = Array.isArray(data?.locations) ? data.locations : [];
    const latestLocation = locations.at(-1);
    if (!latestLocation) return;

    try {
      const session = await readStoredDriverSession();
      if (!session?.driverId) return;
      await postLocationUpdate(session.driverId, latestLocation);
    } catch {
      // Background tasks should fail silently and retry on the next GPS event.
    }
  });
}

export const isBackgroundLocationTrackingActive = async () => {
  return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
};

const ensureBackgroundLocationPermission = async () => {
  let backgroundPermission = await Location.getBackgroundPermissionsAsync();
  if (backgroundPermission.status === 'granted') {
    return true;
  }

  backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  if (backgroundPermission.status !== 'granted') {
    throw new Error('Background location permission is missing. Allow "All the time" so dispatcher keeps seeing the vehicle with the screen off.');
  }

  return true;
};

export const startBackgroundLocationTracking = async () => {
  await ensureBackgroundLocationPermission();

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (alreadyRunning) return true;

  const session = await readStoredDriverSession();
  const configuredBgDistance = Number(session?.gpsSettings?.bgDistanceIntervalMeters);
  const configuredBgTime = Number(session?.gpsSettings?.bgTimeIntervalMs);
  const distanceInterval = Number.isFinite(configuredBgDistance) && configuredBgDistance > 0 ? configuredBgDistance : DRIVER_APP_CONFIG.backgroundGpsDistanceIntervalMeters;
  const timeInterval = Number.isFinite(configuredBgTime) && configuredBgTime > 0 ? configuredBgTime : DRIVER_APP_CONFIG.backgroundGpsTimeIntervalMs;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Highest,
    distanceInterval,
    timeInterval,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: DRIVER_APP_CONFIG.backgroundLocationNotificationTitle,
      notificationBody: DRIVER_APP_CONFIG.backgroundLocationNotificationBody,
      notificationColor: '#0f766e'
    }
  });

  return true;
};

export const stopBackgroundLocationTracking = async () => {
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (!alreadyRunning) return;
  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
};