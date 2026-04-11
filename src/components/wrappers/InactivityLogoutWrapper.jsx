'use client';

import useInactivityLogout from '@/hooks/useInactivityLogout';
import usePresenceHeartbeat from '@/hooks/usePresenceHeartbeat';

/**
 * Wrapper component that provides inactivity logout functionality.
 * Must be placed inside SessionProvider.
 */
const InactivityLogoutWrapper = ({ children, enabled = true }) => {
  useInactivityLogout({ enabled });
  usePresenceHeartbeat({ enabled });
  return children;
};

export default InactivityLogoutWrapper;
