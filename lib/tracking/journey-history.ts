import { endOfWeek, format, isValid, parse, startOfWeek, subDays } from "date-fns";
import type { JourneyCard } from "@/lib/api/field-activity";

export type JourneyPreset =
  | "today"
  | "this_week"
  | "last_week"
  | "last_30_days"
  | "last_90_days"
  | "custom";

export const JOURNEY_PRESETS: JourneyPreset[] = [
  "today",
  "this_week",
  "last_week",
  "last_30_days",
  "last_90_days",
  "custom",
];

export const JOURNEY_PRESET_LABELS: Record<JourneyPreset, string> = {
  today: "Today",
  this_week: "This Week",
  last_week: "Last Week",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  custom: "Custom",
};

export const DEFAULT_JOURNEY_PRESET: JourneyPreset = "last_30_days";

const DAY = "yyyy-MM-dd";

export function isIsoDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parse(value, DAY, new Date()));
}

/** Local-calendar date range (yyyy-MM-dd) for a preset. */
export function getPresetRange(
  preset: JourneyPreset,
  now: Date = new Date(),
  custom?: { from?: string | null; to?: string | null },
): { from: string; to: string } {
  const today = format(now, DAY);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "this_week":
      return { from: format(startOfWeek(now, { weekStartsOn: 1 }), DAY), to: today };
    case "last_week": {
      const prev = subDays(now, 7);
      return {
        from: format(startOfWeek(prev, { weekStartsOn: 1 }), DAY),
        to: format(endOfWeek(prev, { weekStartsOn: 1 }), DAY),
      };
    }
    case "last_90_days":
      return { from: format(subDays(now, 89), DAY), to: today };
    case "custom": {
      const from = isIsoDay(custom?.from) ? custom!.from! : format(subDays(now, 29), DAY);
      const to = isIsoDay(custom?.to) ? custom!.to! : today;
      // Swapped inputs still mean the same span.
      return from <= to ? { from, to } : { from: to, to: from };
    }
    case "last_30_days":
    default:
      return { from: format(subDays(now, 29), DAY), to: today };
  }
}

export type JourneyHistoryUrlState = {
  userId: string | null;
  preset: JourneyPreset;
  page: number;
  from: string | null;
  to: string | null;
};

/** Reads `?user=&preset=&page=&from=&to=` defensively. */
export function parseJourneyHistoryParams(
  params: { get: (key: string) => string | null },
): JourneyHistoryUrlState {
  const rawUser = params.get("user");
  const userId = rawUser && /^\d+$/.test(rawUser) ? rawUser : null;
  const rawPreset = params.get("preset") as JourneyPreset | null;
  const preset = rawPreset && JOURNEY_PRESETS.includes(rawPreset) ? rawPreset : DEFAULT_JOURNEY_PRESET;
  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const from = isIsoDay(params.get("from")) ? params.get("from") : null;
  const to = isIsoDay(params.get("to")) ? params.get("to") : null;
  return { userId, preset, page, from, to };
}

/** Query string for the state, leaving defaults out to keep links short. */
export function buildJourneyHistoryQuery(state: JourneyHistoryUrlState): string {
  const qs = new URLSearchParams();
  if (state.userId) qs.set("user", state.userId);
  if (state.preset !== DEFAULT_JOURNEY_PRESET) qs.set("preset", state.preset);
  if (state.preset === "custom") {
    if (state.from) qs.set("from", state.from);
    if (state.to) qs.set("to", state.to);
  }
  if (state.page > 1) qs.set("page", String(state.page));
  return qs.toString();
}

/**
 * Page buttons around the current page, with the first/last always shown and
 * gaps as "…": 1 … 4 5 [6] 7 8 … 20.
 */
export function windowedPages(current: number, total: number, radius = 2): Array<number | "gap"> {
  if (total <= 1) return [1];
  const pages = new Set<number>([1, total]);
  for (let p = current - radius; p <= current + radius; p += 1) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

/** When a trip started (field trips) or the clock-in day began. */
export function tripStartIso(trip: JourneyCard): string | null {
  return (trip.source === "field_trip" ? trip.started_at : null) ?? trip.started_at ?? trip.clock_in_at ?? null;
}

export function tripEndIso(trip: JourneyCard): string | null {
  return (trip.source === "field_trip" ? trip.ended_at : null) ?? trip.ended_at ?? trip.clock_out_at ?? null;
}

function timeOf(trip: JourneyCard): number {
  const iso = tripStartIso(trip) ?? trip.date;
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/** Newest first by real timestamps (string compare breaks across offsets). */
export function sortTripsNewestFirst(trips: JourneyCard[]): JourneyCard[] {
  return [...trips].sort((a, b) => timeOf(b) - timeOf(a) || b.id - a.id);
}

export function tripCountLabel(count: number): string {
  return `${count} ${count === 1 ? "Trip" : "Trips"}`;
}
