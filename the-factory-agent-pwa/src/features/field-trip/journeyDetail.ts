import type { Completeness, ReportStop, TripAiSummary } from './report/types';

/** Journey / trip detail as served by GET …/field-activity/journeys/{id} (agent + admin). */
export interface JourneyStopDto extends Partial<Omit<ReportStop, 'id' | 'latitude' | 'longitude' | 'classification'>> {
  id: number;
  latitude: number | string;
  longitude: number | string;
  address: string | null;
  arrived_at: string | null;
  departed_at: string | null;
  duration_seconds: number;
  classification: string | null;
}

export interface JourneyRouteDto {
  type: 'LineString';
  /** [longitude, latitude] pairs, oldest first. */
  coordinates: [number, number][];
  /** ISO times, one per coordinate (may be missing on old journeys). */
  timestamps?: (string | null)[];
  point_count: number;
  bounds?: { min_lat: number; min_lng: number; max_lat: number; max_lng: number } | null;
}

export interface JourneyDetailDto {
  journey: {
    id: number;
    date: string | null;
    distance_meters: number;
    source?: 'field_trip' | 'attendance';
    started_at?: string | null;
    ended_at?: string | null;
    end_reason?: string | null;
    status?: string;
    /** Field trips: the trip report. */
    report_status?: 'none' | 'due' | 'submitted' | null;
    report_submitted_at?: string | null;
    ai_summary?: TripAiSummary | null;
    records?: Completeness | null;
  };
  agent?: { id: number; name: string | null };
  stats: Record<string, unknown>;
  stops?: JourneyStopDto[];
  timeline: Array<{
    id: string;
    type: string;
    label: string;
    occurred_at: string | null;
    duration_seconds?: number;
    color: string;
  }>;
  route?: JourneyRouteDto | null;
  navigation: { previous_id: number | null; next_id: number | null };
}

function time(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "Field trip · 9:05 AM – 11:40 AM" (or "… – now" while running); day journeys keep their date. */
export function journeyTitle(j: JourneyDetailDto['journey'] | undefined): string {
  if (!j) return 'Journey';
  if (j.source !== 'field_trip') return j.date ?? 'Journey';
  const start = time(j.started_at);
  const end = j.ended_at ? time(j.ended_at) : 'now';
  return start ? `Field trip · ${start} – ${end}` : 'Field trip';
}

export function journeySubtitle(j: JourneyDetailDto['journey'] | undefined): string | null {
  if (!j) return null;
  const parts: string[] = [];
  if (j.source === 'field_trip' && j.date) parts.push(j.date);
  if (j.end_reason === 'auto_no_signal') parts.push('Ended automatically (no location)');
  else if (j.end_reason === 'feature_disabled') parts.push('Ended when Field Activity was turned off');
  else if (j.status === 'active') parts.push('In progress');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Index into the route for a playback position 0…1 (by time when available, else by point). */
export function playbackIndex(route: JourneyRouteDto, progress: number): number {
  const n = route.coordinates.length;
  if (n === 0) return -1;
  const p = Math.min(1, Math.max(0, progress));
  const ts = route.timestamps?.map((t) => (t ? Date.parse(t) : NaN)) ?? [];
  const first = ts[0];
  const last = ts[n - 1];
  if (ts.length === n && Number.isFinite(first) && Number.isFinite(last) && last > first) {
    const target = first + (last - first) * p;
    let i = 0;
    while (i < n - 1 && (ts[i + 1] ?? Infinity) <= target) i++;
    return i;
  }
  return Math.round((n - 1) * p);
}

export function coordinatesOf(stop: JourneyStopDto): [number, number] | null {
  const lat = Number(stop.latitude);
  const lng = Number(stop.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
}
