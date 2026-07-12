import { create } from "zustand";
import type {
  LiveTaskState,
  TrackingEnvelope,
  TaskRoute,
  AgentLocationSnapshotItem,
} from "@/types/tracking";
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
  hydrateFromSnapshots: (items: AgentLocationSnapshotItem[]) => void;
  seedFromTaskStart: (params: {
    taskId: number;
    trackingSessionId: number;
    userId: number;
    agentName?: string;
    agentAvatarUrl?: string;
    taskTitle?: string;
    taskAddress?: string;
    destination?: { lat: number; lng: number; radiusM?: number };
    position?: [number, number];
    occurredAt?: string;
  }) => void;
  appendPolylinePoint: (taskId: number, point: [number, number]) => void;
  markArrived: (taskId: number, arrivedAt: string) => void;
  markCompleted: (taskId: number) => void;
  removeTask: (taskId: number) => void;
  setSelectedTask: (taskId: number | null) => void;
  setActiveTrackingTask: (taskId: number | null) => void;
  setWsStatus: (status: WsStatus) => void;
}

function normalizeLiveStatus(
  status: string | null | undefined
): LiveTaskState["status"] | undefined {
  if (!status) return undefined;
  const value = status.toLowerCase();
  if (value === "completed") return "completed";
  if (value === "arrived") return "arrived";
  if (value === "near_destination") return "near_destination";
  return "in_progress";
}

function normalizeProximityState(
  state: string | null | undefined
): LiveTaskState["status"] | undefined {
  if (!state) return undefined;
  const value = state.toLowerCase();
  if (value === "completed") return "completed";
  if (value === "arrived") return "arrived";
  if (value === "near_destination") return "near_destination";
  if (value === "in_progress") return "in_progress";
  return undefined;
}

/** Stable key for detecting agent identity swaps on a task marker. */
export function trackingAgentIdentityKey(task: Pick<LiveTaskState, "userId" | "agentAvatarUrl">): string {
  return `${task.userId}:${task.agentAvatarUrl ?? ""}`;
}

function mergeAgentAvatarUrl(
  params: { userId: number; agentAvatarUrl?: string },
  prev: LiveTaskState | undefined,
): string | undefined {
  if (params.agentAvatarUrl) return params.agentAvatarUrl;
  if (prev && prev.userId === params.userId) return prev.agentAvatarUrl;
  return undefined;
}

function buildFromEnvelope(
  prev: LiveTaskState | undefined,
  envelope: TrackingEnvelope
): LiveTaskState {
  const { payload } = envelope;
  const lat = payload.data?.location?.latitude ?? payload.data?.latitude;
  const lng = payload.data?.location?.longitude ?? payload.data?.longitude;
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  const destinationLat = payload.data?.destination?.latitude;
  const destinationLng = payload.data?.destination?.longitude;
  const hasDestination =
    typeof destinationLat === "number" && typeof destinationLng === "number";

  const normalizedStatus =
    normalizeProximityState(payload.data?.proximity_state) ??
    normalizeLiveStatus(payload.data?.task?.status ?? payload.data?.task_status);
  const taskStatus = normalizedStatus ?? prev?.status ?? "in_progress";

  const base: LiveTaskState = prev ?? {
    taskId: payload.task_id,
    trackingSessionId: payload.tracking_session_id,
    userId: payload.user_id,
    agentName: payload.data?.agent?.name ?? "",
    agentAvatarUrl: payload.data?.agent?.avatar_url ?? undefined,
    taskTitle: payload.data?.task?.title ?? "",
    projectName: payload.data?.task?.project?.name ?? undefined,
    taskAddress: payload.data?.task?.address ?? payload.data?.task?.location ?? undefined,
    status: taskStatus,
    lastPosition: hasCoords ? [lng!, lat!] : [0, 0],
    polyline: [],
    trackingStartedAt: payload.occurred_at,
    lastEventAt: payload.occurred_at,
    ...(hasDestination
      ? {
        destination: {
          lat: destinationLat!,
          lng: destinationLng!,
          radiusM: payload.data?.destination?.radius_meters,
        },
      }
      : {}),
  };

  return {
    ...base,
    trackingSessionId: payload.tracking_session_id,
    userId: payload.user_id,
    agentName: payload.data?.agent?.name ?? base.agentName,
    agentAvatarUrl: payload.data?.agent?.avatar_url ?? base.agentAvatarUrl,
    taskTitle: payload.data?.task?.title ?? base.taskTitle,
    projectName: payload.data?.task?.project?.name ?? base.projectName,
    taskAddress:
      payload.data?.task?.address ?? payload.data?.task?.location ?? base.taskAddress,
    status: taskStatus,
    trackingStartedAt:
      prev?.trackingStartedAt ??
      (envelope.type === "tracking.task.started" ? payload.occurred_at : base.trackingStartedAt),
    lastEventAt: payload.occurred_at,
    ...(hasDestination
      ? {
        destination: {
          lat: destinationLat!,
          lng: destinationLng!,
          radiusM: payload.data?.destination?.radius_meters,
        },
      }
      : {}),
    ...(hasCoords && { lastPosition: [lng!, lat!] }),
    distanceToDestinationMeters:
      payload.data?.distance_to_destination_meters ??
      prev?.distanceToDestinationMeters ??
      null,
    distanceRemainingMeters:
      payload.data?.distance_remaining_meters ??
      prev?.distanceRemainingMeters ??
      null,
    speedMps:
      payload.data?.location?.speed_mps ??
      payload.data?.speed_mps ??
      prev?.speedMps ??
      null,
    headingDegrees:
      payload.data?.location?.heading_degrees ??
      payload.data?.heading_degrees ??
      prev?.headingDegrees ??
      null,
    etaSeconds: payload.data?.eta_seconds ?? prev?.etaSeconds ?? null,
    routeDeviationMeters:
      payload.data?.route_deviation_meters ??
      payload.data?.location?.route_deviation_meters ??
      prev?.routeDeviationMeters ??
      null,
    operationalStatus:
      payload.data?.status?.operational_status ??
      payload.data?.operational_status ??
      prev?.operationalStatus,
    isOnline:
      payload.data?.status?.is_online ??
      payload.data?.is_online ??
      prev?.isOnline,
    movementStarted: payload.data?.movement_started ?? prev?.movementStarted,
    nearDetectedAt:
      payload.data?.near_recorded_at ??
      (envelope.type === "tracking.task.near_destination" ? payload.occurred_at : prev?.nearDetectedAt),
    ...(payload.data?.arrived && !base.arrivedAt
      ? { arrivedAt: payload.occurred_at }
      : {}),
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
    const lat = payload.data?.location?.latitude ?? payload.data?.latitude;
    const lng = payload.data?.location?.longitude ?? payload.data?.longitude;
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

      if (
        type === "tracking.location.updated" ||
        type === "tracking.agent.location.updated"
      ) {
        const polyline = prev?.polyline ?? [];
        const isDuplicateByTimestamp = prev?.lastEventAt === payload.occurred_at;
        const lastPoint = polyline[polyline.length - 1];
        const isDuplicateByPoint =
          !!lastPoint && hasCoords && lastPoint[0] === lng && lastPoint[1] === lat;
        const shouldAppend = hasCoords && !(isDuplicateByTimestamp && isDuplicateByPoint);
        const newPolyline: [number, number][] = hasCoords
          ? shouldAppend
            ? ([...polyline, [lng!, lat!] as [number, number]] as [number, number][]).slice(
              -MAX_POLYLINE_PTS
            )
            : polyline
          : polyline;

        const arrivedNow = !!payload.data?.arrived;
        const nearNow = !!payload.data?.near_destination && !arrivedNow;
        return {
          liveTasks: {
            ...s.liveTasks,
            [taskId]: {
              ...updated,
              polyline: newPolyline,
              status: arrivedNow
                ? "arrived"
                : nearNow
                  ? "near_destination"
                  : updated.status,
              ...(nearNow && !prev?.nearDetectedAt
                ? { nearDetectedAt: payload.data?.near_recorded_at ?? payload.occurred_at }
                : {}),
              ...(arrivedNow && !prev?.arrivedAt
                ? { arrivedAt: payload.occurred_at }
                : {}),
            },
          },
        };
      }

      if (type === "tracking.task.near_destination") {
        return {
          liveTasks: {
            ...s.liveTasks,
            [taskId]: {
              ...updated,
              status: "near_destination",
              nearDetectedAt: payload.data?.near_recorded_at ?? payload.occurred_at,
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

      if (type === "tracking.task.reassigned") {
        const toUserId = payload.data?.to_user_id;
        const fromUserId = payload.data?.from_user_id;
        const agentChanged =
          typeof toUserId === "number" &&
          toUserId > 0 &&
          prev?.userId !== toUserId;

        return {
          liveTasks: {
            ...s.liveTasks,
            [taskId]: {
              ...updated,
              userId: typeof toUserId === "number" && toUserId > 0 ? toUserId : updated.userId,
              ...(agentChanged
                ? {
                  agentName: prev?.userId === fromUserId ? "" : updated.agentName,
                  agentAvatarUrl: undefined,
                  polyline: [],
                }
                : {}),
              lastEventAt: payload.occurred_at,
            },
          },
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
        userId: task.assignee?.id ?? prev?.userId ?? 0,
        agentName: task.assignee?.name ?? prev?.agentName ?? "",
        agentAvatarUrl: task.assignee?.avatar_url ?? prev?.agentAvatarUrl,
        taskTitle: task.title,
        projectName: task.project?.name ?? prev?.projectName,
        taskAddress: task.address ?? task.location,
        status:
          route.status === "completed"
            ? "completed"
            : route.arrival
              ? "arrived"
              : route.near || route.proximity?.state === "near_destination"
                ? "near_destination"
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
        trackingStartedAt:
          prev?.trackingStartedAt ?? route.start?.recorded_at ?? route.arrival?.recorded_at,
        lastEventAt:
          route.end?.recorded_at ??
          route.arrival?.recorded_at ??
          route.near?.recorded_at ??
          route.start?.recorded_at ??
          new Date().toISOString(),
        nearDetectedAt: route.near?.recorded_at ?? prev?.nearDetectedAt,
        arrivedAt: route.arrival?.recorded_at,
        distanceToDestinationMeters:
          route.proximity?.distance_to_destination_meters ??
          prev?.distanceToDestinationMeters ??
          null,
        distanceRemainingMeters:
          route.proximity?.distance_remaining_meters ??
          prev?.distanceRemainingMeters ??
          null,
        movementStarted: prev?.movementStarted,
        speedMps: route.proximity?.speed_mps ?? prev?.speedMps ?? null,
        etaSeconds: route.proximity?.eta_seconds ?? prev?.etaSeconds ?? null,
        routeDeviationMeters:
          route.proximity?.route_deviation_meters ?? prev?.routeDeviationMeters ?? null,
        operationalStatus:
          route.proximity?.operational_status ?? prev?.operationalStatus,
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

  hydrateFromSnapshots(items) {
    set((s) => {
      const merged = { ...s.liveTasks };

      for (const item of items) {
        const taskId = item.task.id;
        if (!taskId) continue;

        const prev = merged[taskId];
        const lastPosition: [number, number] = [
          item.location.longitude,
          item.location.latitude,
        ];

        merged[taskId] = {
          taskId,
          trackingSessionId:
            item.task.tracking_session_id ?? prev?.trackingSessionId ?? 0,
          userId: item.agent.id,
          agentName: item.agent.name ?? prev?.agentName ?? `Agent #${item.agent.id}`,
          agentAvatarUrl: item.agent.avatar_url ?? prev?.agentAvatarUrl,
          taskTitle: item.task.title ?? prev?.taskTitle ?? `Task #${taskId}`,
          projectName: prev?.projectName,
          taskAddress: item.task.address ?? item.task.location ?? prev?.taskAddress,
          status:
            normalizeProximityState(item.status.proximity_state) ??
            normalizeLiveStatus(item.task.status) ??
            prev?.status ??
            "in_progress",
          destination:
            typeof item.task.destination_latitude === "number" &&
              typeof item.task.destination_longitude === "number"
              ? {
                lat: item.task.destination_latitude,
                lng: item.task.destination_longitude,
              }
              : prev?.destination,
          lastPosition,
          polyline:
            prev?.polyline && prev.polyline.length > 0 ? prev.polyline : [lastPosition],
          trackingStartedAt:
            prev?.trackingStartedAt ??
            item.location.recorded_at ??
            item.status.last_seen_at ??
            item.updated_at ??
            undefined,
          lastEventAt:
            item.location.recorded_at ??
            item.status.last_seen_at ??
            item.updated_at ??
            prev?.lastEventAt ??
            new Date().toISOString(),
          nearDetectedAt:
            item.status.proximity_state === "near_destination" && !item.location.arrived
              ? prev?.nearDetectedAt ?? item.location.recorded_at ?? item.updated_at ?? undefined
              : prev?.nearDetectedAt,
          arrivedAt:
            item.location.arrived || normalizeLiveStatus(item.task.status) === "arrived"
              ? prev?.arrivedAt ?? item.location.recorded_at ?? item.updated_at ?? undefined
              : prev?.arrivedAt,
          distanceToDestinationMeters:
            item.location.distance_to_destination_meters ??
            prev?.distanceToDestinationMeters ??
            null,
          distanceRemainingMeters:
            item.location.distance_remaining_meters ??
            prev?.distanceRemainingMeters ??
            null,
          speedMps: item.location.speed_mps ?? prev?.speedMps ?? null,
          headingDegrees: item.location.heading_degrees ?? prev?.headingDegrees ?? null,
          etaSeconds: item.location.eta_seconds ?? prev?.etaSeconds ?? null,
          routeDeviationMeters:
            item.location.route_deviation_meters ?? prev?.routeDeviationMeters ?? null,
          operationalStatus:
            item.status.operational_status ?? prev?.operationalStatus,
          isOnline: item.status.is_online ?? prev?.isOnline,
          movementStarted:
            item.status.operational_status === "en_route" ||
            item.status.proximity_state === "in_progress" ||
            prev?.movementStarted,
        };
      }

      return { liveTasks: merged };
    });
  },

  seedFromTaskStart(params) {
    set((s) => {
      const prev = s.liveTasks[params.taskId];
      const occurredAt = params.occurredAt ?? new Date().toISOString();
      const lastPosition = params.position ?? prev?.lastPosition ?? [0, 0];
      const agentChanged = !!prev && prev.userId !== params.userId;

      return {
        liveTasks: {
          ...s.liveTasks,
          [params.taskId]: {
            taskId: params.taskId,
            trackingSessionId: params.trackingSessionId,
            userId: params.userId,
            agentName: params.agentName ?? prev?.agentName ?? "",
            agentAvatarUrl: mergeAgentAvatarUrl(params, prev),
            taskTitle: params.taskTitle ?? prev?.taskTitle ?? `Task #${params.taskId}`,
            projectName: prev?.projectName,
            taskAddress: params.taskAddress ?? prev?.taskAddress,
            status:
              prev?.status === "completed"
                ? "in_progress"
                : prev?.status ?? "in_progress",
            destination: params.destination ?? prev?.destination,
            lastPosition,
            polyline: agentChanged
              ? [lastPosition]
              : prev?.polyline && prev.polyline.length > 0
                ? prev.polyline
                : [lastPosition],
            trackingStartedAt: prev?.trackingStartedAt ?? occurredAt,
            lastEventAt: occurredAt,
            isOnline: true,
            movementStarted: true,
            operationalStatus: prev?.operationalStatus ?? "en_route",
            arrivedAt: agentChanged ? undefined : prev?.arrivedAt,
          },
        },
      };
    });
  },

  appendPolylinePoint(taskId, point) {
    set((s) => {
      const prev = s.liveTasks[taskId];
      if (!prev) return s;
      const last = prev.polyline[prev.polyline.length - 1];
      const isDuplicate = !!last && last[0] === point[0] && last[1] === point[1];
      const polyline = isDuplicate
        ? prev.polyline
        : [...prev.polyline, point].slice(-MAX_POLYLINE_PTS);
      return {
        liveTasks: {
          ...s.liveTasks,
          [taskId]: {
            ...prev,
            polyline,
            lastPosition: point,
            // Keep staleness detection happy while WS echo is in flight.
            lastEventAt: new Date().toISOString(),
          },
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
