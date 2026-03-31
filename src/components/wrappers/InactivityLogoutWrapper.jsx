'use client';

import useInactivityLogout from '@/hooks/useInactivityLogout';

/**
 * Wrapper component that provides inactivity logout functionality.
 * Must be placed inside SessionProvider.
 */
const InactivityLogoutWrapper = ({ children }) => {
  useInactivityLogout();
  return children;
};

export default InactivityLogoutWrapper;
