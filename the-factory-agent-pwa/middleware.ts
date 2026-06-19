import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMobileUserAgent } from '@/lib/pwa/device';

const PWA_ONLY_MODE = process.env.NEXT_PUBLIC_PWA_ONLY_MODE === 'true';

const ALLOWED_PREFIXES = [
  '/install',
  '/offline',
  '/manifest.json',
  '/sw.js',
  '/icons/',
  '/_next/',
  '/favicon.ico',
];

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

export function middleware(request: NextRequest) {
  if (!PWA_ONLY_MODE) {
    return NextResponse.next();
  }

  const hostname = request.nextUrl.hostname;
  if (
    process.env.NODE_ENV === 'development' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isAllowedPath(pathname)) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get('user-agent') ?? '';
  const secChUaMobile = request.headers.get('sec-ch-ua-mobile');
  const isMobile = isMobileUserAgent(userAgent, secChUaMobile);

  // Standalone mode cannot be detected server-side. Mobile install enforcement
  // is handled client-side by PwaAccessGuard via isStandaloneMode().
  if (isMobile) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/install')) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/install';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
