"use client";

import LeftSideBar from '@/components/layouts/LeftSideBar';
import { usePathname } from 'next/navigation';

const SIDEBAR_ENABLED_PATHS = new Set(['/trip-dashboard', '/dispatcher']);

const AdminSidebarGate = () => {
  const pathname = usePathname();

  if (!SIDEBAR_ENABLED_PATHS.has(pathname)) {
    return null;
  }

  return <LeftSideBar />;
};

export default AdminSidebarGate;