'use client';

const STORAGE_KEY = 'f23:notif-return';

interface NotificationReturnEntry {
  fromPath: string;
  targetPath: string;
  reachedTarget: boolean;
  ts: number;
}

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function readEntry(): NotificationReturnEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotificationReturnEntry>;
    if (
      typeof parsed.fromPath !== 'string' ||
      typeof parsed.targetPath !== 'string' ||
      typeof parsed.ts !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.ts > MAX_AGE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      fromPath: parsed.fromPath,
      targetPath: parsed.targetPath,
      reachedTarget: Boolean(parsed.reachedTarget),
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

function writeEntry(entry: NotificationReturnEntry): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function clearNotificationReturn(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function normalizePathname(urlOrPath: string): string {
  if (typeof window === 'undefined') return urlOrPath.split('?')[0].split('#')[0] || '/';
  try {
    return new URL(urlOrPath, window.location.origin).pathname;
  } catch {
    return urlOrPath.split('?')[0].split('#')[0] || '/';
  }
}

export function saveNotificationReturn(fromPath: string, targetUrl: string): void {
  const normalizedFrom = normalizePathname(fromPath);
  const normalizedTarget = normalizePathname(targetUrl);
  if (normalizedFrom === normalizedTarget) {
    clearNotificationReturn();
    return;
  }
  writeEntry({
    fromPath: normalizedFrom,
    targetPath: normalizedTarget,
    reachedTarget: false,
    ts: Date.now(),
  });
}

/**
 * Called from root layout on every pathname change.
 * Marks when the user reaches the notification destination, and clears the return
 * flag if the user navigates away to an unrelated screen instead of going back.
 */
export function trackNotificationReturnPath(currentPathname: string): void {
  const entry = readEntry();
  if (!entry) return;

  const current = normalizePathname(currentPathname);
  if (!entry.reachedTarget) {
    if (current === entry.targetPath) {
      writeEntry({ ...entry, reachedTarget: true });
    } else if (current !== entry.fromPath) {
      // Redirected to an intermediate/resolved route (e.g. /open-notification or proxy)
      writeEntry({ ...entry, targetPath: current, reachedTarget: true });
    }
    return;
  }

  // Already reached target: if user navigates somewhere other than target or origin, clear it.
  if (current !== entry.targetPath && current !== entry.fromPath) {
    clearNotificationReturn();
  }
}

/**
 * Checks whether returning to `currentPathname` should re-open the notification drawer,
 * consuming the stored flag if it matches.
 */
export function consumeNotificationReturn(currentPathname: string): boolean {
  const entry = readEntry();
  if (!entry || !entry.reachedTarget) return false;
  if (normalizePathname(currentPathname) !== entry.fromPath) return false;
  clearNotificationReturn();
  return true;
}
