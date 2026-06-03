import type { LiveTaskState, OperationalTrackingStatus } from "@/types/tracking";

export const OPERATIONAL_STATUS_META: Record<
  OperationalTrackingStatus,
  {
    label: string;
    badgeClassName: string;
    dotColor: string;
  }
> = {
  available: {
    label: "Available",
    badgeClassName: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dotColor: "#16A34A",
  },
  en_route: {
    label: "En Route",
    badgeClassName: "bg-sky-50 text-sky-700 border border-sky-200",
    dotColor: "#0284C7",
  },
  near_destination: {
    label: "Near Destination",
    badgeClassName: "bg-amber-50 text-amber-700 border border-amber-200",
    dotColor: "#D97706",
  },
  delayed: {
    label: "Delayed",
    badgeClassName: "bg-rose-50 text-rose-700 border border-rose-200",
    dotColor: "#DC2626",
  },
  offline: {
    label: "Offline",
    badgeClassName: "bg-slate-100 text-slate-600 border border-slate-200",
    dotColor: "#6B7280",
  },
  destination_reached: {
    label: "Destination Reached",
    badgeClassName: "bg-violet-50 text-violet-700 border border-violet-200",
    dotColor: "#7C3AED",
  },
  completed: {
    label: "Completed",
    badgeClassName: "bg-slate-200 text-slate-700 border border-slate-300",
    dotColor: "#334155",
  },
};

export function resolveOperationalStatusFromTask(
  task: LiveTaskState,
  nowMs: number,
  staleMs: number,
): OperationalTrackingStatus {
  if (task.operationalStatus) {
    return task.operationalStatus;
  }

  const lastSeenAge = nowMs - new Date(task.lastEventAt).getTime();
  if (Number.isFinite(lastSeenAge) && lastSeenAge > staleMs) {
    return "offline";
  }

  if (task.status === "completed") {
    return "completed";
  }

  if (task.status === "arrived") {
    return "destination_reached";
  }

  if (task.status === "near_destination") {
    return "near_destination";
  }

  if (task.etaSeconds != null && task.etaSeconds >= 1800) {
    return "delayed";
  }

  if (task.movementStarted) {
    return "en_route";
  }

  return "available";
}
