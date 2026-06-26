import { isValidMapCoordinate } from './googleMapsNavigation';

type LatLng = { latitude: number; longitude: number };

function pickValid(point?: LatLng | null): LatLng | null {
  if (!point) return null;
  if (!isValidMapCoordinate(point.latitude, point.longitude)) return null;
  return { latitude: point.latitude, longitude: point.longitude };
}

export function resolveTaskDestinationCoords(sources: {
  liveDestination?: LatLng | null;
  routeDestination?: LatLng | null;
  selectedDestination?: LatLng | null;
  taskRecord?: LatLng | null;
}): LatLng | null {
  return (
    pickValid(sources.liveDestination) ??
    pickValid(sources.routeDestination) ??
    pickValid(sources.selectedDestination) ??
    pickValid(sources.taskRecord) ??
    null
  );
}
