import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/reset-pass', '/auth/lock-screen'];
const PUBLIC_ROUTES = ['/privacy-policy', '/terms-and-conditions'];
const DRIVER_PORTAL_PATH = '/driver-portal';
const isDriverRole = role => String(role ?? '').trim().toLowerCase().includes('driver');
const enforceIpBinding = String(process.env.ENFORCE_IP_BINDING || '').trim().toLowerCase() === 'true';

const normalizeIp = value => {
  const raw = String(value ?? '').split(',')[0].trim();
  if (!raw) return '';
  if (raw === '::1' || raw === '127.0.0.1' || raw === '::ffff:127.0.0.1') return 'localhost';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const getRequestIp = req => {
  const forwarded = req?.headers?.get('x-forwarded-for');
  const realIp = req?.headers?.get('x-real-ip');
  const directIp = req?.ip;
  const host = req?.headers?.get('host') || '';
  const localFallback = host.includes('localhost') || host.includes('127.0.0.1') ? 'localhost' : '';
  return normalizeIp(forwarded || realIp || directIp || localFallback);
};

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const role = request.nextauth.token?.user?.role;
    const driverUser = isDriverRole(role);

    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
      return NextResponse.next();
    }

    if (pathname === '/') {
      return NextResponse.redirect(new URL(driverUser ? DRIVER_PORTAL_PATH : '/dispatcher', request.url));
    }

    // Allow access to login page even if logged in - user can logout and re-authenticate
    if (pathname.startsWith('/auth/login')) {
      return NextResponse.next();
    }

    if (AUTH_ROUTES.some(route => pathname.startsWith(route)) && request.nextauth.token) {
      return NextResponse.redirect(new URL(driverUser ? DRIVER_PORTAL_PATH : '/dispatcher', request.url));
    }

    if (driverUser && !pathname.startsWith(DRIVER_PORTAL_PATH)) {
      return NextResponse.redirect(new URL(DRIVER_PORTAL_PATH, request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        const pathname = req.nextUrl.pathname;

        if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
          return true;
        }

        if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
          return true;
        }

        if (!token) {
          return false;
        }

        if (token?.user?.webAccess === false) {
          return false;
        }

        const authenticatedAt = Number(token.authenticatedAt || 0);
        if (!Number.isFinite(authenticatedAt) || authenticatedAt <= 0) {
          return false;
        }

        const tokenIp = normalizeIp(token.loginIp || '');
        const currentIp = getRequestIp(req);
        // IP binding can cause false logouts behind proxies/CDNs. Keep it optional.
        if (enforceIpBinding && tokenIp && currentIp && tokenIp !== 'localhost' && currentIp !== 'localhost' && tokenIp !== currentIp) {
          return false;
        }

        // Keep middleware focused on token validity + IP binding. Inactivity and
        // explicit timeout are handled by app-level inactivity logout.
        return true;
      }
    },
    pages: {
      signIn: '/auth/login'
    },
    secret: process.env.NEXTAUTH_SECRET || 'kvwLrfri/MBznUCofIoRH9+NvGu6GqvVdqO3mor1GuA='
  }
);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
};