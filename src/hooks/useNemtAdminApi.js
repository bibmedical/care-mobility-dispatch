'use client';

import { useEffect, useState } from 'react';

const useNemtAdminApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/nemt/admin', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load admin data');
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
      const response = await fetch('/api/nemt/admin', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextData)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save admin data');
      setData(current => ({ ...current, ...nextData, dispatchDrivers: current?.dispatchDrivers || [] }));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nemt-admin-updated'));
      }
      return payload;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save admin data';
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
    setData
  };
};

export default useNemtAdminApi;