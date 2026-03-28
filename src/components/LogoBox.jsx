import avatarImg from '@/assets/images/users/avatar-1.jpg';
import LeftSideBarToggle from '@/components/layouts/TopBar/components/LeftSideBarToggle';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

const LogoBox = () => {
  return <div className="d-flex align-items-center justify-content-between h-100 px-3 py-2">
      <LeftSideBarToggle />
      <Link href="/dispatcher" className="d-inline-flex align-items-center justify-content-center rounded-circle overflow-hidden text-decoration-none" aria-label="Open dispatcher" style={{ width: 38, height: 38 }}>
        <Image src={avatarImg} alt="Dispatcher profile" width={38} height={38} style={{ objectFit: 'cover' }} />
      </Link>
    </div>;
};
export default LogoBox;