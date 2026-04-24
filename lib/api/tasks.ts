import { apiRequest, ApiEnvelope } from "./onboarding";

export type ApiTaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type ApiTaskPriority = "high" | "medium" | "low";

export type TaskProof = {
  id: number;
  uploaded_by_user_id: number;
  file_url: string | null;
  mime_type: string;
  latitude?: number | null;
  longitude?: number | null;
  captured_at?: string | null;
  notes?: string | null;
};

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
  started_at?: string | null;
  completed_at?: string | null;
  project?: {
    id: number;
    company_id: number;
    name: string;
    status: string;
    priority: string;
  } | null;
  creator?: { id: number; name: string; email: string } | null;
  assignee?: { id: number; name: string; email: string } | null;
  proofs?: TaskProof[];
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

export function getTask(
  taskId: number | string,
  companyId: number | string,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "GET",
    path: `/tasks/${taskId}?company_id=${companyId}`,
    token,
  });
}

export type UpdateTaskStatusPayload = {
  company_id: number | string;
  status: ApiTaskStatus;
};

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

export type ReassignTaskPayload = {
  company_id: number | string;
  assigned_agent_id: number | string;
};

export function reassignTask(
  taskId: number | string,
  payload: ReassignTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "PATCH",
    path: `/tasks/${taskId}/assign`,
    body: payload,
    token,
  });
}

export type CreateSelfTaskPayload = {
  company_id: number | string;
  title: string;
  type: string;
  description: string;
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

export type UploadProofPayload = {
  company_id: number | string;
  file: File;
  latitude?: number;
  longitude?: number;
  captured_at?: string;
  notes?: string;
};

export async function uploadTaskProof(
  taskId: number | string,
  payload: UploadProofPayload,
  token: string
): Promise<ApiEnvelope<{ proof: TaskProof }>> {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

  const formData = new FormData();
  formData.append("company_id", String(payload.company_id));
  formData.append("file", payload.file);
  if (payload.latitude != null) formData.append("latitude", String(payload.latitude));
  if (payload.longitude != null) formData.append("longitude", String(payload.longitude));
  if (payload.captured_at) formData.append("captured_at", payload.captured_at);
  if (payload.notes) formData.append("notes", payload.notes);

  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/proofs`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;
  return body;
}

export async function downloadTaskProof(
  fileUrl: string,
  token: string
): Promise<Blob> {
  const response = await fetch(fileUrl, {
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Proof download failed");
  return response.blob();
}
