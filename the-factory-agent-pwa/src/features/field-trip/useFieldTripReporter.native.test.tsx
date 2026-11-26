import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tracker = vi.hoisted(() => ({
  start: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  flush: vi.fn(async () => ({ pending: 0, endedByServer: false })),
  getState: vi.fn(async () => ({ active: true, running: true, endedByServer: false })),
  getTrail: vi.fn(async () => ({ points: [] })),
  stop: vi.fn(async () => ({})),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
}));
vi.mock('./nativeTracker', () => ({ FieldTripTracker: tracker, isNativeTrackerAvailable: () => true }));
const geo = vi.hoisted(() => ({ startWatching: vi.fn(), stopWatching: vi.fn() }));
vi.mock('@/features/tracking/hooks/useGeolocation', () => ({
  useGeolocation: () => geo,
  restartSharedGeolocationWatch: vi.fn(),
  probeSharedGeolocationFix: vi.fn(),
}));
vi.mock('@/lib/tracking/battery-optimization-prompt', () => ({ maybePromptBatteryOptimizationOnTrackingStart: vi.fn() }));
vi.mock('@/lib/storage/stores', () => ({
  getActiveCompanyId: () => 9,
  appStore: { getString: (k: string) => (k === 'auth_token' ? 'tok' : null) },
}));
vi.mock('@/constants/env', () => ({ env: { API_BASE_URL: 'https://api.example.test/api/v1' } }));
const ended = vi.hoisted(() => vi.fn());
vi.mock('./serverEnded', () => ({ notifyFieldTripServerEnded: ended, isTripNotActiveError: () => false }));

import { useFieldTripReporter } from './useFieldTripReporter';

type Props = Parameters<typeof useFieldTripReporter>[0];
const base: Props = { active: true, clientTripId: 'trip-a', serverId: 77, startedAt: '2026-11-26T08:00:00Z' };

describe('useFieldTripReporter on APK 1.0.4 (native tracker)', () => {
  beforeEach(() => {
    Object.values(tracker).forEach((fn) => fn.mockClear());
    geo.startWatching.mockClear();
    ended.mockClear();
  });

  it('hands the trip to the native service and never starts the WebView watcher', async () => {
    const { result } = renderHook((p: Props) => useFieldTripReporter(p), { initialProps: base });
    await act(async () => {});

    expect(result.current.native).toBe(true);
    expect(geo.startWatching).not.toHaveBeenCalled();
    expect(tracker.start).toHaveBeenCalledWith(
      expect.objectContaining({
        clientTripId: 'trip-a',
        serverId: 77,
        token: 'tok',
        companyId: 9,
        apiBaseUrl: 'https://api.example.test/api/v1',
        startedAtMillis: Date.parse('2026-11-26T08:00:00Z'),
      }),
    );
  });

  it('pauses recording on End, reports uploads done, and stops after the trip is gone', async () => {
    const { result, rerender } = renderHook((p: Props) => useFieldTripReporter(p), { initialProps: base });
    await act(async () => {});

    rerender({ ...base, active: false }); // End tapped ("ending")
    await act(async () => {});
    expect(tracker.update).toHaveBeenCalledWith({ recording: false });
    expect(tracker.stop).not.toHaveBeenCalled();

    tracker.flush.mockResolvedValueOnce({ pending: 3, endedByServer: false });
    await expect(result.current.flush()).resolves.toBe(false); // points still waiting
    await expect(result.current.flush()).resolves.toBe(true);

    rerender({ ...base, active: false, clientTripId: null, serverId: null });
    await act(async () => {});
    expect(tracker.stop).toHaveBeenCalledTimes(1);
  });

  it('a native "trip already ended" answer ends the trip here', async () => {
    const { result } = renderHook((p: Props) => useFieldTripReporter(p), { initialProps: base });
    await act(async () => {});
    tracker.flush.mockResolvedValueOnce({ pending: 5, endedByServer: true });
    await expect(result.current.flush()).resolves.toBe(true);
    expect(ended).toHaveBeenCalledWith(77);
  });

  it('stops a leftover native recording when the server confirms no trip is running', async () => {
    renderHook((p: Props) => useFieldTripReporter(p), {
      initialProps: { active: false, clientTripId: null, serverId: null, idleConfirmed: true },
    });
    await act(async () => {});
    expect(tracker.stop).toHaveBeenCalledTimes(1);
  });
});
