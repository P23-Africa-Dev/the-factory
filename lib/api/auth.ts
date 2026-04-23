"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponseData = {
  token: string;
  token_type: "Bearer";
  user_type: "self-serve" | "enterprise" | "supervisor";
  access_role: "admin" | "supervisor";
  internal_role: "supervisor" | "agent" | null;
  user: {
    id: number;
    name: string;
    email: string;
  };
};

export type AgentLoginResponseData = {
  token: string;
  token_type: "Bearer";
  internal_role: "agent";
  access_role: "agent";
  user: {
    id: number;
    name: string;
    email: string;
    onboarding_status: string;
  };
};

export function loginUser(
  payload: LoginPayload
): Promise<ApiEnvelope<LoginResponseData>> {
  return apiRequest<LoginResponseData>({
    method: "POST",
    path: "/auth/login",
    body: payload,
  });
}

export function loginAgent(
  payload: LoginPayload
): Promise<ApiEnvelope<AgentLoginResponseData>> {
  return apiRequest<AgentLoginResponseData>({
    method: "POST",
    path: "/agent/login",
    body: payload,
  });
}

export function logoutUser(token: string): Promise<ApiEnvelope<null>> {
  return apiRequest<null>({
    method: "POST",
    path: "/auth/logout",
    token,
  });
}
