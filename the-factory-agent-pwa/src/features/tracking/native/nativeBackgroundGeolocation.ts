import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import type { LocationObject } from '../hooks/useGeolocation';
import { isNativeAndroid } from './capacitorPlatform';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

type LocationCallback = (loc: LocationObject) => void;
type ErrorCallback = (message: string) => void;

let watcherId: string | null = null;

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

/**
 * Start Android background geolocation with a persistent foreground notification
 * (Google Maps–style continuous tracking while minimized / screen locked).
 */
export async function startNativeBackgroundWatch(
  onUpdate: LocationCallback,
  onError?: ErrorCallback,
): Promise<void> {
  if (!isNativeAndroid()) {
    throw new Error('Native background geolocation is only available on Android APK.');
  }

  await ensureNativeNotificationPermission();

  if (watcherId) {
    await stopNativeBackgroundWatch();
  }

  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Live tracking active — your location is shared with your team.',
      backgroundTitle: 'Factory 23 — Live tracking',
      requestPermissions: true,
      stale: false,
      // Small filter keeps battery reasonable while still dense enough for routes.
      distanceFilter: 15,
    },
    (location, error) => {
      if (error) {
        onError?.(error.message || String(error.code) || 'Location error');
        return;
      }
      if (!location) return;
      if (location.latitude === 0 && location.longitude === 0) return;
      onUpdate(toLocationObject(location));
    },
  );
}

export async function stopNativeBackgroundWatch(): Promise<void> {
  if (!watcherId) return;
  const id = watcherId;
  watcherId = null;
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
