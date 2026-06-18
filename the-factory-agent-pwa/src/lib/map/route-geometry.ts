const EPSILON = 1e-6;

export function isFiniteCoordinate(point: [number, number] | null | undefined): point is [number, number] {
  if (!point) return false;
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
  if (point[0] === 0 && point[1] === 0) return false;
  return true;
}

export function areSamePoint(a: [number, number], b: [number, number], epsilon = EPSILON): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

export function sanitizePolyline(points: [number, number][]): [number, number][] {
  const sanitized: [number, number][] = [];

  for (const point of points) {
    if (!isFiniteCoordinate(point)) continue;
    const previous = sanitized[sanitized.length - 1];
    if (previous && areSamePoint(previous, point)) continue;
    sanitized.push(point);
  }

  return sanitized;
}

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distancePointToSegmentMeters(
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number],
): number {
  const [px, py] = point;
  const [x1, y1] = segStart;
  const [x2, y2] = segEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return haversineMeters(px, py, x1, y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projLng = x1 + t * dx;
  const projLat = y1 + t * dy;
  return haversineMeters(px, py, projLng, projLat);
}

/** Find closest vertex index on route to agent position. */
function findClosestRouteIndex(route: [number, number][], agent: [number, number]): number {
  if (route.length <= 1) return 0;

  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < route.length - 1; i++) {
    const dist = distancePointToSegmentMeters(agent, route[i], route[i + 1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
}

/** Return the portion of planned route still ahead of the agent. */
export function sliceRemainingRoute(
  planned: [number, number][],
  agent: [number, number] | null,
): [number, number][] {
  const route = sanitizePolyline(planned);
  if (route.length < 2) return route;
  if (!isFiniteCoordinate(agent)) return route;

  const idx = findClosestRouteIndex(route, agent);
  const remaining = route.slice(idx);
  if (remaining.length === 0) return [agent];
  if (!areSamePoint(remaining[0], agent)) {
    return [agent, ...remaining];
  }
  return remaining;
}

/** Sanitized traveled GPS trail for grey "behind" line. */
export function buildTraveledSegment(trail: [number, number][]): [number, number][] {
  return sanitizePolyline(trail);
}

/** Forward azimuth in degrees (0 = north, clockwise) — Mapbox bearing convention. */
export function bearingDegrees(from: [number, number], to: [number, number]): number {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

const MIN_NAV_SPEED_MPS = 0.5;

/** Bearing for navigation camera: device heading when moving, else route/destination. */
export function resolveNavigationBearing(
  agent: [number, number] | null,
  remainingRoute: [number, number][],
  dest: [number, number] | null,
  gpsHeading: number | null | undefined,
  gpsSpeed: number | null | undefined,
): number | null {
  if (
    gpsHeading != null &&
    Number.isFinite(gpsHeading) &&
    gpsSpeed != null &&
    Number.isFinite(gpsSpeed) &&
    gpsSpeed > MIN_NAV_SPEED_MPS
  ) {
    return gpsHeading;
  }

  if (isFiniteCoordinate(agent)) {
    const route = sanitizePolyline(remainingRoute);
    if (route.length >= 2) {
      const next = route.find((pt) => !areSamePoint(pt, agent)) ?? route[1];
      if (next && !areSamePoint(agent, next)) {
        return bearingDegrees(agent, next);
      }
    }
    if (isFiniteCoordinate(dest) && !areSamePoint(agent, dest)) {
      return bearingDegrees(agent, dest);
    }
  }

  return null;
}

/** Smooth map bearing toward target, reducing GPS jitter. */
export function smoothBearingDegrees(
  current: number,
  target: number,
  factor = 0.25,
  minDelta = 8,
): number {
  let delta = target - current;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  if (Math.abs(delta) < minDelta) return current;
  return (current + delta * factor + 360) % 360;
}
