'use client';

import { useEffect, useState } from 'react';

const readJsonSafely = async response => {
  const rawText = await response.text();
  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error('Black List API returned HTML instead of JSON. The endpoint failed on the server.');
    }
    throw new Error('Black List API returned an invalid response.');
  }
};

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
      const payload = await readJsonSafely(response);
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
      const payload = await readJsonSafely(response);
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