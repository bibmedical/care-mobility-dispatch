'use client';

import { DEFAULT_BRANDING_SETTINGS, normalizeBrandingSettings } from '@/helpers/branding';
import { useEffect, useState } from 'react';

const BRANDING_EVENT_NAME = 'care-mobility-branding-updated';

const useBrandingApi = () => {
  const [data, setData] = useState({ branding: DEFAULT_BRANDING_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/branding', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load branding settings');
      setData({ branding: normalizeBrandingSettings(payload?.branding) });
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load branding settings');
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save branding settings');
      const normalized = normalizeBrandingSettings(payload?.branding);
      setData({ branding: normalized });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(BRANDING_EVENT_NAME, { detail: normalized }));
      }
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
    refresh();
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