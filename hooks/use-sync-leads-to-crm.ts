"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pushLeadToCrm, syncLeadsBatch, SalesEngineApiError } from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";

export function useSyncLeadToCrm() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (leadId: number) => pushLeadToCrm(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
    },
    onError: (error) => {
      if (error instanceof SalesEngineApiError && error.status === 401) resetAuth();
    },
  });
}

export function useSyncLeadsBatchToCrm() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (leadIds: number[]) => syncLeadsBatch(leadIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
    },
    onError: (error) => {
      if (error instanceof SalesEngineApiError && error.status === 401) resetAuth();
    },
  });
}
