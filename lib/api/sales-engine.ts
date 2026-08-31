"use client";

import { apiRequest, ApiRequestError, type ApiEnvelope } from "./onboarding";
import type { ApiRoleBasePath } from "./crm";
import { clearSalesEngineSession } from "@/lib/auth/sales-engine-session";
import type { IcpConfig, IcpProfile } from "@/components/sales-engine/icp-builder-modal";

export const SALES_ENGINE_API_BASE_URL =
  process.env.NEXT_PUBLIC_SALES_ENGINE_API_URL ?? "https://api.salesengine.thefactory23.com/api/v1";

type SeRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
};

async function fetchSalesEngine(options: SeRequestOptions): Promise<unknown> {
  const { method, path, body, token } = options;
  let response: Response;

  try {
    response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError("Network error. Please check your connection.", 0, null);
  }

  let payload: { data?: unknown; message?: string; errors?: Record<string, string[]> | null };

  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(
      response.status >= 500 ? "Server error. Please try again shortly." : "Request failed.",
      response.status,
      null
    );
  }

  if (!response.ok) {
    // A 401 from Sales Engine means the cached SE token is dead (expired/revoked) or a
    // Factory23 token was sent by mistake — SE never accepts F23 Sanctum tokens directly.
    // Drop the cache so the next bootstrap re-runs the assertion → exchange flow.
    if (response.status === 401) {
      clearSalesEngineSession();
    }
    throw new ApiRequestError(payload.message || "Request failed.", response.status, payload.errors ?? null);
  }

  return payload;
}

/** Resource endpoints (icp-profiles, etc.) — Laravel wraps the resource in `{ data }`. */
async function seRequest<TData>(options: SeRequestOptions): Promise<TData> {
  const payload = (await fetchSalesEngine(options)) as { data?: TData };
  return payload.data as TData;
}

/** Auth endpoints (register/login/exchange) — return the flat payload, not wrapped in `data`. */
async function seRequestRaw<TData>(options: SeRequestOptions): Promise<TData> {
  return (await fetchSalesEngine(options)) as TData;
}

export type IcpProfilePayload = {
  name: string;
  description?: string;
  config: IcpConfig;
};

export function listIcpProfiles(token: string): Promise<IcpProfile[]> {
  return seRequest<IcpProfile[]>({ method: "GET", path: "/icp-profiles", token });
}

export function getActiveIcpProfile(token: string): Promise<IcpProfile | null> {
  return seRequest<IcpProfile | null>({ method: "GET", path: "/icp-profiles/active", token });
}

export function getIcpProfile(id: string, token: string): Promise<IcpProfile> {
  return seRequest<IcpProfile>({ method: "GET", path: `/icp-profiles/${id}`, token });
}

export function createIcpProfile(payload: IcpProfilePayload, token: string): Promise<IcpProfile> {
  return seRequest<IcpProfile>({ method: "POST", path: "/icp-profiles", body: payload, token });
}

export function updateIcpProfile(
  id: string,
  payload: Partial<IcpProfilePayload>,
  token: string
): Promise<IcpProfile> {
  return seRequest<IcpProfile>({ method: "PATCH", path: `/icp-profiles/${id}`, body: payload, token });
}

export function deleteIcpProfile(id: string, token: string): Promise<null> {
  return seRequest<null>({ method: "DELETE", path: `/icp-profiles/${id}`, token });
}

export function activateIcpProfile(id: string, token: string): Promise<IcpProfile> {
  return seRequest<IcpProfile>({ method: "POST", path: `/icp-profiles/${id}/activate`, token });
}

export function duplicateIcpProfile(id: string, token: string): Promise<IcpProfile> {
  return seRequest<IcpProfile>({ method: "POST", path: `/icp-profiles/${id}/duplicate`, token });
}

// ── Factory23 ↔ Sales Engine token bridge ────────────────────────────────────
// SE never accepts F23 tokens. The frontend must: (1) ask F23 for a short-lived
// JWT assertion, then (2) exchange that assertion for a real SE Sanctum token.

export type Factory23AssertionResponse = {
  assertion: string;
  expires_in: number;
  exchange_url: string;
};

/** Step 1 — calls Factory23's OWN backend (api.thefactory23.com), not Sales Engine. */
export function requestFactory23SalesEngineAssertion(
  f23Token: string,
  basePath: ApiRoleBasePath = "/admin",
  companyId?: number | string | null
): Promise<ApiEnvelope<Factory23AssertionResponse>> {
  return apiRequest<Factory23AssertionResponse>({
    method: "POST",
    path: `${basePath}/sales-engine/assertion`,
    body: companyId != null ? { company_id: companyId } : undefined,
    token: f23Token,
  });
}

export type SalesEngineOrganization = {
  id: string | number;
  name: string;
};

export type SalesEngineAuthResponse = {
  token: string;
  token_type: string;
  user: { id: number; name: string; email: string };
  organization: SalesEngineOrganization;
};

/** Step 2 — calls Sales Engine with the assertion (no F23 token on this call). */
export function exchangeFactory23Assertion(assertion: string): Promise<SalesEngineAuthResponse> {
  return seRequestRaw<SalesEngineAuthResponse>({
    method: "POST",
    path: "/auth/factory23/exchange",
    body: { assertion },
  });
}
