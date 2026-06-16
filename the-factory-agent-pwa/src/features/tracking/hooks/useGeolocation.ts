'use client';

import { useState, useRef, useCallback } from 'react';

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

export const useGeolocation = (): GeolocationState & GeolocationActions => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [isWatching, setIsWatching] = useState(false);
  const [lastPosition, setLastPosition] = useState<LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watcherRef = useRef<number | null>(null);

  const checkPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (typeof window === 'undefined' || !navigator.permissions) {
      setPermissionStatus('unknown');
      return 'unknown';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      const mapped: PermissionStatus = result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'unknown';
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
        { enableHighAccuracy: true, timeout: 5000 }
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
          const loc: LocationObject = {
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
          setLastPosition(loc);
          setError(null);
          resolve(loc);
        },
        (err) => {
          setError(err.message);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const startWatching = useCallback(async (
    onUpdate: (loc: LocationObject) => void,
  ): Promise<void> => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    if (watcherRef.current !== null) return; // already watching

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Quality gates: drop poor accuracy (larger than 200m)
        if (pos.coords.accuracy && pos.coords.accuracy > 200) return;
        // Drop null island
        if (pos.coords.latitude === 0 && pos.coords.longitude === 0) return;

        const loc: LocationObject = {
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

        setLastPosition(loc);
        onUpdate(loc);
      },
      (err) => {
        setError(err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    watcherRef.current = watchId;
    setIsWatching(true);
  }, []);

  const stopWatching = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    if (watcherRef.current !== null) {
      navigator.geolocation.clearWatch(watcherRef.current);
      watcherRef.current = null;
    }
    setIsWatching(false);
  }, []);

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
