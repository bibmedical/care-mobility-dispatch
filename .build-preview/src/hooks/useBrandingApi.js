'use client';

import { DEFAULT_BRANDING_SETTINGS, normalizeBrandingSettings } from '@/helpers/branding';
import { useEffect, useState } from 'react';

const BRANDING_EVENT_NAME = 'care-mobility-branding-updated';
let cachedBranding = DEFAULT_BRANDING_SETTINGS;
let hasLoadedBranding = false;
let brandingRequestPromise = null;
const brandingSubscribers = new Set();

const parseApiResponse = async response => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  const normalizedText = String(text || '').trim();
  return {
    error: normalizedText.startsWith('<') ? `Server returned HTML instead of JSON (${response.status}).` : normalizedText || `Request failed with status ${response.status}.`
  };
};

const broadcastBranding = branding => {
  cachedBranding = normalizeBrandingSettings(branding);
  hasLoadedBranding = true;
  brandingSubscribers.forEach(listener => listener(cachedBranding));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BRANDING_EVENT_NAME, { detail: cachedBranding }));
  }
  return cachedBranding;
};

const fetchBranding = async () => {
  if (brandingRequestPromise) return brandingRequestPromise;

  brandingRequestPromise = (async () => {
    const response = await fetch('/api/branding', { cache: 'no-store' });
    const payload = await parseApiResponse(response);
    if (!response.ok) throw new Error(payload?.error || 'Unable to load branding settings');
    return broadcastBranding(payload?.branding);
  })().finally(() => {
    brandingRequestPromise = null;
  });

  return brandingRequestPromise;
};

const useBrandingApi = () => {
  const [data, setData] = useState({ branding: cachedBranding });
  const [loading, setLoading] = useState(!hasLoadedBranding);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async (options = {}) => {
    const force = options?.force === true;
    const silent = options?.silent === true;
    if (hasLoadedBranding && !force) {
      setData({ branding: cachedBranding });
      setLoading(false);
      return cachedBranding;
    }

    if (!silent) {
      setLoading(true);
    }
    setError('');
    try {
      const branding = await fetchBranding();
      setData({ branding });
      return branding;
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load branding settings');
      throw fetchError;
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextBranding => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextBranding)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to save branding settings');
      const normalized = broadcastBranding(payload?.branding);
      setData({ branding: normalized });
      return normalized;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save branding settings';
      setError(message);
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handleBroadcast = branding => {
      setData({ branding });
      setLoading(false);
    };

    brandingSubscribers.add(handleBroadcast);
    if (hasLoadedBranding) {
      setData({ branding: cachedBranding });
      setLoading(false);
      refresh({ force: true, silent: true }).catch(() => {});
    } else {
      refresh().catch(() => {});
    }

    return () => {
      brandingSubscribers.delete(handleBroadcast);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    loading,
    saving,
    error,
    refresh,
    saveData,
    eventName: BRANDING_EVENT_NAME
  };
};

export default useBrandingApi;