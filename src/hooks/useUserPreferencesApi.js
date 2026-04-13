'use client';

import { normalizeUserPreferences } from '@/helpers/user-preferences';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const useUserPreferencesApi = () => {
  const [data, setData] = useState(normalizeUserPreferences(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dataSnapshotRef = useRef(JSON.stringify(normalizeUserPreferences(null)));
  const inFlightSavePromiseRef = useRef(null);
  const inFlightSaveSnapshotRef = useRef('');

  useEffect(() => {
    dataSnapshotRef.current = JSON.stringify(normalizeUserPreferences(data));
  }, [data]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/user-preferences', { cache: 'no-store' });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load user preferences');
      const normalized = normalizeUserPreferences(payload?.preferences);
      const nextSnapshot = JSON.stringify(normalized);
      dataSnapshotRef.current = nextSnapshot;
      setData(currentData => JSON.stringify(normalizeUserPreferences(currentData)) === nextSnapshot ? currentData : normalized);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load user preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveData = useCallback(async preferences => {
    const normalizedPreferences = normalizeUserPreferences(preferences);
    const nextSnapshot = JSON.stringify(normalizedPreferences);

    if (nextSnapshot === dataSnapshotRef.current) {
      return normalizedPreferences;
    }

    if (inFlightSavePromiseRef.current && inFlightSaveSnapshotRef.current === nextSnapshot) {
      return inFlightSavePromiseRef.current;
    }

    setSaving(true);
    setError('');

    const savePromise = (async () => {
      const response = await fetch('/api/user-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: normalizedPreferences })
      });
      const payload = await parseApiResponse(response);
      if (!response.ok) throw new Error(payload?.error || 'Unable to save user preferences');
      const normalized = normalizeUserPreferences(payload?.preferences);
      dataSnapshotRef.current = JSON.stringify(normalized);
      setData(normalized);
      return normalized;
    })();

    inFlightSavePromiseRef.current = savePromise;
    inFlightSaveSnapshotRef.current = nextSnapshot;

    try {
      return await savePromise;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save user preferences';
      setError(message);
      throw saveError;
    } finally {
      if (inFlightSavePromiseRef.current === savePromise) {
        inFlightSavePromiseRef.current = null;
        inFlightSaveSnapshotRef.current = '';
      }
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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