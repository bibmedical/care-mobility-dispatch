export const PAGE_MEMORY_PROBE_ACTIVE_KEY = 'care-mobility-page-memory-probe-active';
export const PAGE_MEMORY_PROBE_RESULTS_KEY = 'care-mobility-page-memory-probe-results';
export const PAGE_MEMORY_PROBE_EVENT = 'care-mobility-page-memory-probe-results-updated';

export const PAGE_MEMORY_DEFAULT_TARGETS = [{
  label: 'Dispatcher',
  path: '/dispatcher'
}, {
  label: 'Trip Dashboard',
  path: '/trip-dashboard'
}, {
  label: 'Confirmation',
  path: '/confirmation'
}, {
  label: 'Excel Loader',
  path: '/forms-safe-ride-import'
}, {
  label: 'Fuel Requests',
  path: '/fuel-requests'
}, {
  label: 'Drivers',
  path: '/drivers'
}, {
  label: 'Settings GPS',
  path: '/settings/gps'
}, {
  label: 'Settings Email Templates',
  path: '/settings/email-templates'
}];

export const readBrowserMemorySnapshot = () => {
  if (typeof window === 'undefined') return null;
  const memory = window.performance?.memory;
  if (!memory) return null;

  return {
    jsHeapUsedMb: Math.round(memory.usedJSHeapSize / 1024 / 1024),
    jsHeapTotalMb: Math.round(memory.totalJSHeapSize / 1024 / 1024),
    jsHeapLimitMb: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
  };
};

export const parseJsonStorage = (key, fallbackValue) => {
  if (typeof window === 'undefined') return fallbackValue;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

export const writeJsonStorage = (key, value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const clearJsonStorage = key => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
};

export const appendPageMemoryResult = nextResult => {
  const currentResults = parseJsonStorage(PAGE_MEMORY_PROBE_RESULTS_KEY, []);
  const nextResults = [nextResult, ...currentResults].slice(0, 40);
  writeJsonStorage(PAGE_MEMORY_PROBE_RESULTS_KEY, nextResults);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PAGE_MEMORY_PROBE_EVENT, {
      detail: nextResult
    }));
  }
  return nextResults;
};

export const buildMemoryDelta = (beforeValue, afterValue) => {
  if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue)) return null;
  return Math.round((afterValue - beforeValue) * 100) / 100;
};

export const normalizeTargetPath = value => {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) return '';
  return trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
};