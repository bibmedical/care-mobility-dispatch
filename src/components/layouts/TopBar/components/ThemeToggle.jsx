'use client';

import { useLayoutContext } from '@/context/useLayoutContext';
import React from 'react';
const ThemeToggle = () => {
  const {
    changeTheme,
    themeMode
  } = useLayoutContext();
  return <li className="topbar-item">
      <a className="nav-link nav-icon" onClick={() => themeMode === 'dark' ? changeTheme('light') : changeTheme('dark')} id="light-dark-mode">
        <i className="iconoir-half-moon dark-mode" />
        <i className="iconoir-sun-light light-mode" />
      </a>
    </li>;
};
export default ThemeToggle;