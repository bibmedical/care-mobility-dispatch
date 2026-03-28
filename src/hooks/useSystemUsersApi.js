'use client';

import { useEffect, useState } from 'react';

const useSystemUsersApi = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/system-users', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to load users');
      setData(payload);
    } catch (fetchError) {
      setError(fetchError.message || 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  const saveData = async nextState => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/system-users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextState)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save users');
      setData(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nemt-admin-updated'));
      }
      return payload;
    } catch (saveError) {
      const message = saveError.message || 'Unable to save users';
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