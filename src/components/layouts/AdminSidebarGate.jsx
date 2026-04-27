"use client";

import LeftSideBar from '@/components/layouts/LeftSideBar';
import { usePathname } from 'next/navigation';
import { useLayoutContext } from '@/context/useLayoutContext';

const isSidebarEnabledPath = pathname => {
  const normalizedPath = String(pathname || '').toLowerCase();
  return normalizedPath === '/dispatcher' || normalizedPath.startsWith('/dispatcher/');
};

const AdminSidebarGate = () => {
  const pathname = usePathname();
  const {
    themeMode,
    menu: { size },
    changeMenu: { size: changeMenuSize }
  } = useLayoutContext();
  const isDark = themeMode === 'dark';

  if (!isSidebarEnabledPath(pathname)) {
    return null;
  }

  if (size === 'collapsed') {
    return <button
      type="button"
      onClick={() => changeMenuSize('default')}
      title="Show drivers list"
      aria-label="Show drivers list"
      style={{
        position: 'fixed',
        left: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 24,
        height: 44,
        borderRadius: 999,
        border: isDark ? '1px solid rgba(107,114,128,0.45)' : '1px solid #cbd5e1',
        background: isDark ? '#000000' : '#ffffff',
        color: isDark ? '#e5e7eb' : '#0f172a',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1,
        zIndex: 1301,
        boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.45)' : '0 6px 16px rgba(15,23,42,0.15)',
        cursor: 'pointer'
      }}
    >
        {'>'}
      </button>;
  }

  return <LeftSideBar />;
};

export default AdminSidebarGate;