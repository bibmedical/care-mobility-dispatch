'use client';

import { createContext, use, useEffect, useMemo, useRef } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import useQueryParams from '@/hooks/useQueryParams';
import { toggleDocumentAttribute } from '@/utils/layout';

const MENU_AUTO_COLLAPSE_MS = 5 * 60 * 1000;
const THEME_OPTIONS = new Set(['light', 'dark']);
const MENU_THEME_OPTIONS = new Set(['light', 'dark']);
const MENU_SIZE_OPTIONS = new Set(['default', 'collapsed']);

const ThemeContext = createContext(undefined);
const useLayoutContext = () => {
  const context = use(ThemeContext);
  if (!context) {
    return {
      theme: 'light',
      themeMode: 'light',
      menu: {
        theme: 'light',
        size: 'default'
      },
      changeTheme: () => {},
      changeMenu: {
        theme: () => {},
        size: () => {}
      },
      resetSettings: () => {}
    };
  }
  return context;
};
const getPreferredTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const normalizeLayoutSettings = (value, fallbackState) => {
  const normalizedTheme = THEME_OPTIONS.has(String(value?.theme || '').trim()) ? String(value.theme).trim() : fallbackState.theme;
  const menuValue = value?.menu && typeof value.menu === 'object' ? value.menu : {};
  const normalizedMenuTheme = MENU_THEME_OPTIONS.has(String(menuValue?.theme || '').trim()) ? String(menuValue.theme).trim() : fallbackState.menu.theme;
  const normalizedMenuSize = MENU_SIZE_OPTIONS.has(String(menuValue?.size || '').trim()) ? String(menuValue.size).trim() : fallbackState.menu.size;

  return {
    theme: normalizedTheme,
    menu: {
      theme: normalizedMenuTheme,
      size: normalizedMenuSize
    }
  };
};

const LayoutProvider = ({
  children
}) => {
  const queryParams = useQueryParams();
  const override = !!(queryParams.layout_theme || queryParams.menu_theme || queryParams.menu_size);
  const INIT_STATE = {
    theme: queryParams['layout_theme'] ? queryParams['layout_theme'] : getPreferredTheme(),
    menu: {
      theme: queryParams['menu_theme'] ? queryParams['menu_theme'] : 'light',
      size: queryParams['menu_size'] ? queryParams['menu_size'] : 'default'
    }
  };
  const [storedSettings, setSettings] = useLocalStorage('__Dastone_NEXT_CONFIG__', INIT_STATE, override);
  const settings = useMemo(() => normalizeLayoutSettings(storedSettings, INIT_STATE), [INIT_STATE, storedSettings]);
  const autoCollapseTimeoutRef = useRef(null);

  // update settings
  const updateSettings = _newSettings => setSettings({
    ...settings,
    ..._newSettings
  });

  // update theme mode
  const changeTheme = newTheme => {
    updateSettings({
      theme: newTheme
    });
  };

  // change menu theme
  const changeMenuTheme = newTheme => {
    updateSettings({
      menu: {
        ...settings.menu,
        theme: newTheme
      }
    });
  };

  // change menu theme
  const changeMenuSize = newSize => {
    updateSettings({
      menu: {
        ...settings.menu,
        size: newSize
      }
    });
  };
  useEffect(() => {
    toggleDocumentAttribute('data-bs-theme', settings.theme);
    toggleDocumentAttribute('data-startbar', settings.menu.theme);
    toggleDocumentAttribute('data-sidebar-size', settings.menu.size, false, 'body');
    return () => {
      toggleDocumentAttribute('data-bs-theme', settings.theme, true);
      toggleDocumentAttribute('data-startbar', settings.menu.theme, true);
      toggleDocumentAttribute('data-sidebar-size', settings.menu.size, true, 'body');
    };
  }, [settings]);
  useEffect(() => {
    if (settings.menu.size === 'collapsed') {
      if (autoCollapseTimeoutRef.current) {
        window.clearTimeout(autoCollapseTimeoutRef.current);
        autoCollapseTimeoutRef.current = null;
      }
      return undefined;
    }

    const resetAutoCollapseTimer = () => {
      if (autoCollapseTimeoutRef.current) {
        window.clearTimeout(autoCollapseTimeoutRef.current);
      }

      autoCollapseTimeoutRef.current = window.setTimeout(() => {
        setSettings(currentSettings => currentSettings?.menu?.size === 'collapsed' ? currentSettings : {
          ...currentSettings,
          menu: {
            ...currentSettings.menu,
            size: 'collapsed'
          }
        });
      }, MENU_AUTO_COLLAPSE_MS);
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    resetAutoCollapseTimer();
    activityEvents.forEach(eventName => window.addEventListener(eventName, resetAutoCollapseTimer, true));

    return () => {
      activityEvents.forEach(eventName => window.removeEventListener(eventName, resetAutoCollapseTimer, true));
      if (autoCollapseTimeoutRef.current) {
        window.clearTimeout(autoCollapseTimeoutRef.current);
        autoCollapseTimeoutRef.current = null;
      }
    };
  }, [setSettings, settings.menu.size]);
  const resetSettings = () => updateSettings(INIT_STATE);
  return <ThemeContext.Provider value={useMemo(() => ({
    ...settings,
    themeMode: settings.theme,
    changeTheme,
    changeMenu: {
      theme: changeMenuTheme,
      size: changeMenuSize
    },
    resetSettings
  }), [settings])}>
      {children}
      {/* Overlay solo visible si sidebar está abierto y en mobile o forzado por clase */}
      <div
        className="startbar-overlay d-print-none"
        onClick={() => changeMenuSize('collapsed')}
      />
    </ThemeContext.Provider>;
};
export { LayoutProvider, useLayoutContext };