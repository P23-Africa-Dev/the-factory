/**
 * Shared watchdog for field-activity (clock-in) and task live tracking.
 * Detects GPS silence ("zombie watcher") and triggers watcher restarts.
 */

/** No fix for this long while tracking is active → force restart. */
export const DEFAULT_STALE_FIX_MS = 90_000;

/** How often the watchdog evaluates fix freshness. */
export const DEFAULT_WATCHDOG_INTERVAL_MS = 45_000;

/** Minimum time between forced restarts to avoid thrashing. */
export const RESTART_COOLDOWN_MS = 30_000;

let lastFixAtMs = 0;

/** Call whenever any tracking path delivers a valid location fix. */
export function recordBackgroundLocationFix(): void {
  lastFixAtMs = Date.now();
}

/** Age of the last fix in ms; Infinity if none recorded yet. */
export function getLastBackgroundFixAgeMs(nowMs: number = Date.now()): number {
  if (lastFixAtMs <= 0) return Number.POSITIVE_INFINITY;
  return nowMs - lastFixAtMs;
}

/** Seed freshness when a session starts so we do not restart immediately. */
export function markBackgroundTrackingStarted(nowMs: number = Date.now()): void {
  lastFixAtMs = nowMs;
}

export function resetBackgroundTrackingWatchdog(): void {
  lastFixAtMs = 0;
}

export function isBackgroundFixStale(
  nowMs: number,
  staleThresholdMs: number = DEFAULT_STALE_FIX_MS,
): boolean {
  return getLastBackgroundFixAgeMs(nowMs) >= staleThresholdMs;
}

export type BackgroundTrackingWatchdogOptions = {
  isActive: () => boolean;
  onRestart: () => void | Promise<void>;
  staleThresholdMs?: number;
  checkIntervalMs?: number;
  onStaleDetected?: (ageMs: number) => void;
};

export type BackgroundTrackingWatchdog = {
  start: () => void;
  stop: () => void;
  /** Run an immediate stale check (e.g. on visibility / online). */
  poke: () => void;
};

export function createBackgroundTrackingWatchdog(
  options: BackgroundTrackingWatchdogOptions,
): BackgroundTrackingWatchdog {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastRestartAtMs = 0;
  let running = false;

  const staleThresholdMs = options.staleThresholdMs ?? DEFAULT_STALE_FIX_MS;
  const checkIntervalMs = options.checkIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS;

  const tick = (): void => {
    if (!running || !options.isActive()) return;

    const nowMs = Date.now();
    const ageMs = getLastBackgroundFixAgeMs(nowMs);
    if (ageMs < staleThresholdMs) return;
    if (nowMs - lastRestartAtMs < RESTART_COOLDOWN_MS) return;

    lastRestartAtMs = nowMs;
    options.onStaleDetected?.(ageMs);
    void options.onRestart();
  };

  const onVisibility = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      tick();
    }
  };

  const onOnline = (): void => {
    tick();
  };

  return {
    start() {
      if (running) return;
      running = true;
      markBackgroundTrackingStarted();
      intervalId = setInterval(tick, checkIntervalMs);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('online', onOnline);
      }
    },

    stop() {
      running = false;
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
      }
      resetBackgroundTrackingWatchdog();
    },

    poke: tick,
  };
}
