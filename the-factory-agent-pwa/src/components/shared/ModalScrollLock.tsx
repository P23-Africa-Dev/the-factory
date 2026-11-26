'use client';

import { useEffect } from 'react';

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

function isModalElement(el: HTMLElement): boolean {
  if (el.closest('[data-sonner-toaster]')) return false;
  if (!isElementVisible(el)) return false;

  const role = el.getAttribute('role');
  if (
    el.getAttribute('aria-modal') === 'true' ||
    role === 'dialog' ||
    role === 'alertdialog'
  ) {
    return true;
  }

  const style = window.getComputedStyle(el);
  if (style.position !== 'fixed' || style.pointerEvents === 'none') {
    return false;
  }

  const zIndex = Number.parseInt(style.zIndex, 10);
  if (!Number.isFinite(zIndex) || zIndex < 50) {
    return false;
  }

  return (
    style.top === '0px' &&
    style.right === '0px' &&
    style.bottom === '0px' &&
    style.left === '0px'
  );
}

function hasOpenModal(): boolean {
  const candidates = document.body.querySelectorAll<HTMLElement>(
    '[aria-modal="true"], [role="dialog"], [role="alertdialog"], .fixed.inset-0',
  );
  for (const el of candidates) {
    if (isModalElement(el)) return true;
  }
  return false;
}

/**
 * Locks background page scrolling whenever any modal/sheet/dialog is open in the PWA,
 * while preserving the user's scroll position and allowing modal content to scroll.
 */
export function ModalScrollLock(): null {
  useEffect(() => {
    let locked = false;
    let savedScrollY = 0;

    let prevHtmlOverflow = '';
    let prevHtmlOverscroll = '';
    let prevBodyPosition = '';
    let prevBodyTop = '';
    let prevBodyLeft = '';
    let prevBodyRight = '';
    let prevBodyWidth = '';
    let prevBodyOverflow = '';

    const lock = () => {
      if (locked) return;
      locked = true;
      savedScrollY = window.scrollY;

      const html = document.documentElement;
      const body = document.body;

      prevHtmlOverflow = html.style.overflow;
      prevHtmlOverscroll = html.style.overscrollBehavior;
      prevBodyPosition = body.style.position;
      prevBodyTop = body.style.top;
      prevBodyLeft = body.style.left;
      prevBodyRight = body.style.right;
      prevBodyWidth = body.style.width;
      prevBodyOverflow = body.style.overflow;

      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    };

    const unlock = () => {
      if (!locked) return;
      locked = false;

      const html = document.documentElement;
      const body = document.body;

      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      body.style.overflow = prevBodyOverflow;

      window.scrollTo(0, savedScrollY);
    };

    const syncLock = () => {
      if (hasOpenModal()) {
        lock();
      } else {
        unlock();
      }
    };

    syncLock();

    const observer = new MutationObserver(syncLock);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-modal', 'role'],
    });

    return () => {
      observer.disconnect();
      unlock();
    };
  }, []);

  return null;
}
