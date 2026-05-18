"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponseData = {
  token: string;
  token_type: "Bearer";
  user_type: "self-serve" | "enterprise" | "supervisor" | "agent";
  access_role: "admin" | "supervisor" | "agent";
  internal_role: "supervisor" | null;
  user: {
    id: number;
    name: string;
    email: string;
  };
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ForgotPasswordResponseData = {
  email: string;
};

export function forgotPassword(
  payload: ForgotPasswordPayload
): Promise<ApiEnvelope<ForgotPasswordResponseData>> {
  return apiRequest<ForgotPasswordResponseData>({
    method: "POST",
    path: "/auth/forgot-password",
    body: payload,
  });
}

export type ResetPasswordPayload = {
  email: string;
  otp: string;
  password: string;
  password_confirmation: string;
};

export function resetPassword(
  payload: ResetPasswordPayload
): Promise<ApiEnvelope<null>> {
  return apiRequest<null>({
    method: "POST",
    path: "/auth/reset-password",
    body: payload,
  });
}

export function loginUser(
  payload: LoginPayload
): Promise<ApiEnvelope<LoginResponseData>> {
  return apiRequest<LoginResponseData>({
    method: "POST",
    path: "/auth/login",
    body: payload,
  });
}

export type AgentLoginResponseData = {
  token: string;
  token_type: "Bearer";
  internal_role: "agent";
  access_role: "agent";
};

export function loginAgent(
  payload: LoginPayload
): Promise<ApiEnvelope<AgentLoginResponseData>> {
  return apiRequest<AgentLoginResponseData>({
    method: "POST",
    path: "/agent/login",
    body: payload,
  });
}
