/**
 * Keeps the CPU awake while live tracking is active (where supported).
 * Helps reduce WebView / browser timer throttling during field missions.
 * Does not replace the Android foreground-service GPS path.
 */

let sentinel: WakeLockSentinel | null = null;
let activeSessions = 0;

async function requestWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (sentinel && !sentinel.released) return;

  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Permission denied or unsupported — non-fatal.
  }
}

async function releaseWakeLock(): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // ignore
  }
  sentinel = null;
}

/** Call when a tracking session (field or task) becomes active. */
export async function acquireTrackingWakeLock(): Promise<void> {
  activeSessions += 1;
  if (activeSessions === 1) {
    await requestWakeLock();
  }
}

/** Call when a tracking session ends. */
export async function releaseTrackingWakeLock(): Promise<void> {
  activeSessions = Math.max(0, activeSessions - 1);
  if (activeSessions === 0) {
    await releaseWakeLock();
  }
}

/** Re-acquire after visibility return (wake locks are released when tab hides). */
export async function reacquireTrackingWakeLockIfNeeded(): Promise<void> {
  if (activeSessions <= 0) return;
  await requestWakeLock();
}

export function installTrackingWakeLockVisibilityHandler(): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = () => {
    if (document.visibilityState === 'visible') {
      void reacquireTrackingWakeLockIfNeeded();
    }
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
