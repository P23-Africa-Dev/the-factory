"use client";

import { apiRequest, ApiRequestError } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type BillingPlan = {
  key: string;
  label: string;
  seat_limit: number;
  monthly_amount: number;
  annual_amount: number;
  monthly_amount_display: string;
  annual_amount_display: string;
};

export type BillingStatus = {
  company_id: number;
  company_name: string;
  public_company_id: string;
  billing_enforced: boolean;
  subscription_status: string;
  has_active_subscription: boolean;
  plan_key: string | null;
  billing_interval: string | null;
  assigned_plan_key: string | null;
  assigned_billing_interval: string | null;
  can_choose_plan: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
  seat_usage: {
    used: number;
    limit: number | null;
    remaining: number | null;
  };
};

export type BillingPlansResponse = {
  plans: BillingPlan[];
  billing_status: BillingStatus;
};

export type PaymentLinkPayload = {
  company_name: string;
  public_company_id: string;
  plan_key: string;
  plan_label: string;
  billing_interval: string;
  amount_cents: number;
  amount_display: string;
  already_paid: boolean;
  expires_at: string | null;
};

function authToken(): string | undefined {
  return getAuthTokenFromDocument() ?? undefined;
}

export async function getBillingStatus() {
  return apiRequest<BillingStatus>({
    method: "GET",
    path: "/billing/status",
    token: authToken(),
  });
}

export async function getBillingPlans() {
  return apiRequest<BillingPlansResponse>({
    method: "GET",
    path: "/billing/plans",
    token: authToken(),
  });
}

export async function createCheckoutSession(payload: {
  plan_key: string;
  interval: "monthly" | "annual";
  context?: "onboarding" | "renewal";
}) {
  return apiRequest<{ checkout_url: string }>({
    method: "POST",
    path: "/billing/checkout",
    token: authToken(),
    body: payload,
  });
}

export async function createBillingPortalSession() {
  return apiRequest<{ portal_url: string }>({
    method: "POST",
    path: "/billing/portal",
    token: authToken(),
  });
}

export async function getPaymentLinkInfo(token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1"}/billing/payment-link/${token}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new ApiRequestError(payload.message || "Invalid payment link.", response.status, payload.errors);
  }
  return payload as { data: PaymentLinkPayload };
}

export async function checkoutFromPaymentLink(token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1"}/billing/payment-link/${token}/checkout`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new ApiRequestError(payload.message || "Unable to start checkout.", response.status, payload.errors);
  }
  return payload as { data: { checkout_url: string } };
}

export { ApiRequestError };
