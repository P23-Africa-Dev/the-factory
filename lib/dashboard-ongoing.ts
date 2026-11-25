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

export type BadgeAnchor = {
  /** CSS `left` of the badge inside the track: the bar's tip. */
  left: string;
  /** CSS `transform`: shift back by the same share of the badge's own width. */
  transform: string;
  /** CSS `left` of the pointer inside the badge, so it points at the tip. */
  pointerLeft: string;
};

/**
 * Places the avatar badge on the bar tip and keeps it fully inside the track for
 * any label width: at 0% its left edge meets the track's left edge, at 100% its
 * right edge meets the track's right edge, sliding smoothly in between.
 * (Centring it on a clamped point clipped long labels like "Donald · 95%".)
 */
export function badgeAnchor(progress: number): BadgeAnchor {
  const p = clampPercent(progress);
  // Keep the pointer off the badge's rounded ends.
  const pointer = Math.max(12, Math.min(88, p));
  return {
    left: `${p}%`,
    transform: `translateX(-${p}%)`,
    pointerLeft: `${pointer}%`,
  };
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
