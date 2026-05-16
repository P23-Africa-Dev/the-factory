import { create } from "zustand";
import type { LiveTaskState, TrackingEnvelope, TaskRoute } from "@/types/tracking";
import type { TaskApiItem } from "@/lib/api/tasks";

const MAX_POLYLINE_PTS = 2000;
const COMPLETED_LINGER_MS = 5_000;

type WsStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

interface TrackingStore {
  liveTasks: Record<number, LiveTaskState>;
  wsStatus: WsStatus;
  selectedTaskId: number | null;
  activeTrackingTaskId: number | null; // agent-side: task being tracked on this device

  upsertFromWs: (envelope: TrackingEnvelope) => void;
  hydrateFromRoute: (taskId: number, route: TaskRoute, task: TaskApiItem) => void;
  hydrateBatch: (entries: LiveTaskState[]) => void;
  appendPolylinePoint: (taskId: number, point: [number, number]) => void;
  markArrived: (taskId: number, arrivedAt: string) => void;
  markCompleted: (taskId: number) => void;
  removeTask: (taskId: number) => void;
  setSelectedTask: (taskId: number | null) => void;
  setActiveTrackingTask: (taskId: number | null) => void;
  setWsStatus: (status: WsStatus) => void;
}

function buildFromEnvelope(
  prev: LiveTaskState | undefined,
  envelope: TrackingEnvelope
): LiveTaskState {
  const { payload } = envelope;
  const lat = payload.data?.latitude;
  const lng = payload.data?.longitude;
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  const base: LiveTaskState = prev ?? {
    taskId: payload.task_id,
    trackingSessionId: payload.tracking_session_id,
    userId: payload.user_id,
    agentName: "",
    taskTitle: "",
    status: "in_progress",
    lastPosition: hasCoords ? [lng!, lat!] : [0, 0],
    polyline: [],
    lastEventAt: payload.occurred_at,
  };

  return {
    ...base,
    trackingSessionId: payload.tracking_session_id,
    lastEventAt: payload.occurred_at,
    ...(hasCoords && { lastPosition: [lng!, lat!] }),
  };
}

export const useTrackingStore = create<TrackingStore>((set, get) => ({
  liveTasks: {},
  wsStatus: "idle",
  selectedTaskId: null,
  activeTrackingTaskId: null,

  upsertFromWs(envelope) {
    const taskId = envelope.payload.task_id;
    const { type, payload } = envelope;
    const lat = payload.data?.latitude;
    const lng = payload.data?.longitude;
    const hasCoords = typeof lat === "number" && typeof lng === "number";

    set((s) => {
      const prev = s.liveTasks[taskId];
      const updated = buildFromEnvelope(prev, envelope);

      if (type === "tracking.task.started") {
        return {
          liveTasks: {
            ...s.liveTasks,
            [taskId]: { ...updated, status: "in_progress" },
          },
        };
      }

      if (type === "tracking.location.updated") {
        const polyline = prev?.polyline ?? [];
        const newPolyline: [number, number][] = hasCoords
          ? ([...polyline, [lng!, lat!] as [number, number]] as [number, number][]).slice(-MAX_POLYLINE_PTS)
          : polyline;

        const arrivedNow = !!payload.data?.arrived;
        return {
          liveTasks: {
            ...s.liveTasks,
            [taskId]: {
              ...updated,
              polyline: newPolyline,
              status: arrivedNow ? "arrived" : updated.status,
              ...(arrivedNow && !prev?.arrivedAt
                ? { arrivedAt: payload.occurred_at }
                : {}),
            },
          },
        };
      }

      if (type === "tracking.task.arrived") {
        return {
          liveTasks: {
            ...s.liveTasks,
            [taskId]: {
              ...updated,
              status: "arrived",
              arrivedAt: payload.data?.arrival_recorded_at ?? payload.occurred_at,
            },
          },
        };
      }

      if (type === "tracking.task.completed") {
        const completedEntry: LiveTaskState = { ...updated, status: "completed" };
        setTimeout(() => get().removeTask(taskId), COMPLETED_LINGER_MS);
        return {
          liveTasks: { ...s.liveTasks, [taskId]: completedEntry },
        };
      }

      return { liveTasks: { ...s.liveTasks, [taskId]: updated } };
    });
  },

  hydrateFromRoute(taskId, route, task) {
    set((s) => {
      const prev = s.liveTasks[taskId];
      const polyline = (route.polyline ?? []) as [number, number][];
      const lastPt = polyline[polyline.length - 1] as [number, number] | undefined;

      const entry: LiveTaskState = {
        taskId,
        trackingSessionId: prev?.trackingSessionId ?? 0,
        userId: prev?.userId ?? 0,
        agentName: task.assignee?.name ?? prev?.agentName ?? "",
        taskTitle: task.title,
        taskAddress: task.address ?? task.location,
        status:
          route.status === "completed"
            ? "completed"
            : route.arrival
            ? "arrived"
            : "in_progress",
        destination: route.destination
          ? {
              lat: route.destination.latitude,
              lng: route.destination.longitude,
              radiusM: route.destination.radius_meters,
            }
          : undefined,
        lastPosition: lastPt ?? prev?.lastPosition ?? [0, 0],
        polyline: polyline.slice(-MAX_POLYLINE_PTS),
        lastEventAt:
          route.end?.recorded_at ??
          route.arrival?.recorded_at ??
          route.start?.recorded_at ??
          new Date().toISOString(),
        arrivedAt: route.arrival?.recorded_at,
      };

      return { liveTasks: { ...s.liveTasks, [taskId]: entry } };
    });
  },

  hydrateBatch(entries) {
    set((s) => {
      const merged = { ...s.liveTasks };
      for (const e of entries) merged[e.taskId] = e;
      return { liveTasks: merged };
    });
  },

  appendPolylinePoint(taskId, point) {
    set((s) => {
      const prev = s.liveTasks[taskId];
      if (!prev) return s;
      const polyline = [...prev.polyline, point].slice(-MAX_POLYLINE_PTS);
      return {
        liveTasks: {
          ...s.liveTasks,
          [taskId]: { ...prev, polyline, lastPosition: point },
        },
      };
    });
  },

  markArrived(taskId, arrivedAt) {
    set((s) => {
      const prev = s.liveTasks[taskId];
      if (!prev) return s;
      return {
        liveTasks: {
          ...s.liveTasks,
          [taskId]: { ...prev, status: "arrived", arrivedAt },
        },
      };
    });
  },

  markCompleted(taskId) {
    set((s) => {
      const prev = s.liveTasks[taskId];
      if (!prev) return s;
      setTimeout(() => get().removeTask(taskId), COMPLETED_LINGER_MS);
      return {
        liveTasks: {
          ...s.liveTasks,
          [taskId]: { ...prev, status: "completed" },
        },
      };
    });
  },

  removeTask(taskId) {
    set((s) => {
      const next = { ...s.liveTasks };
      delete next[taskId];
      return { liveTasks: next };
    });
  },

  setSelectedTask(taskId) {
    set({ selectedTaskId: taskId });
  },

  setActiveTrackingTask(taskId) {
    set({ activeTrackingTaskId: taskId });
  },

  setWsStatus(status) {
    set({ wsStatus: status });
  },
}));
