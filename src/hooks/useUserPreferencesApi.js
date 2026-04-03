'use client';

import { normalizeUserPreferences } from '@/helpers/user-preferences';
import { useEffect, useState } from 'react';

const useUserPreferencesApi = () => {
  const [data, setData] = useState(normalizeUserPreferences(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/user-preferences', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load user preferences');
      setData(normalizeUserPreferences(payload?.preferences));
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load user preferences');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async preferences => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save user preferences');
      const normalized = normalizeUserPreferences(payload?.preferences);
      setData(normalized);
      return normalized;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save user preferences';
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
    saveData
  };
};

export default useUserPreferencesApi;