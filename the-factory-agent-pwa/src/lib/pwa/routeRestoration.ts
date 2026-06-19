'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const LAST_ROUTE_KEY = 'agent:last_route';

/** The PWA manifest start_url. A cold launch / relaunch always lands here. */
const LAUNCH_PATH = '/';

/** Forget the persisted route (e.g. on logout) so the next session starts clean. */
export function clearSavedRoute(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LAST_ROUTE_KEY);
}

/**
 * Routes that should never be persisted or restored. Auth and install live
 * outside the agent route group, but guarding here keeps the helper safe if it
 * is ever mounted higher in the tree.
 */
function isRestorableRoute(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('/login')) return false;
  if (path.startsWith('/install')) return false;
  return true;
}

/**
 * Keeps the agent on the page they were last on across reloads.
 *
 * A standalone PWA always boots at the manifest `start_url` (`/`), so a relaunch
 * — and a hard refresh on platforms that reset to the start URL — drops the user
 * back on the dashboard. We persist the current route on every navigation and,
 * when a cold load lands on the launch path while a deeper route was saved,
 * redirect back to it before the dashboard paints.
 *
 * Returns `isRestoring` so the caller can render a spinner instead of briefly
 * mounting the dashboard while the redirect is in flight.
 */
export function useRouteRestoration(): { isRestoring: boolean } {
  const router = useRouter();
  const pathname = usePathname();

  // Decide synchronously on the first render so the dashboard never mounts when
  // we already know we are going to restore a deeper route.
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
      setIsRestoring(false);
    }
    // Run once on mount; the lazy initializer captured the launch-time pathname.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restoration is complete once we have navigated away from the launch path.
  useEffect(() => {
    if (isRestoring && pathname !== LAUNCH_PATH) {
      setIsRestoring(false);
    }
  }, [pathname, isRestoring]);

  // Persist the active route on every change so the next launch can restore it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isRestorableRoute(pathname)) return;
    window.localStorage.setItem(LAST_ROUTE_KEY, pathname + window.location.search);
  }, [pathname]);

  return { isRestoring };
}
