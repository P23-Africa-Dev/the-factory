/**
 * Tracking store — direct port from mobile app.
 * Zero React Native dependencies — identical Zustand store.
 */
import { create } from 'zustand';

export type LiveTaskStatus = 'tracking' | 'arrived' | 'completed';

export interface LiveTaskState {
  taskId: number;
  trackingSessionId: number | null;
  agentId: number;
  agentName: string;
  agentAvatar: string | null;
  taskTitle: string;
  lastPosition: [number, number] | null; // [lng, lat] — Mapbox convention
  lastHeadingDegrees: number | null;
  lastSpeedMps: number | null;
  polyline: [number, number][]; // ordered route trail so far
  status: LiveTaskStatus;
  arrivedAt: string | null;
  lastUpdatedAt: string | null;
  destination: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  } | null;
}

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface TrackingStore {
  liveTaskMap: Record<number, LiveTaskState>;
  activeTrackingTaskId: number | null;
  wsStatus: WsStatus;
  serverSimulatesMovement: boolean;

  upsertTask: (taskId: number, partial: Partial<LiveTaskState>) => void;
  appendPolylinePoint: (taskId: number, point: [number, number]) => void;
  markArrived: (taskId: number, arrivedAt: string) => void;
  markCompleted: (taskId: number) => void;
  removeTask: (taskId: number) => void;
  hydrateTasks: (tasks: LiveTaskState[]) => void;
  setActiveTrackingTaskId: (taskId: number | null) => void;
  setWsStatus: (status: WsStatus) => void;
  setServerSimulatesMovement: (active: boolean) => void;
}

const POLYLINE_CAP = 2000; // prevent unbounded growth during long shifts

export const useTrackingStore = create<TrackingStore>((set) => ({
  liveTaskMap: {},
  activeTrackingTaskId: null,
  wsStatus: 'idle',
  serverSimulatesMovement: false,

  upsertTask: (taskId, partial) =>
    set((state) => ({
      liveTaskMap: {
        ...state.liveTaskMap,
        [taskId]: {
          ...(state.liveTaskMap[taskId] ?? {}),
          ...partial,
          taskId,
        } as LiveTaskState,
      },
    })),

  appendPolylinePoint: (taskId, point) =>
    set((state) => {
      const existing = state.liveTaskMap[taskId];
      if (!existing) return state;

      const polyline = [...existing.polyline, point];
      const capped =
        polyline.length > POLYLINE_CAP
          ? polyline.slice(polyline.length - POLYLINE_CAP)
          : polyline;

      return {
        liveTaskMap: {
          ...state.liveTaskMap,
          [taskId]: { ...existing, polyline: capped },
        },
      };
    }),

  markArrived: (taskId, arrivedAt) =>
    set((state) => {
      const existing = state.liveTaskMap[taskId];
      if (!existing) return state;
      return {
        liveTaskMap: {
          ...state.liveTaskMap,
          [taskId]: { ...existing, status: 'arrived', arrivedAt },
        },
      };
    }),

  markCompleted: (taskId) =>
    set((state) => {
      const existing = state.liveTaskMap[taskId];
      if (!existing) return state;
      return {
        liveTaskMap: {
          ...state.liveTaskMap,
          [taskId]: { ...existing, status: 'completed' },
        },
      };
    }),

  removeTask: (taskId) =>
    set((state) => {
      const { [taskId]: _unused, ...rest } = state.liveTaskMap; void _unused;
      return { liveTaskMap: rest };
    }),

  hydrateTasks: (tasks) =>
    set((state) => {
      const hydrated = { ...state.liveTaskMap };
      for (const task of tasks) {
        hydrated[task.taskId] = { ...hydrated[task.taskId], ...task };
      }
      return { liveTaskMap: hydrated };
    }),

  setActiveTrackingTaskId: (taskId) => set({ activeTrackingTaskId: taskId }),

  setWsStatus: (status) => set({ wsStatus: status }),

  setServerSimulatesMovement: (active) => set({ serverSimulatesMovement: active }),
}));
