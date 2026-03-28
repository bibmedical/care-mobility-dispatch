'use client';

import { useEffect, useState } from 'react';

const useBlacklistApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/blacklist', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load blacklist');
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load blacklist');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextState => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/blacklist', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save blacklist');
      setData(payload);
      return payload;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save blacklist';
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

export default useBlacklistApi;