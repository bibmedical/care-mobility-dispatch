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

const DISPATCH_STATE_ROUTE_PREFIXES = ['/dispatcher', '/trip-dashboard', '/drivers', '/route-control', '/confirmation', '/rates', '/trip-analytics', '/forms-safe-ride-import', '/settings/office/print-setup', '/map-screen'];

const matchesRoutePrefix = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

const LayoutProvider = dynamic(() => import('@/context/useLayoutContext').then(mod => mod.LayoutProvider), {
  ssr: false
});
const AppProvidersWrapper = ({
  children
}) => {
  const pathname = usePathname();
  const currentPathname = typeof pathname === 'string' ? pathname : '';
  const isAuthRoute = currentPathname.startsWith('/auth/');
  const shouldUseDispatchState = !isAuthRoute && DISPATCH_STATE_ROUTE_PREFIXES.some(prefix => matchesRoutePrefix(currentPathname, prefix));
  const showAssistantWidget = shouldUseDispatchState && currentPathname !== '/dispatcher';

  const content = shouldUseDispatchState ? <NemtProvider syncEnabled>
      {children}
      {showAssistantWidget ? <DispatchAssistantWidget /> : null}
      <Toaster richColors />
    </NemtProvider> : <>
      {children}
      <Toaster richColors />
    </>;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const splashRoot = document.querySelector('#__next_splash');
    const removeSplash = () => {
      document.querySelector('#splash-screen')?.classList.add('remove');
    };

    if (splashRoot?.hasChildNodes()) {
      removeSplash();
    }

    splashRoot?.addEventListener('DOMNodeInserted', removeSplash);

    return () => {
      splashRoot?.removeEventListener('DOMNodeInserted', removeSplash);
    };
  }, []);
  return <SessionProvider>
      <LayoutProvider>
        <NotificationProvider>
          <InactivityLogoutWrapper enabled={!isAuthRoute}>{content}</InactivityLogoutWrapper>
        </NotificationProvider>
      </LayoutProvider>
    </SessionProvider>;
};
export default AppProvidersWrapper;