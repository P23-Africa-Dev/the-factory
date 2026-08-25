import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBackgroundTrackingWatchdog,
  DEFAULT_STALE_FIX_MS,
  getLastBackgroundFixAgeMs,
  isBackgroundFixStale,
  markBackgroundTrackingStarted,
  recordBackgroundLocationFix,
  resetBackgroundTrackingWatchdog,
  RESTART_COOLDOWN_MS,
} from './background-tracking-watchdog';

describe('background-tracking-watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBackgroundTrackingWatchdog();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetBackgroundTrackingWatchdog();
  });

  it('records fix age and detects stale GPS', () => {
    vi.setSystemTime(new Date(1_000));
    markBackgroundTrackingStarted();
    recordBackgroundLocationFix();
    expect(getLastBackgroundFixAgeMs(2_000)).toBe(1_000);
    expect(isBackgroundFixStale(2_000 + DEFAULT_STALE_FIX_MS, DEFAULT_STALE_FIX_MS)).toBe(true);
  });

  it('restarts when fixes go stale while tracking is active', async () => {
    vi.setSystemTime(new Date(0));
    const onRestart = vi.fn().mockResolvedValue(undefined);
    const onStaleDetected = vi.fn();

    const watchdog = createBackgroundTrackingWatchdog({
      isActive: () => true,
      onRestart,
      onStaleDetected,
      staleThresholdMs: 90_000,
      checkIntervalMs: 45_000,
    });

    watchdog.start();
    recordBackgroundLocationFix();

    vi.setSystemTime(new Date(91_000));
    await vi.advanceTimersByTimeAsync(45_000);

    expect(onStaleDetected).toHaveBeenCalled();
    expect(onRestart.mock.calls.length).toBeGreaterThanOrEqual(1);

    watchdog.stop();
  });

  it('respects restart cooldown to avoid thrashing', async () => {
    vi.setSystemTime(new Date(0));
    const onRestart = vi.fn().mockResolvedValue(undefined);

    const watchdog = createBackgroundTrackingWatchdog({
      isActive: () => true,
      onRestart,
      staleThresholdMs: 10_000,
      checkIntervalMs: 5_000,
    });

    watchdog.start();
    recordBackgroundLocationFix();

    vi.setSystemTime(new Date(20_000));
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onRestart.mock.calls.length).toBeLessThanOrEqual(2);
    expect(onRestart.mock.calls.length).toBeGreaterThanOrEqual(1);

    watchdog.stop();
    void RESTART_COOLDOWN_MS;
  });

  it('does not restart when tracking is inactive', async () => {
    const onRestart = vi.fn();
    let active = true;

    const watchdog = createBackgroundTrackingWatchdog({
      isActive: () => active,
      onRestart,
      staleThresholdMs: 5_000,
      checkIntervalMs: 5_000,
    });

    watchdog.start();
    markBackgroundTrackingStarted(0);
    active = false;

    vi.advanceTimersByTime(20_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onRestart).not.toHaveBeenCalled();
    watchdog.stop();
  });
});
