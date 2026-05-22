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

export type PayrollOverview = {
  date: string;
  today_present_agents: number;
  today_payroll_value: number;
  payroll_rise: boolean;
  payroll_fall: boolean;
  total_commission: number;
  pending_approval: number;
  total_agents: number;
  total_payroll: number;
  currency: string;
};

export type PayrollAgentListItem = {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  assigned_zone: string | null;
  role: string;
  status: "Approved" | "Pending";
  base_salary: number;
  daily_pay: number;
  net_pay: number;
  attendance_days: number;
  currency: string;
  salary_type: "monthly" | "weekly" | string;
  attendance_affects_pay: boolean;
};

export type PayrollAgentListResponse = {
  items: PayrollAgentListItem[];
  pagination: {
    current_page: number;
    last_page: number;
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
    total: number;
  };
};

export type PayrollHistoryEntry = {
  id: number;
  month: string;
  period_year: number;
  period_month: number;
  base_salary: number;
  net_pay: number;
  due_date: string | null;
  status: "Pending" | "Approved";
};

export type PayrollAgentProfile = {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  assigned_zone: string | null;
  role: string;
  salary_type: string;
  base_salary: number;
  daily_pay: number;
  work_days: number;
  work_hours: number;
  attendance_affects_pay: boolean;
  commission_enabled: boolean;
  currency: string;
  attendance_days: number;
  salary_payable: number;
  history: PayrollHistoryEntry[];
};

export type UpdateAgentPayrollPayload = {
  company_id: number | string;
  base_salary?: number;
  salary_type?: "monthly" | "weekly";
  attendance_affects_pay?: boolean;
  work_days_override?: number | null;
};

export type PayrollAgentListParams = {
  company_id?: number | string;
  search?: string;
  status?: "approved" | "pending";
  year?: number;
  month?: number;
  per_page?: number;
  page?: number;
};

export type PayrollOverviewParams = {
  company_id?: number | string;
  date?: string;
};

export type PayrollAgentProfileParams = {
  company_id?: number | string;
  year?: number;
  month?: number;
};

export function mapPayrollAgentToUi(agent: PayrollAgentListItem) {
  return {
    id: String(agent.id),
    name: agent.name,
    address: agent.email,
    lga: agent.assigned_zone ?? "Unassigned",
    avatar: agent.avatar_url ?? "/avatars/male-avatar.png",
    baseSalary: formatMoney(agent.base_salary, agent.currency),
    netPay: formatMoney(agent.net_pay, agent.currency),
    role: agent.role,
    status: agent.status,
    email: agent.email,
    currency: agent.currency,
    salaryType: agent.salary_type,
    dailyPay: formatMoney(agent.daily_pay, agent.currency),
    attendanceDays: agent.attendance_days,
    attendanceAffectsPay: agent.attendance_affects_pay,
    workDays: agent.attendance_days,
    workHours: 0,
  };
}

export function mapPayrollProfileToUi(profile: PayrollAgentProfile) {
  return {
    id: String(profile.id),
    name: profile.name,
    address: profile.email,
    lga: profile.assigned_zone ?? "Unassigned",
    avatar: profile.avatar_url ?? "/avatars/male-avatar.png",
    baseSalary: formatMoney(profile.base_salary, profile.currency),
    netPay: formatMoney(profile.salary_payable, profile.currency),
    role: profile.role,
    status: "Approved" as const,
    email: profile.email,
    currency: profile.currency,
    salaryType: profile.salary_type,
    dailyPay: formatMoney(profile.daily_pay, profile.currency),
    attendanceDays: profile.attendance_days,
    attendanceAffectsPay: profile.attendance_affects_pay,
    workDays: profile.work_days,
    workHours: profile.work_hours,
  };
}

function formatMoney(amount: number, currency: string) {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (currency === "NGN") return `₦${formatted}`;
  if (currency === "USD") return `$${formatted}`;

  return `${formatted} ${currency}`;
}

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

export function getPayrollOverview(
  params: PayrollOverviewParams,
  token: string
): Promise<ApiEnvelope<PayrollOverview>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return apiRequest<PayrollOverview>({
    method: "GET",
    path: `/payroll/overview${query.toString() ? `?${query.toString()}` : ""}`,
    token,
  });
}

export function getPayrollAgents(
  params: PayrollAgentListParams,
  token: string
): Promise<ApiEnvelope<PayrollAgentListResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return apiRequest<PayrollAgentListResponse>({
    method: "GET",
    path: `/payroll/agents${query.toString() ? `?${query.toString()}` : ""}`,
    token,
  });
}

export function getPayrollAgentProfile(
  userId: number | string,
  params: PayrollAgentProfileParams,
  token: string
): Promise<ApiEnvelope<PayrollAgentProfile>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return apiRequest<PayrollAgentProfile>({
    method: "GET",
    path: `/payroll/agents/${userId}${query.toString() ? `?${query.toString()}` : ""}`,
    token,
  });
}

export function updatePayrollAgent(
  userId: number | string,
  payload: UpdateAgentPayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollAgentProfile>> {
  return apiRequest<PayrollAgentProfile>({
    method: "PATCH",
    path: `/payroll/agents/${userId}`,
    body: payload,
    token,
  });
}
