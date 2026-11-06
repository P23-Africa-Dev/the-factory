/**
 * Application Mode & Role definitions for Unified Factory 23 PWA
 */

export type AppMode = 'agent' | 'manager';

export type ManagerRole = 'owner' | 'admin' | 'supervisor';

export function homeFor(mode: AppMode | null | undefined): '/' | '/manager' | '/login' {
  if (mode === 'manager') return '/manager';
  if (mode === 'agent') return '/';
  return '/login';
}

export function isManagerPath(pathname: string): boolean {
  if (!pathname) return false;
  return pathname === '/manager' || pathname.startsWith('/manager/');
}

export function isAuthPath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/reset-password')
  );
}

export function isPublicOrSystemPath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    isAuthPath(pathname) ||
    pathname === '/install' ||
    pathname.startsWith('/install/') ||
    pathname === '/offline' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

export function isAgentPath(pathname: string): boolean {
  if (!pathname) return false;
  return !isManagerPath(pathname) && !isPublicOrSystemPath(pathname);
}
