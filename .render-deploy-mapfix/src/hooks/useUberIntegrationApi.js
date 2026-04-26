'use client';

import { useEffect, useState } from 'react';

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

const useUberIntegrationApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/uber', { cache: 'no-store' });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load Uber integration');
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load Uber integration');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextState => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/integrations/uber', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to save Uber integration');
      setData(payload);
      return payload;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save Uber integration';
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

export default useUberIntegrationApi;