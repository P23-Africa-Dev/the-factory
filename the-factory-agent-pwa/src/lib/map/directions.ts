export type MapboxProfile = 'driving-traffic' | 'driving' | 'cycling' | 'walking';

export type DirectionsResult = {
  coords: [number, number][];
  duration: number; // seconds (from Mapbox API)
  distance: number; // meters  (from Mapbox API)
};

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox';
const ROUTE_CACHE = new Map<string, { result: DirectionsResult; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;
const INFLIGHT = new Map<string, Promise<DirectionsResult | null>>();

function cacheKey(
  origin: [number, number],
  destination: [number, number],
  profile: MapboxProfile,
): string {
  const oLng = origin[0].toFixed(5);
  const oLat = origin[1].toFixed(5);
  const dLng = destination[0].toFixed(5);
  const dLat = destination[1].toFixed(5);
  return `${profile}:${oLng},${oLat}→${dLng},${dLat}`;
}

/**
 * Fetch a road-following route using the Mapbox Directions API.
 * Returns geometry, accurate API duration (seconds), and distance (meters).
 * Defaults to `driving-traffic` for real-time congestion-aware car routing.
 */
export async function fetchDirectionsRoute(
  origin: [number, number],
  destination: [number, number],
  accessToken: string,
  profile: MapboxProfile = 'driving-traffic',
): Promise<DirectionsResult | null> {
  const key = cacheKey(origin, destination, profile);

  const cached = ROUTE_CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const inflight = INFLIGHT.get(key);
  if (inflight) return inflight;

  const promise = (async (): Promise<DirectionsResult | null> => {
    try {
      const url =
        `${DIRECTIONS_BASE}/${profile}/` +
        `${origin[0]},${origin[1]};${destination[0]},${destination[1]}` +
        `?geometries=geojson&overview=full&access_token=${accessToken}`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data = (await res.json()) as {
        routes?: Array<{
          duration?: number;
          distance?: number;
          geometry?: { coordinates?: [number, number][] };
        }>;
      };

      const route = data?.routes?.[0];
      if (!route?.geometry?.coordinates?.length) return null;

      const result: DirectionsResult = {
        coords: route.geometry.coordinates,
        duration: route.duration ?? 0,
        distance: route.distance ?? 0,
      };

      ROUTE_CACHE.set(key, { result, fetchedAt: Date.now() });
      return result;
    } catch {
      return null;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}
