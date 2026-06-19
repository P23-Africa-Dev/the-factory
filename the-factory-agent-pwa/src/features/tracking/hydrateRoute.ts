import { useTrackingStore } from '@/store/tracking';
import type { TaskRoute } from './types';

/** Hydrate Zustand live task state from GET /agent/tasks/{id}/route */
export function hydrateLiveTaskFromRoute(taskId: number, route: TaskRoute): void {
  const lastPoint = route.points.length > 0 ? route.points[route.points.length - 1] : null;
  const arrived = route.arrival != null || route.status === 'arrived';

  useTrackingStore.getState().upsertTask(taskId, {
    polyline: route.polyline,
    lastPosition: lastPoint ? [lastPoint.longitude, lastPoint.latitude] : undefined,
    destination: {
      latitude: route.destination.latitude,
      longitude: route.destination.longitude,
      radiusMeters: route.destination.radius_meters,
    },
    status: arrived ? 'arrived' : 'tracking',
  });

  if (arrived && route.arrival?.recorded_at) {
    useTrackingStore.getState().markArrived(taskId, route.arrival.recorded_at);
  }
}
