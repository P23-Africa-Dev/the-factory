import type { DndItem } from "@/types/operations";

export type StatusMoveBlocker = {
  id: string;
  label: string;
};

/**
 * Incomplete work that should be acknowledged before a drag-to-Completed sticks.
 * Confirming the move marks these checklist items done server-side.
 */
export function getTaskCompletionBlockers(item: DndItem | undefined | null): StatusMoveBlocker[] {
  if (!item) return [];
  const subtasks = item.projectChecklist?.subtasks ?? [];
  return subtasks
    .filter((subtask) => !subtask.isCompleted)
    .map((subtask) => ({
      id: subtask.id,
      label: subtask.title.trim() || "Untitled subtask",
    }));
}

export function completionBlockerLabels(item: DndItem | undefined | null): string[] {
  return getTaskCompletionBlockers(item).map((blocker) => blocker.label);
}
