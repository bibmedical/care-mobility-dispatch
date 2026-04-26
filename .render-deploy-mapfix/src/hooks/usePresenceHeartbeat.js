'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

const HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;
const RECENT_INTERACTION_WINDOW_MS = 2 * 60 * 1000;
const HEARTBEAT_TICK_MS = 30 * 1000;

const usePresenceHeartbeat = ({ enabled = true } = {}) => {
  const { data: session, status } = useSession();
  const lastHeartbeatRef = useRef(0);
  const lastInteractionRef = useRef(Date.now());

  const sendHeartbeat = useCallback(async force => {
    if (!enabled) return;
    if (status !== 'authenticated' || !session?.user?.id) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const now = Date.now();
    if (!force && now - lastHeartbeatRef.current < HEARTBEAT_MIN_INTERVAL_MS) return;

    lastHeartbeatRef.current = now;
    try {
      await fetch('/api/system-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventLabel: 'Presence heartbeat',
          metadata: {
            kind: 'presence-heartbeat',
            source: 'web-app'
          }
        })
      });
    } catch (error) {
      console.error('Failed to send presence heartbeat:', error);
    }
  }, [enabled, session?.user?.id, status]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (status !== 'authenticated' || !session?.user?.id) return undefined;

    const onActivity = () => {
      lastInteractionRef.current = Date.now();
      void sendHeartbeat(false);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(eventName => document.addEventListener(eventName, onActivity, true));

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const recentlyActive = now - lastInteractionRef.current <= RECENT_INTERACTION_WINDOW_MS;
      if (recentlyActive) {
        void sendHeartbeat(false);
      }
    }, HEARTBEAT_TICK_MS);

    void sendHeartbeat(true);

    return () => {
      events.forEach(eventName => document.removeEventListener(eventName, onActivity, true));
      window.clearInterval(intervalId);
    };
  }, [enabled, sendHeartbeat, session?.user?.id, status]);
};

export default usePresenceHeartbeat;