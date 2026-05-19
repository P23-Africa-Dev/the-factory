"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
    addLeadActivity,
    addLeadNote,
    createLead,
    getLead,
    getLeadPipeline,
    listLeads,
    updateLead,
    type AddLeadActivityPayload,
    type AddLeadNotePayload,
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
