'use client';

import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { useEffect } from 'react';

// import { NotificationProvider } from '@/context/useNotificationContext'

import { Toaster } from 'sonner';
import { NotificationProvider } from '@/context/useNotificationContext';
import { NemtProvider } from '@/context/useNemtContext';
import DispatchAssistantWidget from '@/components/nemt/DispatchAssistantWidget';
import InactivityLogoutWrapper from '@/components/wrappers/InactivityLogoutWrapper';
const LayoutProvider = dynamic(() => import('@/context/useLayoutContext').then(mod => mod.LayoutProvider), {
  ssr: false
});
const AppProvidersWrapper = ({
  children
}) => {
  useEffect(() => {
    if (document) {
      const e = document.querySelector('#__next_splash');
      if (e?.hasChildNodes()) {
        document.querySelector('#splash-screen')?.classList.add('remove');
      }
      e?.addEventListener('DOMNodeInserted', () => {
        document.querySelector('#splash-screen')?.classList.add('remove');
      });
    }
  }, []);
  return <SessionProvider>
      <LayoutProvider>
        <NotificationProvider>
          <InactivityLogoutWrapper>
            <NemtProvider>
              {children}
              <DispatchAssistantWidget />
              <Toaster richColors />
            </NemtProvider>
          </InactivityLogoutWrapper>
        </NotificationProvider>
      </LayoutProvider>
    </SessionProvider>;
};
export default AppProvidersWrapper;