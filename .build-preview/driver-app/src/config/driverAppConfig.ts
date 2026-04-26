import { RoadmapVersion } from '../types/driver';

const normalizeApiBaseUrl = (value?: string) => {
  const normalizedValue = String(value || '').trim();
  return normalizedValue.replace(/\/$/, '');
};

const resolvedApiBaseUrl = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_DRIVER_API_BASE_URL)
  || 'https://care-mobility-dispatch-web-v2.onrender.com';

export const DRIVER_APP_CONFIG = {
  apiBaseUrl: resolvedApiBaseUrl,
  enableBackgroundTracking: true,
  // Trip updates should reach drivers quickly after dispatcher changes.
  tripSyncIntervalMs: 8000,
  messageSyncIntervalMs: 3000,
  lateAlertThresholdMinutes: 5,
  gpsDistanceIntervalMeters: 8,
  gpsTimeIntervalMs: 5000,
  backgroundGpsDistanceIntervalMeters: 12,
  backgroundGpsTimeIntervalMs: 15000,
  backgroundLocationNotificationTitle: 'Florida Mobility Group tracking active',
  backgroundLocationNotificationBody: 'Dispatcher can keep seeing your live vehicle position while the app is in the background.'
};

export const DRIVER_APP_ROADMAP: RoadmapVersion[] = [{
  id: 'V1',
  title: 'Base Real App',
  goal: 'Create the real Expo shell for drivers with tabs, services, runtime state, and deployment-ready structure.',
  items: ['App shell and driver layout', 'Shared runtime hook', 'Config and API foundation', 'Visible roadmap inside app']
}, {
  id: 'V2',
  title: 'Driver Login',
  goal: 'Replace fake sign-in with real driver authentication and persistent session handling.',
  items: ['Real auth flow', 'Driver profile session', 'Logout and session restore']
}, {
  id: 'V3',
  title: 'Today Trips',
  goal: 'Show assigned trips and an active-trip workflow backed by the web dispatch tree.',
  items: ['Today list', 'Trip detail', 'Active trip card', 'Dispatcher note visibility']
}, {
  id: 'V4',
  title: 'Trip Actions',
  goal: 'Let drivers update real trip state from the phone.',
  items: ['En route', 'Arrived', 'Picked up', 'Dropped off', 'Delay and no-show actions']
}, {
  id: 'V5',
  title: 'Foreground GPS',
  goal: 'Send real phone GPS while the app is open and show driver online state in dispatch.',
  items: ['Live GPS sync', 'Checkpoint updates', 'Online-offline state', 'Foreground tracking reliability']
}, {
  id: 'V6',
  title: 'Background GPS',
  goal: 'Keep real tracking alive on Android when the app is not in the foreground.',
  items: ['Background tasks', 'Battery-safe tracking', 'Device build via EAS', 'Production Android testing']
}, {
  id: 'V7',
  title: 'Messages And Alerts',
  goal: 'Let drivers receive dispatcher changes and operational alerts inside the app.',
  items: ['Dispatcher alerts', 'Trip changes', 'Cancellation notices', 'Message center']
}, {
  id: 'V8',
  title: 'Production Hardening',
  goal: 'Finish offline safety, observability, QA, and distribution for daily operations.',
  items: ['Offline retry rules', 'Crash reporting', 'Push notifications', 'Release and rollout']
}];