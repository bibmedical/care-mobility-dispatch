'use client';

import React from 'react';
import { useLayoutContext } from '@/context/useLayoutContext';

const SidebarThemeToggle = () => {
  const { changeTheme, themeMode } = useLayoutContext();

  return (
    <button
      onClick={() => changeTheme(themeMode === 'dark' ? 'light' : 'dark')}
      className="nav-link nav-icon"
      id="sidebar-light-dark-mode"
      type="button"
      title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <i className={themeMode === 'dark' ? 'iconoir-sun-light' : 'iconoir-half-moon'} />
    </button>
  );
};

export default SidebarThemeToggle;
