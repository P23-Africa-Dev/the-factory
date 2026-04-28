"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type InternalUserRole = "supervisor" | "agent";

export type CreateInternalUserPayload = {
  company_id: number | string;
  full_name: string;
  email: string;
  role: InternalUserRole;
  assigned_zone: string;
  work_days: string[];
  base_salary: number;
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
