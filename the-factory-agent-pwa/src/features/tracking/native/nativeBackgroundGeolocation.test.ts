import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addWatcher, removeWatcher } = vi.hoisted(() => ({
  addWatcher: vi.fn(async (..._args: unknown[]) => 'watcher-1'),
  removeWatcher: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ addWatcher, removeWatcher, openSettings: vi.fn() }),
}));
vi.mock('./capacitorPlatform', () => ({ isNativeAndroid: () => true }));
vi.mock('./nativeLocalNotifications', () => ({ ensureNativeLocalNotificationPermission: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/trackingAlerts', () => ({
  beginLiveTrackingIndicator: vi.fn(async () => {}),
  endLiveTrackingIndicator: vi.fn(async () => {}),
}));

import {
  nativeWatchOwners,
  resetNativeWatchStateForTests,
  startNativeBackgroundWatch,
  stopNativeBackgroundWatch,
} from './nativeBackgroundGeolocation';

describe('shared native watcher (reference counted)', () => {
  beforeEach(() => {
    resetNativeWatchStateForTests();
    addWatcher.mockClear();
    removeWatcher.mockClear();
  });

  it('stopping task tracking keeps an active field trip watcher alive', async () => {
    await startNativeBackgroundWatch(vi.fn(), undefined, undefined, 'field-trip');
    await startNativeBackgroundWatch(vi.fn(), undefined, undefined, 'shared');
    expect(addWatcher).toHaveBeenCalledTimes(1); // one foreground service

    await stopNativeBackgroundWatch(); // task tracking / map preview leaves
    expect(removeWatcher).not.toHaveBeenCalled();
    expect(nativeWatchOwners()).toEqual(['field-trip']);

    await stopNativeBackgroundWatch({ owner: 'field-trip' });
    expect(removeWatcher).toHaveBeenCalledTimes(1);
    expect(nativeWatchOwners()).toEqual([]);
  });

  it('delivers every fix to every subscriber', async () => {
    const trip = vi.fn();
    const task = vi.fn();
    await startNativeBackgroundWatch(trip, undefined, undefined, 'field-trip');
    await startNativeBackgroundWatch(task, undefined, undefined, 'shared');

    const callback = addWatcher.mock.calls[0]?.[1] as (loc: unknown, err?: unknown) => void;
    callback({ latitude: 6.5, longitude: 3.3, accuracy: 5, time: 1 });

    expect(trip).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
