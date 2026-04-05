import SidebarThemeToggle from '@/components/layouts/TopBar/components/SidebarThemeToggle';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

const LogoBox = () => {
  return <div className="d-flex align-items-center h-100 px-3 py-2" style={{ position: 'relative' }}>
      <Link href="/dispatcher" className="d-inline-flex align-items-center justify-content-center rounded-circle overflow-hidden text-decoration-none" aria-label="Open dispatcher" style={{ width: 38, height: 38 }}>
        <Image src="/fmg-app-icon.png" alt="Florida Mobility Group icon" width={38} height={38} style={{ objectFit: 'cover' }} />
      </Link>
      <div style={{ position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)', zIndex: 1100 }}>
        <SidebarThemeToggle />
      </div>
    </div>;
};
export default LogoBox;