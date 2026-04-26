'use client';

import { useLayoutContext } from '@/context/useLayoutContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useMemo } from 'react';

export const VDR_TABS = [
  { key: 'admin', label: 'Admin', href: '/user-management' },
  { key: 'avatar', label: 'Avatar', href: '/avatar' },
  { key: 'excel-loader', label: 'Excel Loader', href: '/forms-safe-ride-import' },
  { key: 'fuel-requests', label: 'Fuel Requests', href: '/fuel-requests' },
  { key: 'drivers', label: 'Drivers', href: '/drivers' },
  { key: 'attendants', label: 'Attendants', href: '/drivers/attendants' },
  { key: 'vehicles', label: 'Vehicles', href: '/drivers/vehicles' },
  { key: 'grouping', label: 'Grouping', href: '/drivers/grouping' }
];

const buildTabStyles = isLight => ({
  active: {
    backgroundColor: isLight ? '#dbe7f5' : '#24324a',
    borderColor: isLight ? '#9fb3cc' : '#3a4f74',
    color: isLight ? '#10212b' : '#f8fbff',
    borderRadius: 4
  },
  inactive: {
    backgroundColor: isLight ? '#f3f7fc' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#d7deef',
    borderRadius: 4
  }
});

const VdrTabsBar = ({ onNavigate }) => {
  const pathname = usePathname();
  const { themeMode } = useLayoutContext();
  const tabStyles = useMemo(() => buildTabStyles(themeMode === 'light'), [themeMode]);

  return <div className="d-flex flex-wrap align-items-center gap-2">
      {VDR_TABS.map(tab => <Link key={tab.key} href={tab.href} className="btn" onClick={onNavigate} style={pathname === tab.href ? tabStyles.active : tabStyles.inactive}>{tab.label}</Link>)}
    </div>;
};

export default VdrTabsBar;