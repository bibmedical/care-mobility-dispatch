'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook that logs out user after inactivity timeout.
 * Tracks mouse, keyboard, touch events and resets timer on activity.
 */
const useInactivityLogout = () => {
  const { data: session, status } = useSession();
  const timeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetInactivityTimer = useCallback(() => {
    if (!session?.user?.id) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    lastActivityRef.current = Date.now();
    const timeoutMinutes = session?.user?.inactivityTimeoutMinutes || 15;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      signOut({ redirect: true, callbackUrl: '/auth/login' });
    }, timeoutMs);
  }, [session?.user?.id, session?.user?.inactivityTimeoutMinutes]);

  useEffect(() => {
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
    };
  }, [status, session?.user?.id, resetInactivityTimer]);
};

export default useInactivityLogout;
