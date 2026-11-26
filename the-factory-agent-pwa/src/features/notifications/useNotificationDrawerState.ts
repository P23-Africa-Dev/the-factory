'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  clearNotificationReturn,
  consumeNotificationReturn,
} from './notificationReturnStore';

const PARAM_KEY = 'notifications';
const PARAM_VALUE = 'open';

function readOpenFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get(PARAM_KEY) === PARAM_VALUE;
}

function setUrlDrawerParam(pathname: string, open: boolean, mode: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const currentlyOpen = params.get(PARAM_KEY) === PARAM_VALUE;
  if (open === currentlyOpen) return;

  if (open) {
    params.set(PARAM_KEY, PARAM_VALUE);
  } else {
    params.delete(PARAM_KEY);
  }
  const qs = params.toString();
  const nextUrl = qs ? `${pathname}?${qs}` : pathname;
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', nextUrl);
  } else {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

/**
 * Syncs NotificationPanel open state with browser history (`?notifications=open`)
 * and a session return marker so clicking Back (either `router.back()`, browser Back,
 * or `<Link>` back to the origin page) from a notification destination re-opens the
 * notification list, while normal navigation stays untouched.
 */
export function useNotificationDrawerState() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const navigatingFromNotificationRef = useRef(false);

  const syncFromUrlOrReturn = useCallback(() => {
    if (consumeNotificationReturn(pathname)) {
      setUrlDrawerParam(pathname, true, 'replace');
      setIsOpen(true);
      return;
    }
    setIsOpen(readOpenFromUrl());
  }, [pathname]);

  useEffect(() => {
    navigatingFromNotificationRef.current = false;
    syncFromUrlOrReturn();
    const rafId = window.requestAnimationFrame(syncFromUrlOrReturn);
    return () => window.cancelAnimationFrame(rafId);
  }, [pathname, syncFromUrlOrReturn]);

  useEffect(() => {
    const onPopState = () => {
      syncFromUrlOrReturn();
      window.requestAnimationFrame(syncFromUrlOrReturn);
    };
    const onNotificationNavigate = () => {
      navigatingFromNotificationRef.current = true;
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('f23:notification-navigate', onNotificationNavigate);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('f23:notification-navigate', onNotificationNavigate);
    };
  }, [syncFromUrlOrReturn]);

  const openDrawer = useCallback(() => {
    navigatingFromNotificationRef.current = false;
    setUrlDrawerParam(pathname, true, 'push');
    setIsOpen(true);
  }, [pathname]);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    if (navigatingFromNotificationRef.current) {
      navigatingFromNotificationRef.current = false;
      return;
    }
    clearNotificationReturn();
    setUrlDrawerParam(pathname, false, 'replace');
  }, [pathname]);

  return { isOpen, openDrawer, closeDrawer };
}
