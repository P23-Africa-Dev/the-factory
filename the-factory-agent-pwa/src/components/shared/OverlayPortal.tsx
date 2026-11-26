'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders modals / bottom sheets directly under <body>.
 *
 * The bottom navbar is `fixed z-[9999]`. An overlay rendered deep inside a page
 * can be trapped in a parent stacking context (transform, z-index, filter) and
 * then shows *behind* the navbar no matter its own z-index. Overlays must use
 * a z-index above 10000 (e.g. z-[10050]) and render through this portal.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  // Client-only: document.body does not exist during server rendering.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(children, document.body);
}
