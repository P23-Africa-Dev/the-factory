import {
  checkLocationSettings,
  getPermissionStatus,
  requestForegroundPermission,
  type LocationPermissionStatus,
} from '@/features/tracking/native/locationSettings';
import type { TripPosition } from './types';
import { FieldTripTracker, isNativeTrackerAvailable } from './nativeTracker';

/**
 * Checks run when the user presses "Start Field Trip", in order:
 * permission → device location (GPS) on → background permission (APK) → first fix.
 *
 * Each failure maps to ONE clear fix-it action in the sheet.
 */
export type PreflightIssue =
  | 'permission_denied' // user/OS refused location access
  | 'gps_off' // device location switched off (APK: user declined the system dialog)
  | 'background_missing' // APK: only "while using the app" — tracking stops when minimised
  | 'precise_off' // approximate location only: routes and stops are off by hundreds of metres
  | 'battery_optimized' // APK 1.0.4+: Android may pause the app to save battery
  | 'unsupported'; // no geolocation at all (very old browser)

export type PreflightStep = 'permission' | 'gps' | 'background' | 'position';

export interface PreflightResult {
  /** True when the trip can start (possibly with a soft warning). */
  ok: boolean;
  issue: PreflightIssue | null;
  /** Soft: start allowed, but the user should fix this for reliable tracking. */
  warning: PreflightIssue | null;
  position: TripPosition | null;
  native: boolean;
}

export interface PreflightDeps {
  getPermissionStatus: () => Promise<LocationPermissionStatus>;
  requestForegroundPermission: () => Promise<LocationPermissionStatus>;
  checkLocationSettings: (opts: { highAccuracy?: boolean; showDialog?: boolean }) => Promise<{ enabled: boolean; resolution: string }>;
  readPosition: (timeoutMs: number) => Promise<TripPosition>;
  /** APK 1.0.4+: is Android allowed to pause the app for battery? null = unknown. */
  getBatteryOptimized?: () => Promise<boolean | null>;
}

/** Wait this long for a first fix; after that the trip starts and waits for GPS. */
export const FIRST_FIX_TIMEOUT_MS = 15_000;

export function readBrowserPosition(timeoutMs: number): Promise<TripPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('unsupported'), { code: -1 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export const defaultPreflightDeps: PreflightDeps = {
  getPermissionStatus,
  requestForegroundPermission,
  checkLocationSettings,
  readPosition: readBrowserPosition,
  getBatteryOptimized: async () => {
    if (!isNativeTrackerAvailable()) return null;
    try {
      return (await FieldTripTracker.getBatteryOptimization()).optimized;
    } catch {
      return null;
    }
  },
};

/** GeolocationPositionError codes: 1 denied, 2 unavailable (GPS off / no signal), 3 timeout. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

export async function runFieldTripPreflight(
  onStep: (step: PreflightStep) => void = () => {},
  deps: PreflightDeps = defaultPreflightDeps,
): Promise<PreflightResult> {
  onStep('permission');
  let status = await deps.getPermissionStatus();
  const native = status.native;

  if (status.foreground === 'denied') {
    return { ok: false, issue: 'permission_denied', warning: null, position: null, native };
  }
  if (status.foreground === 'prompt' && native) {
    status = await deps.requestForegroundPermission();
    if (status.foreground !== 'granted') {
      return { ok: false, issue: 'permission_denied', warning: null, position: null, native };
    }
  }

  onStep('gps');
  if (native && !status.locationServicesOn) {
    // Shows Android's own "Turn on device location?" dialog inside the app.
    const settings = await deps.checkLocationSettings({ highAccuracy: true, showDialog: true });
    if (!settings.enabled) {
      return { ok: false, issue: 'gps_off', warning: null, position: null, native };
    }
  }

  onStep('background');
  // Soft warnings (start allowed): the most important one is shown.
  const batteryOptimized = native && deps.getBatteryOptimized ? await deps.getBatteryOptimized() : null;
  const warning: PreflightIssue | null =
    native && status.precise === false
      ? 'precise_off'
      : native && status.background !== 'granted'
        ? 'background_missing'
        : batteryOptimized === true
          ? 'battery_optimized'
          : null;

  onStep('position');
  try {
    const position = await deps.readPosition(FIRST_FIX_TIMEOUT_MS);
    return { ok: true, issue: null, warning, position, native };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === PERMISSION_DENIED) {
      return { ok: false, issue: 'permission_denied', warning: null, position: null, native };
    }
    if (code === -1) {
      return { ok: false, issue: 'unsupported', warning: null, position: null, native };
    }
    if (code === POSITION_UNAVAILABLE && !native) {
      // Browsers report "location off" as unavailable.
      return { ok: false, issue: 'gps_off', warning: null, position: null, native };
    }
    // Timeout / weak signal: start anyway and wait for GPS.
    return { ok: true, issue: null, warning, position: null, native };
  }
}
