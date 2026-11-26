"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAgentJourneys,
  getJourneyDetail,
  getMyJourneys,
  type JourneyDetail,
  type JourneyHistoryResponse,
  type JourneyListParams,
} from "@/lib/api/field-activity";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

export const FIELD_JOURNEY_KEYS = {
  all: ["field-journeys"] as const,
  agentList: (userId: number | string | undefined, params: JourneyListParams) =>
    [...FIELD_JOURNEY_KEYS.all, "agent", userId, params] as const,
  mine: (params: JourneyListParams) => [...FIELD_JOURNEY_KEYS.all, "mine", params] as const,
  detail: (sessionId: number | string | undefined, asAgent?: boolean) =>
    [...FIELD_JOURNEY_KEYS.all, "detail", sessionId, asAgent ? "agent" : "mgmt"] as const,
};

/** Lists refresh every minute while one of the shown trips is still running. */
export const ACTIVE_LIST_REFETCH_MS = 60_000;
/** An open journey page refreshes faster while the trip is still running. */
export const ACTIVE_DETAIL_REFETCH_MS = 30_000;

export function listRefetchInterval(data: JourneyHistoryResponse | undefined): number | false {
  return data?.items.some((item) => item.status === "active") ? ACTIVE_LIST_REFETCH_MS : false;
}

export function detailRefetchInterval(data: JourneyDetail | undefined): number | false {
  return data?.journey.status === "active" ? ACTIVE_DETAIL_REFETCH_MS : false;
}

export function useAgentJourneys(
  userId: number | string | undefined,
  params: JourneyListParams,
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: FIELD_JOURNEY_KEYS.agentList(userId, params),
    queryFn: async () => {
      const res = await getAgentJourneys(userId!, params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!userId && !!params.company_id,
    staleTime: 1000 * 60 * 2,
    refetchInterval: (query) => listRefetchInterval(query.state.data),
  });
}

export function useMyJourneys(params: JourneyListParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: FIELD_JOURNEY_KEYS.mine(params),
    queryFn: async () => {
      const res = await getMyJourneys(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!params.company_id,
    staleTime: 1000 * 60 * 2,
    refetchInterval: (query) => listRefetchInterval(query.state.data),
  });
}

export function useJourneyDetail(
  sessionId: number | string | undefined,
  options: {
    company_id?: number | string;
    asAgent?: boolean;
    enabled?: boolean;
  } = {},
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: FIELD_JOURNEY_KEYS.detail(sessionId, options.asAgent),
    queryFn: async () => {
      const res = await getJourneyDetail(
        sessionId!,
        {
          company_id: options.company_id,
          asAgent: options.asAgent,
          include_route: true,
          include_timeline: true,
        },
        token,
      );
      return res.data;
    },
    enabled:
      (options.enabled ?? true) &&
      hasActiveApiSession(token) &&
      !!sessionId,
    staleTime: 1000 * 60,
    // A running trip keeps growing: keep the open journey page current.
    refetchInterval: (query) => detailRefetchInterval(query.state.data),
  });
}
