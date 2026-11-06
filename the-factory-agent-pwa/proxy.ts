import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMobileUserAgent } from '@/lib/pwa/device';
import { MODE_COOKIE_NAME, verifyModeCookie } from '@/session/cookieSigner';
import { homeFor, isAuthPath, isManagerPath, isPublicOrSystemPath } from '@/session/appMode';

const PWA_ONLY_MODE = process.env.NEXT_PUBLIC_PWA_ONLY_MODE === 'true';

const ALLOWED_PREFIXES = [
  '/api/',
  '/install',
  '/offline',
  '/manifest.json',
  '/sw.js',
  '/icons/',
  '/_next/',
  '/favicon.ico',
];

function isAllowedSystemPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // 1. Bypass all static and system assets
  if (isAllowedSystemPath(pathname)) {
    return NextResponse.next();
  }

  // 2. PWA Mobile / Standalone gate (enforced in production when enabled)
  if (PWA_ONLY_MODE) {
    const hostname = request.nextUrl.hostname;
    const isLocalhost =
      process.env.NODE_ENV === 'development' &&
      (hostname === 'localhost' || hostname === '127.0.0.1');

    if (!isLocalhost) {
      const userAgent = request.headers.get('user-agent') ?? '';
      const secChUaMobile = request.headers.get('sec-ch-ua-mobile');
      const isMobile = isMobileUserAgent(userAgent, secChUaMobile);

      if (!isMobile && !pathname.startsWith('/install')) {
        const url = request.nextUrl.clone();
        url.pathname = '/install';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  // 3. Mode Gate via signed HttpOnly cookie (optimistic Edge protection)
  const cookieValue = request.cookies.get(MODE_COOKIE_NAME)?.value;
  const verified = verifyModeCookie(cookieValue);

  if (verified) {
    // If user is logged in and visits /login or /forgot-password -> send to their home
    if (isAuthPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = homeFor(verified.mode);
      return NextResponse.redirect(url);
    }

    // Agent trying to access manager route -> redirect to agent root
    if (verified.mode === 'agent' && isManagerPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // Manager trying to access agent route -> redirect to manager root
    if (verified.mode === 'manager' && !isManagerPath(pathname) && !isPublicOrSystemPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/manager';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};

