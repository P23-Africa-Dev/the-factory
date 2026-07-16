import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import type { LocationObject } from '../hooks/useGeolocation';
import { isNativeAndroid } from './capacitorPlatform';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

type LocationCallback = (loc: LocationObject) => void;
type ErrorCallback = (message: string) => void;

export type NativeWatchOptions = {
  /** Notification title — e.g. "Live tracking · Acme Site" */
  title?: string;
  /** Notification body — stable copy for the FGS notification */
  message?: string;
};

const DEFAULT_TITLE = 'Factory 23 — Live tracking';
const DEFAULT_MESSAGE = 'Tap to open map · Location shared with your team';

let watcherId: string | null = null;
let onUpdateCb: LocationCallback | null = null;
let onErrorCb: ErrorCallback | null = null;

function toLocationObject(raw: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  bearing?: number | null;
  speed?: number | null;
  time?: number | null;
}): LocationObject {
  return {
    coords: {
      latitude: raw.latitude,
      longitude: raw.longitude,
      altitude: raw.altitude ?? null,
      accuracy: raw.accuracy ?? null,
      altitudeAccuracy: raw.altitudeAccuracy ?? null,
      heading: raw.bearing ?? null,
      speed: raw.speed ?? null,
    },
    timestamp: raw.time ?? Date.now(),
  };
}

/** Request Android 13+ notification permission so the tracking FGS notification can show. */
export async function ensureNativeNotificationPermission(): Promise<void> {
  if (!isNativeAndroid()) return;
  if (typeof Notification === 'undefined') return;
  try {
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    await Notification.requestPermission();
  } catch {
    // Non-fatal — location may still work; notification may be suppressed.
  }
}

export function formatDistanceRemaining(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km left`;
  }
  return `${Math.round(meters)} m left`;
}

export function buildLiveTrackingTitle(destinationLabel?: string | null): string {
  const label = destinationLabel?.trim();
  if (label) return `Live tracking · ${label}`;
  return DEFAULT_TITLE;
}

export function buildLiveTrackingMessage(distanceMeters?: number | null): string {
  const dist =
    typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
      ? formatDistanceRemaining(distanceMeters)
      : '';
  if (dist) return `${dist} · Tap to open map · Location shared with your team`;
  return DEFAULT_MESSAGE;
}

async function addWatcherInternal(title: string, message: string): Promise<void> {
  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: message,
      backgroundTitle: title,
      requestPermissions: true,
      stale: false,
      distanceFilter: 15,
    },
    (location, error) => {
      if (error) {
        onErrorCb?.(error.message || String(error.code) || 'Location error');
        return;
      }
      if (!location) return;
      if (location.latitude === 0 && location.longitude === 0) return;
      onUpdateCb?.(toLocationObject(location));
    },
  );
}

/**
 * Start Android background geolocation with a persistent foreground notification
 * (Google Maps–style continuous tracking while minimized / screen locked).
 */
export async function startNativeBackgroundWatch(
  onUpdate: LocationCallback,
  onError?: ErrorCallback,
  options?: NativeWatchOptions,
): Promise<void> {
  if (!isNativeAndroid()) {
    throw new Error('Native background geolocation is only available on Android APK.');
  }

  await ensureNativeNotificationPermission();

  onUpdateCb = onUpdate;
  onErrorCb = onError ?? null;

  if (watcherId) {
    await stopNativeBackgroundWatch({ keepCallbacks: true });
  }

  const title = options?.title?.trim() || DEFAULT_TITLE;
  // Freeze body at start — never restart the FGS just to refresh distance copy.
  const message = options?.message?.trim() || DEFAULT_MESSAGE;
  await addWatcherInternal(title, message);
}

/**
 * Kept for call-site compatibility. Does NOT restart the FGS watcher.
 * Restarting removeWatcher/addWatcher was clearing the ongoing notification mid-session.
 */
export async function updateNativeBackgroundNotification(_options: {
  title?: string;
  message?: string;
  distanceMeters?: number | null;
}): Promise<void> {
  // Intentionally a no-op: notification copy is set once at start and stays until stop.
}

export async function stopNativeBackgroundWatch(opts?: {
  keepCallbacks?: boolean;
}): Promise<void> {
  if (!watcherId) {
    if (!opts?.keepCallbacks) {
      onUpdateCb = null;
      onErrorCb = null;
    }
    return;
  }
  const id = watcherId;
  watcherId = null;
  if (!opts?.keepCallbacks) {
    onUpdateCb = null;
    onErrorCb = null;
  }
  try {
    await BackgroundGeolocation.removeWatcher({ id });
  } catch {
    // Ignore — watcher may already be gone.
  }
}

export function isNativeBackgroundWatching(): boolean {
  return watcherId != null;
}

/** Open OS app settings (useful when location was denied). */
export async function openNativeLocationSettings(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await BackgroundGeolocation.openSettings();
  } catch {
    // Ignore
  }
}
