'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useNotificationContext } from '@/context/useNotificationContext';

const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 15;
const WARNING_BEFORE_LOGOUT_MINUTES = 5;

/**
 * Hook that logs out user after inactivity timeout.
 * Shows warning 2 minutes before logout.
 * Tracks mouse, keyboard, touch events and resets timer on activity.
 */
const useInactivityLogout = ({ enabled = true } = {}) => {
  const { data: session, status } = useSession();
  const { showNotification } = useNotificationContext();
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const [showWarning, setShowWarning] = useState(false);

  const resetInactivityTimer = useCallback(() => {
    if (!enabled) return;
    if (!session?.user?.id) return;

    // Clear existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (showWarning) {
      setShowWarning(false);
    }

    lastActivityRef.current = Date.now();
    const configuredTimeoutMinutes = Number(session?.user?.inactivityTimeoutMinutes);
    const timeoutMinutes = Number.isFinite(configuredTimeoutMinutes) && configuredTimeoutMinutes > 0
      ? configuredTimeoutMinutes
      : DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningLeadMinutes = Math.min(WARNING_BEFORE_LOGOUT_MINUTES, Math.max(timeoutMinutes - 1, 1));
    const warningMs = Math.max(timeoutMs - warningLeadMinutes * 60 * 1000, 0);

    // Set warning timeout before automatic logout
    if (warningMs > 0) {
      warningTimeoutRef.current = setTimeout(() => {
        setShowWarning(true);
        showNotification({
          message: `Your session will expire in ${warningLeadMinutes} minute${warningLeadMinutes === 1 ? '' : 's'} due to inactivity. Move your mouse or click to stay logged in.`,
          variant: 'warning'
        });
      }, warningMs);
    }

    // Set logout timeout
    timeoutRef.current = setTimeout(() => {
      setShowWarning(false);

      void (async () => {
        try {
          if (session?.user?.id) {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              keepalive: true,
              body: JSON.stringify({
                userId: session.user.id,
                authSessionId: session.user.authSessionId
              })
            });
          }
        } catch (err) {
          console.error('Failed to log inactivity logout:', err);
        }

        await signOut({ redirect: false });
        if (typeof window !== 'undefined') {
          window.location.assign('/auth/login');
        }
      })();
    }, timeoutMs);
  }, [enabled, session?.user?.id, session?.user?.inactivityTimeoutMinutes, showWarning, showNotification]);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (showWarning) {
        setShowWarning(false);
      }
      return undefined;
    }

    if (status !== 'authenticated' || !session?.user?.id) return;

    // Event listeners for user activity
    const handleActivity = () => {
      resetInactivityTimer();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Initialize timer on mount
    resetInactivityTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [enabled, status, session?.user?.id, resetInactivityTimer, showWarning]);
};

export default useInactivityLogout;
