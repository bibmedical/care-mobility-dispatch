'use client';

import { SessionProvider } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith('/auth/');
  const isAvatarRoute = pathname.startsWith('/avatar');
  const isOfficeRoute = pathname.startsWith('/settings/office');
  const isPreferencesRoute = pathname.startsWith('/preferences');
  const shouldUseDispatchShell = !(isAuthRoute || isAvatarRoute || isOfficeRoute || isPreferencesRoute);
  const showAssistantWidget = shouldUseDispatchShell && pathname !== '/dispatcher';
  const content = shouldUseDispatchShell ? <NemtProvider>
      {children}
      {showAssistantWidget ? <DispatchAssistantWidget /> : null}
      <Toaster richColors />
    </NemtProvider> : <>
      {children}
      <Toaster richColors />
    </>;

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
          {shouldUseDispatchShell ? <InactivityLogoutWrapper>{content}</InactivityLogoutWrapper> : content}
        </NotificationProvider>
      </LayoutProvider>
    </SessionProvider>;
};
export default AppProvidersWrapper;