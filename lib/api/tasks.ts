import { apiRequest, ApiEnvelope } from "./onboarding";

export type ApiTaskStatus = "pending" | "in_progress" | "completed";
export type ApiTaskPriority = "high" | "medium" | "low";

export type TaskApiItem = {
  id: number;
  company_id: number | string;
  project_id?: number | string | null;
  assigned_agent_id: number | string;
  created_by_user_id?: number | string;
  title: string;
  type?: string;
  description?: string;
  status: ApiTaskStatus;
  location?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  due_date?: string;
  required_actions?: string[];
  priority?: ApiTaskPriority;
  minimum_photos_required?: number;
  visit_verification_required?: boolean;
};

export type ListTasksParams = {
  company_id?: number | string;
  project_id?: number | string;
  status?: ApiTaskStatus;
  page?: number;
};

export type PaginationData = {
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  current_page?: number;
  total?: number;
  last_page?: number;
};

export type TasksListData = {
  items: TaskApiItem[];
  pagination: PaginationData;
};

export type CreateTaskPayload = {
  company_id: number | string;
  project_id?: number | string | null;
  title: string;
  type: string;
  description: string;
  assigned_agent_id: number | string;
  location: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  due_date: string;
  required_actions?: string[];
  priority: ApiTaskPriority;
  minimum_photos_required?: number;
  visit_verification_required?: boolean;
};

export type TaskDetailData = {
  task: TaskApiItem;
};

export function listTasks(
  params: ListTasksParams,
  token: string
): Promise<ApiEnvelope<TasksListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.project_id != null) qs.set("project_id", String(params.project_id));
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<TasksListData>({
    method: "GET",
    path: `/tasks${query}`,
    token,
  });
}

export function createTask(
  payload: CreateTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "POST",
    path: "/tasks",
    body: payload,
    token,
  });
}
