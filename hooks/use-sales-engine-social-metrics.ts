"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSocialListeningMetrics, SalesEngineApiError } from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";

export const SALES_ENGINE_SOCIAL_METRICS_KEYS = {
  all: ["sales-engine", "social-listening", "metrics"] as const,
  summary: (icpId: string | undefined) =>
    ["sales-engine", "social-listening", "metrics", icpId] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useSocialListeningMetrics() {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const { data: activeIcp } = useActiveIcpProfile();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.summary(activeIcp?.id),
    queryFn: async () => {
      try {
        return await fetchSocialListeningMetrics();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading && Boolean(activeIcp?.id),
    staleTime: 1000 * 60,
  });
}
