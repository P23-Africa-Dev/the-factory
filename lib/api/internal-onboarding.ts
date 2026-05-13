"use client";

import { ApiEnvelope, apiRequest } from "./onboarding";

export type InvitationPreviewPayload = {
  invitation_id: number | string;
  token: string;
};

export type InvitationPreviewData = {
  user: {
    id: number;
    name: string;
    email: string;
  };
  prefilled_data: {
    phone_number?: string | null;
    gender?: "male" | "female" | null;
    avatar_key?: string | null;
  };
  avatar_options?: Array<{ key: string; url: string | null; svg: string | null }>;
  avatar_options_by_gender?: {
    male: Array<{ key: string; url: string | null; svg: string | null }>;
    female: Array<{ key: string; url: string | null; svg: string | null }>;
  };
  selected_avatar_svg?: string | null;
  suggested_avatar_key?: string | null;
  expires_at: string;
};

export type CompleteInvitationPayload = {
  invitation_id: number | string;
  token: string;
  password: string;
  password_confirmation: string;
  phone_number?: string;
  gender?: "male" | "female";
  avatar_key?: string;
};

export type CompleteInvitationData = {
  token: string;
  token_type: "Bearer";
  access_role?: string;
  internal_role?: "agent" | "supervisor";
  user: {
    id: number;
    name?: string;
    email: string;
    internal_role?: "agent" | "supervisor";
    onboarding_status?: string;
    avatar_url?: string | null;
    avatar_svg?: string | null;
  };
};

export type AvatarData = string[];

export type AgentLoginPayload = {
  email: string;
  password: string;
};

export type AgentLoginData = {
  token: string;
  token_type: "Bearer";
  internal_role: "agent";
  access_role: "agent";
  user: {
    id: number;
    email: string;
    internal_role: "agent";
    onboarding_status: string;
  };
};

export function previewInternalInvitation(
  payload: InvitationPreviewPayload
): Promise<ApiEnvelope<InvitationPreviewData>> {
  return apiRequest<InvitationPreviewData>({
    method: "POST",
    path: "/internal/onboarding/preview",
    body: payload,
  });
}

export function completeInternalInvitation(
  payload: CompleteInvitationPayload
): Promise<ApiEnvelope<CompleteInvitationData>> {
  return apiRequest<CompleteInvitationData>({
    method: "POST",
    path: "/internal/onboarding/complete",
    body: payload,
  });
}

export function listAvatars(
  gender: "male" | "female"
): Promise<ApiEnvelope<AvatarData>> {
  return apiRequest<AvatarData>({
    method: "GET",
    path: `/avatars?gender=${gender}`,
  });
}

export function loginAgent(
  payload: AgentLoginPayload
): Promise<ApiEnvelope<AgentLoginData>> {
  return apiRequest<AgentLoginData>({
    method: "POST",
    path: "/agent/login",
    body: payload,
  });
}
