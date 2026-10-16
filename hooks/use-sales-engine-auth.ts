"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ensureSalesEngineSession,
  loginLinkSalesEngineSession,
  requestSalesEngineAccess,
  resolveSalesEngineAccess,
  type SalesEngineAccessState,
} from "@/lib/api/sales-engine";
import { clearSalesEngineSession, getSalesEngineToken } from "@/lib/sales-engine/session";
import { useAuthStore } from "@/store/auth";

export const SALES_ENGINE_AUTH_KEY = ["sales-engine", "session"] as const;
export const SALES_ENGINE_ACCESS_KEY = ["sales-engine", "access"] as const;

/**
 * Silently rides the existing Factory23 session: exchanges it for a Sales Engine
 * Sanctum token (F23 tokens are rejected by SE routes) and caches the result.
 * React Query dedupes this across every component that calls it at once.
 *
 * Only succeeds when the user already has (or is linked to) a Sales Engine account.
 */
export function useSalesEngineAuth() {
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  return useQuery({
    queryKey: SALES_ENGINE_AUTH_KEY,
    queryFn: async (): Promise<string> => {
      if (!getSalesEngineToken()) {
        await ensureSalesEngineSession();
      }
      const token = getSalesEngineToken();
      if (!token) {
        throw new Error("Could not connect to Sales Engine.");
      }
      return token;
    },
    enabled: hasHydrated,
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
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ACCESS_KEY });
  };
}

export type SalesEngineAccessResult = {
  state: SalesEngineAccessState;
  token: string | null;
  message?: string;
};

/**
 * Gate-facing access resolution for the Sales Engine page.
 * Does not throw on access_required — surfaces ready | needs_access | pending | declined.
 */
export function useSalesEngineAccess() {
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SALES_ENGINE_ACCESS_KEY,
    queryFn: (): Promise<SalesEngineAccessResult> => resolveSalesEngineAccess(),
    enabled: hasHydrated,
    staleTime: 30_000,
    refetchInterval: (q) => {
      const state = q.state.data?.state;
      return state === "pending" ? 15_000 : false;
    },
    retry: false,
  });

  const requestAccess = useMutation({
    mutationFn: requestSalesEngineAccess,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ACCESS_KEY });
    },
  });

  const loginLink = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginLinkSalesEngineSession(email, password),
    onSuccess: async () => {
      const token = getSalesEngineToken();
      if (token) {
        queryClient.setQueryData(SALES_ENGINE_AUTH_KEY, token);
      }
      queryClient.setQueryData(SALES_ENGINE_ACCESS_KEY, {
        state: "ready" as const,
        token,
      });
      await queryClient.invalidateQueries({ queryKey: SALES_ENGINE_AUTH_KEY });
      await queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ACCESS_KEY });
    },
  });

  return {
    ...query,
    requestAccess,
    loginLink,
  };
}
