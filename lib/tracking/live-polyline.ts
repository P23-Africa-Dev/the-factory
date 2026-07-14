/** Max distance (m) between trail origin and current position to treat as same live session. */
export const MAX_LIVE_TRAIL_ORIGIN_DRIFT_M = 200;

export function haversineMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
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

export function shouldKeepLivePolyline(
  polyline: [number, number][] | undefined,
  anchor: [number, number] | undefined,
): boolean {
  if (!polyline?.length || !anchor) return false;
  const [lng, lat] = polyline[0];
  return haversineMeters(lng, lat, anchor[0], anchor[1]) <= MAX_LIVE_TRAIL_ORIGIN_DRIFT_M;
}

/** Live trail for map display: never resurrect a stale session breadcrumb on hydrate. */
export function resolveLivePolylineForHydrate(
  prevPolyline: [number, number][] | undefined,
  anchor: [number, number] | undefined,
): [number, number][] {
  if (shouldKeepLivePolyline(prevPolyline, anchor)) {
    return prevPolyline!;
  }
  return anchor ? [anchor] : [];
}
