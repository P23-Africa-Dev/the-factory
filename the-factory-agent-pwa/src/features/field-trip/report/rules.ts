import type { ReportStop, StopActivity, StopOutcome, StopRecordInput } from './types';

/** Visits that need an outcome (how did it go?). */
export function needsOutcome(activity: StopActivity | null | undefined): boolean {
  return activity === 'customer_visit' || activity === 'lead_visit';
}

/** Visits that are linked to a CRM customer / lead / company location. */
export function isVisit(activity: StopActivity | null | undefined): boolean {
  return activity === 'customer_visit' || activity === 'lead_visit' || activity === 'org_visit';
}

export interface FormState {
  activity: StopActivity | null;
  leadId: number | null;
  leadName: string | null;
  locationId: number | null;
  outcome: StopOutcome | null;
  followUpAt: string | null;
  notes: string;
  place: { latitude: number; longitude: number; address: string | null } | null;
}

/** First problem that stops the form from being saved, or null (same rules as the server). */
export function validateStopForm(f: FormState): string | null {
  if (!f.activity) return 'Choose what you did here.';
  if (f.activity === 'customer_visit' && !f.leadId) return 'Choose the customer you visited.';
  if (needsOutcome(f.activity) && !f.outcome) return 'Choose how the visit went.';
  if (f.notes.length > 5000) return 'Notes can be up to 5,000 characters.';
  return null;
}

export function formFromStop(stop: ReportStop): FormState {
  return {
    activity: stop.classification !== 'pending' ? stop.classification : null,
    leadId: stop.lead_id,
    leadName: stop.lead_name,
    locationId: stop.company_location_id,
    outcome: stop.outcome,
    followUpAt: stop.follow_up_at,
    notes: stop.notes ?? '',
    place: null,
  };
}

export function toRecordInput(f: FormState, via: 'live' | 'review'): StopRecordInput {
  if (!f.activity) throw new Error('activity required');
  const visit = isVisit(f.activity);
  return {
    activity: f.activity,
    lead_id: visit ? f.leadId : null,
    company_location_id: f.activity === 'org_visit' ? f.locationId : null,
    outcome: visit ? f.outcome : null,
    follow_up_at: f.outcome === 'follow_up' ? f.followUpAt : null,
    notes: f.notes.trim() || null,
    via,
    location: f.place
      ? { action: 'correct', latitude: f.place.latitude, longitude: f.place.longitude, address: f.place.address }
      : { action: 'confirm' },
  };
}

/** "11:58 – 12:16 · 18 min" */
export function stopWindow(stop: Pick<ReportStop, 'arrived_at' | 'departed_at' | 'duration_seconds'>): string {
  const t = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '…';
  const minutes = Math.max(1, Math.round((stop.duration_seconds || 0) / 60));
  return `${t(stop.arrived_at)} – ${stop.departed_at ? t(stop.departed_at) : 'now'} · ${minutes} min`;
}

export function stopTitle(stop: ReportStop, index: number): string {
  return stop.lead_name || stop.location_name || stop.address || `Stop ${index + 1}`;
}

/** Distance in metres between two [lng, lat] points. */
export function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Best guess of when a missed stop happened, from the recorded route: the time
 * span of route points within 150 m of the place (or around the nearest point),
 * at least 10 minutes, kept inside the trip.
 */
export function guessStopTimes(
  place: { latitude: number; longitude: number },
  route: { coordinates: [number, number][]; timestamps?: (string | null)[] } | null | undefined,
  trip: { started_at: string | null; ended_at: string | null },
): { arrived: Date; departed: Date } {
  const start = trip.started_at ? Date.parse(trip.started_at) : Date.now() - 3_600_000;
  const end = trip.ended_at ? Date.parse(trip.ended_at) : Date.now();
  const clamp = (t: number) => Math.min(end, Math.max(start, t));
  const here: [number, number] = [place.longitude, place.latitude];
  const coords = route?.coordinates ?? [];
  const stamps = route?.timestamps ?? [];

  const near: number[] = [];
  let nearestT: number | null = null;
  let nearestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const raw = stamps[i];
    const t = raw ? Date.parse(raw) : NaN;
    if (Number.isNaN(t)) continue;
    const d = metersBetween(here, coords[i]);
    if (d <= 150) near.push(t);
    if (d < nearestD) {
      nearestD = d;
      nearestT = t;
    }
  }

  let from: number;
  let to: number;
  if (near.length > 0) {
    from = Math.min(...near);
    to = Math.max(...near);
  } else if (nearestT != null) {
    from = nearestT;
    to = nearestT;
  } else {
    from = start + (end - start) / 2;
    to = from;
  }
  if (to - from < 600_000) {
    const mid = (from + to) / 2;
    from = mid - 300_000;
    to = mid + 300_000;
  }
  return { arrived: new Date(clamp(from)), departed: new Date(clamp(to)) };
}

/** "HH:MM" for a time input, in the phone's time zone. */
export function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Same day as `base`, at the "HH:MM" from a time input. */
export function fromTimeInput(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
