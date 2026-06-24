import { apiRequest, ApiEnvelope } from "./onboarding";

export type KpiPriority = "low" | "medium" | "high" | "critical";
export type KpiMeasurementUnit = "count" | "currency" | "percentage" | "duration";
export type KpiCategory =
  | "sales"
  | "customer_visits"
  | "lead_generation"
  | "collection"
  | "survey"
  | "merchandising";

export type CreateKpiPayload = {
  company_id: number | string;
  name: string;
  category: KpiCategory;
  objective: string;
  target_value: string;
  start_date: string;
  end_date: string;
  assigned_to?: string;
  priority: KpiPriority;
  expected_outcome: string;
};

export type KpiItem = CreateKpiPayload & {
  id: number;
  created_at: string;
  updated_at: string;
};

export type KpiDetailData = { kpi: KpiItem };

export function createKpi(
  payload: CreateKpiPayload,
  token: string
): Promise<ApiEnvelope<KpiDetailData>> {
  return apiRequest<KpiDetailData>({
    method: "POST",
    path: "/kpis",
    body: payload,
    token,
  });
}
