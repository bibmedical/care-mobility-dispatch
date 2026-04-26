'use client';

import { useEffect, useState } from 'react';

const API_TIMEOUT_MS = 15000;

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

const fetchWithTimeout = async (input, init = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(new Error('Request timeout')), API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const useSmsIntegrationApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/integrations/sms', { cache: 'no-store' });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load SMS integration');
      setData(payload);
    } catch (fetchError) {
      const message = fetchError?.name === 'AbortError' ? 'SMS integration request timed out.' : fetchError.message || 'Unable to load SMS integration';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextState => {
    setSaving(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/integrations/sms', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to save SMS integration');
      setData(payload);
      return payload;
    } catch (saveError) {
      const message = saveError?.name === 'AbortError' ? 'Saving SMS integration timed out.' : saveError.message || 'Unable to save SMS integration';
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

export default useSmsIntegrationApi;