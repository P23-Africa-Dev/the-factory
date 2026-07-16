'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { isNativeAndroid } from '../native/capacitorPlatform';
import {
  startNativeBackgroundWatch,
  stopNativeBackgroundWatch,
} from '../native/nativeBackgroundGeolocation';

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

export const useGeolocation = (): GeolocationState & GeolocationActions => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(cachedPermissionStatus);
  const [isWatching, setIsWatching] = useState(false);
  const [lastPosition, setLastPosition] = useState<LocationObject | null>(cachedLastPosition);
  const [error, setError] = useState<string | null>(null);
  const watcherRef = useRef<number | null>(null);
  const onUpdateRef = useRef<((loc: LocationObject) => void) | null>(null);
  const lowAccuracyRef = useRef(false);
  const lastPositionRef = useRef<LocationObject | null>(cachedLastPosition);
  const nativeWatchActiveRef = useRef(false);

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

  const clearWatcher = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    if (watcherRef.current !== null) {
      navigator.geolocation.clearWatch(watcherRef.current);
      watcherRef.current = null;
    }
    setIsWatching(false);
  }, []);

  const beginWatch = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    if (!onUpdateRef.current) return;
    // Native Android uses the background-geolocation foreground service instead.
    if (isNativeAndroid()) return;

    clearWatcher();

    const options = lowAccuracyRef.current ? LOW_ACCURACY_OPTIONS : HIGH_ACCURACY_OPTIONS;
    const maxAccuracy = lowAccuracyRef.current
      ? MAX_STREAMING_ACCURACY_LOW_M
      : MAX_STREAMING_ACCURACY_HIGH_M;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = toLocationObject(pos);
        if (!isValidReading(loc, maxAccuracy)) return;
        rememberPosition(loc);
        onUpdateRef.current?.(loc);
      },
      (err) => setError(err.message),
      options,
    );

    watcherRef.current = watchId;
    setIsWatching(true);
  }, [clearWatcher, rememberPosition]);

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

      if (isNativeAndroid()) {
        clearWatcher();
        try {
          await startNativeBackgroundWatch(
            (loc) => {
              if (!isValidReading(loc, MAX_STREAMING_ACCURACY_LOW_M)) return;
              rememberPosition(loc);
              onUpdateRef.current?.(loc);
            },
            (message) => setError(message),
          );
          nativeWatchActiveRef.current = true;
          setIsWatching(true);
          setPermission('granted');
        } catch (err) {
          nativeWatchActiveRef.current = false;
          setIsWatching(false);
          const message = err instanceof Error ? err.message : 'Failed to start native tracking';
          setError(message);
          throw err;
        }
        return;
      }

      beginWatch();
    },
    [beginWatch, clearWatcher, rememberPosition, setPermission],
  );

  const stopWatching = useCallback(() => {
    onUpdateRef.current = null;
    if (nativeWatchActiveRef.current || isNativeAndroid()) {
      nativeWatchActiveRef.current = false;
      void stopNativeBackgroundWatch();
      setIsWatching(false);
    }
    clearWatcher();
  }, [clearWatcher]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Native Android keeps high-accuracy FGS; no visibility downgrade.
    if (isNativeAndroid()) return;

    const handler = () => {
      const hidden = document.visibilityState === 'hidden';
      lowAccuracyRef.current = hidden;
      if (onUpdateRef.current) beginWatch();
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [beginWatch]);

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
