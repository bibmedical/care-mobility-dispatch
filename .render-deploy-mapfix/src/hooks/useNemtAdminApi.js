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

const delay = ms => new Promise(resolve => {
  if (typeof window !== 'undefined') {
    window.setTimeout(resolve, ms);
    return;
  }
  setTimeout(resolve, ms);
});

const readJsonSafe = async response => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const fetchAdminPayloadWithRetry = async (attempts = 3) => {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout('/api/nemt/admin', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await readJsonSafe(response);

      if (response.ok) {
        return payload;
      }

      const message = payload?.error || `Unable to load admin data (${response.status})`;
      // Retry transient gateway/server errors that happen during deploy or cold boot.
      if ([500, 502, 503, 504].includes(response.status) && attempt < attempts) {
        await delay(500 * attempt);
        continue;
      }

      throw new Error(message);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(500 * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error('Unable to load admin data');
};

const useNemtAdminApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchAdminPayloadWithRetry();
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextData => {
    setSaving(true);
    setError('');
    try {
      const response = await fetchWithTimeout('/api/nemt/admin', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextData)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save admin data');
      setData(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nemt-admin-updated'));
      }
      return payload;
    } catch (saveError) {
      const message = saveError?.name === 'AbortError' ? 'Saving admin data timed out.' : saveError.message || 'Unable to save admin data';
      setError(message);
      throw saveError;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleAdminUpdated = () => {
      refresh();
    };

    window.addEventListener('nemt-admin-updated', handleAdminUpdated);
    return () => {
      window.removeEventListener('nemt-admin-updated', handleAdminUpdated);
    };
  }, []);

  return {
    data,
    loading,
    saving,
    error,
    refresh,
    saveData,
    setData
  };
};

export default useNemtAdminApi;