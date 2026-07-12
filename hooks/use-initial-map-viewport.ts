import { useEffect, useState } from 'react';
import {
  getCountryFallbackViewport,
  resolvePrivacySafeViewport,
  type ResolvedMapViewport,
} from '@/lib/map/default-viewport';
import type { TaskMapFocus } from '@/lib/tasks/map-navigation';

const TASK_FOCUS_ZOOM = 15;

function taskFocusViewport(taskFocus: TaskMapFocus): ResolvedMapViewport {
  return {
    center: [taskFocus.lng, taskFocus.lat],
    zoom: TASK_FOCUS_ZOOM,
    granularity: 'gps',
    countryCode: null,
  };
}

export type InitialMapViewportState = {
  viewport: ResolvedMapViewport | null;
  /** True while waiting for GPS/IP before the map is created. */
  isResolving: boolean;
  /** True when the viewport came from the user's GPS fix. */
  isUserLocation: boolean;
};

export function useInitialMapViewport(options: {
  preferUserLocation: boolean;
  taskFocus?: TaskMapFocus | null;
}): InitialMapViewportState {
  const { preferUserLocation, taskFocus } = options;
  const [viewport, setViewport] = useState<ResolvedMapViewport | null>(null);
  const [isUserLocation, setIsUserLocation] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (taskFocus) {
      setViewport(taskFocusViewport(taskFocus));
      setIsUserLocation(false);
      return;
    }

    if (!preferUserLocation) {
      setViewport(getCountryFallbackViewport());
      setIsUserLocation(false);
      return;
    }

    setViewport(null);
    setIsUserLocation(false);

    resolvePrivacySafeViewport().then((resolved) => {
      if (cancelled) {
        return;
      }

      setViewport(resolved);
      setIsUserLocation(resolved.granularity === 'gps');
    });

    return () => {
      cancelled = true;
    };
  }, [preferUserLocation, taskFocus?.taskId, taskFocus?.lat, taskFocus?.lng]);

  const isResolving = preferUserLocation && !taskFocus && viewport === null;

  return { viewport, isResolving, isUserLocation };
}
