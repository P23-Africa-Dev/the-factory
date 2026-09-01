"use client";

import { apiRequest } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument, getCompanyId } from "@/lib/auth/session";
import {
  clearSalesEngineSession,
  getSalesEngineOrgId,
  getSalesEngineToken,
  setSalesEngineSession,
} from "@/lib/sales-engine/session";
import { useAuthStore } from "@/store/auth";
import type { IcpConfig, IcpProfile } from "@/components/sales-engine/icp-builder-modal";

export const SALES_ENGINE_API_BASE_URL =
  process.env.NEXT_PUBLIC_SALES_ENGINE_API_URL ??
  "https://api.salesengine.thefactory23.com/api/v1";

export class SalesEngineApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SeAssertionData = {
  assertion: string;
  expires_in: number;
  exchange_url: string;
};

type SeExchangeResponse = {
  token: string;
  token_type: "Bearer";
  organization: { id: number };
};

const DEFAULT_ICP_CONFIG: IcpConfig = {
  profileName: "",
  description: "",
  industries: [],
  companySizes: [],
  revenueRanges: [],
  territories: [],
  decisionMakers: [],
  minMatchScore: 60,
  autoSyncCrm: false,
  enrichContactDetails: true,
  customPrompt: "",
};

// The API returns `lastUpdated` as an ISO timestamp; the UI wants a friendly relative string.
function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// Backfills any config fields the API omitted so the form never breaks on a partial profile.
export function mapApiIcpProfile(raw: IcpProfile): IcpProfile {
  const config = { ...DEFAULT_ICP_CONFIG, ...raw.config };
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? "",
    isActive: raw.isActive,
    leadCount: raw.leadCount ?? 0,
    lastUpdated: formatLastUpdated(raw.lastUpdated),
    config: {
      ...config,
      profileName: config.profileName || raw.name,
    },
  };
}

function resolveAssertionPath(accessRole: string | undefined): string {
  return accessRole === "agent"
    ? "/agent/sales-engine/assertion"
    : "/admin/sales-engine/assertion";
}

function resolveCompanyId(): number | undefined {
  const fromStorage = getCompanyId();
  if (fromStorage) {
    const parsed = Number(fromStorage);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const activeCompany = useAuthStore.getState().user?.active_company;
  if (activeCompany?.id) return activeCompany.id;

  return undefined;
}

async function seRequest<T>({
  method,
  path,
  body,
  token,
  orgId,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
  orgId?: string | null;
}): Promise<T> {
  const authToken = token ?? getSalesEngineToken();
  if (!authToken) {
    throw new SalesEngineApiError("Sales Engine session is not ready.", 401);
  }

  const organizationId = orgId ?? getSalesEngineOrgId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; data?: T }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Sales Engine request failed (${response.status})`;
    throw new SalesEngineApiError(message, response.status);
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

export async function ensureSalesEngineSession(): Promise<void> {
  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new SalesEngineApiError("Factory23 session is not available.", 401);
  }

  const accessRole = useAuthStore.getState().user?.access_role;
  const companyId = resolveCompanyId();

  const assertionRes = await apiRequest<SeAssertionData>({
    method: "POST",
    path: resolveAssertionPath(accessRole),
    token: f23Token,
    body: companyId ? { company_id: companyId } : undefined,
  });

  const exchangeResponse = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/factory23/exchange`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assertion: assertionRes.data.assertion }),
  });

  const exchangePayload = (await exchangeResponse.json().catch(() => null)) as
    | SeExchangeResponse
    | { message?: string }
    | null;

  if (!exchangeResponse.ok) {
    const message =
      exchangePayload &&
      typeof exchangePayload === "object" &&
      "message" in exchangePayload &&
      typeof exchangePayload.message === "string"
        ? exchangePayload.message
        : `Sales Engine token exchange failed (${exchangeResponse.status})`;
    throw new SalesEngineApiError(message, exchangeResponse.status);
  }

  const exchange = exchangePayload as SeExchangeResponse;
  setSalesEngineSession(exchange.token, exchange.organization.id);
}

/** Runs `fn`; on a dead/expired SE token (401), re-runs the assertion → exchange handshake once and retries. */
async function withSessionRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SalesEngineApiError && error.status === 401) {
      clearSalesEngineSession();
      await ensureSalesEngineSession();
      return await fn();
    }
    throw error;
  }
}

export type IcpProfilePayload = {
  name: string;
  description?: string;
  config: IcpConfig;
};

export function fetchIcpProfiles(): Promise<IcpProfile[]> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile[]>({ method: "GET", path: "/icp-profiles" });
    return (data ?? []).map(mapApiIcpProfile);
  });
}

/** @deprecated kept for compatibility — same as {@link fetchIcpProfiles}, which now retries on 401 itself. */
export const refreshSalesEngineProfiles = fetchIcpProfiles;

export function createIcpProfile(payload: IcpProfilePayload): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({ method: "POST", path: "/icp-profiles", body: payload });
    return mapApiIcpProfile(data);
  });
}

export function updateIcpProfile(id: string, payload: Partial<IcpProfilePayload>): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({
      method: "PATCH",
      path: `/icp-profiles/${id}`,
      body: payload,
    });
    return mapApiIcpProfile(data);
  });
}

export function deleteIcpProfile(id: string): Promise<null> {
  return withSessionRetry(async () => {
    await seRequest<null>({ method: "DELETE", path: `/icp-profiles/${id}` });
    return null;
  });
}

export function activateIcpProfile(id: string): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({ method: "POST", path: `/icp-profiles/${id}/activate` });
    return mapApiIcpProfile(data);
  });
}

export function duplicateIcpProfile(id: string): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({ method: "POST", path: `/icp-profiles/${id}/duplicate` });
    return mapApiIcpProfile(data);
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export type ChatIntent = "freeform" | "quick_research" | "generate_leads" | "create_outreach";

export type ChatLead = {
  id: number;
  name: string;
  source: string;
  score: number;
  summary: string;
};

export type ChatMessageApi = {
  id: number;
  role: "user" | "assistant";
  body: string;
  intent?: ChatIntent;
  leads?: ChatLead[] | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
};

export type SendChatMessageResult = {
  user_message: ChatMessageApi;
  assistant_message: ChatMessageApi;
  discovery_run_id?: number | null;
};

export function createChatSession(title?: string): Promise<{ id: number }> {
  return withSessionRetry(() =>
    seRequest<{ id: number }>({
      method: "POST",
      path: "/chat/sessions",
      body: title ? { title } : {},
    })
  );
}

export function sendChatMessage(
  sessionId: number,
  payload: { body: string; intent: ChatIntent }
): Promise<SendChatMessageResult> {
  return withSessionRetry(() =>
    seRequest<SendChatMessageResult>({
      method: "POST",
      path: `/chat/sessions/${sessionId}/messages`,
      body: payload,
    })
  );
}
