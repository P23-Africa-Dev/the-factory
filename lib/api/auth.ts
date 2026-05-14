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

export function loginUser(
  payload: LoginPayload
): Promise<ApiEnvelope<LoginResponseData>> {
  return apiRequest<LoginResponseData>({
    method: "POST",
    path: "/auth/login",
    body: payload,
  });
}
