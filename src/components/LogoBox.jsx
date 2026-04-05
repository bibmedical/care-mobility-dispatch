import SidebarThemeToggle from '@/components/layouts/TopBar/components/SidebarThemeToggle';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

const SIDEBAR_BRAND_IMAGE = '/fmg-login-logo.png';

const LogoBox = () => {
  return <div className="d-flex align-items-center h-100 px-3 py-2" style={{ position: 'relative' }}>
      <Link href="/dispatcher" className="d-inline-flex align-items-center justify-content-center overflow-hidden text-decoration-none" aria-label="Open dispatcher" style={{
      width: 54,
      height: 42,
      borderRadius: 14,
      background: 'rgba(8, 17, 34, 0.95)',
      border: '1px solid rgba(85, 176, 255, 0.45)',
      boxShadow: '0 0 0 3px rgba(7, 18, 38, 0.9), 0 8px 20px rgba(0, 0, 0, 0.35)'
    }}>
        <Image src={SIDEBAR_BRAND_IMAGE} alt="Florida Mobility Group logo" width={48} height={28} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px 5px' }} />
      </Link>
      <div style={{ position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)', zIndex: 1100 }}>
        <SidebarThemeToggle />
      </div>
    </div>;
};
export default LogoBox;