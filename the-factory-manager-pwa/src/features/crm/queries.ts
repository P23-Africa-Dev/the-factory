import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
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
  CreateLeadFieldPayload,
  LeadFieldDefinition,
} from './types';

function isSignedInClient(): boolean {
  return typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
}

export function useLeads(filters?: LeadFilters) {
  return useQuery<LeadsResult>({
    queryKey: crmKeys.leads(filters),
    queryFn: () => crmApi.listLeads(filters),
    enabled: isSignedInClient(),
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

export function useCrmAssignees() {
  return useQuery({
    queryKey: [...crmKeys.all, 'assignees'],
    queryFn: () => crmApi.getAssignees(),
    enabled: isSignedInClient(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrmAnalytics(pipelineId?: number) {
  return useQuery({
    queryKey: [...crmKeys.all, 'analytics', pipelineId],
    queryFn: () => crmApi.getAnalytics(pipelineId ? { pipeline_id: pipelineId } : undefined),
    enabled: isSignedInClient(),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCrmLabels() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: crmKeys.labels(companyId),
    queryFn: () => crmApi.listLabels(),
    enabled: isSignedInClient(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCrmPipelines() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: crmKeys.pipelines(companyId),
    queryFn: () => crmApi.listPipelines(),
    enabled: isSignedInClient(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useAgentUploadsOverview() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: crmKeys.agentOverview(companyId),
    queryFn: () => crmApi.getAgentUploadsOverview(),
    enabled: isSignedInClient(),
    staleTime: 1000 * 60,
  });
}

export function useCreateLead(options?: { onSuccess?: (lead: Lead) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateLeadPayload) => crmApi.createLead(payload),
    onSuccess: (lead) => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
      if (isOffline()) {
        toast.info('Offline queue', 'Lead saved locally and will sync when you reconnect.');
      }
      options?.onSuccess?.(lead);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not save lead.';
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
              assignedToUserId:
                payload.assigned_to_user_id !== undefined
                  ? payload.assigned_to_user_id
                  : old.assignedToUserId,
              customFields: payload.custom_fields
                ? { ...old.customFields, ...payload.custom_fields }
                : old.customFields,
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
        void queryClient.invalidateQueries({ queryKey: crmKeys.lead(id) });
        void queryClient.invalidateQueries({ queryKey: crmKeys.all });
        void queryClient.invalidateQueries({ queryKey: locationKeys.lists() });
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

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => crmApi.deleteLead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.all });
      toast.success('Lead deleted');
    },
  });
}

export function useAddLeadNote(leadId: number | string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => crmApi.addLeadNote(leadId, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.lead(leadId) });
      toast.success('Note added');
    },
  });
}

export function useAddLeadActivity(leadId: number | string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      type: string;
      title?: string;
      description?: string;
      happened_at?: string;
    }) => crmApi.addLeadActivity(leadId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.lead(leadId) });
      toast.success('Activity logged');
    },
  });
}

export function useLeadFields() {
  const companyId = getActiveCompanyId();
  return useQuery<LeadFieldDefinition[]>({
    queryKey: crmKeys.leadFields(companyId),
    queryFn: () => crmApi.listLeadFields(),
    enabled: isSignedInClient(),
    staleTime: 1000 * 60,
  });
}

export function useCreateLeadField(options?: { onSuccess?: (field: LeadFieldDefinition) => void }) {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: (payload: CreateLeadFieldPayload) => crmApi.createLeadField(payload),
    onSuccess: (field) => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.leadFields(companyId) });
      toast.success('Lead field added');
      options?.onSuccess?.(field);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not add the lead field.';
      toast.error('Field not added', message);
    },
  });
}

export function useApproveLeadField() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();
  return useMutation({
    mutationFn: (fieldId: number | string) => crmApi.approveLeadField(fieldId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.leadFields(companyId) });
      toast.success('Custom lead field approved');
    },
  });
}

export function useDeclineLeadField() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();
  return useMutation({
    mutationFn: (fieldId: number | string) => crmApi.declineLeadField(fieldId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: crmKeys.leadFields(companyId) });
      toast.success('Custom lead field declined');
    },
  });
}
