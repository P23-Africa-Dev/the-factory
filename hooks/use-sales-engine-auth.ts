"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
  clearSalesEngineSession,
  getSalesEngineToken,
  setSalesEngineSession,
} from "@/lib/auth/sales-engine-session";
import {
  exchangeFactory23Assertion,
  requestFactory23SalesEngineAssertion,
} from "@/lib/api/sales-engine";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import { useAuthStore } from "@/store/auth";

export const SALES_ENGINE_AUTH_KEY = ["sales-engine", "session"] as const;

async function bootstrapSalesEngineSession(basePath: ApiRoleBasePath): Promise<string> {
  const cached = getSalesEngineToken();
  if (cached) return cached;

  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new Error("Not logged in.");
  }

  const assertionRes = await requestFactory23SalesEngineAssertion(f23Token, basePath);
  const exchangeRes = await exchangeFactory23Assertion(assertionRes.data.assertion);
  setSalesEngineSession(exchangeRes.token, exchangeRes.organization?.id);
  return exchangeRes.token;
}

/**
 * Silently rides the existing Factory23 session: exchanges it for a Sales Engine
 * Sanctum token (F23 tokens are rejected by SE routes) and caches the result.
 * React Query dedupes this across every component that calls it at once.
 */
export function useSalesEngineAuth() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const basePath: ApiRoleBasePath = accessRole === "agent" ? "/agent" : "/admin";

  return useQuery({
    queryKey: [...SALES_ENGINE_AUTH_KEY, basePath],
    queryFn: () => bootstrapSalesEngineSession(basePath),
    staleTime: Infinity,
    retry: false,
  });
}

/** Call after a Sales Engine request 401s to force a fresh assertion → exchange on next use. */
export function useResetSalesEngineAuth() {
  const queryClient = useQueryClient();
  return () => {
    clearSalesEngineSession();
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_AUTH_KEY });
  };
}
