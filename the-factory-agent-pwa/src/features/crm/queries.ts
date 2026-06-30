import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { isOffline } from '@/lib/offline/connectivity';
import { locationKeys } from '@/features/locations/queryKeys';
import { crmApi } from './api';
import { crmKeys } from './queryKeys';
import type {
  Lead,
  LeadFilters,
  CreateLeadPayload,
  UpdateLeadPayload,
  LeadsResult,
} from './types';

export function useLeads(filters?: LeadFilters) {
  const companyId = getActiveCompanyId();
  return useQuery<LeadsResult>({
    queryKey: crmKeys.leads(filters),
    queryFn: () => crmApi.listLeads(filters),
    enabled: companyId != null,
    staleTime: 1000 * 60 * 2,
  });
}

export function useLead(id: number | string | null | undefined) {
  return useQuery<Lead>({
    queryKey: crmKeys.lead(id ?? 0),
    queryFn: () => crmApi.getLead(id!),
    enabled: id != null && id !== 0 && id !== '',
    staleTime: 1000 * 60 * 2,
  });
}

export function useCrmLabels() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: crmKeys.labels(companyId),
    queryFn: () => crmApi.listLabels(),
    enabled: companyId != null,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrmPipelines() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: crmKeys.pipelines(companyId),
    queryFn: () => crmApi.listPipelines(),
    enabled: companyId != null,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAgentUploadsOverview() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: crmKeys.agentOverview(companyId),
    queryFn: () => crmApi.getAgentUploadsOverview(),
    enabled: companyId != null,
    staleTime: 1000 * 60,
  });
}

export function useCreateLead(options?: { onSuccess?: (lead: Lead) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateLeadPayload) => crmApi.createLead(payload),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.all });
      if (isOffline()) {
        toast.info('Offline queue', 'Lead saved locally and will sync when you reconnect.');
      }
      options?.onSuccess?.(lead);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not save lead offline.';
      toast.error('Lead not saved', message);
    },
  });
}

export function useUpdateLead(options?: { onSuccess?: (lead: Lead) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number | string; payload: UpdateLeadPayload }) =>
      crmApi.updateLead(id, payload),

    onMutate: async ({ id, payload }) => {
      const key = crmKeys.lead(id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Lead>(key);
      queryClient.setQueryData<Lead>(key, (old) =>
        old
          ? {
              ...old,
              status: payload.status ?? old.status,
              name: payload.name ?? old.name,
              email: payload.email !== undefined ? payload.email : old.email,
              phone: payload.phone !== undefined ? payload.phone : old.phone,
              location: payload.location !== undefined ? payload.location : old.location,
            }
          : old,
      );
      return { previous };
    },

    onError: (_err, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(crmKeys.lead(id), context.previous);
      }
    },

    onSettled: (_data, _err, { id }) => {
      if (!isOffline()) {
        queryClient.invalidateQueries({ queryKey: crmKeys.lead(id) });
        queryClient.invalidateQueries({ queryKey: crmKeys.all });
        queryClient.invalidateQueries({ queryKey: locationKeys.lists() });
      }
    },

    onSuccess: (lead) => {
      if (isOffline()) {
        toast.info('Offline queue', 'Lead update will sync automatically.');
      }
      options?.onSuccess?.(lead);
    },
  });
}
