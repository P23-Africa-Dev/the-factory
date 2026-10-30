'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const LAST_ROUTE_KEY = 'manager:last_route';
const LAUNCH_PATH = '/';

export function clearSavedRoute(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LAST_ROUTE_KEY);
}

function isRestorableRoute(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('/login')) return false;
  if (path.startsWith('/install')) return false;
  return true;
}

export function useRouteRestoration(): { isRestoring: boolean } {
  const router = useRouter();
  const pathname = usePathname();

  const [isRestoring, setIsRestoring] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (pathname !== LAUNCH_PATH) return false;
    const saved = window.localStorage.getItem(LAST_ROUTE_KEY);
    return Boolean(saved && saved !== LAUNCH_PATH && isRestorableRoute(saved));
  });

  useLayoutEffect(() => {
    if (!isRestoring) return;
    const saved = window.localStorage.getItem(LAST_ROUTE_KEY);
    if (saved && saved !== LAUNCH_PATH && isRestorableRoute(saved)) {
      router.replace(saved);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRestoring(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRestoring && pathname !== LAUNCH_PATH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRestoring(false);
    }
  }, [pathname, isRestoring]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isRestorableRoute(pathname)) return;
    window.localStorage.setItem(LAST_ROUTE_KEY, pathname + window.location.search);
  }, [pathname]);

  return { isRestoring };
}
