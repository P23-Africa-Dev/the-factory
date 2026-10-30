'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { isNativeAndroid } from '../native/capacitorPlatform';
import {
  startNativeBackgroundWatch,
  stopNativeBackgroundWatch,
  forceRestartNativeBackgroundWatch,
  buildLiveTrackingTitle,
  buildLiveTrackingMessage,
  isNativeBackgroundWatching,
} from '../native/nativeBackgroundGeolocation';
import { useTrackingStore } from '@/store/tracking';
import {
  beginLiveTrackingIndicator,
  buildMapTaskUrl,
  endLiveTrackingIndicator,
} from '@/lib/notifications/trackingAlerts';
import { recordBackgroundLocationFix } from '@/lib/tracking/background-tracking-watchdog';

export type PermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface LocationObject {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

interface GeolocationState {
  permissionStatus: PermissionStatus;
  isWatching: boolean;
  lastPosition: LocationObject | null;
  error: string | null;
}

interface GeolocationActions {
  checkPermission: () => Promise<PermissionStatus>;
  requestPermission: () => Promise<PermissionStatus>;
  /** Check permission; if prompt/unknown, trigger the browser location prompt. */
  ensureLocationPermission: () => Promise<PermissionStatus>;
  /** Explicit user retry: re-check, then always attempt GPS even if previously denied. */
  retryLocationPermission: () => Promise<PermissionStatus>;
  getCurrentPosition: () => Promise<LocationObject>;
  /** Prefer a recent fix; fall back through high- then low-accuracy reads. */
  resolveCurrentPosition: () => Promise<LocationObject>;
  startWatching: (onUpdate: (loc: LocationObject) => void) => Promise<void>;
  stopWatching: () => void;
}

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
};

const LOW_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20_000,
  maximumAge: 60_000,
};

const MAX_STREAMING_ACCURACY_HIGH_M = 120;
const MAX_STREAMING_ACCURACY_LOW_M = 250;
const RECENT_POSITION_MS = 60_000;

/** Shared across hook instances so permission/GPS survives page navigations. */
let cachedLastPosition: LocationObject | null = null;
let cachedPermissionStatus: PermissionStatus = 'unknown';

/**
 * Shared watch ownership — map preview, location reporter, and field activity
 * all call useGeolocation. Stopping one instance must NOT tear down the native
 * Android FGS / browser watch while another instance still needs it.
 */
type WatchSubscriber = {
  onUpdate: (loc: LocationObject) => void;
  rememberPosition: (loc: LocationObject) => void;
  setError: (message: string) => void;
  setIsWatching: (watching: boolean) => void;
};

const watchSubscribers = new Map<symbol, WatchSubscriber>();
let sharedBrowserWatchId: number | null = null;
let sharedNativeOwned = false;
let sharedLowAccuracy = false;

function dispatchSharedLocation(loc: LocationObject): void {
  recordBackgroundLocationFix();
  for (const sub of watchSubscribers.values()) {
    sub.rememberPosition(loc);
    sub.onUpdate(loc);
  }
}

function dispatchSharedError(message: string): void {
  for (const sub of watchSubscribers.values()) {
    sub.setError(message);
  }
}

function clearSharedBrowserWatch(): void {
  if (typeof window === 'undefined' || !navigator.geolocation) return;
  if (sharedBrowserWatchId !== null) {
    navigator.geolocation.clearWatch(sharedBrowserWatchId);
    sharedBrowserWatchId = null;
  }
}

function beginSharedBrowserWatch(): void {
  if (typeof window === 'undefined' || !navigator.geolocation) return;
  if (isNativeAndroid()) return;
  if (watchSubscribers.size === 0) return;

  clearSharedBrowserWatch();

  const options = sharedLowAccuracy ? LOW_ACCURACY_OPTIONS : HIGH_ACCURACY_OPTIONS;
  const maxAccuracy = sharedLowAccuracy
    ? MAX_STREAMING_ACCURACY_LOW_M
    : MAX_STREAMING_ACCURACY_HIGH_M;

  sharedBrowserWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const loc = toLocationObject(pos);
      if (!isValidReading(loc, maxAccuracy)) return;
      dispatchSharedLocation(loc);
    },
    (err) => dispatchSharedError(err.message),
    options,
  );
}

async function ensureSharedNativeWatch(): Promise<void> {
  if (!isNativeAndroid()) return;
  if (watchSubscribers.size === 0) return;
  if (sharedNativeOwned && isNativeBackgroundWatching()) return;

  const taskId = useTrackingStore.getState().activeTrackingTaskId;
  const live = taskId != null ? useTrackingStore.getState().liveTaskMap[taskId] : null;
  const title = buildLiveTrackingTitle(live?.taskTitle ?? null);
  const message = buildLiveTrackingMessage(null);

  await startNativeBackgroundWatch(
    (loc) => {
      if (!isValidReading(loc, MAX_STREAMING_ACCURACY_LOW_M)) return;
      dispatchSharedLocation(loc);
    },
    (messageText) => dispatchSharedError(messageText),
    { title, message },
  );
  sharedNativeOwned = true;
}

async function releaseSharedWatchIfIdle(): Promise<void> {
  if (watchSubscribers.size > 0) return;

  if (sharedNativeOwned || isNativeBackgroundWatching()) {
    sharedNativeOwned = false;
    await stopNativeBackgroundWatch();
  } else {
    void endLiveTrackingIndicator();
  }
  clearSharedBrowserWatch();
}

function toLocationObject(pos: GeolocationPosition): LocationObject {
  return {
    coords: {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      altitude: pos.coords.altitude,
      accuracy: pos.coords.accuracy,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
    },
    timestamp: pos.timestamp,
  };
}

function isValidReading(loc: LocationObject, maxAccuracyM: number): boolean {
  if (loc.coords.latitude === 0 && loc.coords.longitude === 0) return false;
  if (loc.coords.accuracy != null && loc.coords.accuracy > maxAccuracyM) return false;
  return true;
}

function readPosition(options: PositionOptions): Promise<LocationObject> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toLocationObject(pos)),
      (err) => reject(err),
      options,
    );
  });
}

/** True when any hook instance holds an active shared watch. */
export function isSharedGeolocationWatching(): boolean {
  return watchSubscribers.size > 0;
}

/**
 * Restart the shared browser or native watch without dropping subscribers.
 * Used by the background tracking watchdog when fixes go stale.
 */
export async function restartSharedGeolocationWatch(): Promise<void> {
  if (watchSubscribers.size === 0) return;

  if (isNativeAndroid()) {
    if (isNativeBackgroundWatching()) {
      await forceRestartNativeBackgroundWatch();
    } else {
      await ensureSharedNativeWatch();
    }
    return;
  }

  beginSharedBrowserWatch();
}

/**
 * One-shot GPS read while the page is foregrounded — helps recover browser
 * tracking when watchPosition stalls after a lock/unlock cycle.
 */
export async function probeSharedGeolocationFix(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (watchSubscribers.size === 0) return;

  try {
    const loc = await readPosition(HIGH_ACCURACY_OPTIONS);
    if (!isValidReading(loc, MAX_STREAMING_ACCURACY_LOW_M)) return;
    dispatchSharedLocation(loc);
  } catch {
    try {
      const loc = await readPosition(LOW_ACCURACY_OPTIONS);
      if (!isValidReading(loc, MAX_STREAMING_ACCURACY_LOW_M)) return;
      dispatchSharedLocation(loc);
    } catch {
      // Non-fatal — watchdog may force a full watcher restart next tick.
    }
  }
}

export const useGeolocation = (): GeolocationState & GeolocationActions => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(cachedPermissionStatus);
  const [isWatching, setIsWatching] = useState(false);
  const [lastPosition, setLastPosition] = useState<LocationObject | null>(cachedLastPosition);
  const [error, setError] = useState<string | null>(null);
  const ownerTokenRef = useRef<symbol>(Symbol('geolocation-owner'));
  const onUpdateRef = useRef<((loc: LocationObject) => void) | null>(null);
  const lastPositionRef = useRef<LocationObject | null>(cachedLastPosition);

  const rememberPosition = useCallback((loc: LocationObject) => {
    cachedLastPosition = loc;
    lastPositionRef.current = loc;
    setLastPosition(loc);
    setError(null);
  }, []);

  const setPermission = useCallback((status: PermissionStatus) => {
    cachedPermissionStatus = status;
    setPermissionStatus(status);
  }, []);

  const checkPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (typeof window === 'undefined' || !navigator.permissions) {
      setPermission('unknown');
      return 'unknown';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      const mapped: PermissionStatus =
        result.state === 'granted'
          ? 'granted'
          : result.state === 'denied'
            ? 'denied'
            : 'prompt';
      setPermission(mapped);
      return mapped;
    } catch {
      setPermission('unknown');
      return 'unknown';
    }
  }, [setPermission]);

  const requestPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setPermission('denied');
      return 'denied';
    }

    try {
      const loc = await readPosition(HIGH_ACCURACY_OPTIONS);
      rememberPosition(loc);
      setPermission('granted');
      return 'granted';
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code === geoErr.PERMISSION_DENIED) {
        setPermission('denied');
        return 'denied';
      }
    }

    try {
      const loc = await readPosition(LOW_ACCURACY_OPTIONS);
      rememberPosition(loc);
      setPermission('granted');
      return 'granted';
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code === geoErr.PERMISSION_DENIED) {
        setPermission('denied');
        return 'denied';
      }
    }

    const perm = await checkPermission();
    if (perm === 'granted') {
      setPermission('granted');
      return 'granted';
    }

    setPermission('prompt');
    return 'prompt';
  }, [checkPermission, rememberPosition, setPermission]);

  const ensureLocationPermission = useCallback(async (): Promise<PermissionStatus> => {
    const status = await checkPermission();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return requestPermission();
  }, [checkPermission, requestPermission]);

  const retryLocationPermission = useCallback(async (): Promise<PermissionStatus> => {
    const status = await checkPermission();
    if (status === 'granted') return 'granted';
    return requestPermission();
  }, [checkPermission, requestPermission]);

  const getCurrentPosition = useCallback(async (): Promise<LocationObject> => {
    try {
      const loc = await readPosition(HIGH_ACCURACY_OPTIONS);
      rememberPosition(loc);
      return loc;
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      setError(geoErr.message);
      throw err;
    }
  }, [rememberPosition]);

  const resolveCurrentPosition = useCallback(async (): Promise<LocationObject> => {
    const cached = lastPositionRef.current ?? cachedLastPosition;
    if (cached && Date.now() - cached.timestamp < RECENT_POSITION_MS) {
      return cached;
    }

    if (cachedPermissionStatus !== 'granted') {
      const perm = await ensureLocationPermission();
      if (perm === 'denied') {
        setPermission('denied');
        const message = 'Location permission denied';
        setError(message);
        const deniedErr = {
          code: 1,
          message,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError;
        throw deniedErr;
      }
    }

    try {
      const loc = await readPosition(HIGH_ACCURACY_OPTIONS);
      rememberPosition(loc);
      return loc;
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code === geoErr.PERMISSION_DENIED) {
        setPermission('denied');
        setError(geoErr.message);
        throw err;
      }
      const loc = await readPosition(LOW_ACCURACY_OPTIONS);
      rememberPosition(loc);
      return loc;
    }
  }, [ensureLocationPermission, rememberPosition, setPermission]);

  const startWatching = useCallback(
    async (onUpdate: (loc: LocationObject) => void): Promise<void> => {
      onUpdateRef.current = onUpdate;
      const token = ownerTokenRef.current;

      watchSubscribers.set(token, {
        onUpdate: (loc) => onUpdateRef.current?.(loc),
        rememberPosition,
        setError,
        setIsWatching,
      });
      setIsWatching(true);

      if (isNativeAndroid()) {
        try {
          await ensureSharedNativeWatch();
          setPermission('granted');
        } catch (err) {
          watchSubscribers.delete(token);
          setIsWatching(false);
          const message = err instanceof Error ? err.message : 'Failed to start native tracking';
          setError(message);
          throw err;
        }
        return;
      }

      beginSharedBrowserWatch();
      const taskId = useTrackingStore.getState().activeTrackingTaskId;
      const live = taskId != null ? useTrackingStore.getState().liveTaskMap[taskId] : null;
      void beginLiveTrackingIndicator({
        label: live?.taskTitle ?? 'Live session',
        url: taskId != null ? buildMapTaskUrl(taskId) : '/map',
      });
    },
    [rememberPosition, setPermission],
  );

  const stopWatching = useCallback(() => {
    const token = ownerTokenRef.current;
    // Only release ownership if THIS instance started/subscribed a watch.
    if (!watchSubscribers.has(token)) {
      onUpdateRef.current = null;
      setIsWatching(false);
      return;
    }

    watchSubscribers.delete(token);
    onUpdateRef.current = null;
    setIsWatching(false);
    void releaseSharedWatchIfIdle();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Native Android keeps high-accuracy FGS; no visibility downgrade.
    if (isNativeAndroid()) return;

    const handler = () => {
      const hidden = document.visibilityState === 'hidden';
      sharedLowAccuracy = hidden;
      if (watchSubscribers.size > 0) beginSharedBrowserWatch();
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Drop this instance's claim on unmount without tearing down others.
  useEffect(() => {
    const token = ownerTokenRef.current;
    return () => {
      if (!watchSubscribers.has(token)) return;
      watchSubscribers.delete(token);
      void releaseSharedWatchIfIdle();
    };
  }, []);

  return {
    permissionStatus,
    isWatching,
    lastPosition,
    error,
    checkPermission,
    requestPermission,
    ensureLocationPermission,
    retryLocationPermission,
    getCurrentPosition,
    resolveCurrentPosition,
    startWatching,
    stopWatching,
  };
};
