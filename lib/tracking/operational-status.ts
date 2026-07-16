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
  // Freshness is decided by the client's own clock against the event time,
  // which is internally consistent. The backend `operational_status` "offline"
  // (and `is_online`) are derived from server-vs-device time and misfire under
  // clock skew — a live, actively-reporting agent then shows as offline. So we
  // only declare "offline" when the client itself sees the task as stale.
  const lastSeenAge =
    typeof task.lastReceivedAt === "number" && task.lastReceivedAt > 0
      ? nowMs - task.lastReceivedAt
      : nowMs - new Date(task.lastEventAt).getTime();
  const clientStale = Number.isFinite(lastSeenAge) && lastSeenAge > staleMs;

  if (clientStale) {
    return "offline";
  }

  // Completed always wins over a stale destination_reached operational flag.
  if (task.status === "completed") {
    return "completed";
  }

  // Trust real, non-clock backend statuses when present.
  if (task.operationalStatus && task.operationalStatus !== "offline") {
    return task.operationalStatus;
  }

  if (task.status === "arrived") {
    return "destination_reached";
  }

  if (task.status === "near_destination") {
    return "near_destination";
  }

  // Fresh and actively tracking → online. Represent as en route (the online
  // indicator) rather than the skew-derived offline flag.
  return "en_route";
}
