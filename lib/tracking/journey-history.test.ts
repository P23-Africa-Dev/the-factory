import { describe, expect, it } from "vitest";
import type { JourneyCard } from "@/lib/api/field-activity";
import {
  buildJourneyHistoryQuery,
  getPresetRange,
  parseJourneyHistoryParams,
  sortTripsNewestFirst,
  tripCountLabel,
  windowedPages,
} from "@/lib/tracking/journey-history";
import { detailRefetchInterval, listRefetchInterval } from "@/hooks/use-field-journeys";

const params = (qs: string) => new URLSearchParams(qs);

describe("journey history URL state", () => {
  it("parses valid values and falls back on bad ones", () => {
    expect(parseJourneyHistoryParams(params("user=12&preset=last_week&page=3"))).toEqual({
      userId: "12",
      preset: "last_week",
      page: 3,
      from: null,
      to: null,
    });
    expect(parseJourneyHistoryParams(params("user=abc&preset=forever&page=-1&from=2026-13-40"))).toEqual({
      userId: null,
      preset: "last_30_days",
      page: 1,
      from: null,
      to: null,
    });
  });

  it("round-trips a custom range and drops defaults", () => {
    const qs = buildJourneyHistoryQuery({
      userId: "12",
      preset: "custom",
      page: 2,
      from: "2026-07-01",
      to: "2026-07-15",
    });
    expect(qs).toBe("user=12&preset=custom&from=2026-07-01&to=2026-07-15&page=2");
    expect(parseJourneyHistoryParams(params(qs)).from).toBe("2026-07-01");
    expect(buildJourneyHistoryQuery({ userId: null, preset: "last_30_days", page: 1, from: null, to: null })).toBe("");
  });
});

describe("getPresetRange", () => {
  const now = new Date(2026, 6, 29, 23, 30); // local time, late evening

  it("uses local calendar days", () => {
    expect(getPresetRange("today", now)).toEqual({ from: "2026-07-29", to: "2026-07-29" });
    expect(getPresetRange("last_30_days", now)).toEqual({ from: "2026-06-30", to: "2026-07-29" });
    expect(getPresetRange("this_week", now).from).toBe("2026-07-27");
    expect(getPresetRange("last_week", now)).toEqual({ from: "2026-07-20", to: "2026-07-26" });
  });

  it("supports custom ranges, swapping reversed inputs", () => {
    expect(getPresetRange("custom", now, { from: "2026-07-10", to: "2026-07-01" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-10",
    });
    expect(getPresetRange("custom", now, { from: "nope" }).to).toBe("2026-07-29");
  });
});

describe("pagination and sorting", () => {
  it("windows page buttons", () => {
    expect(windowedPages(1, 1)).toEqual([1]);
    expect(windowedPages(1, 5)).toEqual([1, 2, 3, "gap", 5]);
    expect(windowedPages(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
    expect(windowedPages(20, 20)).toEqual([1, "gap", 18, 19, 20]);
  });

  it("sorts trips newest first by real time, across offsets", () => {
    const base = {
      date: "2026-07-29",
      status: "completed",
      clock_in_at: null,
      clock_out_at: null,
      distance_meters: 0,
      travel_seconds: 0,
      stationary_seconds: 0,
      active_seconds: 0,
      stop_count: 0,
      visit_count: 0,
      unknown_stop_count: 0,
      travel_efficiency: null,
      narrative: null,
      attendance_record_id: null,
      source: "field_trip" as const,
    };
    const a = { ...base, id: 1, started_at: "2026-07-29T10:00:00+01:00" } as JourneyCard; // 09:00Z
    const b = { ...base, id: 2, started_at: "2026-07-29T09:30:00Z" } as JourneyCard; // later
    expect(sortTripsNewestFirst([a, b]).map((t) => t.id)).toEqual([2, 1]);
  });

  it("labels trip counts", () => {
    expect(tripCountLabel(1)).toBe("1 Trip");
    expect(tripCountLabel(0)).toBe("0 Trips");
  });
});

describe("journey refetch while a trip is running", () => {
  it("polls lists only when a shown trip is active", () => {
    const list = (status: string) =>
      ({ items: [{ status }] }) as unknown as Parameters<typeof listRefetchInterval>[0];
    expect(listRefetchInterval(list("active"))).toBe(60_000);
    expect(listRefetchInterval(list("completed"))).toBe(false);
    expect(listRefetchInterval(undefined)).toBe(false);
  });

  it("polls an open journey only while it is active", () => {
    const detail = (status: string) =>
      ({ journey: { status } }) as unknown as Parameters<typeof detailRefetchInterval>[0];
    expect(detailRefetchInterval(detail("active"))).toBe(30_000);
    expect(detailRefetchInterval(detail("completed"))).toBe(false);
  });
});
