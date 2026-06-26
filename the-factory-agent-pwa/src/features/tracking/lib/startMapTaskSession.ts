import { flattenApiError, isTrackingAlreadyActiveError } from '@/lib/api/errors';
import type { LocationObject } from '../hooks/useGeolocation';
import { trackingApi } from '../api';
import { hydrateLiveTaskFromRoute } from '../hydrateRoute';
import type { StartTaskPayload } from '../types';

type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export type StartMapTaskSessionResult =
  | { ok: true; startPoint: [number, number]; kind: 'fresh' | 'resume' | 'reconnect' }
  | { ok: false; reason: 'permission_denied' | 'location_error' | 'api_error'; error?: unknown };

export type StartMapTaskSessionParams = {
  taskId: number;
  companyId: number;
  isResume: boolean;
  lastPosition: LocationObject | null;
  customOrigin: { latitude: number; longitude: number } | null;
  effectiveOriginLng: number | null;
  effectiveOriginLat: number | null;
  ensureLocationPermission: () => Promise<PermissionStatus>;
  resolveCurrentPosition: () => Promise<LocationObject>;
  startTaskAsync: (args: {
    taskId: number;
    payload: StartTaskPayload;
  }) => Promise<{ arrived: boolean; tracking: { id: number } }>;
  beginSession: (opts: {
    arrived?: boolean;
    trackingSessionId?: number;
    startPoint: [number, number];
  }) => void;
  markTrackingLive: () => void;
  stopTracking: () => Promise<void>;
  onRollback: () => void;
  onRouteHydrated?: (arrived: boolean) => void;
};

async function resolveStartPoint(params: StartMapTaskSessionParams): Promise<[number, number]> {
  const {
    lastPosition,
    customOrigin,
    effectiveOriginLng,
    effectiveOriginLat,
    resolveCurrentPosition,
  } = params;

  if (lastPosition) {
    return [lastPosition.coords.longitude, lastPosition.coords.latitude];
  }
  if (customOrigin) {
    return [customOrigin.longitude, customOrigin.latitude];
  }
  if (effectiveOriginLng != null && effectiveOriginLat != null) {
    return [effectiveOriginLng, effectiveOriginLat];
  }
  const pos = await resolveCurrentPosition();
  return [pos.coords.longitude, pos.coords.latitude];
}

export async function startMapTaskSession(
  params: StartMapTaskSessionParams,
): Promise<StartMapTaskSessionResult> {
  const {
    taskId,
    companyId,
    isResume,
    lastPosition,
    ensureLocationPermission,
    startTaskAsync,
    beginSession,
    markTrackingLive,
    stopTracking,
    onRollback,
    onRouteHydrated,
  } = params;

  const permStatus = await ensureLocationPermission();
  if (permStatus === 'denied') {
    return { ok: false, reason: 'permission_denied' };
  }

  let startPoint: [number, number];
  try {
    startPoint = await resolveStartPoint(params);
  } catch {
    return { ok: false, reason: 'location_error' };
  }

  if (isResume) {
    beginSession({ arrived: false, startPoint });
    void trackingApi
      .getTaskRoute(taskId, companyId)
      .then((route) => {
        hydrateLiveTaskFromRoute(taskId, route);
        if (route.arrival) onRouteHydrated?.(true);
        markTrackingLive();
      })
      .catch(() => {
        markTrackingLive();
      });
    return { ok: true, startPoint, kind: 'resume' };
  }

  try {
    const data = await startTaskAsync({
      taskId,
      payload: {
        companyId,
        latitude: startPoint[1],
        longitude: startPoint[0],
        accuracyMeters: lastPosition?.coords.accuracy ?? 0,
        recordedAt: new Date(lastPosition?.timestamp ?? Date.now()).toISOString(),
      },
    });
    beginSession({
      arrived: data.arrived,
      trackingSessionId: data.tracking.id,
      startPoint,
    });
    markTrackingLive();
    return { ok: true, startPoint, kind: 'fresh' };
  } catch (err: unknown) {
    if (isTrackingAlreadyActiveError(err)) {
      try {
        const route = await trackingApi.getTaskRoute(taskId, companyId);
        beginSession({
          arrived: route.arrival != null,
          startPoint,
        });
        hydrateLiveTaskFromRoute(taskId, route);
        if (route.arrival) onRouteHydrated?.(true);
        markTrackingLive();
        return { ok: true, startPoint, kind: 'reconnect' };
      } catch {
        // fall through
      }
    }

    await stopTracking();
    onRollback();
    return { ok: false, reason: 'api_error', error: err };
  }
}

export function getApiErrorMessage(error: unknown): string {
  return flattenApiError(error) || 'Please try again.';
}
