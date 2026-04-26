'use client';

import Link from 'next/link';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ThemeToggle from './components/ThemeToggle';
import ProfileDropdown from './components/ProfileDropdown';
import LeftSideBarToggle from './components/LeftSideBarToggle';

const quickLinks = [{
  keywords: ['dispatcher', 'dispatch', 'trip'],
  href: '/dispatcher'
}, {
  keywords: ['analytics'],
  href: '/trip-analytics'
}, {
  keywords: ['dashboard'],
  href: '/trip-dashboard'
}, {
  keywords: ['dispatching', 'message center', 'messages'],
  href: '/dispatching'
}, {
  keywords: ['driver', 'application'],
  href: '/driver-applications'
}, {
  keywords: ['vehicle'],
  href: '/vehicles'
}, {
  keywords: ['passenger', 'rider'],
  href: '/passengers'
}, {
  keywords: ['admin'],
  href: '/administrators'
}, {
  keywords: ['chat', 'message'],
  href: '/driver-chat'
}, {
  keywords: ['contact'],
  href: '/driver-contacts'
}, {
  keywords: ['calendar'],
  href: '/care-calendar'
}, {
  keywords: ['import', 'csv', 'form'],
  href: '/forms-safe-ride-import'
}];

const TopBar = () => {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearch = event => {
    event.preventDefault();
    const normalizedTerm = searchTerm.trim().toLowerCase();
    if (!normalizedTerm) return;
    const match = quickLinks.find(item => item.keywords.some(keyword => normalizedTerm.includes(keyword)));
    router.push(match?.href ?? '/dispatcher');
  };

  return <div className="topbar d-print-none">
      <div className="container-fluid">
        <nav className="topbar-custom d-flex justify-content-between" id="topbar-custom">
          <ul className="topbar-item list-unstyled d-inline-flex align-items-center mb-0">
            <li className="me-2">
              <LeftSideBarToggle />
            </li>
            <li className="mx-2 welcome-text">
              <Link className="btn btn-sm text-primary btn-soft-primary" href="/forms-safe-ride-import"><i className="fas fa-plus me-2" />New Task</Link>
            </li>
          </ul>
          <ul className="topbar-item list-unstyled d-inline-flex align-items-center mb-0">
            <li className="hide-phone app-search">
              <form role="search" onSubmit={handleSearch}>
                <input type="search" name="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="form-control top-search mb-0" placeholder="Search here..." />
                <button type="submit"><i className="iconoir-search" /></button>
              </form>
            </li>
            <ThemeToggle />
            <ProfileDropdown />
          </ul>
        </nav>
      </div>
    </div>;
};
export default TopBar;