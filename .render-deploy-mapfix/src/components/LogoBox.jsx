import SidebarThemeToggle from '@/components/layouts/TopBar/components/SidebarThemeToggle';
import BrandImage from '@/components/BrandImage';
import Link from 'next/link';
import React from 'react';

const LogoBox = () => {
  return <div className="d-flex align-items-center h-100 px-3 py-2" style={{ position: 'relative' }}>
      <Link href="/dispatcher" className="d-inline-flex align-items-center justify-content-center text-decoration-none" aria-label="Open dispatcher" style={{
      width: 92,
      height: 56,
      background: 'transparent',
      border: 'none',
      boxShadow: 'none'
    }}>
        <BrandImage target="portalSidebar" alt="Florida Mobility Group portal logo" width={92} height={56} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </Link>
      <div style={{ position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)', zIndex: 1100 }}>
        <SidebarThemeToggle />
      </div>
    </div>;
};
export default LogoBox;