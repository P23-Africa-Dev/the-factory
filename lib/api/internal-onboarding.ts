"use client";

import { API_BASE_URL, ApiEnvelope, ApiRequestError, apiRequest } from "./onboarding";

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
  avatar_file?: File;
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
  if (payload.avatar_file) {
    const formData = new FormData();
    formData.set("invitation_id", String(payload.invitation_id));
    formData.set("token", payload.token);
    formData.set("password", payload.password);
    formData.set("password_confirmation", payload.password_confirmation);

    if (payload.phone_number) {
      formData.set("phone_number", payload.phone_number);
    }

    if (payload.gender) {
      formData.set("gender", payload.gender);
    }

    if (payload.avatar_key) {
      formData.set("avatar_key", payload.avatar_key);
    }

    formData.set("avatar_file", payload.avatar_file);

    return fetch(`${API_BASE_URL}/internal/onboarding/complete`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: formData,
    }).then(async (response) => {
      const result = (await response.json()) as ApiEnvelope<CompleteInvitationData>;

      if (!response.ok || !result.success) {
        throw new ApiRequestError(
          result.message || "Request failed.",
          response.status,
          result.errors
        );
      }

      return result;
    });
  }

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
