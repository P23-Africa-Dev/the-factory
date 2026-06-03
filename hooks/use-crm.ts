"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
    addLeadActivity,
    addLeadNote,
    createCrmLabel,
    deleteCrmLabel,
    createCrmPipeline,
    createLead,
    getAgentUploadsOverview,
    getLead,
    getLeadPipeline,
    importCrmLeads,
    listCrmLabels,
    listCrmPipelines,
    listLeads,
    reorderCrmLabels,
    type CrmLabel,
    type CrmPipeline,
    type ImportLeadRow,
    type ImportLeadsResult,
    updateLead,
    updateCrmLabel,
    updateCrmPipeline,
    type AddLeadActivityPayload,
    type AddLeadNotePayload,
    type AgentUploadOverview,
    type ApiRoleBasePath,
    type CreateLeadPayload,
    type LeadActivity,
    type LeadApiItem,
    type LeadNote,
    type ListLeadsParams,
    type PaginationData,
    type PipelineSnapshot,
    type UpdateLeadPayload,
} from "@/lib/api/crm";

export const CRM_KEYS = {
    all: ["crm"] as const,
    list: (params: ListLeadsParams, basePath: ApiRoleBasePath) =>
        ["crm", "leads", basePath, params] as const,
    detail: (
        leadId: number | string,
        companyId: number | string | undefined,
        basePath: ApiRoleBasePath
    ) => ["crm", "lead", basePath, leadId, companyId] as const,
    pipeline: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "pipeline", basePath, companyId] as const,
    pipelines: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "pipelines", basePath, companyId] as const,
    labels: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "labels", basePath, companyId] as const,
    agentUploadsOverview: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "agent-uploads-overview", basePath, companyId] as const,
};

export type LeadsResult = {
    leads: LeadApiItem[];
    pagination: PaginationData;
};

export function useLeads(
    params: ListLeadsParams = {},
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.list(params, basePath),
        queryFn: async (): Promise<LeadsResult> => {
            const res = await listLeads(params, token, basePath);
            return {
                leads: res.data.items,
                pagination: res.data.pagination,
            };
        },
        enabled: !!token && !!params.company_id,
        staleTime: 1000 * 60 * 2,
    });
}

export function useLeadPipeline(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.pipeline(companyId, basePath),
        queryFn: async (): Promise<PipelineSnapshot> => {
            const res = await getLeadPipeline({ company_id: companyId }, token, basePath);
            return res.data;
        },
        enabled: !!token && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useLead(
    leadId: number | string,
    companyId?: number | string,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.detail(leadId, companyId, basePath),
        queryFn: async (): Promise<LeadApiItem> => {
            const res = await getLead(leadId, { company_id: companyId }, token, basePath);
            return res.data.lead;
        },
        enabled: !!token && !!leadId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useCrmPipelines(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.pipelines(companyId, basePath),
        queryFn: async (): Promise<CrmPipeline[]> => {
            const res = await listCrmPipelines({ company_id: companyId }, token, basePath);
            return res.data.items;
        },
        enabled: !!token && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useCrmLabels(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.labels(companyId, basePath),
        queryFn: async (): Promise<CrmLabel[]> => {
            const res = await listCrmLabels({ company_id: companyId }, token, basePath);
            return res.data.items;
        },
        enabled: !!token && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useAgentUploadsOverview(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.agentUploadsOverview(companyId, basePath),
        queryFn: async (): Promise<AgentUploadOverview> => {
            const res = await getAgentUploadsOverview({ company_id: companyId }, token, basePath);
            return res.data;
        },
        enabled: !!token && !!companyId,
        staleTime: 1000 * 60,
    });
}

export function useCreateLead(
    options?: { onSuccess?: (lead: LeadApiItem) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: CreateLeadPayload) => createLead(payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.lead);
        },
    });
}

export function useUpdateLead(
    options?: { onSuccess?: (lead: LeadApiItem) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            payload,
        }: {
            leadId: number | string;
            payload: UpdateLeadPayload;
        }) => updateLead(leadId, payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.lead);
        },
    });
}

export function useAddLeadNote(
    options?: { onSuccess?: (note: LeadNote) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            payload,
        }: {
            leadId: number | string;
            payload: AddLeadNotePayload;
        }) => addLeadNote(leadId, payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.note);
        },
    });
}

export function useAddLeadActivity(
    options?: { onSuccess?: (activity: LeadActivity) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            payload,
        }: {
            leadId: number | string;
            payload: AddLeadActivityPayload;
        }) => addLeadActivity(leadId, payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.activity);
        },
    });
}

export function useCreateCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; name: string }) =>
            createCrmPipeline(payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useUpdateCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            pipelineId,
            payload,
        }: {
            pipelineId: number | string;
            payload: { company_id?: number | string; name?: string; sort_order?: number };
        }) => updateCrmPipeline(pipelineId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useCreateCrmLabel(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; name: string; color: string }) =>
            createCrmLabel(payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useUpdateCrmLabel(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            labelId,
            payload,
        }: {
            labelId: number | string;
            payload: { company_id?: number | string; name?: string; color?: string };
        }) => updateCrmLabel(labelId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useReorderCrmLabels(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; ordered_label_ids: Array<number | string> }) =>
            reorderCrmLabels(payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useDeleteCrmLabel(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            labelId,
            payload,
        }: {
            labelId: number | string;
            payload: { company_id?: number | string; force?: boolean };
        }) => deleteCrmLabel(labelId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useImportCrmLeads(basePath: ApiRoleBasePath = "/admin") {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; pipeline_id: number | string; rows: ImportLeadRow[] }) =>
            importCrmLeads(payload, token, basePath),
    });
}
