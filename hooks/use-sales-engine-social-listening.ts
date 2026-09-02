"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSignalOutreach,
  dismissSignal,
  fetchSocialSignals,
  SalesEngineApiError,
  setSignalReminder,
  syncSignalToCrm,
  triggerSocialListeningRun,
  type PaginatedSocialSignals,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_OUTREACH_KEYS } from "@/hooks/use-sales-engine-outreach";
import { SALES_ENGINE_SOCIAL_METRICS_KEYS } from "@/hooks/use-sales-engine-social-metrics";

export const SALES_ENGINE_SOCIAL_KEYS = {
  all: ["sales-engine", "social-listening"] as const,
  signals: (icpId: string | undefined, filters: SocialSignalsFilters) =>
    ["sales-engine", "social-listening", "signals", icpId, filters] as const,
};

export type SocialSignalsFilters = {
  page: number;
  per_page: number;
  search: string;
  source: string;
  signal_type: string;
  buying_stage: string;
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useSocialListeningSignals(filters: SocialSignalsFilters) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const { data: activeIcp } = useActiveIcpProfile();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_SOCIAL_KEYS.signals(activeIcp?.id, filters),
    queryFn: async (): Promise<PaginatedSocialSignals> => {
      try {
        return await fetchSocialSignals({
          page: filters.page,
          per_page: filters.per_page,
          search: filters.search || undefined,
          source: filters.source,
          signal_type: filters.signal_type,
          buying_stage: filters.buying_stage,
        });
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading && Boolean(activeIcp?.id),
    staleTime: 1000 * 30,
  });
}

function useSocialMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useCreateSignalOutreach() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: ({ id, send, to_email }: { id: number; send?: boolean; to_email?: string }) =>
      createSignalOutreach(id, { send, to_email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useSetSignalReminder() {
  return useSocialMutation(({ id, note }: { id: number; note?: string }) =>
    setSignalReminder(id, {
      remind_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      note,
    })
  );
}

export function useSyncSignalToCrm() {
  return useSocialMutation((id: number) => syncSignalToCrm(id));
}

export function useDismissSignal() {
  return useSocialMutation((id: number) => dismissSignal(id));
}

export function useTriggerSocialListeningRun() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (force?: boolean) => triggerSocialListeningRun(Boolean(force)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
