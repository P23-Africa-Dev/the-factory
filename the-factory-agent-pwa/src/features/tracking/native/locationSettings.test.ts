import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(() => false),
  isPluginAvailable: vi.fn(() => false),
  native: {
    checkLocationSettings: vi.fn(),
    getPermissionStatus: vi.fn(),
    requestForegroundPermission: vi.fn(),
    requestBackgroundPermission: vi.fn(),
    openAppSettings: vi.fn(),
    openLocationSettings: vi.fn(),
  },
}));

vi.mock('./capacitorPlatform', () => ({ isNativeAndroid: mocks.isNativeAndroid }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: mocks.isPluginAvailable },
  registerPlugin: () => mocks.native,
}));

import {
  checkLocationSettings,
  getPermissionStatus,
  isLocationSettingsAvailable,
  openAppSettings,
  openLocationSettings,
  requestBackgroundPermission,
  requestForegroundPermission,
} from './locationSettings';

const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

function setNavigator(key: 'permissions' | 'geolocation', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

function restoreNavigator(key: 'permissions' | 'geolocation', desc: PropertyDescriptor | undefined) {
  if (desc) Object.defineProperty(navigator, key, desc);
  else delete (navigator as unknown as Record<string, unknown>)[key];
}

function mockPermissionState(state: PermissionState | Error) {
  const query = vi.fn(async () => {
    if (state instanceof Error) throw state;
    return { state } as PermissionStatus;
  });
  setNavigator('permissions', { query });
  return query;
}

function mockGeolocation(behaviour: 'success' | 'error' | 'never' = 'success') {
  const getCurrentPosition = vi.fn((ok: () => void, fail: () => void) => {
    if (behaviour === 'success') ok();
    if (behaviour === 'error') fail();
  });
  setNavigator('geolocation', { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn() });
  return getCurrentPosition;
}

beforeEach(() => {
  mocks.isNativeAndroid.mockReturnValue(false);
  mocks.isPluginAvailable.mockReturnValue(false);
  mockGeolocation();
});

afterEach(() => {
  vi.useRealTimers();
  restoreNavigator('permissions', originalPermissions);
  restoreNavigator('geolocation', originalGeolocation);
});

describe('web fallback (not native)', () => {
  it('reports the plugin as unavailable', () => {
    expect(isLocationSettingsAvailable()).toBe(false);
  });

  it('checkLocationSettings resolves unavailable without touching the native plugin', async () => {
    await expect(checkLocationSettings({ highAccuracy: true })).resolves.toEqual({
      enabled: false,
      resolution: 'unavailable',
    });
    expect(mocks.native.checkLocationSettings).not.toHaveBeenCalled();
  });

  it.each(['granted', 'denied', 'prompt'] as const)(
    'getPermissionStatus maps navigator.permissions state %s',
    async (state) => {
      const query = mockPermissionState(state);
      const status = await getPermissionStatus();
      expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
      expect(status).toEqual({
        foreground: state,
        background: 'denied',
        locationServicesOn: true,
        precise: state === 'granted',
        native: false,
      });
      expect(mocks.native.getPermissionStatus).not.toHaveBeenCalled();
    },
  );

  it('getPermissionStatus falls back to prompt when navigator.permissions is missing', async () => {
    setNavigator('permissions', undefined);
    const status = await getPermissionStatus();
    expect(status.foreground).toBe('prompt');
  });

  it('getPermissionStatus falls back to prompt when the query throws', async () => {
    mockPermissionState(new TypeError('geolocation not supported by Permissions API'));
    const status = await getPermissionStatus();
    expect(status.foreground).toBe('prompt');
  });

  it('getPermissionStatus reports denied and location off when geolocation is missing', async () => {
    setNavigator('geolocation', undefined);
    mockPermissionState('granted');
    const status = await getPermissionStatus();
    expect(status.foreground).toBe('denied');
    expect(status.locationServicesOn).toBe(false);
  });

  it('requestForegroundPermission triggers the browser prompt then re-reads the state', async () => {
    const getCurrentPosition = mockGeolocation('error');
    mockPermissionState('denied');
    const status = await requestForegroundPermission();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(status.foreground).toBe('denied');
    expect(status.native).toBe(false);
  });

  it('requestForegroundPermission does not hang when the browser never answers', async () => {
    vi.useFakeTimers();
    mockGeolocation('never');
    mockPermissionState('prompt');
    const pending = requestForegroundPermission();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toMatchObject({ foreground: 'prompt', native: false });
  });

  it('requestBackgroundPermission is unsupported', async () => {
    await expect(requestBackgroundPermission()).resolves.toEqual({
      status: 'denied',
      openedSettings: false,
      method: 'unsupported',
    });
  });

  it('openAppSettings and openLocationSettings resolve opened: false', async () => {
    mockPermissionState('granted');
    await expect(openAppSettings()).resolves.toMatchObject({ opened: false, foreground: 'granted' });
    await expect(openLocationSettings()).resolves.toMatchObject({ opened: false, native: false });
    expect(mocks.native.openAppSettings).not.toHaveBeenCalled();
    expect(mocks.native.openLocationSettings).not.toHaveBeenCalled();
  });
});

describe('old APK without the plugin', () => {
  beforeEach(() => {
    mocks.isNativeAndroid.mockReturnValue(true);
    mocks.isPluginAvailable.mockReturnValue(false);
  });

  it('uses the web fallback instead of calling an unimplemented plugin', async () => {
    mockPermissionState('granted');
    await expect(checkLocationSettings()).resolves.toEqual({ enabled: false, resolution: 'unavailable' });
    await expect(getPermissionStatus()).resolves.toMatchObject({ foreground: 'granted', native: false });
    expect(mocks.native.checkLocationSettings).not.toHaveBeenCalled();
    expect(mocks.native.getPermissionStatus).not.toHaveBeenCalled();
  });
});

describe('native Android with the plugin', () => {
  beforeEach(() => {
    mocks.isNativeAndroid.mockReturnValue(true);
    mocks.isPluginAvailable.mockReturnValue(true);
  });

  it('passes options through and returns the native result', async () => {
    mocks.native.checkLocationSettings.mockResolvedValue({ enabled: true, resolution: 'turned_on' });
    await expect(checkLocationSettings()).resolves.toEqual({ enabled: true, resolution: 'turned_on' });
    expect(mocks.native.checkLocationSettings).toHaveBeenCalledWith({ highAccuracy: true, showDialog: true });
  });

  it('resolves unavailable when the native call rejects', async () => {
    mocks.native.checkLocationSettings.mockRejectedValue(new Error('boom'));
    await expect(checkLocationSettings()).resolves.toEqual({ enabled: false, resolution: 'unavailable' });
  });

  it('marks native permission status', async () => {
    mocks.native.getPermissionStatus.mockResolvedValue({
      foreground: 'granted',
      background: 'prompt',
      locationServicesOn: false,
      precise: true,
      sdkInt: 34,
    });
    await expect(getPermissionStatus()).resolves.toEqual({
      foreground: 'granted',
      background: 'prompt',
      locationServicesOn: false,
      precise: true,
      sdkInt: 34,
      native: true,
    });
  });

  it('returns the background request result from native', async () => {
    const result = { status: 'granted', openedSettings: true, method: 'permission_page', sdkInt: 34 };
    mocks.native.requestBackgroundPermission.mockResolvedValue(result);
    await expect(requestBackgroundPermission()).resolves.toEqual(result);
  });
});
