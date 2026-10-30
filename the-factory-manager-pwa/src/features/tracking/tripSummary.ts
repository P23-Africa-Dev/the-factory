import type { TaskRoute } from './types';

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${Math.max(1, totalMin)} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export type TripSummary = {
  distanceLabel: string;
  durationLabel: string;
  pointsCount: number;
};

/** Build a brief trip summary from the route API response. */
export function summarizeTaskRoute(route: TaskRoute): TripSummary {
  const distanceMeters = route.summary?.total_distance_meters ?? 0;
  const startAt = route.start?.recorded_at ? new Date(route.start.recorded_at).getTime() : null;
  const endAt = route.end?.recorded_at
    ? new Date(route.end.recorded_at).getTime()
    : route.arrival?.recorded_at
      ? new Date(route.arrival.recorded_at).getTime()
      : Date.now();
  const durationMs =
    startAt != null && Number.isFinite(startAt) ? Math.max(0, endAt - startAt) : 0;

  return {
    distanceLabel: formatDistance(distanceMeters),
    durationLabel: formatDurationMs(durationMs),
    pointsCount: route.summary?.points_count ?? route.points?.length ?? 0,
  };
}

export function formatTripSummaryToast(summary: TripSummary, reason: 'paused' | 'completed'): string {
  const verb = reason === 'completed' ? 'Trip complete' : 'Trip paused';
  return `${verb} · ${summary.distanceLabel} · ${summary.durationLabel}`;
}
