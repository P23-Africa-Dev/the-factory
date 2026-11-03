export const MAX_MARKER_SPEED_MPS = 40;
export const MIN_SEGMENT_MS = 250;
export const MAX_SEGMENT_MS = 8_000;
export const SNAP_DISTANCE_M = 1.5;
export const TELEPORT_GAP_M = 500;

export type LngLat = [number, number];

export type MarkerMotionState = {
  from: LngLat;
  to: LngLat;
  startMs: number;
  durationMs: number;
  lastFixMs: number;
};

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createMarkerMotion(position: LngLat, nowMs = 0): MarkerMotionState {
  return { from: position, to: position, startMs: nowMs, durationMs: 0, lastFixMs: nowMs };
}

export function sampleMarkerPosition(state: MarkerMotionState, nowMs: number): LngLat {
  if (state.durationMs <= 0) return state.to;
  const t = Math.min(1, Math.max(0, (nowMs - state.startMs) / state.durationMs));
  return [
    state.from[0] + (state.to[0] - state.from[0]) * t,
    state.from[1] + (state.to[1] - state.from[1]) * t,
  ];
}

export function isMarkerMotionComplete(state: MarkerMotionState, nowMs: number): boolean {
  return state.durationMs <= 0 || nowMs - state.startMs >= state.durationMs;
}

export function enqueueMarkerFix(
  state: MarkerMotionState,
  target: LngLat,
  nowMs: number,
  recordedAtMs?: number,
): MarkerMotionState {
  const display = sampleMarkerPosition(state, nowMs);
  const dist = haversineMeters(display[0], display[1], target[0], target[1]);
  const fixMs = recordedAtMs ?? nowMs;

  if (dist < SNAP_DISTANCE_M) {
    return { from: target, to: target, startMs: nowMs, durationMs: 0, lastFixMs: fixMs };
  }
  if (dist > TELEPORT_GAP_M) {
    return { from: target, to: target, startMs: nowMs, durationMs: 0, lastFixMs: fixMs };
  }

  const dtRecorded =
    recordedAtMs != null && state.lastFixMs > 0 ? Math.abs(recordedAtMs - state.lastFixMs) : 0;
  const durationFromSpeed = (dist / MAX_MARKER_SPEED_MPS) * 1000;
  const durationMs = Math.min(
    MAX_SEGMENT_MS,
    Math.max(MIN_SEGMENT_MS, dtRecorded > 80 ? dtRecorded : durationFromSpeed),
  );

  return { from: display, to: target, startMs: nowMs, durationMs, lastFixMs: fixMs };
}
