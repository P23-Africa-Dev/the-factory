'use client';

import { useEffect } from 'react';

/** Bundled with the app, so it loads even when remote storage is unreachable. */
export const LOCAL_AVATAR_FALLBACK = '/avatars/default-ghost.svg';

/** 1×1 transparent GIF: keeps the image's box but never shows a broken-image glyph. */
export const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const HANDLED_ATTR = 'data-broken-image-handled';

function looksLikeAvatar(img: HTMLImageElement): boolean {
  const hint = `${img.alt} ${img.className} ${img.getAttribute('src') ?? ''}`.toLowerCase();
  return /avatar|profile|\/avatar|ghost|user-photo/.test(hint) || img.classList.contains('rounded-full');
}

/**
 * Pick a replacement for an image that failed to load.
 * - `data-fallback="<url>"` on the element wins.
 * - Avatars fall back to the bundled ghost avatar.
 * - Anything else becomes a transparent pixel (layout kept, no broken icon).
 */
export function fallbackFor(img: HTMLImageElement): string {
  const explicit = img.getAttribute('data-fallback');
  if (explicit && img.getAttribute('src') !== explicit) return explicit;
  if (looksLikeAvatar(img) && !img.src.endsWith(LOCAL_AVATAR_FALLBACK)) return LOCAL_AVATAR_FALLBACK;
  return TRANSPARENT_PIXEL;
}

export function recoverBrokenImage(img: HTMLImageElement): void {
  const current = img.getAttribute('src');
  if (!current || current === TRANSPARENT_PIXEL) return;

  const attempts = Number(img.getAttribute(HANDLED_ATTR) ?? '0');
  // First failure → best fallback; if that fails too → transparent pixel.
  const next = attempts === 0 ? fallbackFor(img) : TRANSPARENT_PIXEL;
  img.setAttribute(HANDLED_ATTR, String(attempts + 1));
  img.removeAttribute('srcset');
  img.src = next;
}

/** React re-renders can restore the original src; allow a fresh recovery then. */
function resetIfSourceChanged(img: HTMLImageElement): void {
  const src = img.getAttribute('src');
  if (src && src !== TRANSPARENT_PIXEL && src !== LOCAL_AVATAR_FALLBACK && src !== img.getAttribute('data-fallback')) {
    img.removeAttribute(HANDLED_ATTR);
  }
}

/**
 * App-wide safety net: no `<img>` in the PWA / APK ever renders the browser's
 * broken-image icon, whether the source is a missing bundled asset, an expired
 * storage URL, or an offline avatar.
 */
export function BrokenImageGuard(): null {
  useEffect(() => {
    const onError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      resetIfSourceChanged(target);
      recoverBrokenImage(target);
    };
    // `error` on images does not bubble — listen in the capture phase.
    document.addEventListener('error', onError, true);

    // Images that already failed before hydration never fire again: re-probe them.
    for (const img of Array.from(document.images)) {
      if (!img.complete || img.naturalWidth > 0) continue;
      const src = img.currentSrc || img.src;
      if (!src || src === TRANSPARENT_PIXEL) continue;
      const probe = new Image();
      probe.onerror = () => recoverBrokenImage(img);
      probe.src = src;
    }

    return () => document.removeEventListener('error', onError, true);
  }, []);

  return null;
}
