/**
 * Pure helpers for the management live map's field-trip layer (people on a
 * "Start Field Trip" session in the mobile app). Kept framework-free so the
 * store, panels and map layers share one definition and it can be unit tested.
 */

export type LngLatPair = [number, number];

/** No location for this long → the person is shown as "Signal lost". */
export const FIELD_TRIP_SIGNAL_LOST_MS = 10 * 60_000;

/** An ended trip stays on the map (greyed, "Trip ended") for this long. */
export const FIELD_TRIP_ENDED_LINGER_MS = 30_000;

export type FieldTripLiveState = "ended" | "signal_lost" | "moving" | "stationary";

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two [lng, lat] points. */
export function haversineMeters(a: LngLatPair, b: LngLatPair): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length in metres of a [lng, lat] polyline. */
export function polylineLengthMeters(points: readonly LngLatPair[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

export function parseTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function resolveFieldTripLiveState(
  agent: {
    endedAt?: string | null;
    lastRecordedAt?: string | null;
    lastMovementState?: string | null;
    startedAt?: string | null;
  },
  nowMs: number,
): FieldTripLiveState {
  if (agent.endedAt) return "ended";
  // A trip that just started has no point yet: judge freshness by its start.
  const last = parseTimeMs(agent.lastRecordedAt) ?? parseTimeMs(agent.startedAt);
  if (last == null || nowMs - last > FIELD_TRIP_SIGNAL_LOST_MS) return "signal_lost";
  const moving = agent.lastMovementState != null && agent.lastMovementState !== "stopped"
    && agent.lastMovementState !== "stationary";
  return moving ? "moving" : "stationary";
}

export const FIELD_TRIP_STATE_LABEL: Record<FieldTripLiveState, string> = {
  ended: "Trip ended",
  signal_lost: "Signal lost",
  moving: "Moving",
  stationary: "Stationary",
};

/** "2h 05m" / "14m" / "<1m" for an elapsed span. */
export function formatElapsed(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "--";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "<1m";
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatDistanceMeters(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "--";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Appends a point to a live trail, skipping exact duplicates and keeping at
 * most `max` points (the oldest are dropped — the start pin is stored
 * separately so it never drifts).
 */
export function appendTrailPoint(
  prev: LngLatPair[],
  point: LngLatPair,
  max: number,
): LngLatPair[] {
  const last = prev[prev.length - 1];
  if (last && last[0] === point[0] && last[1] === point[1]) return prev;
  const next = [...prev, point];
  return next.length > max ? next.slice(-max) : next;
}

/**
 * Merges a REST snapshot trail with the trail already built from realtime
 * points. When the local copy is newer, its points after the snapshot's last
 * point are kept so a refetch never rewinds the line.
 */
export function mergeTrailTail(
  snapshot: LngLatPair[],
  local: LngLatPair[],
  max: number,
): LngLatPair[] {
  if (local.length === 0) return snapshot;
  if (snapshot.length === 0) return local.slice(-max);
  const tail = snapshot[snapshot.length - 1];
  let index = -1;
  for (let i = local.length - 1; i >= 0; i -= 1) {
    if (local[i][0] === tail[0] && local[i][1] === tail[1]) {
      index = i;
      break;
    }
  }
  const extra = index >= 0 ? local.slice(index + 1) : [local[local.length - 1]];
  let merged = snapshot;
  for (const point of extra) merged = appendTrailPoint(merged, point, max);
  return merged;
}
