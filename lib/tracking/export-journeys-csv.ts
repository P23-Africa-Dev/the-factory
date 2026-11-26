import type { FieldStopDto, JourneyCard } from "@/lib/api/field-activity";

/**
 * Escapes one CSV cell. Values that a spreadsheet would run as a formula
 * (leading =, +, -, @, tab or CR — "CSV injection") are prefixed with an
 * apostrophe; plain numbers are left alone so they stay numeric.
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let raw = value;
  if (/^[=+\-@\t\r]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw)) {
    raw = `'${raw}`;
  }
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [header.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\r\n");
}

function formatDurationSeconds(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Build CSV for trip/journey history (one row per trip). */
export function buildJourneysCsv(journeys: JourneyCard[], agentName?: string): string {
  const header = [
    "trip_id",
    "date",
    "person",
    "type",
    "status",
    "started_at",
    "ended_at",
    "end_reason",
    "distance_meters",
    "stops",
    "visits",
    "unknown_stops",
    "active_duration",
    "travel_seconds",
    "stationary_seconds",
    "travel_efficiency",
  ];

  const rows = journeys.map((j) => [
    j.id,
    j.date,
    agentName ?? "",
    j.source === "field_trip" ? "Field trip" : "Clock-in day",
    j.status,
    j.started_at ?? j.clock_in_at,
    j.ended_at ?? j.clock_out_at,
    j.end_reason ?? "",
    j.distance_meters,
    j.stop_count,
    j.visit_count,
    j.unknown_stop_count,
    formatDurationSeconds(j.active_seconds),
    j.travel_seconds,
    j.stationary_seconds,
    j.travel_efficiency != null ? Math.round(j.travel_efficiency * 100) / 100 : null,
  ]);

  return toCsv(header, rows);
}

export type TripStops = {
  journey: Pick<JourneyCard, "id" | "date">;
  stops: FieldStopDto[];
};

/** Build CSV of stops (one row per stop) for one or more trips. */
export function buildStopsCsv(trips: TripStops[], agentName?: string): string {
  const header = [
    "trip_id",
    "trip_date",
    "person",
    "stop_id",
    "arrived_at",
    "departed_at",
    "duration_seconds",
    "classification",
    "address",
    "latitude",
    "longitude",
  ];
  const rows = trips.flatMap(({ journey, stops }) =>
    stops.map((stop) => [
      journey.id,
      journey.date,
      agentName ?? "",
      stop.id,
      stop.arrived_at,
      stop.departed_at,
      stop.duration_seconds,
      stop.classification ?? "",
      stop.address ?? "",
      stop.latitude,
      stop.longitude,
    ]),
  );
  return toCsv(header, rows);
}

type Page<T> = {
  items: T[];
  pagination?: { current_page: number; last_page: number } | null;
};

/** Fetches every page of a paginated list (page 1..last_page), in order. */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<Page<T>>,
  maxPages = 200,
): Promise<T[]> {
  const first = await fetchPage(1);
  const items = [...first.items];
  const last = Math.min(first.pagination?.last_page ?? 1, maxPages);
  for (let page = 2; page <= last; page += 1) {
    const next = await fetchPage(page);
    items.push(...next.items);
  }
  return items;
}

/** Runs `fn` over `items` with at most `limit` in flight; keeps order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** "Jane Doe" → "jane-doe" for file names. */
export function fileSlug(value: string | number): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "export";
}

/**
 * Saves text as a file. CSVs get a UTF-8 BOM so Excel shows names with
 * accents correctly. The link is attached to the page while clicking (some
 * browsers ignore detached links) and the blob URL is freed afterwards.
 */
export function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8"): void {
  if (typeof document === "undefined") return;
  const withBom = mime.startsWith("text/csv") && !contents.startsWith("﻿") ? `﻿${contents}` : contents;
  const blob = new Blob([withBom], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
