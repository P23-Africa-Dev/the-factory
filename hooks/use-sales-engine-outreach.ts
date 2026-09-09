"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRecentOutreach, sendOutreachActivity, SalesEngineApiError } from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";

export const SALES_ENGINE_OUTREACH_KEYS = {
  all: ["sales-engine", "outreach"] as const,
  recent: () => ["sales-engine", "outreach", "recent"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useSalesEngineOutreach() {
  const { data: token, isLoading: isAuthLoading, error: authError } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_OUTREACH_KEYS.recent(),
    queryFn: async () => {
      try {
        return await fetchRecentOutreach();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 30,
  });
}

export function useSendOutreachActivity() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: ({
      activityId,
      ...payload
    }: {
      activityId: number;
      to_email: string;
      subject?: string;
      body: string;
    }) => sendOutreachActivity(activityId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
