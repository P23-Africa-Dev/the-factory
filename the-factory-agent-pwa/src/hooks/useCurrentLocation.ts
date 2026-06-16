'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function useCurrentLocation(): UseCurrentLocationReturn {
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

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setIsLoading(false);
      },
      (err) => {
        let message = 'Failed to get location';
        if (err.code === err.PERMISSION_DENIED) {
          message = 'Location permission denied';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = 'Location position unavailable';
        } else if (err.code === err.TIMEOUT) {
          message = 'Location request timed out';
        }
        setError(message);
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  return { location, error, isLoading, refresh: fetchLocation };
}
