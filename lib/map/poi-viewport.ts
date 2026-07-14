import { isBboxTooLarge, type PoiResult } from "@/lib/map/overpass-search";
import { fetchPlacesInArea } from "@/lib/map/poi-search";
import type { LocationContext } from "@/lib/map/location-search";

export const POI_MIN_ZOOM = 12;
export const POI_MAX_RADIUS_M = 3000;

export type ViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ViewportSearchCircle = {
  lat: number;
  lng: number;
  radiusM: number;
  bbox: [number, number, number, number];
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

export function boundsToArray(bounds: ViewportBounds): [number, number, number, number] {
  return [bounds.west, bounds.south, bounds.east, bounds.north];
}

export function viewportToSearchCircle(bounds: ViewportBounds): ViewportSearchCircle {
  const lat = (bounds.north + bounds.south) / 2;
  const lng = (bounds.east + bounds.west) / 2;
  const bbox = boundsToArray(bounds);

  const cornerDist = haversineM(bounds.south, bounds.west, bounds.north, bounds.east);
  const radiusM = Math.min(Math.max(cornerDist / 2, 500), POI_MAX_RADIUS_M);

  return { lat, lng, radiusM, bbox };
}

export function canFetchPoisForViewport(zoom: number, bounds: ViewportBounds): boolean {
  if (zoom < POI_MIN_ZOOM) return false;
  return !isBboxTooLarge(boundsToArray(bounds));
}

async function fetchGoogleNearbyForViewport(
  circle: ViewportSearchCircle,
  signal?: AbortSignal,
): Promise<PoiResult[]> {
  try {
    const response = await fetch("/api/places/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: circle.lat,
        lng: circle.lng,
        radiusM: circle.radiusM,
        bbox: circle.bbox,
      }),
      signal,
    });

    if (response.status === 503 || !response.ok) return [];

    const payload = (await response.json()) as {
      enabled?: boolean;
      places?: PoiResult[];
    };

    if (payload.enabled === false) return [];
    return payload.places ?? [];
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return [];
  }
}

export async function fetchPlacesInViewport(
  bounds: ViewportBounds,
  zoom: number,
  signal?: AbortSignal,
): Promise<PoiResult[]> {
  if (!canFetchPoisForViewport(zoom, bounds)) return [];

  const circle = viewportToSearchCircle(bounds);
  const googleResults = await fetchGoogleNearbyForViewport(circle, signal);
  if (googleResults.length > 0) return googleResults;

  const ctx: LocationContext = {
    name: "Map viewport",
    center: [circle.lng, circle.lat],
    bbox: circle.bbox,
    radiusKm: circle.radiusM / 1000,
  };

  return fetchPlacesInArea(ctx);
}
