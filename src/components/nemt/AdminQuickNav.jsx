'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

const QUICK_LINKS = [
  { href: '/trip-dashboard', label: 'Trip Dashboard', variant: 'success' },
  { href: '/confirmation', label: 'Confirmation', variant: 'warning' },
  { href: '/dispatcher', label: 'Dispatch', variant: 'success' }
];

const HIDDEN_PATHS = new Set(['/trip-dashboard', '/dispatcher', '/confirmation']);

const AdminQuickNav = () => {
  const pathname = usePathname();

  if (HIDDEN_PATHS.has(pathname)) return null;

  return <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
      {QUICK_LINKS.map(link => <Link key={link.href} href={link.href} className={`btn btn-sm btn-${link.variant}`}>
          {link.label}
        </Link>)}
    </div>;
};

export default AdminQuickNav;