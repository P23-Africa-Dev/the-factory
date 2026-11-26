import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeFieldTripPositions,
  liveAgentDistanceMeters,
  MAX_POLYLINE_PTS,
  mergeLiveSnapshot,
  useFieldActivityLiveStore,
  type FieldActivityLiveAgent,
} from "@/store/field-activity-live";
import { FIELD_TRIP_ENDED_LINGER_MS } from "@/lib/tracking/field-trip-live";

function agent(overrides: Partial<FieldActivityLiveAgent> = {}): FieldActivityLiveAgent {
  return {
    userId: 9,
    name: "Amara",
    avatarUrl: null,
    sessionId: 44,
    lastPosition: [3.37, 6.52],
    lastMovementState: "moving",
    lastRecordedAt: "2026-07-29T10:00:00+01:00",
    polyline: [[3.36, 6.51], [3.37, 6.52]],
    stops: [],
    startedAt: "2026-07-29T09:00:00+01:00",
    startPosition: [3.36, 6.51],
    distanceMeters: 1500,
    endedAt: null,
    ...overrides,
  };
}

const store = () => useFieldActivityLiveStore.getState();

describe("field activity live store", () => {
  beforeEach(() => {
    store().clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates and appends points, growing the distance", () => {
    store().hydrate([agent()]);
    const accepted = store().appendPoint(9, [3.38, 6.53], {
      movementState: "moving",
      recordedAt: "2026-07-29T10:05:00+01:00",
    });

    const a = store().agents[9];
    expect(accepted).toBe(true);
    expect(a.polyline).toHaveLength(3);
    expect(a.lastPosition).toEqual([3.38, 6.53]);
    expect(a.distanceMeters).toBeGreaterThan(1500);
  });

  it("does not invent a nameless person for a location of an unknown user", () => {
    const accepted = store().appendPoint(5, [3.1, 6.1], { sessionId: 12 });
    expect(accepted).toBe(false);
    expect(store().agents[5]).toBeUndefined();
  });

  it("adds a person on trip_started even without coordinates", () => {
    store().startTrip(7, {
      sessionId: 70,
      name: "Bola",
      avatarUrl: "https://cdn.example.com/b.png",
      startedAt: "2026-07-29T08:00:00+01:00",
      position: null,
    });
    const a = store().agents[7];
    expect(a.name).toBe("Bola");
    expect(a.avatarUrl).toBe("https://cdn.example.com/b.png");
    expect(a.lastPosition).toBeNull();
    expect(a.startedAt).toBe("2026-07-29T08:00:00+01:00");

    // The first location then becomes the start pin.
    expect(store().appendPoint(7, [3.2, 6.2], { sessionId: 70 })).toBe(true);
    expect(store().agents[7].startPosition).toEqual([3.2, 6.2]);
  });

  it("a new session starts a fresh trail, start point and distance", () => {
    store().hydrate([agent()]);
    store().appendPoint(9, [3.5, 6.6], { sessionId: 45, recordedAt: "2026-07-29T12:00:00+01:00" });
    const a = store().agents[9];
    expect(a.sessionId).toBe(45);
    expect(a.polyline).toEqual([[3.5, 6.6]]);
    expect(a.startPosition).toEqual([3.5, 6.6]);
    expect(a.distanceMeters).toBe(0);
  });

  it("keeps the start point when the capped trail drops its oldest points", () => {
    store().hydrate([agent({ polyline: [[0, 0]], startPosition: [0, 0], lastPosition: [0, 0] })]);
    for (let i = 1; i <= MAX_POLYLINE_PTS + 5; i += 1) {
      store().appendPoint(9, [i / 10000, 0]);
    }
    const a = store().agents[9];
    expect(a.polyline).toHaveLength(MAX_POLYLINE_PTS);
    expect(a.polyline[0]).not.toEqual([0, 0]);
    expect(a.startPosition).toEqual([0, 0]);
  });

  it("selecting a person follows them without hiding the panel", () => {
    store().hydrate([agent()]);
    store().setFollowUserId(9);
    expect(store().followUserId).toBe(9);
    expect(store().focusMode).toBe(false);
    expect(store().followPaused).toBe(false);

    store().pauseFollow();
    expect(store().followUserId).toBe(9);
    expect(store().followPaused).toBe(true);

    store().setFollowAll(true);
    expect(store().followAll).toBe(true);
    expect(store().followUserId).toBeNull();
    store().pauseFollow();
    expect(store().followAll).toBe(false);
  });

  it("an ended trip lingers as 'Trip ended', then leaves and resets focus", () => {
    vi.useFakeTimers();
    store().hydrate([agent()]);
    store().setFollowUserId(9);
    store().setFocusMode(true);

    store().endTrip(9, { sessionId: 44, endedAt: "2026-07-29T11:00:00+01:00" });
    expect(store().agents[9].endedAt).toBe("2026-07-29T11:00:00+01:00");
    expect(store().focusMode).toBe(false);

    vi.advanceTimersByTime(FIELD_TRIP_ENDED_LINGER_MS + 10);
    expect(store().agents[9]).toBeUndefined();
    expect(store().followUserId).toBeNull();
  });

  it("ignores trip_ended for an older session", () => {
    store().hydrate([agent({ sessionId: 50 })]);
    store().endTrip(9, { sessionId: 44 });
    expect(store().agents[9].endedAt).toBeNull();
  });

  it("requestRefresh bumps the nonce", () => {
    const before = store().refreshNonce;
    store().requestRefresh();
    expect(store().refreshNonce).toBe(before + 1);
  });

  it("lists active positions, skipping ended trips", () => {
    store().hydrate([agent(), agent({ userId: 10, endedAt: "2026-07-29T11:00:00Z" })]);
    expect(activeFieldTripPositions(store().agents)).toEqual([[3.37, 6.52]]);
  });

  it("falls back to the trail length when no distance is known", () => {
    expect(liveAgentDistanceMeters(agent({ distanceMeters: null }))).toBeGreaterThan(0);
  });
});

describe("mergeLiveSnapshot", () => {
  it("keeps the newer realtime tail instead of rewinding the trail", () => {
    const local = agent({
      polyline: [[1, 1], [2, 2], [3, 3]],
      lastPosition: [3, 3],
      lastRecordedAt: "2026-07-29T10:10:00Z",
    });
    const snapshot = agent({
      polyline: [[1, 1], [2, 2]],
      lastPosition: [2, 2],
      lastRecordedAt: "2026-07-29T10:05:00Z",
    });
    const merged = mergeLiveSnapshot({ 9: local }, [snapshot])[9];
    expect(merged.polyline).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(merged.lastPosition).toEqual([3, 3]);
    expect(merged.lastRecordedAt).toBe("2026-07-29T10:10:00Z");
  });

  it("takes the snapshot when it is newer", () => {
    const local = agent({ polyline: [[1, 1]], lastPosition: [1, 1], lastRecordedAt: "2026-07-29T10:00:00Z" });
    const snapshot = agent({
      polyline: [[1, 1], [2, 2]],
      lastPosition: [2, 2],
      lastRecordedAt: "2026-07-29T10:05:00Z",
    });
    const merged = mergeLiveSnapshot({ 9: local }, [snapshot])[9];
    expect(merged.polyline).toEqual([[1, 1], [2, 2]]);
    expect(merged.lastPosition).toEqual([2, 2]);
  });

  it("unions stops and keeps people that arrived after the request started", () => {
    const fetchedAt = 1_000;
    const current = {
      9: agent({ stops: [{ id: 1, field_activity_session_id: 44, latitude: 6, longitude: 3 }] }),
      11: agent({ userId: 11, sessionId: 99, updatedAtMs: 2_000 }),
      12: agent({ userId: 12, sessionId: 98, updatedAtMs: 500 }),
    };
    const snapshot = agent({ stops: [{ id: 2, field_activity_session_id: 44, latitude: 6.1, longitude: 3.1 }] });
    const merged = mergeLiveSnapshot(current, [snapshot], fetchedAt);
    expect(merged[9].stops.map((s) => s.id).sort()).toEqual([1, 2]);
    expect(merged[11]).toBeDefined();
    // Not in the snapshot and older than the request: their trip ended.
    expect(merged[12]).toBeUndefined();
  });

  it("keeps a placeholder-free name and the lingering ended state", () => {
    const local = agent({ name: "Amara", endedAt: "2026-07-29T11:00:00Z" });
    const snapshot = agent({ name: "Agent", endedAt: null });
    const merged = mergeLiveSnapshot({ 9: local }, [snapshot])[9];
    expect(merged.name).toBe("Amara");
    expect(merged.endedAt).toBe("2026-07-29T11:00:00Z");
  });

  it("uses the server start point, or the first trail point", () => {
    const merged = mergeLiveSnapshot({}, [agent({ startPosition: null, polyline: [[5, 5], [6, 6]] })])[9];
    expect(merged.startPosition).toEqual([5, 5]);
  });
});
