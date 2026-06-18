'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type PermissionStatus = 'unknown' | 'granted' | 'denied';

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
  getCurrentPosition: () => Promise<LocationObject>;
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
  timeout: 15_000,
  maximumAge: 30_000,
};

const MAX_STREAMING_ACCURACY_HIGH_M = 120;
const MAX_STREAMING_ACCURACY_LOW_M = 250;

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

export const useGeolocation = (): GeolocationState & GeolocationActions => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [isWatching, setIsWatching] = useState(false);
  const [lastPosition, setLastPosition] = useState<LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watcherRef = useRef<number | null>(null);
  const onUpdateRef = useRef<((loc: LocationObject) => void) | null>(null);
  const lowAccuracyRef = useRef(false);

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

    clearWatcher();

    const options = lowAccuracyRef.current ? LOW_ACCURACY_OPTIONS : HIGH_ACCURACY_OPTIONS;
    const maxAccuracy = lowAccuracyRef.current
      ? MAX_STREAMING_ACCURACY_LOW_M
      : MAX_STREAMING_ACCURACY_HIGH_M;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = toLocationObject(pos);
        if (!isValidReading(loc, maxAccuracy)) return;
        setLastPosition(loc);
        onUpdateRef.current?.(loc);
      },
      (err) => setError(err.message),
      options,
    );

    watcherRef.current = watchId;
    setIsWatching(true);
  }, [clearWatcher]);

  const checkPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (typeof window === 'undefined' || !navigator.permissions) {
      setPermissionStatus('unknown');
      return 'unknown';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      const mapped: PermissionStatus =
        result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown';
      setPermissionStatus(mapped);
      return mapped;
    } catch {
      setPermissionStatus('unknown');
      return 'unknown';
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setPermissionStatus('denied');
      return 'denied';
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissionStatus('granted');
          resolve('granted');
        },
        () => {
          setPermissionStatus('denied');
          resolve('denied');
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });
  }, []);

  const getCurrentPosition = useCallback(async (): Promise<LocationObject> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation is not supported by this browser.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = toLocationObject(pos);
          setLastPosition(loc);
          setError(null);
          resolve(loc);
        },
        (err) => {
          setError(err.message);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }, []);

  const startWatching = useCallback(
    async (onUpdate: (loc: LocationObject) => void): Promise<void> => {
      onUpdateRef.current = onUpdate;
      beginWatch();
    },
    [beginWatch],
  );

  const stopWatching = useCallback(() => {
    onUpdateRef.current = null;
    clearWatcher();
  }, [clearWatcher]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

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
    getCurrentPosition,
    startWatching,
    stopWatching,
  };
};
