"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type PayrollSettings = {
  id: number;
  company_id: number | string;
  salary_type: "monthly" | "weekly";
  base_salary: number;
  currency: string;
  work_days: number;
  work_hours: number;
  daily_pay: number;
  attendance_affects_pay: boolean;
  commission_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PayrollData = {
  payroll: PayrollSettings | null;
};

export type CreatePayrollPayload = {
  company_id: number | string;
  salary_type: "monthly" | "weekly";
  base_salary: number;
  work_days: number;
  work_hours: number;
  currency?: string;
  attendance_affects_pay?: boolean;
  commission_enabled?: boolean;
};

export type UpdatePayrollPayload = CreatePayrollPayload;

export function getPayroll(
  companyId: number | string,
  token: string
): Promise<ApiEnvelope<PayrollData>> {
  return apiRequest<PayrollData>({
    method: "GET",
    path: `/payroll?company_id=${companyId}`,
    token,
  });
}

export function createPayroll(
  payload: CreatePayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollData>> {
  return apiRequest<PayrollData>({
    method: "POST",
    path: "/payroll",
    body: payload,
    token,
  });
}

export function updatePayroll(
  id: number,
  payload: UpdatePayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollData>> {
  return apiRequest<PayrollData>({
    method: "PUT",
    path: `/payroll/${id}`,
    body: payload,
    token,
  });
}
