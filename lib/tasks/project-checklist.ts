import type { ApiTaskStatus, TaskApiItem } from "@/lib/api/tasks";

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

const USE_MOCK_SUBTASKS = true;

export function mockProjectTasks(companyId: number | string, userId: string, userName: string, assignedView = false) {
  if (!USE_MOCK_SUBTASKS || !userId) return [];
  const now = Date.now();
  const date = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const examples: { title: string; status: ApiTaskStatus; due: number | null; steps: string[]; done: number; comments: string[] }[] = [
    {
      title: "Demo · Prepare account handoff",
      status: "pending",
      due: 5,
      steps: ["Review the account notes", "Draft the handoff summary", "Confirm next steps", "Share the handoff"],
      done: 0,
      comments: [
        "Make sure the client contact sheet is attached before sharing.",
        "Handoff template has been updated in the shared drive.",
      ],
    },
    {
      title: "Demo · Review site visit",
      status: "in_progress",
      due: -1,
      steps: ["Collect visit notes", "Review action items", "Send the visit summary"],
      done: 1,
      comments: [
        "Site photos from the morning inspection are ready.",
        "Waiting on supervisor sign-off for action item #2.",
        "Will send the summary right after review.",
      ],
    },
    {
      title: "Demo · Verify project contacts",
      status: "completed",
      due: 1,
      steps: ["Confirm contact details", "Update project contacts"],
      done: 2,
      comments: [
        "All stakeholder phone numbers and emails verified.",
      ],
    },
    {
      title: "Demo · Reschedule supplier visit",
      status: "cancelled",
      due: 2,
      steps: ["Confirm supplier availability"],
      done: 0,
      comments: [
        "Supplier requested to move this to next month.",
      ],
    },
    {
      title: "Demo · Review project brief",
      status: "pending",
      due: null,
      steps: [],
      done: 0,
      comments: [],
    },
  ];

  return examples.map((example, index) => {
    const id = -(index + 1);
    const creatorId = assignedView ? "-100" : userId;
    const creatorName = assignedView ? "Demo Supervisor" : userName;
    const task: TaskApiItem = {
      id, company_id: companyId, created_by_user_id: creatorId, assigned_agent_id: userId,
      title: example.title, status: example.status, created_at: date(-4),
      assigned_users: [{ id: Number(userId), name: userName }],
      creator: { id: Number(creatorId), name: creatorName, email: "" },
    };
    const checklist: ProjectChecklist = {
      creatorId, assigneeId: userId, assigneeName: userName, isMock: true,
      dueAt: example.due === null ? null : date(example.due),
      initialComments: example.comments,
      subtasks: example.steps.map((title, position) => ({
        id: `demo-${id}-${position}`, title, assigneeId: userId, assigneeName: userName,
        dueAt: example.due === null ? null : date(example.due - 1),
        isCompleted: position < example.done, completedAt: position < example.done ? date(-2) : null,
      })),
    };
    return { task, checklist };
  });
}
