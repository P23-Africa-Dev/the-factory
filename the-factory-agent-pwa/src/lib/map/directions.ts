const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const ROUTE_CACHE = new Map<string, { coords: [number, number][]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;
const INFLIGHT = new Map<string, Promise<[number, number][] | null>>();

function cacheKey(origin: [number, number], destination: [number, number]): string {
  const oLng = origin[0].toFixed(5);
  const oLat = origin[1].toFixed(5);
  const dLng = destination[0].toFixed(5);
  const dLat = destination[1].toFixed(5);
  return `${oLng},${oLat}→${dLng},${dLat}`;
}

export async function fetchDirectionsRoute(
  origin: [number, number],
  destination: [number, number],
  accessToken: string,
): Promise<[number, number][] | null> {
  const key = cacheKey(origin, destination);

  const cached = ROUTE_CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.coords;
  }

  const inflight = INFLIGHT.get(key);
  if (inflight) return inflight;

  const promise = (async (): Promise<[number, number][] | null> => {
    try {
      const url = `${DIRECTIONS_BASE}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&overview=full&access_token=${accessToken}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = (await res.json()) as {
        routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
      };
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (!coords?.length) return null;

      ROUTE_CACHE.set(key, { coords, fetchedAt: Date.now() });
      return coords;
    } catch {
      return null;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}
