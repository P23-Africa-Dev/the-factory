import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeAndroid } from './capacitorPlatform';

/**
 * Typed bridge to the native `LocationSettings` Capacitor plugin
 * (android/app/src/main/java/com/thefactory23/agent/LocationSettingsPlugin.java).
 *
 * Used by the "Start Field Trip" pre-flight sheet: GPS on? foreground permission?
 * "Allow all the time"? Every function resolves (never throws) so UI can branch on the result.
 *
 * The WebView loads the live site, so this code also runs inside OLDER APKs (≤ 1.0.2) that do not
 * contain the plugin. Those, and the browser PWA, get the web fallback below.
 */

export type PermissionValue = 'granted' | 'denied' | 'prompt';

export type LocationSettingsResolution = 'already_on' | 'turned_on' | 'declined' | 'unavailable';

export interface CheckLocationSettingsOptions {
  /** Ask for GPS-level accuracy (default true). */
  highAccuracy?: boolean;
  /** Show Google's "Turn on device location?" dialog when location is off (default true). */
  showDialog?: boolean;
}

export interface LocationSettingsResult {
  enabled: boolean;
  resolution: LocationSettingsResolution;
}

export interface LocationPermissionStatus {
  foreground: PermissionValue;
  /** Web/PWA can never track in the background, so this is 'denied' when `native` is false. */
  background: PermissionValue;
  /** Device location toggle. On web this cannot be read and is reported as true. */
  locationServicesOn: boolean;
  /** Fine (GPS) location granted, not just approximate. */
  precise: boolean;
  /** True when the answer came from the native plugin. */
  native: boolean;
  sdkInt?: number;
}

export type BackgroundPermissionMethod =
  | 'not_needed'
  | 'dialog'
  | 'permission_page'
  | 'app_settings'
  | 'none'
  | 'unsupported';

export interface BackgroundPermissionResult {
  status: PermissionValue | 'foreground_required';
  /** True when the user was sent to a system settings screen (Android 11+). */
  openedSettings: boolean;
  method: BackgroundPermissionMethod;
  sdkInt?: number;
}

export interface OpenSettingsResult extends LocationPermissionStatus {
  opened: boolean;
}

/** Raw native contract — matches LocationSettingsPlugin.java. */
interface LocationSettingsNativePlugin {
  checkLocationSettings(options: CheckLocationSettingsOptions): Promise<LocationSettingsResult>;
  getPermissionStatus(): Promise<Omit<LocationPermissionStatus, 'native'>>;
  requestForegroundPermission(): Promise<Omit<LocationPermissionStatus, 'native'>>;
  requestBackgroundPermission(): Promise<BackgroundPermissionResult>;
  openAppSettings(): Promise<Omit<OpenSettingsResult, 'native'>>;
  openLocationSettings(): Promise<Omit<OpenSettingsResult, 'native'>>;
}

const LocationSettingsNative = registerPlugin<LocationSettingsNativePlugin>('LocationSettings');

const FOREGROUND_PROMPT_TIMEOUT_MS = 20_000;

/** True when the installed APK contains the LocationSettings plugin (APK ≥ 1.0.3 on Android). */
export function isLocationSettingsAvailable(): boolean {
  if (!isNativeAndroid()) return false;
  try {
    return Capacitor.isPluginAvailable('LocationSettings');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Web fallback helpers
// ---------------------------------------------------------------------------

function hasGeolocation(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

async function queryWebGeolocationPermission(): Promise<PermissionValue> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    const state = status?.state;
    return state === 'granted' || state === 'denied' ? state : 'prompt';
  } catch {
    return 'prompt';
  }
}

async function webPermissionStatus(): Promise<LocationPermissionStatus> {
  const foreground = hasGeolocation() ? await queryWebGeolocationPermission() : 'denied';
  return {
    foreground,
    background: 'denied',
    locationServicesOn: hasGeolocation(),
    precise: foreground === 'granted',
    native: false,
  };
}

/** Triggers the browser prompt with a one-off position request. Resolves when the user answers. */
function promptWebGeolocation(): Promise<void> {
  return new Promise((resolve) => {
    if (!hasGeolocation()) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, FOREGROUND_PROMPT_TIMEOUT_MS);
    try {
      navigator.geolocation.getCurrentPosition(done, done, {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: FOREGROUND_PROMPT_TIMEOUT_MS,
      });
    } catch {
      done();
    }
  });
}

function withNative(status: Omit<LocationPermissionStatus, 'native'>): LocationPermissionStatus {
  return { ...status, precise: status.precise ?? status.foreground === 'granted', native: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures device location is on. On Android, shows Google's in-app
 * "Turn on device location?" dialog when it is off.
 */
export async function checkLocationSettings(
  options: CheckLocationSettingsOptions = {},
): Promise<LocationSettingsResult> {
  if (!isLocationSettingsAvailable()) {
    return { enabled: false, resolution: 'unavailable' };
  }
  try {
    return await LocationSettingsNative.checkLocationSettings({
      highAccuracy: options.highAccuracy ?? true,
      showDialog: options.showDialog ?? true,
    });
  } catch {
    return { enabled: false, resolution: 'unavailable' };
  }
}

/** Reads foreground/background permission + device location toggle without prompting. */
export async function getPermissionStatus(): Promise<LocationPermissionStatus> {
  if (isLocationSettingsAvailable()) {
    try {
      return withNative(await LocationSettingsNative.getPermissionStatus());
    } catch {
      // fall through to web
    }
  }
  return webPermissionStatus();
}

/** Asks for "While using the app" location. Must be granted before requestBackgroundPermission(). */
export async function requestForegroundPermission(): Promise<LocationPermissionStatus> {
  if (isLocationSettingsAvailable()) {
    try {
      return withNative(await LocationSettingsNative.requestForegroundPermission());
    } catch {
      // fall through to web
    }
  }
  await promptWebGeolocation();
  return webPermissionStatus();
}

/**
 * Asks for "Allow all the time". On Android 11+ this opens a settings page and resolves when the
 * user comes back — re-check with getPermissionStatus() on app resume as well, in case Android
 * recreated the activity while the user was in settings.
 */
export async function requestBackgroundPermission(): Promise<BackgroundPermissionResult> {
  if (isLocationSettingsAvailable()) {
    try {
      return await LocationSettingsNative.requestBackgroundPermission();
    } catch {
      // fall through
    }
  }
  return { status: 'denied', openedSettings: false, method: 'unsupported' };
}

/** Opens Settings → Apps → Factory 23 Agent. Resolves with fresh status when the user returns. */
export async function openAppSettings(): Promise<OpenSettingsResult> {
  if (isLocationSettingsAvailable()) {
    try {
      const result = await LocationSettingsNative.openAppSettings();
      return { ...withNative(result), opened: result.opened };
    } catch {
      // fall through
    }
  }
  return { ...(await webPermissionStatus()), opened: false };
}

/** Opens the system Location screen (fallback for phones without Google Play services). */
export async function openLocationSettings(): Promise<OpenSettingsResult> {
  if (isLocationSettingsAvailable()) {
    try {
      const result = await LocationSettingsNative.openLocationSettings();
      return { ...withNative(result), opened: result.opened };
    } catch {
      // fall through
    }
  }
  return { ...(await webPermissionStatus()), opened: false };
}
