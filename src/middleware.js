import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/reset-pass', '/auth/lock-screen'];

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;

    if (pathname === '/') {
      return NextResponse.redirect(new URL('/trip-analytics', request.url));
    }

    if (AUTH_ROUTES.some(route => pathname.startsWith(route)) && request.nextauth.token) {
      return NextResponse.redirect(new URL('/trip-analytics', request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        const pathname = req.nextUrl.pathname;

        if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
          return true;
        }

        return Boolean(token);
      }
    },
    pages: {
      signIn: '/auth/login'
    },
    secret: process.env.NEXTAUTH_SECRET || 'kvwLrfri/MBznUCofIoRH9+NvGu6GqvVdqO3mor1GuA='
  }
);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};