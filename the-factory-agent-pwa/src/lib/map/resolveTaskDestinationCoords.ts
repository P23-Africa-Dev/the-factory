import { formatMapCoordinate, isValidMapCoordinate } from './googleMapsNavigation';

export type LatLng = { latitude: number; longitude: number };

function pickValid(point?: LatLng | null): LatLng | null {
  if (!point) return null;
  if (!isValidMapCoordinate(point.latitude, point.longitude)) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

/**
 * Resolve the task destination from the most authoritative GPS source available.
 * Priority: live tracking session → server route → map selection → task record.
 */
export function resolveTaskDestinationCoords(
  sources:
    | {
        liveDestination?: LatLng | null;
        routeDestination?: LatLng | null;
        selectedDestination?: LatLng | null;
        taskRecord?: LatLng | null;
      }
    | LatLng
    | { latitude?: number | null; longitude?: number | null; [key: string]: unknown }
    | null
    | undefined,
): LatLng | null {
  if (!sources) return null;
  if (
    'latitude' in sources &&
    'longitude' in sources &&
    typeof sources.latitude === 'number' &&
    typeof sources.longitude === 'number'
  ) {
    return pickValid({ latitude: sources.latitude, longitude: sources.longitude });
  }
  const s = sources as {
    liveDestination?: LatLng | null;
    routeDestination?: LatLng | null;
    selectedDestination?: LatLng | null;
    taskRecord?: LatLng | null;
  };
  return (
    pickValid(s.liveDestination) ??
    pickValid(s.routeDestination) ??
    pickValid(s.selectedDestination) ??
    pickValid(s.taskRecord) ??
    null
  );
}

export function formatCoordsLabel(point: LatLng): string {
  return `${formatMapCoordinate(point.latitude)}, ${formatMapCoordinate(point.longitude)}`;
}
