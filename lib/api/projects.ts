"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type TaskSummary = {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  completed_percentage: number;
  pending_percentage: number;
};

export type ApiProjectStatus = "active" | "planning" | "completed";
export type ApiProjectPriority = "high" | "medium" | "low";
export type ApiProjectType = "sales" | "inspection" | "deployment";

export type ProjectApiItem = {
  id: number;
  name: string;
  status: ApiProjectStatus;
  priority: ApiProjectPriority | null;
  description?: string;
  start_date?: string;
  end_date?: string | null;
  duration_days?: number | null;
  territory_zone?: string | null;
  type?: ApiProjectType | null;
  task_summary: TaskSummary;
};

export type ProjectApiDetail = ProjectApiItem & {
  company_id: number | string;
  project_manager_user_id: number;
  notes?: string | null;
  attachments?: Array<{
    id: number;
    original_name: string;
    mime_type: string;
  }>;
};

export type ListProjectsParams = {
  company_id?: number | string;
  status?: ApiProjectStatus;
  search?: string;
  page?: number;
};

export type CreateProjectPayload = {
  company_id: number | string;
  name: string;
  description?: string;
  type?: ApiProjectType | null;
  status: ApiProjectStatus;
  priority?: ApiProjectPriority | null;
  start_date: string;
  end_date?: string | null;
  project_manager_user_id: number;
  assigned_team?: number[];
  territory_zone?: string | null;
  notes?: string | null;
};

export type UpdateProjectPayload = Partial<
  Omit<CreateProjectPayload, "company_id">
>;

export type ProjectsListData = {
  items: ProjectApiItem[];
  pagination: {
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
  };
};

export type ProjectDetailData = {
  project: ProjectApiDetail;
};

export function listProjects(
  params: ListProjectsParams,
  token: string
): Promise<ApiEnvelope<ProjectsListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<ProjectsListData>({
    method: "GET",
    path: `/projects${query}`,
    token,
  });
}

export function getProject(
  id: number | string,
  token: string
): Promise<ApiEnvelope<ProjectDetailData>> {
  return apiRequest<ProjectDetailData>({
    method: "GET",
    path: `/projects/${id}`,
    token,
  });
}

export function createProject(
  payload: CreateProjectPayload,
  token: string
): Promise<ApiEnvelope<ProjectDetailData>> {
  return apiRequest<ProjectDetailData>({
    method: "POST",
    path: "/projects",
    body: payload,
    token,
  });
}

export function updateProject(
  id: number | string,
  payload: UpdateProjectPayload,
  token: string
): Promise<ApiEnvelope<ProjectDetailData>> {
  return apiRequest<ProjectDetailData>({
    method: "PATCH",
    path: `/projects/${id}`,
    body: payload,
    token,
  });
}
