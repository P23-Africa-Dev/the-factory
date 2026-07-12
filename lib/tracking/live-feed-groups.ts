import { resolveOperationalStatusFromTask } from "@/lib/tracking/operational-status";
import type { LiveTaskState } from "@/types/tracking";

/** Matches backend `tracking.agent_location_stale_after_seconds` default (300s). */
export const TRACKING_STALE_MS = 300_000;

export function hasUsableTaskPosition(task: LiveTaskState): boolean {
  return task.lastPosition[0] !== 0 || task.lastPosition[1] !== 0;
}

function isTaskStale(lastEventAt: string, nowMs: number, staleMs: number): boolean {
  if (!lastEventAt || !nowMs) return false;
  return nowMs - new Date(lastEventAt).getTime() > staleMs;
}

/**
 * Agent is actively on a live tracking session right now.
 * Uses open session + recent GPS + backend online flag when present.
 * Delayed agents still count as active while they are tracking.
 */
export function isActivelyOnTask(
  task: LiveTaskState,
  nowMs: number,
  staleMs: number = TRACKING_STALE_MS,
): boolean {
  if (!hasUsableTaskPosition(task)) return false;
  if (task.status === "completed") return false;
  if (task.trackingSessionId <= 0) return false;

  if (task.isOnline === false) return false;
  if (isTaskStale(task.lastEventAt, nowMs, staleMs)) return false;

  const operationalStatus = resolveOperationalStatusFromTask(task, nowMs, staleMs);
  return operationalStatus !== "offline" && operationalStatus !== "completed";
}

export function isHistoryFeedTask(
  task: LiveTaskState,
  nowMs: number,
  staleMs: number = TRACKING_STALE_MS,
): boolean {
  if (!hasUsableTaskPosition(task)) return false;
  if (isActivelyOnTask(task, nowMs, staleMs)) return false;
  return true;
}

function sortByLastEventDesc(a: LiveTaskState, b: LiveTaskState): number {
  return new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime();
}

export function splitLiveFeedTasks(
  tasks: LiveTaskState[],
  nowMs: number,
  staleMs: number = TRACKING_STALE_MS,
): { active: LiveTaskState[]; history: LiveTaskState[] } {
  const active: LiveTaskState[] = [];
  const history: LiveTaskState[] = [];

  for (const task of tasks) {
    if (!hasUsableTaskPosition(task)) continue;
    if (isActivelyOnTask(task, nowMs, staleMs)) {
      active.push(task);
    } else {
      history.push(task);
    }
  }

  active.sort(sortByLastEventDesc);
  history.sort(sortByLastEventDesc);

  return { active, history };
}

export function shouldShowTrajectory(
  taskId: number,
  selectedTaskId: number | null,
  followAllActive: boolean,
  activeTaskIds: ReadonlySet<number>,
): boolean {
  if (followAllActive) return activeTaskIds.has(taskId);
  return selectedTaskId != null && selectedTaskId === taskId;
}

export function resolveMapTasks(
  active: LiveTaskState[],
  history: LiveTaskState[],
  selectedTaskId: number | null,
): LiveTaskState[] {
  if (selectedTaskId == null) return active;

  const selectedHistory = history.find((task) => task.taskId === selectedTaskId);
  if (!selectedHistory) return active;
  if (active.some((task) => task.taskId === selectedTaskId)) return active;

  return [...active, selectedHistory];
}

export function resolveTrajectoryTaskIds(
  active: LiveTaskState[],
  selectedTaskId: number | null,
  followAllActive: boolean,
): Set<number> {
  if (followAllActive) {
    return new Set(active.map((task) => task.taskId));
  }
  if (selectedTaskId != null) {
    return new Set([selectedTaskId]);
  }
  return new Set();
}

export function taskMatchesSearch(task: LiveTaskState, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return (
    task.agentName.toLowerCase().includes(q) ||
    (task.taskTitle ?? "").toLowerCase().includes(q) ||
    (task.projectName ?? "").toLowerCase().includes(q) ||
    (task.taskAddress ?? "").toLowerCase().includes(q) ||
    String(task.taskId).includes(q)
  );
}
