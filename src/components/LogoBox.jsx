import SidebarThemeToggle from '@/components/layouts/TopBar/components/SidebarThemeToggle';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

const SIDEBAR_BRAND_IMAGE = '/WhatsApp%20Image%202026-03-28%20at%2011.58.52%20PM.jpeg';

const LogoBox = () => {
  return <div className="d-flex align-items-center h-100 px-3 py-2" style={{ position: 'relative' }}>
      <Link href="/dispatcher" className="d-inline-flex align-items-center justify-content-center rounded-circle overflow-hidden text-decoration-none" aria-label="Open dispatcher" style={{
      width: 42,
      height: 42,
      border: '1px solid rgba(85, 176, 255, 0.45)',
      boxShadow: '0 0 0 3px rgba(7, 18, 38, 0.9), 0 8px 20px rgba(0, 0, 0, 0.35)'
    }}>
        <Image src={SIDEBAR_BRAND_IMAGE} alt="Dispatcher brand portrait" width={42} height={42} style={{ objectFit: 'cover' }} />
      </Link>
      <div style={{ position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)', zIndex: 1100 }}>
        <SidebarThemeToggle />
      </div>
    </div>;
};
export default LogoBox;