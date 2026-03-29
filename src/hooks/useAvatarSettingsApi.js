'use client';

import { useEffect, useState } from 'react';

const useAvatarSettingsApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/avatar', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load avatar settings');
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load avatar settings');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextState => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/avatar', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save avatar settings');
      setData(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('care-mobility-avatar-settings-updated', {
          detail: payload?.avatar || null
        }));
      }
      return payload;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save avatar settings';
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

export default useAvatarSettingsApi;