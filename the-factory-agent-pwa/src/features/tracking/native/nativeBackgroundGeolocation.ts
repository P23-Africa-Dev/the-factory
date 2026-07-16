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
  /** Notification body — e.g. distance remaining */
  message?: string;
};

const DEFAULT_TITLE = 'Factory 23 — Live tracking';
const DEFAULT_MESSAGE = 'Live tracking active — your location is shared with your team.';

const DISTANCE_UPDATE_MIN_M = 100;
const DISTANCE_UPDATE_MIN_MS = 60_000;

let watcherId: string | null = null;
let onUpdateCb: LocationCallback | null = null;
let onErrorCb: ErrorCallback | null = null;
let currentTitle = DEFAULT_TITLE;
let currentMessage = DEFAULT_MESSAGE;
let lastNotifiedDistanceM: number | null = null;
let lastNotificationUpdateAt = 0;
let restartInFlight: Promise<void> | null = null;

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
  return 'Tap to open map · Location shared with your team';
}

async function addWatcherInternal(title: string, message: string): Promise<void> {
  currentTitle = title;
  currentMessage = message;
  lastNotificationUpdateAt = Date.now();

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
  lastNotifiedDistanceM = null;

  if (watcherId) {
    await stopNativeBackgroundWatch({ keepCallbacks: true });
  }

  const title = options?.title?.trim() || DEFAULT_TITLE;
  const message = options?.message?.trim() || DEFAULT_MESSAGE;
  await addWatcherInternal(title, message);
}

/**
 * Throttled FGS text refresh when distance remaining changes meaningfully.
 * Restarts the watcher only when title/body actually change (avoids flicker).
 */
export async function updateNativeBackgroundNotification(options: {
  title?: string;
  message?: string;
  distanceMeters?: number | null;
}): Promise<void> {
  if (!isNativeAndroid() || !watcherId || !onUpdateCb) return;

  const title = options.title?.trim() || currentTitle;
  let message = options.message?.trim() || currentMessage;

  if (typeof options.distanceMeters === 'number' && Number.isFinite(options.distanceMeters)) {
    const now = Date.now();
    const prev = lastNotifiedDistanceM;
    const delta =
      prev == null ? Number.POSITIVE_INFINITY : Math.abs(prev - options.distanceMeters);
    const timeOk = now - lastNotificationUpdateAt >= DISTANCE_UPDATE_MIN_MS;
    const distOk = delta >= DISTANCE_UPDATE_MIN_M;
    if (!distOk && !timeOk && prev != null) {
      return;
    }
    lastNotifiedDistanceM = options.distanceMeters;
    message = buildLiveTrackingMessage(options.distanceMeters);
  }

  if (title === currentTitle && message === currentMessage) return;

  if (restartInFlight) {
    await restartInFlight;
    if (title === currentTitle && message === currentMessage) return;
  }

  restartInFlight = (async () => {
    const id = watcherId;
    if (id) {
      watcherId = null;
      try {
        await BackgroundGeolocation.removeWatcher({ id });
      } catch {
        // ignore
      }
    }
    await addWatcherInternal(title, message);
  })();

  try {
    await restartInFlight;
  } finally {
    restartInFlight = null;
  }
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
  lastNotifiedDistanceM = null;
  currentTitle = DEFAULT_TITLE;
  currentMessage = DEFAULT_MESSAGE;
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
