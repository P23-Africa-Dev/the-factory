"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import {
    addLeadActivity,
    addLeadNote,
    createCrmLabel,
    deleteCrmLabel,
    createCrmPipeline,
    deleteCrmPipeline,
    createLead,
    deleteLead,
    downloadCrmLeadsExport,
    getAgentUploadsOverview,
    getCrmLeadsAnalytics,
    getLead,
    getLeadPipeline,
    importCrmLeads,
    listCrmLabels,
    listCrmPipelines,
    listLeads,
    previewImportCrmLeads,
    reorderCrmLabels,
    type CrmLabel,
    type CrmPipeline,
    type ExportLeadsParams,
    type ImportLeadsPayload,
    updateLead,
    updateCrmLabel,
    updateCrmPipeline,
    type AddLeadActivityPayload,
    type AddLeadNotePayload,
    type AgentUploadOverview,
    type ApiRoleBasePath,
    type CrmLeadsAnalytics,
    type CrmLeadsAnalyticsParams,
    type CreateLeadPayload,
    type LeadActivity,
    type LeadApiItem,
    type LeadNote,
    type ListLeadsParams,
    type PaginationData,
    type PipelineSnapshot,
    type UpdateLeadPayload,
} from "@/lib/api/crm";
import { SAVED_LOCATION_KEYS } from "@/hooks/use-saved-locations";

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
    leadsAnalytics: (params: CrmLeadsAnalyticsParams, basePath: ApiRoleBasePath) =>
        ["crm", "leads-analytics", basePath, params] as const,
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
        enabled: hasActiveApiSession(token) && !!params.company_id,
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
        enabled: hasActiveApiSession(token) && !!companyId,
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
        enabled: hasActiveApiSession(token) && !!leadId,
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
        enabled: hasActiveApiSession(token) && !!companyId,
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
        enabled: hasActiveApiSession(token) && !!companyId,
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
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60,
    });
}

export function useCrmLeadsAnalytics(
    params: CrmLeadsAnalyticsParams = {},
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.leadsAnalytics(params, basePath),
        queryFn: async (): Promise<CrmLeadsAnalytics> => {
            const res = await getCrmLeadsAnalytics(params, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && !!params.company_id,
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
            if (res.data.lead.linked_to_map || res.data.lead.company_location_id) {
                queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
            }
            options?.onSuccess?.(res.data.lead);
        },
    });
}

export function useDeleteLead(
    options?: { onSuccess?: (deletedLeadId: number) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            companyId,
        }: {
            leadId: number | string;
            companyId: number | string | undefined;
        }) => deleteLead(leadId, companyId, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            // Deleting a lead unlinks any saved map location tied to it.
            queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
            options?.onSuccess?.(res.data.deleted_lead_id);
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

export function useDeleteCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            pipelineId,
            payload,
        }: {
            pipelineId: number | string;
            payload: { company_id?: number | string; force?: boolean };
        }) => deleteCrmPipeline(pipelineId, payload, token, basePath),
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
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: ImportLeadsPayload) => importCrmLeads(payload, token, basePath),
        // Invalidate even on partial success so the kanban/list reflects imported rows.
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function usePreviewImportCrmLeads(basePath: ApiRoleBasePath = "/admin") {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: ImportLeadsPayload) => previewImportCrmLeads(payload, token, basePath),
    });
}

export function useCrmLeadsExport(
    basePath: ApiRoleBasePath = "/admin",
    options?: { onSuccess?: () => void; onError?: (error: Error) => void }
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: async (params: ExportLeadsParams) => {
            const { blob, filename } = await downloadCrmLeadsExport(params, token, basePath);
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 500);
        },
        onSuccess: () => {
            options?.onSuccess?.();
        },
        onError: (error: Error) => {
            options?.onError?.(error);
        },
    });
}
