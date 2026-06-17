'use client';

import { useEffect, useRef } from 'react';
import type { LocationObject } from './useGeolocation';

interface ProximityWatchOptions {
  currentPosition: LocationObject | null;
  destination: { latitude: number; longitude: number; radiusMeters: number } | null;
  onWithinRange: () => void;
  onOutsideRange?: () => void;
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const useProximityWatch = ({
  currentPosition,
  destination,
  onWithinRange,
  onOutsideRange,
}: ProximityWatchOptions): void => {
  const withinRangeRef = useRef(false);

  useEffect(() => {
    if (!currentPosition || !destination) return;

    const distance = haversineDistance(
      currentPosition.coords.latitude,
      currentPosition.coords.longitude,
      destination.latitude,
      destination.longitude,
    );

    const isWithin = distance <= destination.radiusMeters;

    if (isWithin && !withinRangeRef.current) {
      withinRangeRef.current = true;
      onWithinRange();
    } else if (!isWithin && withinRangeRef.current) {
      withinRangeRef.current = false;
      onOutsideRange?.();
    }
  }, [currentPosition, destination, onWithinRange, onOutsideRange]);
};

export { haversineDistance };
