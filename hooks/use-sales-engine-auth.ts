"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureSalesEngineSession } from "@/lib/api/sales-engine";
import { clearSalesEngineSession, getSalesEngineToken } from "@/lib/sales-engine/session";
import { useAuthStore } from "@/store/auth";

export const SALES_ENGINE_AUTH_KEY = ["sales-engine", "session"] as const;

/**
 * Silently rides the existing Factory23 session: exchanges it for a Sales Engine
 * Sanctum token (F23 tokens are rejected by SE routes) and caches the result.
 * React Query dedupes this across every component that calls it at once.
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
  };
}
