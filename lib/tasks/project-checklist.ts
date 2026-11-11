import type { ApiTaskStatus, TaskApiItem, TaskSubtaskApiItem } from "@/lib/api/tasks";

export type ProjectSubtask = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  dueAt: string | null;
  isCompleted: boolean;
  completedAt: string | null;
};

export type ProjectChecklist = {
  creatorId: string;
  assigneeId: string;
  assigneeName: string;
  dueAt: string | null;
  subtasks: ProjectSubtask[];
  initialComments?: string[];
  isMock?: boolean;
};

export function checklistStatus(status: ApiTaskStatus, subtasks: ProjectSubtask[]): ApiTaskStatus {
  if (status === "cancelled" || !subtasks.length) return status;
  if (subtasks.every((item) => item.isCompleted)) return "completed";
  if (status === "completed" || (status === "pending" && subtasks.some((item) => item.isCompleted))) return "in_progress";
  return status;
}

export function toLocalChecklistDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function formatChecklistDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function isOverdue(value: string | null | undefined) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

export function mapApiSubtask(subtask: TaskSubtaskApiItem, fallbackAssigneeName = "Unassigned"): ProjectSubtask {
  return {
    id: String(subtask.id),
    title: subtask.title,
    assigneeId: subtask.assignee ? String(subtask.assignee.id) : "",
    assigneeName: subtask.assignee?.name ?? fallbackAssigneeName,
    dueAt: subtask.due_at ?? null,
    isCompleted: Boolean(subtask.is_completed),
    completedAt: subtask.completed_at ?? null,
  };
}

export function checklistFromTask(
  task: TaskApiItem,
  fallbackUserId = "",
  fallbackUserName = "Unassigned",
): ProjectChecklist {
  const assigneeId = String(
    task.assigned_agent_id ?? task.assignee?.id ?? task.assigned_users?.[0]?.id ?? fallbackUserId,
  );
  const assigneeName =
    task.assignee?.name ?? task.assigned_users?.[0]?.name ?? (assigneeId ? fallbackUserName : "Unassigned");

  return {
    creatorId: String(task.created_by_user_id ?? task.creator?.id ?? fallbackUserId),
    assigneeId,
    assigneeName,
    dueAt: task.due_date ?? null,
    subtasks: (task.subtasks ?? []).map((item) => mapApiSubtask(item, assigneeName)),
  };
}
