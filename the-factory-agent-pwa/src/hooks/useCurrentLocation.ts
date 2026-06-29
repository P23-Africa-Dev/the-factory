'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGeolocation } from '@/features/tracking';

type LocationState = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
} | null;

type UseCurrentLocationReturn = {
  location: LocationState;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

function mapGeolocationError(err: unknown): string {
  const geoErr = err as GeolocationPositionError;
  if (geoErr?.code === geoErr?.PERMISSION_DENIED) {
    return 'Location permission denied';
  }
  if (geoErr?.code === geoErr?.POSITION_UNAVAILABLE) {
    return 'Location position unavailable';
  }
  if (geoErr?.code === geoErr?.TIMEOUT) {
    return 'Location request timed out';
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Failed to get location';
}

export function useCurrentLocation(): UseCurrentLocationReturn {
  const { ensureLocationPermission, resolveCurrentPosition } = useGeolocation();
  const [location, setLocation] = useState<LocationState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLocation = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const status = await ensureLocationPermission();
      if (status === 'denied') {
        setError('Location permission denied');
        setIsLoading(false);
        return;
      }

      const pos = await resolveCurrentPosition();
      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
    } catch (err) {
      setError(mapGeolocationError(err));
    } finally {
      setIsLoading(false);
    }
  }, [ensureLocationPermission, resolveCurrentPosition]);

  useEffect(() => {
    void fetchLocation();
  }, [fetchLocation]);

  return { location, error, isLoading, refresh: fetchLocation };
}
