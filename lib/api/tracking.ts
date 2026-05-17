import {
  apiRequest,
  ApiEnvelope,
  ApiRequestError,
  API_BASE_URL,
} from "./onboarding";
import type { TaskApiItem } from "./tasks";
import type {
  StartTrackingPayload,
  RecordLocationPayload,
  RecordLocationResponse,
  TrackingSession,
  TaskRoute,
} from "@/types/tracking";

export type { TrackingSession, TaskRoute };

function normalizeBooleanQuery(value: unknown, fallback: boolean): "true" | "false" {
  if (typeof value === "boolean") return value ? "true" : "false";

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") {
    return fallback ? "true" : "false";
  }

  if (["1", "true", "yes", "on", "all"].includes(normalized)) return "true";
  if (["0", "false", "no", "off", "online"].includes(normalized)) return "false";

  return fallback ? "true" : "false";
}

// ─── Start tracking ────────────────────────────────────────────────────────

export interface StartTrackingResponse {
  task: TaskApiItem;
  tracking: TrackingSession;
  arrived: boolean;
}

export function startTaskTracking(
  taskId: number | string,
  payload: StartTrackingPayload,
  token: string
): Promise<ApiEnvelope<StartTrackingResponse>> {
  return apiRequest<StartTrackingResponse>({
    method: "POST",
    path: `/agent/tasks/${taskId}/start`,
    body: payload,
    token,
  });
}

// ─── Record location ───────────────────────────────────────────────────────

export interface RecordLocationApiResponse {
  task?: TaskApiItem;
  tracking?: TrackingSession;
  received_points: number;
  persisted_points: number;
  arrived: boolean;
}

export function recordTaskLocation(
  taskId: number | string,
  payload: RecordLocationPayload,
  token: string
): Promise<ApiEnvelope<RecordLocationApiResponse>> {
  return apiRequest<RecordLocationApiResponse>({
    method: "POST",
    path: `/agent/tasks/${taskId}/location`,
    body: payload,
    token,
  });
}

// ─── Complete task ─────────────────────────────────────────────────────────

export interface CompleteTrackingResponse {
  task: TaskApiItem;
  tracking: TrackingSession;
  proofs: Array<{ id: number; file_url: string | null; mime_type: string }>;
}

export async function completeTaskTracking(
  taskId: number | string,
  formData: FormData,
  token: string
): Promise<ApiEnvelope<CompleteTrackingResponse>> {
  const response = await fetch(
    `${API_BASE_URL}/agent/tasks/${taskId}/complete`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    }
  );

  const body = (await response.json()) as ApiEnvelope<CompleteTrackingResponse>;

  if (!response.ok || !body.success) {
    throw new ApiRequestError(
      body.message || "Request failed.",
      response.status,
      body.errors
    );
  }

  return body;
}

// ─── Get route ─────────────────────────────────────────────────────────────

export function getTaskRoute(
  taskId: number | string,
  params: {
    company_id: number | string;
    role?: "agent" | "management";
    include_points?: boolean | string | number | null;
    limit?: number;
  },
  token: string
): Promise<ApiEnvelope<TaskRoute>> {
  const { company_id, role = "agent", include_points = true, limit = 500 } =
    params;
  const prefix = role === "management" ? "admin" : "agent";
  const qs = new URLSearchParams({
    company_id: String(company_id),
    include_points: normalizeBooleanQuery(include_points, true),
    limit: String(limit),
  });

  return apiRequest<TaskRoute>({
    method: "GET",
    path: `/${prefix}/tasks/${taskId}/route?${qs.toString()}`,
    token,
  });
}

// ─── List agent tasks ──────────────────────────────────────────────────────

import type { TasksListData, ListTasksParams } from "./tasks";

export function listAgentTasks(
  params: ListTasksParams,
  token: string
): Promise<ApiEnvelope<TasksListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null)
    qs.set("company_id", String(params.company_id));
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));

  return apiRequest<TasksListData>({
    method: "GET",
    path: `/agent/tasks${qs.toString() ? `?${qs.toString()}` : ""}`,
    token,
  });
}
