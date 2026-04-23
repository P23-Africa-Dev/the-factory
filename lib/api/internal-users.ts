"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type InternalUserRole = "supervisor" | "agent";
export type WorkDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type AvatarOption = {
  key: string;
  url: string;
  svg: string | null;
};

export type PrefilledData = {
  phone_number: string | null;
  gender: "male" | "female" | null;
  avatar_key: string | null;
};

export type InvitationPreviewData = {
  user: {
    id: number;
    name: string;
    email: string;
  };
  prefilled_data: PrefilledData;
  avatar_options: AvatarOption[];
  expires_at: string;
};

export type CompleteOnboardingData = {
  token: string;
  token_type: "Bearer";
  internal_role: InternalUserRole;
  access_role: InternalUserRole;
  user: {
    id: number;
    name: string;
    email: string;
    internal_role: InternalUserRole;
    onboarding_status: string;
  };
  avatar_url?: string | null;
  avatar_svg?: string | null;
};

// ─── Request payload types ────────────────────────────────────────────────────

export type CreateInternalUserPayload = {
  company_id: number | string;
  full_name: string;
  email: string;
  role: InternalUserRole;
  assigned_zone: string;
  work_days: WorkDay[];
  base_salary: number;
  currency_code?: string;
  commission_enabled?: boolean;
  phone_number?: string;
  gender?: "male" | "female";
  avatar_key?: string;
  supervisor_user_id?: number;
  assign_agent_ids?: number[];
};

export type AssignSupervisorPayload = {
  supervisor_user_id: number;
};

export type InternalOnboardingPreviewPayload = {
  invitation_id: number;
  token: string;
};

export type InternalOnboardingCompletePayload = {
  invitation_id: number;
  token: string;
  password: string;
  password_confirmation: string;
  phone_number?: string;
  gender?: "male" | "female";
  avatar_key?: string;
};

// ─── API functions ────────────────────────────────────────────────────────────

export function createInternalUser(
  payload: CreateInternalUserPayload,
  token: string
): Promise<ApiEnvelope<{ user: { id: number; email: string; role: string } }>> {
  return apiRequest({
    method: "POST",
    path: "/internal-users",
    body: payload,
    token,
  });
}

export function resendInvite(
  userId: number | string,
  token: string
): Promise<ApiEnvelope<null>> {
  return apiRequest<null>({
    method: "POST",
    path: `/internal-users/${userId}/invite`,
    token,
  });
}

export function assignSupervisor(
  userId: number | string,
  payload: AssignSupervisorPayload,
  token: string
): Promise<ApiEnvelope<null>> {
  return apiRequest<null>({
    method: "PATCH",
    path: `/internal-users/${userId}/supervisor`,
    body: payload,
    token,
  });
}

export function getAvatars(
  gender: "male" | "female"
): Promise<ApiEnvelope<string[]>> {
  return apiRequest<string[]>({
    method: "GET",
    path: `/avatars?gender=${gender}`,
  });
}

export function previewInvitation(
  payload: InternalOnboardingPreviewPayload
): Promise<ApiEnvelope<InvitationPreviewData>> {
  return apiRequest<InvitationPreviewData>({
    method: "POST",
    path: "/internal/onboarding/preview",
    body: payload,
  });
}

export function completeInternalOnboarding(
  payload: InternalOnboardingCompletePayload
): Promise<ApiEnvelope<CompleteOnboardingData>> {
  return apiRequest<CompleteOnboardingData>({
    method: "POST",
    path: "/internal/onboarding/complete",
    body: payload,
  });
}
