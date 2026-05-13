import { apiRequest, ApiEnvelope, ApiRequestError } from "./onboarding";

export type ApiTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type ApiTaskPriority = "high" | "medium" | "low";

export type TaskApiItem = {
  id: number;
  company_id: number | string;
  project_id?: number | string | null;
  assigned_agent_id: number | string | null;
  assigned_agent_ids?: Array<number | string>;
  assigned_users?: Array<{ id: number; name: string }>;
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
  project?: {
    id: number;
    name: string;
    status: string;
    priority: string | null;
  } | null;
  creator?: {
    id: number;
    name: string;
    email: string;
  };
  assignee?: {
    id: number;
    name: string;
    email: string;
  } | null;
  proofs?: Array<{
    id: number;
    uploaded_by_user_id: number;
    file_url: string | null;
    mime_type: string;
  }>;
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
  type?: string;
  description?: string;
  assigned_agent_id?: number | string;
  assigned_agent_ids?: Array<number | string>;
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

export type TaskDetailData = {
  task: TaskApiItem;
};

export type AssignTaskPayload = {
  company_id?: number | string;
  assigned_agent_id?: number | string;
  assigned_agent_ids?: Array<number | string>;
};

export type UpdateTaskStatusPayload = {
  company_id?: number | string;
  status: ApiTaskStatus;
};

export type CreateSelfTaskPayload = Omit<
  CreateTaskPayload,
  "project_id" | "assigned_agent_id" | "assigned_agent_ids"
>;

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

export function getTask(
  taskId: number | string,
  params: { company_id?: number | string },
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<TaskDetailData>({
    method: "GET",
    path: `/tasks/${taskId}${query}`,
    token,
  });
}

export function assignTask(
  taskId: number | string,
  payload: AssignTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "PATCH",
    path: `/tasks/${taskId}/assign`,
    body: payload,
    token,
  });
}

export function updateTaskStatus(
  taskId: number | string,
  payload: UpdateTaskStatusPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "PATCH",
    path: `/tasks/${taskId}/status`,
    body: payload,
    token,
  });
}

export function createSelfTask(
  payload: CreateSelfTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "POST",
    path: "/agent/tasks/self",
    body: payload,
    token,
  });
}

export async function uploadTaskProof(
  taskId: number | string,
  formData: FormData,
  token: string
): Promise<ApiEnvelope<{ proof: { id: number; file_url: string | null } }>> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";
  const response = await fetch(`${base}/tasks/${taskId}/proofs`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const body = (await response.json()) as ApiEnvelope<{
    proof: { id: number; file_url: string | null };
  }>;
  if (!response.ok || !body.success) {
    throw new ApiRequestError(body.message || "Request failed.", response.status, body.errors);
  }
  return body;
}

export async function downloadTaskProof(
  taskId: number | string,
  proofId: number | string,
  params: { company_id?: number | string },
  token: string
): Promise<Blob> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const response = await fetch(`${base}/tasks/${taskId}/proofs/${proofId}${query}`, {
    method: "GET",
    headers: {
      Accept: "*/*",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new ApiRequestError("Failed to download proof.", response.status);
  }

  return response.blob();
}
