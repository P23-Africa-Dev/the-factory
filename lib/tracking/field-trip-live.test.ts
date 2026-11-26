import { describe, expect, it } from "vitest";
import {
  appendTrailPoint,
  FIELD_TRIP_SIGNAL_LOST_MS,
  formatDistanceMeters,
  formatElapsed,
  haversineMeters,
  mergeTrailTail,
  polylineLengthMeters,
  resolveFieldTripLiveState,
} from "@/lib/tracking/field-trip-live";
import {
  buildFieldTripAgentPopupHtml,
  buildFieldTripStopPopupHtml,
  escapeHtml,
} from "@/lib/tracking/field-trip-popups";

describe("field trip live helpers", () => {
  it("measures distance", () => {
    // ~111 km per degree of latitude.
    expect(haversineMeters([0, 0], [0, 1])).toBeGreaterThan(110_000);
    expect(haversineMeters([0, 0], [0, 1])).toBeLessThan(112_000);
    expect(polylineLengthMeters([[0, 0], [0, 1], [0, 2]])).toBeGreaterThan(220_000);
    expect(polylineLengthMeters([[0, 0]])).toBe(0);
  });

  it("resolves the live state", () => {
    const now = Date.parse("2026-07-29T10:00:00Z");
    expect(resolveFieldTripLiveState({ endedAt: "2026-07-29T09:59:00Z" }, now)).toBe("ended");
    expect(
      resolveFieldTripLiveState(
        { lastRecordedAt: new Date(now - FIELD_TRIP_SIGNAL_LOST_MS - 1000).toISOString(), lastMovementState: "moving" },
        now,
      ),
    ).toBe("signal_lost");
    expect(
      resolveFieldTripLiveState({ lastRecordedAt: "2026-07-29T09:59:00Z", lastMovementState: "moving" }, now),
    ).toBe("moving");
    expect(
      resolveFieldTripLiveState({ lastRecordedAt: "2026-07-29T09:59:00Z", lastMovementState: "stopped" }, now),
    ).toBe("stationary");
    // Just started, no point yet: judged by the start time, not "signal lost".
    expect(resolveFieldTripLiveState({ startedAt: "2026-07-29T09:58:00Z" }, now)).toBe("stationary");
    expect(resolveFieldTripLiveState({}, now)).toBe("signal_lost");
  });

  it("formats elapsed time and distance", () => {
    expect(formatElapsed(30_000)).toBe("<1m");
    expect(formatElapsed(14 * 60_000)).toBe("14m");
    expect(formatElapsed(125 * 60_000)).toBe("2h 05m");
    expect(formatElapsed(-1)).toBe("--");
    expect(formatDistanceMeters(950)).toBe("950 m");
    expect(formatDistanceMeters(12_345)).toBe("12.3 km");
    expect(formatDistanceMeters(null)).toBe("--");
  });

  it("appends without duplicates and caps the trail", () => {
    expect(appendTrailPoint([[1, 1]], [1, 1], 10)).toEqual([[1, 1]]);
    expect(appendTrailPoint([[1, 1], [2, 2]], [3, 3], 2)).toEqual([[2, 2], [3, 3]]);
  });

  it("merges a snapshot with the local tail", () => {
    expect(mergeTrailTail([[1, 1], [2, 2]], [[1, 1], [2, 2], [3, 3], [4, 4]], 100)).toEqual([
      [1, 1], [2, 2], [3, 3], [4, 4],
    ]);
    // Snapshot tail not found locally (downsampled): keep at least our latest point.
    expect(mergeTrailTail([[1, 1], [2.5, 2.5]], [[3, 3], [4, 4]], 100)).toEqual([[1, 1], [2.5, 2.5], [4, 4]]);
    expect(mergeTrailTail([], [[3, 3]], 100)).toEqual([[3, 3]]);
    expect(mergeTrailTail([[1, 1]], [], 100)).toEqual([[1, 1]]);
  });
});

describe("field trip popups", () => {
  it("escapes names and addresses", () => {
    expect(escapeHtml(`<b>"x"&'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
    const html = buildFieldTripAgentPopupHtml({
      name: "<img src=x onerror=alert(1)>",
      state: "moving",
      startedAt: "2026-07-29T09:00:00Z",
      stopCount: 2,
      distanceMeters: 2500,
      nowMs: Date.parse("2026-07-29T10:30:00Z"),
      journeyHref: "/operations/journeys/44",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("1h 30m");
    expect(html).toContain("2.5 km");
    expect(html).toContain("2 stops");
    expect(html).toContain('href="/operations/journeys/44"');

    const stop = buildFieldTripStopPopupHtml({
      kind: "stop",
      label: "<script>x</script>",
      classification: "customer_visit",
      durationSeconds: 600,
    });
    expect(stop).not.toContain("<script>");
    expect(stop).toContain("customer visit");
    expect(stop).toContain("10m");
  });
});
