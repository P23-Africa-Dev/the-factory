import { useTrackingStore } from '@/store/tracking';
import type { TaskRoute } from './types';

const MAX_LIVE_TRAIL_GAP_M = 400;

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shouldKeepLivePolyline(
  polyline: [number, number][] | undefined,
  anchor: [number, number] | undefined,
): boolean {
  if (!polyline?.length || !anchor) return false;
  const last = polyline[polyline.length - 1];
  return haversineMeters(last[0], last[1], anchor[0], anchor[1]) <= MAX_LIVE_TRAIL_GAP_M;
}

/** Hydrate Zustand live task state from GET /agent/tasks/{id}/route */
export function hydrateLiveTaskFromRoute(taskId: number, route: TaskRoute): void {
  const lastPoint = route.points.length > 0 ? route.points[route.points.length - 1] : null;
  const arrived = route.arrival != null || route.status === 'arrived';
  const prev = useTrackingStore.getState().liveTaskMap[taskId];
  const lastPosition = lastPoint
    ? ([lastPoint.longitude, lastPoint.latitude] as [number, number])
    : prev?.lastPosition;

  let polyline: [number, number][] = [];
  if (lastPosition && shouldKeepLivePolyline(prev?.polyline, lastPosition)) {
    const trail = prev!.polyline!;
    const last = trail[trail.length - 1];
    polyline =
      last[0] === lastPosition[0] && last[1] === lastPosition[1]
        ? trail
        : [...trail, lastPosition];
  } else if (lastPosition) {
    polyline = [lastPosition];
  }

  useTrackingStore.getState().upsertTask(taskId, {
    polyline,
    lastPosition,
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
