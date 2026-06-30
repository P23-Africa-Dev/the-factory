import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { appStore } from '@/lib/storage/stores';
import { kpiApi } from './api';
import type { Kpi, KpiFilters, KpiStatus } from './types';

export const kpiKeys = {
  all: ['kpis'] as const,
  lists: () => ['kpis', 'list'] as const,
  list: (filters?: KpiFilters) => ['kpis', 'list', filters] as const,
  details: () => ['kpis', 'detail'] as const,
  detail: (id: number) => ['kpis', 'detail', id] as const,
};

export function useKpis(filters?: KpiFilters) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: kpiKeys.list(filters),
    queryFn: () => kpiApi.list(filters),
    enabled: isAuthenticated,
    staleTime: 1000 * 30,
  });
}

export function useUpdateKpiStatus() {
  return useMutation({
    mutationFn: ({ kpiId, status }: { kpiId: number; status: KpiStatus }) =>
      kpiApi.updateStatus(kpiId, status),
    onMutate: async ({ kpiId, status }) => {
      await queryClient.cancelQueries({ queryKey: kpiKeys.detail(kpiId) });
      const previous = queryClient.getQueryData<Kpi>(kpiKeys.detail(kpiId));
      queryClient.setQueryData<Kpi>(kpiKeys.detail(kpiId), (old) =>
        old ? { ...old, status } : old,
      );
      return { previous };
    },
    onError: (_, { kpiId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(kpiKeys.detail(kpiId), context.previous);
      }
    },
    onSettled: (_, __, { kpiId }) => {
      queryClient.invalidateQueries({ queryKey: kpiKeys.lists() });
      queryClient.invalidateQueries({ queryKey: kpiKeys.detail(kpiId) });
    },
  });
}
