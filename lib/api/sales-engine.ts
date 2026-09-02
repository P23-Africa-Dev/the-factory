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
  reason?: string | null;

  constructor(message: string, status: number, reason?: string | null) {
    super(message);
    this.status = status;
    this.reason = reason ?? null;
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
  timeoutMs,
}: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
  orgId?: string | null;
  timeoutMs?: number;
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

  const controller = timeoutMs ? new AbortController() : undefined;
  const timeoutId =
    controller && timeoutMs
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SalesEngineApiError("Sales Engine request timed out.", 408);
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

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
    const reason =
      payload &&
      typeof payload === "object" &&
      "reason" in payload &&
      typeof payload.reason === "string"
        ? payload.reason
        : null;
    throw new SalesEngineApiError(message, response.status, reason);
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
    body: JSON.stringify({
      assertion: assertionRes.data.assertion,
      f23_access_token: f23Token,
    }),
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
  await ensureFactory23CrmLink({ skipSessionRetry: true });
}

/** Bridges the signed-in Factory23 session to Sales Engine CRM sync (no manual API tokens). */
export async function ensureFactory23CrmLink(options?: {
  skipSessionRetry?: boolean;
}): Promise<Factory23IntegrationStatus> {
  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new SalesEngineApiError("Factory23 session is not available.", 401);
  }

  const request = () =>
    seRequest<{
      linked: boolean;
      token_registered: boolean;
      status: Factory23IntegrationStatus;
    }>({
      method: "POST",
      path: "/integrations/factory23/ensure",
      body: { f23_access_token: f23Token },
    });

  const result = options?.skipSessionRetry ? await request() : await withSessionRetry(request);

  return result.status;
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

// ── Chat ─────────────────────────────────────────────────────────────────────

export type ChatIntent = "freeform" | "quick_research" | "generate_leads" | "create_outreach";

export type ChatLead = {
  id: number;
  name: string;
  source: string;
  score: number;
  summary: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  website?: string | null;
  profile_urls?: string[] | null;
  next_action?: string | null;
  source_url?: string | null;
  save_status?: "draft" | "saved";
  crm_synced?: boolean;
  f23_lead_id?: string | number | null;
  low_confidence?: boolean;
  icp_recommended?: boolean;
  icp_fit_score?: number;
  query_match?: boolean;
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
  assistant_message?: ChatMessageApi | null;
  discovery_run_id?: number | null;
  status?: "processing" | "completed";
  pending?: boolean;
};

export type ChatSessionApi = {
  id: number;
  title?: string | null;
  icp_profile_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type DiscoveryRunProgress = {
  step?: number;
  total_steps?: number;
  sources_checked?: number;
  candidates_found?: number;
};

export type DiscoveryRunApi = {
  id: number;
  status: string;
  query?: string | null;
  intent?: string | null;
  stages?: string[] | null;
  result_summary?: unknown;
  progress?: DiscoveryRunProgress | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type DiscoveryStageInfo = {
  label: string;
  stepIndex: number;
  totalSteps: number;
  stageKey: string;
  progress?: DiscoveryRunProgress | null;
};

const ASYNC_CHAT_INTENTS: ChatIntent[] = ["quick_research", "generate_leads"];
const CHAT_OUTREACH_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_CHAT_OUTREACH_TIMEOUT_MS) || 120_000;
const CHAT_POLL_INTERVAL_MS = 2_000;
const CHAT_POLL_MAX_MS = 600_000;

const DISCOVERY_STAGE_LABELS: Record<string, string> = {
  analyzing_brief: "Analyzing your brief…",
  analyzing_icp: "Analyzing your ICP…",
  searching_sources: "Scanning web & social signals…",
  extracting: "Extracting buying intent…",
  enriching: "Enriching signal data…",
  synthesizing: "Synthesizing insights…",
  compiling_results: "Compiling ranked results…",
  completed: "Finalizing results…",
};

const STAGE_TO_STEP: Record<string, number> = {
  queued: 0,
  analyzing_brief: 0,
  analyzing_icp: 0,
  searching_sources: 1,
  extracting: 2,
  enriching: 2,
  synthesizing: 2,
  compiling_results: 3,
  completed: 3,
};

const TOTAL_PIPELINE_STEPS = 4;

function humanizeStageKey(stageKey: string, intent?: ChatIntent): string {
  if (stageKey === "queued") {
    if (intent === "quick_research") return "Reviewing your question…";
    if (intent === "generate_leads") return "Parsing your ICP brief…";
    if (intent === "create_outreach") return "Reading target context…";
    return "Starting your request…";
  }

  return (
    DISCOVERY_STAGE_LABELS[stageKey] ??
    stageKey.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) + "…"
  );
}

export function mapDiscoveryStage(
  stages?: string[] | null,
  intent?: ChatIntent,
  progress?: DiscoveryRunProgress | null
): DiscoveryStageInfo {
  const stageKey = stages?.length ? stages[stages.length - 1] : "analyzing_brief";
  const stepIndex =
    typeof progress?.step === "number"
      ? Math.min(Math.max(progress.step - 1, 0), TOTAL_PIPELINE_STEPS - 1)
      : (STAGE_TO_STEP[stageKey] ?? 0);

  return {
    label: humanizeStageKey(stageKey, intent),
    stepIndex,
    totalSteps: progress?.total_steps ?? TOTAL_PIPELINE_STEPS,
    stageKey,
    progress: progress ?? null,
  };
}

/** @deprecated Use mapDiscoveryStage for structured stage info. */
export function formatDiscoveryStage(stages?: string[] | null, intent?: ChatIntent): string {
  return mapDiscoveryStage(stages, intent).label;
}

export function createChatSession(icpProfileId?: string): Promise<ChatSessionApi> {
  return withSessionRetry(async () =>
    seRequest<ChatSessionApi>({
      method: "POST",
      path: "/chat/sessions",
      body: icpProfileId ? { icp_profile_id: Number(icpProfileId) } : {},
    })
  );
}

export function fetchCurrentChatSession(icpProfileId?: string): Promise<ChatSessionApi | null> {
  return withSessionRetry(async () => {
    const query = icpProfileId ? `?icp_profile_id=${encodeURIComponent(icpProfileId)}` : "";

    return seRequest<ChatSessionApi | null>({
      method: "GET",
      path: `/chat/sessions/current${query}`,
    });
  });
}

export function clearChatMessages(sessionId: number): Promise<{ cleared: boolean }> {
  return withSessionRetry(async () =>
    seRequest<{ cleared: boolean }>({
      method: "DELETE",
      path: `/chat/sessions/${sessionId}/messages`,
    })
  );
}

export function fetchDiscoveryRun(id: number): Promise<DiscoveryRunApi> {
  return withSessionRetry(async () =>
    seRequest<DiscoveryRunApi>({ method: "GET", path: `/discovery/runs/${id}` })
  );
}

export async function pollDiscoveryRunUntilComplete(
  runId: number,
  options?: {
    onStage?: (info: DiscoveryStageInfo) => void;
    intent?: ChatIntent;
    maxMs?: number;
    signal?: AbortSignal;
  }
): Promise<{ run: DiscoveryRunApi; timedOut: boolean; aborted?: boolean }> {
  const maxMs = options?.maxMs ?? CHAT_POLL_MAX_MS;
  const started = Date.now();

  while (Date.now() - started < maxMs) {
    if (options?.signal?.aborted) {
      const run = await fetchDiscoveryRun(runId);
      return { run, timedOut: true, aborted: true };
    }

    const run = await fetchDiscoveryRun(runId);
    const intent = options?.intent ?? (run.intent as ChatIntent | undefined);
    const stageInfo = mapDiscoveryStage(run.stages, intent, run.progress ?? null);
    options?.onStage?.(stageInfo);

    if (run.status === "completed") {
      return { run, timedOut: false };
    }

    if (run.status === "failed") {
      throw new SalesEngineApiError(run.error ?? "Discovery run failed.", 422);
    }

    if (options?.signal?.aborted) {
      return { run, timedOut: true, aborted: true };
    }

    await new Promise((resolve) => window.setTimeout(resolve, CHAT_POLL_INTERVAL_MS));
  }

  const run = await fetchDiscoveryRun(runId);
  return { run, timedOut: true };
}

function findLatestAssistantMessage(messages: ChatMessageApi[]): ChatMessageApi | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

export function listChatMessages(sessionId: number): Promise<ChatMessageApi[]> {
  return withSessionRetry(async () =>
    seRequest<ChatMessageApi[]>({
      method: "GET",
      path: `/chat/sessions/${sessionId}/messages`,
    })
  );
}

export async function sendChatMessage(
  sessionId: number,
  payload: { body: string; intent: ChatIntent },
  options?: {
    onStage?: (info: DiscoveryStageInfo) => void;
    icpContext?: { industries?: string[]; territories?: string[]; name?: string };
    signal?: AbortSignal;
  }
): Promise<SendChatMessageResult> {
  return withSessionRetry(async () => {
    const timeoutMs = payload.intent === "create_outreach" ? CHAT_OUTREACH_TIMEOUT_MS : undefined;

    const initial = await seRequest<SendChatMessageResult>({
      method: "POST",
      path: `/chat/sessions/${sessionId}/messages`,
      body: payload,
      timeoutMs,
    });

    if (
      ASYNC_CHAT_INTENTS.includes(payload.intent) &&
      initial.status === "processing" &&
      initial.discovery_run_id
    ) {
      let messages = await listChatMessages(sessionId);
      let placeholder = findLatestAssistantMessage(messages);

      const pollResult = await pollDiscoveryRunUntilComplete(initial.discovery_run_id, {
        intent: payload.intent,
        onStage: options?.onStage,
        signal: options?.signal,
      });

      messages = await listChatMessages(sessionId);
      const assistantMessage =
        findLatestAssistantMessage(messages.filter((message) => !message.meta?.pending)) ??
        findLatestAssistantMessage(messages) ??
        placeholder;

      if (pollResult.aborted) {
        return {
          ...initial,
          assistant_message: assistantMessage ?? null,
          status: "processing",
          pending: true,
        };
      }

      if (pollResult.timedOut && pollResult.run.status !== "completed") {
        return {
          ...initial,
          assistant_message: assistantMessage ?? null,
          status: "processing",
          pending: true,
        };
      }

      if (!assistantMessage || assistantMessage.meta?.pending) {
        throw new SalesEngineApiError("Assistant response was not found after processing.", 500);
      }

      return {
        ...initial,
        assistant_message: assistantMessage,
        status: "completed",
        pending: false,
      };
    }

    if (!initial.assistant_message) {
      throw new SalesEngineApiError("Assistant response was missing from the server.", 500);
    }

    return initial;
  });
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export type SalesEngineMetrics = {
  leads_discovered: number;
  leads_pending_review: number;
  leads_in_crm: number;
  qualified_leads: number;
  companies_cached: number;
  outreach_drafts: number;
  pipeline: Record<string, number>;
};

export function fetchMetrics(): Promise<SalesEngineMetrics> {
  return withSessionRetry(async () =>
    seRequest<SalesEngineMetrics>({ method: "GET", path: "/metrics" })
  );
}

// ── Outreach ────────────────────────────────────────────────────────────────

export type OutreachActivity = {
  id: number;
  name: string;
  channel: string;
  preview: string;
  accentBg: string;
  accentIcon: string;
  occurred_at: string;
};

export function fetchRecentOutreach(): Promise<OutreachActivity[]> {
  return withSessionRetry(async () =>
    seRequest<OutreachActivity[]>({ method: "GET", path: "/outreach/recent" })
  );
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// ── Social Listening ────────────────────────────────────────────────────────

export type SocialSignalApi = {
  id: number;
  signal: string;
  source: string;
  sourceIcon: string;
  persona: string;
  company: string;
  location: string;
  intent: string;
  intentColor: string;
  description: string;
  score: number;
  profile: string;
  reasons: string[];
  signalType: string;
  buyingStage: string;
  problem: string;
  urgency: string;
  suggestedMessage: string;
  recommendedAction?: string;
  status?: string;
  posted_at?: string | null;
  post_url?: string | null;
  lead_id?: number | null;
  f23_lead_id?: number | null;
};

export type SocialListeningRunStatus = {
  id: number;
  status: string;
  stages?: string[] | null;
  signals_created?: number | null;
  result_summary?: string | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type SocialListeningMetrics = {
  signals_detected: number;
  high_opportunities: number;
  added_to_crm: number;
  percent_change: number;
  last_run_at?: string | null;
  latest_run?: SocialListeningRunStatus | null;
};

export type SocialListeningSettings = {
  enabled_sources: string[];
  cadence_days: 14 | 30;
  min_score: number;
  intent_filters: string[];
  crm_destination: "qualified_pipeline" | "human_review";
  outreach_channel_default: "email" | "human_follow_up";
  sender_mode: "platform" | "organization";
  org_verified_from_email?: string | null;
  org_verified_domain?: string | null;
  verification_status: "pending" | "verified" | "failed";
  last_run_at?: string | null;
};

export type OutreachSenderSettings = {
  sender_mode: "platform" | "organization";
  reply_to_email: string;
  org_verified_from_email?: string | null;
  org_verified_domain?: string | null;
  verification_status: "pending" | "verified" | "failed";
  platform_from_email?: string | null;
};

export type PaginatedMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type PaginatedSocialSignals = {
  items: SocialSignalApi[];
  meta: PaginatedMeta;
};

type PaginatedResponse<T> = {
  data: T[];
  meta: PaginatedMeta;
};

async function seRequestPaginated<T>({
  method,
  path,
  body,
  token,
  orgId,
}: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
  orgId?: string | null;
}): Promise<PaginatedResponse<T>> {
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
    | { message?: string; data?: T[]; meta?: PaginatedMeta }
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Sales Engine request failed (${response.status})`;
    const reason =
      payload &&
      typeof payload === "object" &&
      "reason" in payload &&
      typeof payload.reason === "string"
        ? payload.reason
        : null;
    throw new SalesEngineApiError(message, response.status, reason);
  }

  return {
    data: (payload?.data ?? []) as T[],
    meta: payload?.meta ?? { current_page: 1, last_page: 1, per_page: 20, total: 0 },
  };
}

export function fetchSocialSignals(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  source?: string;
  signal_type?: string;
  buying_stage?: string;
}): Promise<PaginatedSocialSignals> {
  return withSessionRetry(async () => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.per_page) query.set("per_page", String(params.per_page));
    if (params?.search) query.set("search", params.search);
    if (params?.source && params.source !== "all") query.set("source", params.source);
    if (params?.signal_type && params.signal_type !== "all") query.set("signal_type", params.signal_type);
    if (params?.buying_stage && params.buying_stage !== "all") query.set("buying_stage", params.buying_stage);

    const qs = query.toString();
    const result = await seRequestPaginated<SocialSignalApi>({
      method: "GET",
      path: `/social-listening/signals${qs ? `?${qs}` : ""}`,
    });
    return { items: result.data, meta: result.meta };
  });
}

export function fetchSocialSignal(id: number): Promise<SocialSignalApi> {
  return withSessionRetry(async () =>
    seRequest<SocialSignalApi>({ method: "GET", path: `/social-listening/signals/${id}` })
  );
}

export function fetchSocialListeningMetrics(): Promise<SocialListeningMetrics> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningMetrics>({ method: "GET", path: "/social-listening/metrics" })
  );
}

export function fetchSocialListeningSettings(): Promise<SocialListeningSettings> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningSettings>({ method: "GET", path: "/social-listening/settings" })
  );
}

export function updateSocialListeningSettings(
  payload: Partial<SocialListeningSettings>
): Promise<SocialListeningSettings> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningSettings>({
      method: "PUT",
      path: "/social-listening/settings",
      body: payload,
    })
  );
}

export function triggerSocialListeningRun(force = false): Promise<{ id: number; status: string }> {
  return withSessionRetry(async () =>
    seRequest<{ id: number; status: string }>({
      method: "POST",
      path: "/social-listening/runs",
      body: force ? { force: true } : {},
    })
  );
}

export function bootstrapSocialListeningRun(force = false): Promise<{
  id: number;
  status: string;
  bootstrapped: boolean;
  latest_run?: SocialListeningRunStatus | null;
}> {
  return withSessionRetry(async () =>
    seRequest<{
      id: number;
      status: string;
      bootstrapped: boolean;
      latest_run?: SocialListeningRunStatus | null;
    }>({
      method: "POST",
      path: "/social-listening/runs/bootstrap",
      body: force ? { force: true } : {},
    })
  );
}

export function fetchSocialListeningRun(id: number): Promise<SocialListeningRunStatus> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningRunStatus>({ method: "GET", path: `/social-listening/runs/${id}` })
  );
}

export function createSignalOutreach(
  id: number,
  opts?: { send?: boolean; to_email?: string }
): Promise<{ subject?: string; body: string; activity_id?: number; sent?: boolean }> {
  return withSessionRetry(async () =>
    seRequest<{ subject?: string; body: string; activity_id?: number; sent?: boolean }>({
      method: "POST",
      path: `/social-listening/signals/${id}/outreach`,
      body: opts ?? {},
    })
  );
}

export function setSignalReminder(
  id: number,
  payload?: { remind_at?: string; note?: string }
): Promise<{ id: number; remind_at: string }> {
  return withSessionRetry(async () =>
    seRequest<{ id: number; remind_at: string }>({
      method: "POST",
      path: `/social-listening/signals/${id}/reminder`,
      body: payload ?? {},
    })
  );
}

export function syncSignalToCrm(id: number): Promise<{
  lead_id: number;
  f23_lead_id?: number | null;
  crm?: unknown;
  signal: SocialSignalApi;
}> {
  return withSessionRetry(async () =>
    seRequest<{
      lead_id: number;
      f23_lead_id?: number | null;
      crm?: unknown;
      signal: SocialSignalApi;
    }>({
      method: "POST",
      path: `/social-listening/signals/${id}/sync-to-crm`,
    })
  );
}

export function dismissSignal(id: number): Promise<SocialSignalApi> {
  return withSessionRetry(async () =>
    seRequest<SocialSignalApi>({
      method: "POST",
      path: `/social-listening/signals/${id}/dismiss`,
    })
  );
}

export function fetchOutreachSenderSettings(): Promise<OutreachSenderSettings> {
  return withSessionRetry(async () =>
    seRequest<OutreachSenderSettings>({ method: "GET", path: "/outreach/sender-settings" })
  );
}

export function updateOutreachSenderSettings(
  payload: Partial<OutreachSenderSettings>
): Promise<OutreachSenderSettings> {
  return withSessionRetry(async () =>
    seRequest<OutreachSenderSettings>({
      method: "PUT",
      path: "/outreach/sender-settings",
      body: payload,
    })
  );
}

export type Factory23IntegrationStatus = {
  configured: boolean;
  global_enabled: boolean;
  organization_enabled: boolean;
  f23_company_id?: string | number | null;
  linked: boolean;
  token_linked?: boolean;
  can_sync: boolean;
  block_reason?: string | null;
  block_message?: string | null;
};

export async function fetchFactory23IntegrationStatusWithAutoEnsure(): Promise<Factory23IntegrationStatus> {
  let status = await fetchFactory23IntegrationStatus();
  if (!status.can_sync && status.block_reason === "not_configured") {
    try {
      status = await ensureFactory23CrmLink();
    } catch {
      return status;
    }
  }

  return status;
}

export function pushLeadToCrm(leadId: number): Promise<{
  lead_id: number;
  save_status?: string;
  synced?: boolean;
  f23_lead_id?: string | number | null;
}> {
  return withSessionRetry(async () => {
    try {
      return await seRequest<{
        lead_id: number;
        save_status?: string;
        synced?: boolean;
        f23_lead_id?: string | number | null;
      }>({
        method: "POST",
        path: `/leads/${leadId}/sync-to-crm`,
      });
    } catch (error) {
      if (
        error instanceof SalesEngineApiError &&
        (error.reason === "not_configured" || error.reason === "token_invalid")
      ) {
        await ensureFactory23CrmLink();
        return await seRequest<{
          lead_id: number;
          save_status?: string;
          synced?: boolean;
          f23_lead_id?: string | number | null;
        }>({
          method: "POST",
          path: `/leads/${leadId}/sync-to-crm`,
        });
      }
      throw error;
    }
  });
}

export function syncLeadsBatch(leadIds: number[]): Promise<{
  synced: Array<{ lead_id: number; save_status?: string; synced?: boolean; f23_lead_id?: string | number | null }>;
  errors: string[];
}> {
  return withSessionRetry(async () => {
    try {
      return await seRequest<{
        synced: Array<{ lead_id: number; save_status?: string; synced?: boolean; f23_lead_id?: string | number | null }>;
        errors: string[];
      }>({
        method: "POST",
        path: "/leads/sync-to-crm",
        body: { lead_ids: leadIds },
      });
    } catch (error) {
      if (
        error instanceof SalesEngineApiError &&
        (error.reason === "not_configured" || error.reason === "token_invalid")
      ) {
        await ensureFactory23CrmLink();
        return await seRequest<{
          synced: Array<{ lead_id: number; save_status?: string; synced?: boolean; f23_lead_id?: string | number | null }>;
          errors: string[];
        }>({
          method: "POST",
          path: "/leads/sync-to-crm",
          body: { lead_ids: leadIds },
        });
      }
      throw error;
    }
  });
}
