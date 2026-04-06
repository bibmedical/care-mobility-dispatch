'use client';

import { useCallback, useEffect, useState } from 'react';

const parseStoredValue = (rawValue, fallbackValue) => {
  if (rawValue == null || rawValue === '') return fallbackValue;

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.error(error);
    return fallbackValue;
  }
};

export default function useLocalStorage(key, initialValue, override = false) {
  const [storedValue, setStoredValue] = useState(() => {
    if (override) return initialValue;
    try {
      let item = null;
      if (key) {
        item = window.localStorage.getItem(key);
      }
      if (!item) localStorage.setItem(key, JSON.stringify(initialValue));
      return parseStoredValue(item, initialValue);
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const getStoredItem = useCallback(() => {
    if (!key) return;

    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(parseStoredValue(item, initialValue));
      }
    } catch (error) {
      console.error(error);
      setStoredValue(initialValue);
    }
  }, [initialValue, key]);

  useEffect(() => {
    window.addEventListener('storage', getStoredItem, false);
    return () => window.removeEventListener('storage', getStoredItem);
  }, [getStoredItem]);

  const setValue = useCallback(value => {
    try {
      setStoredValue(currentValue => {
        const valueToStore = value instanceof Function ? value(currentValue) : value;
        if (key) {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        return valueToStore;
      });
    } catch (error) {
      console.error(error);
    }
  }, [key]);

  return [storedValue, setValue];
}