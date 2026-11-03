'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { readSession } from '@/session/sessionStore';
import { homeFor, type AppMode } from '@/session/appMode';

function getStorageKey(mode?: AppMode, userId?: number | string): string {
  if (mode && userId) {
    return `f23:last_route:${mode}:${userId}`;
  }
  if (mode) {
    return `f23:last_route:${mode}`;
  }
  return 'f23:last_route';
}

/** Forget persisted routes across all modes on logout */
export function clearSavedRoute(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (
        key.startsWith('f23:last_route') ||
        key === 'agent:last_route' ||
        key === 'manager:last_route'
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Non-fatal
  }
}

function isRestorableRoute(path: string, mode?: AppMode): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('/login')) return false;
  if (path.startsWith('/install')) return false;
  if (path.startsWith('/offline')) return false;

  if (mode === 'manager') {
    return path.startsWith('/manager');
  }
  if (mode === 'agent') {
    return !path.startsWith('/manager');
  }
  return true;
}

/**
 * Keeps the user on the page they were last on across reloads, scoped per mode.
 *
 * Standalone PWA cold launch lands on the manifest start_url or Edge-redirected home.
 * We persist the active route per (mode, userId) and restore when landing on the mode's root.
 */
export function useRouteRestoration(expectedMode?: AppMode): { isRestoring: boolean } {
  const router = useRouter();
  const pathname = usePathname();

  const session = readSession();
  const activeMode: AppMode = expectedMode ?? session?.app_mode ?? 'agent';
  const launchPath = homeFor(activeMode);
  const storageKey = getStorageKey(activeMode, session?.user?.id);

  const [isRestoring, setIsRestoring] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (pathname !== launchPath) return false;
    const saved = window.localStorage.getItem(storageKey);
    return Boolean(saved && saved !== launchPath && isRestorableRoute(saved, activeMode));
  });

  useLayoutEffect(() => {
    if (!isRestoring) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved && saved !== launchPath && isRestorableRoute(saved, activeMode)) {
      router.replace(saved);
    } else {
      setIsRestoring(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRestoring && pathname !== launchPath) {
      setIsRestoring(false);
    }
  }, [pathname, isRestoring, launchPath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isRestorableRoute(pathname, activeMode)) return;
    window.localStorage.setItem(storageKey, pathname + window.location.search);
  }, [pathname, activeMode, storageKey]);

  return { isRestoring };
}
