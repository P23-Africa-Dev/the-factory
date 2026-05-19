/**
 * Mapbox Directions API utility for fetching road-following routes
 * between two coordinates. Used by the Map view to display the
 * planned path an agent will follow to reach their destination.
 */

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const ROUTE_CACHE = new Map<string, { coords: [number, number][]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const INFLIGHT = new Map<string, Promise<[number, number][] | null>>();

function cacheKey(origin: [number, number], destination: [number, number]): string {
  // Round to 5 decimal places (~1m precision) to avoid cache misses from tiny GPS jitter
  const oLng = origin[0].toFixed(5);
  const oLat = origin[1].toFixed(5);
  const dLng = destination[0].toFixed(5);
  const dLat = destination[1].toFixed(5);
  return `${oLng},${oLat}→${dLng},${dLat}`;
}

/**
 * Fetch a road-following route between two points using Mapbox Directions API.
 * Returns an array of [lng, lat] coordinates representing the route geometry,
 * or null if the request fails or no route is found.
 *
 * Results are cached for 5 minutes to avoid excessive API calls.
 */
export async function fetchDirectionsRoute(
  origin: [number, number],
  destination: [number, number],
  accessToken: string,
): Promise<[number, number][] | null> {
  const key = cacheKey(origin, destination);

  // Return from cache if still fresh
  const cached = ROUTE_CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.coords;
  }

  // Deduplicate inflight requests for the same route
  const inflight = INFLIGHT.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = (async (): Promise<[number, number][] | null> => {
    try {
      const url = `${DIRECTIONS_BASE}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&overview=full&access_token=${accessToken}`;
      const res = await fetch(url);

      if (!res.ok) {
        console.warn(`[directions] HTTP ${res.status} for route ${key}`);
        return null;
      }

      const data = await res.json();
      const route = data?.routes?.[0];

      if (!route?.geometry?.coordinates?.length) {
        return null;
      }

      const coords: [number, number][] = route.geometry.coordinates;
      ROUTE_CACHE.set(key, { coords, fetchedAt: Date.now() });
      return coords;
    } catch (err) {
      console.warn('[directions] fetch failed:', err);
      return null;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}

/** Manually clear the directions route cache (e.g. on unmount). */
export function clearDirectionsCache(): void {
  ROUTE_CACHE.clear();
  INFLIGHT.clear();
}
