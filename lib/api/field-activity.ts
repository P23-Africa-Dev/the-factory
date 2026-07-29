"use client";

import { apiRequest } from "./onboarding";

export type FieldActivitySettings = {
  enabled: boolean;
  company_id: number;
};

export type FieldActivityAnalytics = {
  from: string;
  to: string;
  totals: {
    active_sessions: number;
    distance_meters: number;
    travel_seconds: number;
    stationary_seconds: number;
    stop_count: number;
    visit_count: number;
    unknown_stop_count: number;
    personal_seconds: number;
    productive_visit_seconds: number;
    travel_efficiency: number | null;
    avg_distance_per_visit_meters: number | null;
  };
  agents: Array<{
    user_id: number;
    name: string | null;
    distance_meters: number;
    travel_seconds: number;
    visit_count: number;
    stop_count: number;
    unknown_stop_count: number;
    days: number;
  }>;
  heatmap_points: Array<{
    latitude: number;
    longitude: number;
    classification: string | null;
    duration_seconds: number;
    arrived_at?: string | null;
  }>;
};

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  const encoded = qs.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function getFieldActivitySettings(token: string, companyId?: number) {
  return apiRequest<FieldActivitySettings>({
    method: "GET",
    path: withQuery("/field-activity/settings", { company_id: companyId }),
    token,
  });
}

export function updateFieldActivitySettings(
  payload: { enabled: boolean; company_id?: number },
  token: string,
) {
  return apiRequest<FieldActivitySettings>({
    method: "PUT",
    path: "/field-activity/settings",
    body: payload,
    token,
  });
}

export function getFieldActivityAnalytics(
  params: { from?: string; to?: string; company_id?: number; user_id?: number },
  token: string,
) {
  return apiRequest<FieldActivityAnalytics>({
    method: "GET",
    path: withQuery("/field-activity/analytics", {
      from: params.from,
      to: params.to,
      company_id: params.company_id,
      user_id: params.user_id,
    }),
    token,
  });
}
