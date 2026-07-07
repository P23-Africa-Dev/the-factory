"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type InternalUserRole = "admin" | "supervisor" | "agent";

export type CreateInternalUserPayload = {
  company_id: number | string;
  full_name: string;
  email: string;
  role: InternalUserRole;
  assigned_zone?: string;
  assigned_zone_ids?: number[];
  work_days: string[];
  base_salary: number;
  salary_type?: "daily" | "monthly" | "weekly";
  currency_code?: string;
  commission_enabled?: boolean;
  supervisor_user_id?: number;
  phone_number?: string;
  gender?: "male" | "female";
  avatar_key?: string;
};

export type CreatedInternalUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  status?: string;
};

export type CreateInternalUserData = {
  user: CreatedInternalUser;
};

export type InternalUserListItem = {
  id: number;
  name: string;
  email: string;
  role: InternalUserRole;
  internal_role?: InternalUserRole;
  assigned_zone?: string | null;
  assigned_zone_ids?: number[];
  assigned_zones?: CompanyZoneOption[];
  base_salary?: number | null;
  payroll_salary_type?: "daily" | "monthly" | "weekly" | null;
  salary_currency?: string | null;
  phone_number?: string | null;
  avatar_key?: string | null;
  avatar_url?: string | null;
  onboarding_status?: "active" | "pending_onboarding" | "inactive";
  is_active?: boolean;
  internal_onboarding_completed_at?: string | null;
  invite_sent_at?: string | null;
  invite_expires_at?: string | null;
  invite_accepted_at?: string | null;
  invite_revoked_at?: string | null;
  presence?: {
    is_session_online: boolean;
    is_map_active: boolean;
    last_seen_at?: string | null;
    last_session_at?: string | null;
    active_task_id?: number | null;
    active_task_title?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
};

export type ListInternalUsersParams = {
  company_id?: number | string;
  role?: InternalUserRole;
  onboarding_status?: "active" | "pending_onboarding" | "inactive";
  status?: "active" | "offline" | "pending_onboarding" | "inactive";
  search?: string;
  zone?: string;
  zone_id?: number;
  include_inactive?: 0 | 1;
  per_page?: number;
  page?: number;
};

export type PaginatedInternalUsersData = {
  items: InternalUserListItem[];
  pagination: {
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
    current_page?: number;
    last_page?: number;
    total?: number;
  };
};

export type InternalOnboardingStatusData = {
  summary: {
    total: number;
    active: number;
    pending_onboarding: number;
    inactive: number;
  };
  items: InternalUserListItem[];
};

export type AssignSupervisorPayload = {
  company_id?: number | string;
  supervisor_user_id: number;
};

export type InternalUserSimpleData = {
  user: InternalUserListItem;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) qs.set(key, String(value));
  });
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export function createInternalUser(
  payload: CreateInternalUserPayload,
  token: string
): Promise<ApiEnvelope<CreateInternalUserData>> {
  return apiRequest<CreateInternalUserData>({
    method: "POST",
    path: "/internal-users",
    body: payload,
    token,
  });
}

export function listInternalUsers(
  params: ListInternalUsersParams,
  token: string
): Promise<ApiEnvelope<InternalUserListItem[]>> {
  const query = buildQuery({
    company_id: params.company_id,
    role: params.role,
    onboarding_status: params.onboarding_status,
    include_inactive: params.include_inactive,
  });

  return apiRequest<InternalUserListItem[]>({
    method: "GET",
    path: `/internal-users${query}`,
    token,
  });
}

export function listInternalUsersPaginated(
  params: ListInternalUsersParams,
  token: string
): Promise<ApiEnvelope<PaginatedInternalUsersData>> {
  const query = buildQuery({
    company_id: params.company_id,
    role: params.role,
    onboarding_status: params.onboarding_status,
    status: params.status,
    search: params.search,
    zone: params.zone,
    zone_id: params.zone_id,
    include_inactive: params.include_inactive,
    per_page: params.per_page,
    page: params.page,
  });

  return apiRequest<PaginatedInternalUsersData>({
    method: "GET",
    path: `/internal-users${query}`,
    token,
  });
}

export function getInternalUsersOnboardingStatus(
  params: Pick<ListInternalUsersParams, "company_id">,
  token: string
): Promise<ApiEnvelope<InternalOnboardingStatusData>> {
  const query = buildQuery({
    company_id: params.company_id,
  });

  return apiRequest<InternalOnboardingStatusData>({
    method: "GET",
    path: `/internal-users/onboarding-status${query}`,
    token,
  });
}

export function resendInternalUserInvite(
  userId: number | string,
  payload: Pick<ListInternalUsersParams, "company_id">,
  token: string
): Promise<ApiEnvelope<InternalUserSimpleData>> {
  return apiRequest<InternalUserSimpleData>({
    method: "POST",
    path: `/internal-users/${userId}/invite`,
    body: payload,
    token,
  });
}

export function assignInternalUserSupervisor(
  userId: number | string,
  payload: AssignSupervisorPayload,
  token: string
): Promise<ApiEnvelope<InternalUserSimpleData>> {
  return apiRequest<InternalUserSimpleData>({
    method: "PATCH",
    path: `/internal-users/${userId}/supervisor`,
    body: payload,
    token,
  });
}

export type UpdateInternalUserPayload = {
  company_id: number | string;
  full_name?: string;
  role?: InternalUserRole;
  phone_number?: string | null;
  assigned_zone?: string | null;
  assigned_zone_ids?: number[] | null;
};

export type CompanyZoneOption = {
  id: number;
  company_id: number;
  name: string;
  country_code: string;
  state_name: string;
  lga_name: string;
  is_active: boolean;
};

export function updateInternalUser(
  userId: number | string,
  payload: UpdateInternalUserPayload,
  token: string
): Promise<ApiEnvelope<InternalUserSimpleData>> {
  return apiRequest<InternalUserSimpleData>({
    method: "PATCH",
    path: `/internal-users/${userId}`,
    body: payload,
    token,
  });
}

export function listCompanyZones(
  params: { company_id?: number | string; q?: string; is_active?: 0 | 1 },
  token: string,
): Promise<ApiEnvelope<CompanyZoneOption[]>> {
  const query = buildQuery({
    company_id: params.company_id,
    q: params.q,
    is_active: params.is_active,
  });

  return apiRequest<CompanyZoneOption[]>({
    method: "GET",
    path: `/internal-users/zones${query}`,
    token,
  });
}
