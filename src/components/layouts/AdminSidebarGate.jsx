"use client";

import LeftSideBar from '@/components/layouts/LeftSideBar';
import { usePathname } from 'next/navigation';

const isSidebarEnabledPath = pathname => {
  const normalizedPath = String(pathname || '').toLowerCase();
  return normalizedPath === '/trip-dashboard' || normalizedPath.startsWith('/trip-dashboard/') || normalizedPath === '/dispatcher' || normalizedPath.startsWith('/dispatcher/');
};

const AdminSidebarGate = () => {
  const pathname = usePathname();

  if (!isSidebarEnabledPath(pathname)) {
    return null;
  }

  return <LeftSideBar />;
};

export default AdminSidebarGate;