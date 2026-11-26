import { create } from "zustand";
import {
  appendTrailPoint,
  FIELD_TRIP_ENDED_LINGER_MS,
  haversineMeters,
  mergeTrailTail,
  parseTimeMs,
  polylineLengthMeters,
} from "@/lib/tracking/field-trip-live";

export type FieldActivityLiveStop = {
  id: number;
  field_activity_session_id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  duration_seconds?: number;
  classification?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
};

export type FieldActivityLiveAgent = {
  userId: number;
  name: string;
  avatarUrl: string | null;
  sessionId: number;
  lastPosition: [number, number] | null;
  lastMovementState: string | null;
  lastRecordedAt: string | null;
  polyline: [number, number][];
  stops: FieldActivityLiveStop[];
  /** When the trip started (ISO). */
  startedAt?: string | null;
  /**
   * Where the trip started. Stored apart from `polyline` because the live
   * trail is capped and drops its oldest points, so `polyline[0]` drifts.
   */
  startPosition?: [number, number] | null;
  /** Distance travelled so far (server value, grown by live points). */
  distanceMeters?: number | null;
  /** Set when the trip ended; the person lingers briefly as "Trip ended". */
  endedAt?: string | null;
  /** Client clock (ms) of the last change — used to merge REST snapshots. */
  updatedAtMs?: number;
};

export const MAX_POLYLINE_PTS = 2000;

type AppendMeta = {
  sessionId?: number;
  movementState?: string | null;
  recordedAt?: string | null;
  name?: string;
  avatarUrl?: string | null;
};

type StartTripInfo = {
  sessionId: number;
  name?: string | null;
  avatarUrl?: string | null;
  startedAt?: string | null;
  position?: [number, number] | null;
};

type FieldActivityLiveStore = {
  agents: Record<number, FieldActivityLiveAgent>;
  followUserId: number | null;
  followAll: boolean;
  /**
   * The user panned the map: stop moving the camera but keep the person
   * selected/highlighted. Selecting them again resumes following.
   */
  followPaused: boolean;
  focusMode: boolean;
  /** Bumped when realtime data looks incomplete; the hydrate hook refetches. */
  refreshNonce: number;
  hydrate: (agents: FieldActivityLiveAgent[], options?: { fetchedAtMs?: number }) => void;
  /**
   * Adds a live point. Returns false when the person is unknown (no trip seen
   * yet) — the caller should refetch rather than invent a nameless entry.
   */
  appendPoint: (userId: number, point: [number, number], meta?: AppendMeta) => boolean;
  startTrip: (userId: number, info: StartTripInfo) => void;
  endTrip: (userId: number, info?: { sessionId?: number; endedAt?: string | null }) => void;
  upsertStop: (userId: number, stop: FieldActivityLiveStop) => void;
  removeAgent: (userId: number) => void;
  clear: () => void;
  setFollowUserId: (userId: number | null) => void;
  setFollowAll: (value: boolean) => void;
  setFocusMode: (value: boolean) => void;
  /** Manual pan/zoom: stop camera follow (single and all), keep selection. */
  pauseFollow: () => void;
  requestRefresh: () => void;
};

function isPlaceholderName(name: string | null | undefined): boolean {
  return !name || name === "Agent";
}

function newerIso(a: string | null | undefined, b: string | null | undefined): boolean {
  const am = parseTimeMs(a);
  const bm = parseTimeMs(b);
  if (am == null) return false;
  if (bm == null) return true;
  return am > bm;
}

/**
 * Merges a REST snapshot into the live agents. Never rewinds a trail that
 * realtime points already moved past, keeps people that arrived over the
 * socket after the request started, and keeps briefly-lingering ended trips.
 */
export function mergeLiveSnapshot(
  current: Record<number, FieldActivityLiveAgent>,
  incoming: FieldActivityLiveAgent[],
  fetchedAtMs: number = Number.POSITIVE_INFINITY,
): Record<number, FieldActivityLiveAgent> {
  const next: Record<number, FieldActivityLiveAgent> = {};

  for (const snap of incoming) {
    const existing = current[snap.userId];
    const startPosition = snap.startPosition ?? snap.polyline[0] ?? null;
    if (!existing || existing.sessionId !== snap.sessionId) {
      // A different session in the snapshot is authoritative, unless the
      // socket already told us about a newer trip than the request saw.
      if (existing && existing.sessionId > snap.sessionId && (existing.updatedAtMs ?? 0) > fetchedAtMs) {
        next[snap.userId] = existing;
        continue;
      }
      next[snap.userId] = { ...snap, startPosition };
      continue;
    }

    const localNewer = newerIso(existing.lastRecordedAt, snap.lastRecordedAt);
    const polyline = localNewer
      ? mergeTrailTail(snap.polyline, existing.polyline, MAX_POLYLINE_PTS)
      : snap.polyline;
    const stopsById = new Map<number, FieldActivityLiveStop>();
    for (const stop of existing.stops) stopsById.set(stop.id, stop);
    for (const stop of snap.stops) stopsById.set(stop.id, stop);
    const distances = [snap.distanceMeters, existing.distanceMeters].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );

    next[snap.userId] = {
      ...snap,
      name: isPlaceholderName(snap.name) && !isPlaceholderName(existing.name) ? existing.name : snap.name,
      avatarUrl: snap.avatarUrl ?? existing.avatarUrl,
      polyline,
      stops: [...stopsById.values()],
      lastPosition: localNewer ? existing.lastPosition : snap.lastPosition ?? existing.lastPosition,
      lastRecordedAt: localNewer ? existing.lastRecordedAt : snap.lastRecordedAt,
      lastMovementState: localNewer ? existing.lastMovementState : snap.lastMovementState,
      startedAt: snap.startedAt ?? existing.startedAt ?? null,
      startPosition: snap.startPosition ?? existing.startPosition ?? startPosition,
      distanceMeters: distances.length > 0 ? Math.max(...distances) : null,
      endedAt: existing.endedAt ?? null,
      updatedAtMs: existing.updatedAtMs,
    };
  }

  for (const [key, agent] of Object.entries(current)) {
    const userId = Number(key);
    if (next[userId]) continue;
    const arrivedAfterRequest = (agent.updatedAtMs ?? 0) > fetchedAtMs;
    if (agent.endedAt || arrivedAfterRequest) next[userId] = agent;
  }

  return next;
}

export const useFieldActivityLiveStore = create<FieldActivityLiveStore>((set, get) => ({
  agents: {},
  followUserId: null,
  followAll: false,
  followPaused: false,
  focusMode: false,
  refreshNonce: 0,

  hydrate: (agents, options) =>
    set((state) => {
      const merged = mergeLiveSnapshot(state.agents, agents, options?.fetchedAtMs);
      const followGone = state.followUserId != null && !merged[state.followUserId];
      return {
        agents: merged,
        ...(followGone ? { followUserId: null, focusMode: false } : {}),
      };
    }),

  appendPoint: (userId, point, meta) => {
    const existing = get().agents[userId];
    if (!existing && (!meta?.sessionId || isPlaceholderName(meta.name))) {
      return false;
    }
    const now = Date.now();

    set((state) => {
      const current = state.agents[userId];
      if (!current) {
        return {
          agents: {
            ...state.agents,
            [userId]: {
              userId,
              name: meta?.name ?? "Agent",
              avatarUrl: meta?.avatarUrl ?? null,
              sessionId: meta?.sessionId ?? 0,
              lastPosition: point,
              lastMovementState: meta?.movementState ?? null,
              lastRecordedAt: meta?.recordedAt ?? null,
              polyline: [point],
              stops: [],
              startedAt: meta?.recordedAt ?? null,
              startPosition: point,
              distanceMeters: 0,
              endedAt: null,
              updatedAtMs: now,
            },
          },
        };
      }

      // A different session is a new trip: start a fresh line.
      const newTrip = meta?.sessionId != null && meta.sessionId !== current.sessionId;
      const basePolyline = newTrip ? [] : current.polyline;
      const previous = newTrip ? null : current.lastPosition;
      const step = previous ? haversineMeters(previous, point) : 0;

      return {
        agents: {
          ...state.agents,
          [userId]: {
            ...current,
            ...(newTrip
              ? {
                  stops: [],
                  startPosition: point,
                  startedAt: meta?.recordedAt ?? null,
                  distanceMeters: 0,
                  endedAt: null,
                }
              : {}),
            name: !isPlaceholderName(current.name) ? current.name : meta?.name ?? current.name,
            avatarUrl: current.avatarUrl ?? meta?.avatarUrl ?? null,
            lastPosition: point,
            lastMovementState: meta?.movementState ?? current.lastMovementState,
            lastRecordedAt: meta?.recordedAt ?? current.lastRecordedAt,
            sessionId: meta?.sessionId ?? current.sessionId,
            polyline: appendTrailPoint(basePolyline, point, MAX_POLYLINE_PTS),
            startPosition: newTrip ? point : current.startPosition ?? point,
            distanceMeters: newTrip ? 0 : (current.distanceMeters ?? 0) + step,
            updatedAtMs: now,
          },
        },
      };
    });
    return true;
  },

  startTrip: (userId, info) =>
    set((state) => {
      const current = state.agents[userId];
      const now = Date.now();
      const sameTrip = current && current.sessionId === info.sessionId;
      const position = info.position ?? null;
      if (sameTrip) {
        return {
          agents: {
            ...state.agents,
            [userId]: {
              ...current,
              name: !isPlaceholderName(info.name) ? (info.name as string) : current.name,
              avatarUrl: info.avatarUrl ?? current.avatarUrl,
              startedAt: current.startedAt ?? info.startedAt ?? null,
              startPosition: current.startPosition ?? position,
              lastPosition: current.lastPosition ?? position,
              endedAt: null,
              updatedAtMs: now,
            },
          },
        };
      }
      return {
        agents: {
          ...state.agents,
          [userId]: {
            userId,
            name: !isPlaceholderName(info.name) ? (info.name as string) : current?.name ?? "Agent",
            avatarUrl: info.avatarUrl ?? current?.avatarUrl ?? null,
            sessionId: info.sessionId,
            lastPosition: position,
            lastMovementState: null,
            lastRecordedAt: position ? info.startedAt ?? null : null,
            polyline: position ? [position] : [],
            stops: [],
            startedAt: info.startedAt ?? null,
            startPosition: position,
            distanceMeters: 0,
            endedAt: null,
            updatedAtMs: now,
          },
        },
      };
    }),

  endTrip: (userId, info) => {
    const current = get().agents[userId];
    if (!current) return;
    if (info?.sessionId != null && info.sessionId !== current.sessionId) return;
    const sessionId = current.sessionId;
    set((state) => ({
      agents: {
        ...state.agents,
        [userId]: {
          ...current,
          endedAt: info?.endedAt ?? new Date().toISOString(),
          updatedAtMs: Date.now(),
        },
      },
      ...(state.followUserId === userId ? { focusMode: false } : {}),
    }));
    setTimeout(() => {
      const agent = get().agents[userId];
      if (agent?.endedAt && agent.sessionId === sessionId) {
        get().removeAgent(userId);
      }
    }, FIELD_TRIP_ENDED_LINGER_MS);
  },

  upsertStop: (userId, stop) =>
    set((state) => {
      const existing = state.agents[userId];
      if (!existing) return state;
      const without = existing.stops.filter((s) => s.id !== stop.id);
      return {
        agents: {
          ...state.agents,
          [userId]: {
            ...existing,
            stops: [...without, stop],
            updatedAtMs: Date.now(),
          },
        },
      };
    }),

  removeAgent: (userId) =>
    set((state) => {
      if (!state.agents[userId]) return state;
      const next = { ...state.agents };
      delete next[userId];
      const wasFollowed = state.followUserId === userId;
      return {
        agents: next,
        followUserId: wasFollowed ? null : state.followUserId,
        focusMode: wasFollowed ? false : state.focusMode,
      };
    }),

  clear: () =>
    set({ agents: {}, followUserId: null, followAll: false, followPaused: false, focusMode: false }),

  // Selecting a person follows them; it does not hide the panel (focus mode
  // is a separate, explicit choice).
  setFollowUserId: (userId) =>
    set((state) => ({
      followUserId: userId,
      followAll: false,
      followPaused: false,
      focusMode: userId == null ? false : state.focusMode,
    })),

  setFollowAll: (value) =>
    set({
      followAll: value,
      followUserId: null,
      followPaused: false,
      focusMode: false,
    }),

  setFocusMode: (value) => set({ focusMode: value }),

  pauseFollow: () =>
    set((state) =>
      state.followPaused && !state.followAll ? state : { followPaused: true, followAll: false },
    ),

  requestRefresh: () => set((state) => ({ refreshNonce: state.refreshNonce + 1 })),
}));

/** Current positions of people on an active (not ended) trip. */
export function activeFieldTripPositions(
  agents: Record<number, FieldActivityLiveAgent>,
): [number, number][] {
  const out: [number, number][] = [];
  for (const agent of Object.values(agents)) {
    if (agent.endedAt) continue;
    const pos = agent.lastPosition ?? agent.polyline[agent.polyline.length - 1];
    if (pos) out.push(pos);
  }
  return out;
}

/** Stable string of active positions — a cheap selector for "follow all". */
export function activeFieldTripPositionsKey(
  agents: Record<number, FieldActivityLiveAgent>,
): string {
  return activeFieldTripPositions(agents)
    .map((p) => `${p[0]},${p[1]}`)
    .join("|");
}

/** Distance fallback when the server did not send one. */
export function liveAgentDistanceMeters(agent: FieldActivityLiveAgent): number {
  if (typeof agent.distanceMeters === "number" && Number.isFinite(agent.distanceMeters)) {
    return agent.distanceMeters;
  }
  return polylineLengthMeters(agent.polyline);
}
