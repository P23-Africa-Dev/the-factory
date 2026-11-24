import type {
  OngoingAgent,
  OngoingProgressSource,
  OngoingTask,
  OngoingTaskAgent,
  OngoingTaskState,
} from "@/lib/api/dashboard";

/** How long each ongoing-task slide stays on screen before rotating. */
export const ONGOING_ROTATE_MS = 6000;

export type OngoingSlide = {
  key: string;
  agent: OngoingTaskAgent;
  /** 0-100, already clamped and rounded. */
  progress: number;
  /** e.g. "3 tasks · Visit Ikeja site" */
  caption: string;
  state: OngoingTaskState;
  source: OngoingProgressSource;
};

export function clampPercent(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)));
}

export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed.split(/\s+/)[0] || "Agent";
}

/**
 * Managers: one slide per agent (average of their ongoing tasks).
 * Agents: one slide per own ongoing task.
 */
export function buildOngoingSlides(
  agents: OngoingAgent[] | undefined | null,
  isAgentView: boolean,
): OngoingSlide[] {
  const list = agents ?? [];

  if (isAgentView) {
    return list.flatMap((entry) =>
      entry.tasks.map((task) => ({
        key: `task-${task.id}`,
        agent: entry.agent,
        progress: clampPercent(task.progress_percent),
        caption: task.title,
        state: task.state,
        source: task.progress_source,
      })),
    );
  }

  return list.map((entry) => ({
    key: `agent-${entry.agent.id ?? entry.agent.name}`,
    agent: entry.agent,
    progress: clampPercent(entry.progress_percent),
    caption: `${entry.task_count} ${entry.task_count === 1 ? "task" : "tasks"} · ${entry.current_task.title}`,
    state: entry.current_task.state,
    source: entry.current_task.progress_source,
  }));
}

/** Older APIs only send `ongoing_tasks`: one slide per task. */
export function buildLegacyOngoingSlides(tasks: OngoingTask[] | undefined | null): OngoingSlide[] {
  return (tasks ?? []).map((task) => ({
    key: `task-${task.task_id}`,
    agent: task.agent,
    progress: clampPercent(task.progress_percent),
    caption: task.task_title,
    state:
      task.state ??
      (task.tracking_state === "arrived" || task.tracking_state === "near_destination"
        ? task.tracking_state
        : "active"),
    source: task.progress_source ?? "travel",
  }));
}

/**
 * Horizontal position (in % of the track) for the avatar badge on the bar tip,
 * kept inside the track so it never falls off at 0% or 100%.
 */
export function badgePositionPercent(progress: number, min = 8, max = 88): number {
  return Math.max(min, Math.min(max, clampPercent(progress)));
}

export const ONGOING_STATE_LABEL: Record<OngoingTaskState, string> = {
  active: "Active",
  paused: "Paused",
  near_destination: "Near destination",
  arrived: "Arrived",
};

export const ONGOING_SOURCE_LABEL: Record<OngoingProgressSource, string> = {
  checklist: "via checklist",
  travel: "via travel",
  schedule: "via schedule",
  started: "just started",
};
