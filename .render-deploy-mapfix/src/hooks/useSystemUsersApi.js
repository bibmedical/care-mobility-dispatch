'use client';

import { useEffect, useState } from 'react';

const API_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (input, init = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const parseApiPayload = async response => {
  const rawText = await response.text();
  if (!rawText) {
    return {
      payload: null,
      rawText: ''
    };
  }

  try {
    return {
      payload: JSON.parse(rawText),
      rawText
    };
  } catch {
    return {
      payload: null,
      rawText
    };
  }
};

const getApiErrorMessage = (response, payload, fallbackMessage, rawText = '') => {
  if (payload?.error) return payload.error;
  if (response.status === 401 || response.status === 403) {
    return 'Your admin session expired or no longer has access to User Management. Sign in again and retry.';
  }
  if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
    return 'User Management received an HTML page instead of JSON. Refresh the page and sign in again.';
  }
  return fallbackMessage;
};

const useSystemUsersApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/system-users', { cache: 'no-store' });
      const { payload, rawText } = await parseApiPayload(response);
      if (!response.ok || !payload) {
        throw new Error(getApiErrorMessage(response, payload, 'Unable to load users', rawText));
      }
      setData(payload);
    } catch (fetchError) {
      setError(fetchError?.name === 'AbortError' ? 'User Management request timed out.' : fetchError.message || 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextState => {
    setSaving(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/system-users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      const { payload, rawText } = await parseApiPayload(response);
      if (!response.ok || !payload) {
        throw new Error(getApiErrorMessage(response, payload, 'Unable to save users', rawText));
      }
      setData(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nemt-admin-updated'));
      }
      return payload;
    } catch (saveError) {
      const message = saveError?.name === 'AbortError' ? 'Saving users timed out.' : saveError.message || 'Unable to save users';
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

export default useSystemUsersApi;