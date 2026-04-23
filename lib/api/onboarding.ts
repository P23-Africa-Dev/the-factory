"use client";

export type ApiEnvelope<TData> = {
  success: boolean;
  message: string;
  data: TData;
  errors: Record<string, string[]> | null;
};

type ApiRequestOptions = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  token?: string;
};

export class ApiRequestError extends Error {
  status: number;
  errors: Record<string, string[]> | null;

  constructor(
    message: string,
    status: number,
    errors: Record<string, string[]> | null = null
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

export async function apiRequest<TData>({
  method,
  path,
  body,
  token,
}: ApiRequestOptions): Promise<ApiEnvelope<TData>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json()) as ApiEnvelope<TData>;

  if (!response.ok || !payload.success) {
    throw new ApiRequestError(
      payload.message || "Request failed.",
      response.status,
      payload.errors
    );
  }

  return payload;
}

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
};

export type VerifyEmailPayload = {
  email: string;
  otp_code: string;
};

export type ResendOtpPayload = {
  email: string;
};

export type WorkspacePayload = {
  company_name: string;
  country: string;
  team_size: "solo" | "2-10" | "11-50" | "51-200" | "201-500" | "500+";
  purpose:
    | "personal"
    | "startup"
    | "enterprise"
    | "freelancing"
    | "education"
    | "non_profit"
    | "other";
  user_type:
    | "developer"
    | "designer"
    | "product_manager"
    | "marketing"
    | "sales"
    | "operations"
    | "founder"
    | "student"
    | "other";
};

type RegisterResponse = {
  email: string;
};

type VerifyEmailResponse = {
  token: string;
  token_type: "Bearer";
  expires_in_days: number;
  user: {
    id: number;
    name: string;
    email: string;
    email_verified: boolean;
    onboarding_completed: boolean;
    onboarding_completed_at: string | null;
  };
  onboarding_completed: boolean;
};

export function registerUser(payload: RegisterPayload) {
  return apiRequest<RegisterResponse>({
    method: "POST",
    path: "/auth/register",
    body: payload,
  });
}

export function verifyEmailOtp(payload: VerifyEmailPayload) {
  return apiRequest<VerifyEmailResponse>({
    method: "POST",
    path: "/auth/verify-email",
    body: payload,
  });
}

export function resendEmailOtp(payload: ResendOtpPayload) {
  return apiRequest<RegisterResponse>({
    method: "POST",
    path: "/auth/resend-otp",
    body: payload,
  });
}

export function createWorkspace(payload: WorkspacePayload, token: string) {
  return apiRequest({
    method: "POST",
    path: "/onboarding/workspace",
    body: payload,
    token,
  });
}

export type ActiveCompany = {
  id: number;
  company_id: string;
  name: string;
  status: string;
  role: string;
};

export type MeResponse = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  email_verified: boolean;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  active_company: ActiveCompany | null;
  created_at: string;
};

export function getMe(token: string) {
  return apiRequest<MeResponse>({
    method: "GET",
    path: "/user/me",
    token,
  });
}
