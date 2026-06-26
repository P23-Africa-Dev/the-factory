"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
    deleteLeadEmail,
    getCrmEmailActivity,
    getLeadEmailThread,
    listLeadEmails,
    markLeadEmailRead,
    replyLeadEmail,
    sendLeadEmail,
    uploadLeadEmailAttachment,
    type CrmEmailMessage,
    type SendCrmEmailPayload,
} from "@/lib/api/crm-emails";
import type { ApiRoleBasePath } from "@/lib/api/crm";

export const CRM_EMAIL_KEYS = {
    all: ["crm-emails"] as const,
    lead: (
        leadId: number | string,
        companyId: number | string | undefined,
        basePath: ApiRoleBasePath,
    ) => ["crm-emails", basePath, leadId, companyId] as const,
    thread: (
        leadId: number | string,
        threadId: number | string,
        companyId: number | string | undefined,
        basePath: ApiRoleBasePath,
    ) => ["crm-emails", "thread", basePath, leadId, threadId, companyId] as const,
    activity: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm-emails", "activity", basePath, companyId] as const,
};

export function useLeadEmails(
    leadId: number | string,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
    options?: { sync?: boolean },
) {
    const token = getAuthTokenFromDocument();

    return useQuery({
        queryKey: [...CRM_EMAIL_KEYS.lead(leadId, companyId, basePath), options?.sync ?? false],
        enabled: Boolean(token && leadId),
        refetchInterval: options?.sync ? 15_000 : false,
        queryFn: async () => {
            const response = await listLeadEmails(
                basePath,
                leadId,
                { company_id: companyId, sync: options?.sync, per_page: 50 },
                token!,
            );
            return response.data;
        },
    });
}

export function useLeadEmailThread(
    leadId: number | string,
    threadId: number | string | null,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
) {
    const token = getAuthTokenFromDocument();

    return useQuery({
        queryKey: CRM_EMAIL_KEYS.thread(leadId, threadId ?? 0, companyId, basePath),
        enabled: Boolean(token && leadId && threadId),
        queryFn: async () => {
            const response = await getLeadEmailThread(
                basePath,
                leadId,
                threadId!,
                { company_id: companyId },
                token!,
            );
            return response.data.thread;
        },
    });
}

export function useSendLeadEmail(
    leadId: number | string,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
    options?: { onSuccess?: (message: CrmEmailMessage) => void },
) {
    const queryClient = useQueryClient();
    const token = getAuthTokenFromDocument();

    return useMutation({
        mutationFn: async (payload: SendCrmEmailPayload) => {
            const response = await sendLeadEmail(basePath, leadId, {
                ...payload,
                company_id: companyId,
            }, token!);
            return response.data.message;
        },
        onSuccess: (message) => {
            queryClient.invalidateQueries({
                queryKey: CRM_EMAIL_KEYS.lead(leadId, companyId, basePath),
            });
            options?.onSuccess?.(message);
        },
    });
}

export function useReplyLeadEmail(
    leadId: number | string,
    threadId: number | string,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
    options?: { onSuccess?: (message: CrmEmailMessage) => void },
) {
    const queryClient = useQueryClient();
    const token = getAuthTokenFromDocument();

    return useMutation({
        mutationFn: async (payload: SendCrmEmailPayload) => {
            const response = await replyLeadEmail(basePath, leadId, threadId, {
                ...payload,
                company_id: companyId,
            }, token!);
            return response.data.message;
        },
        onSuccess: (message) => {
            queryClient.invalidateQueries({
                queryKey: CRM_EMAIL_KEYS.lead(leadId, companyId, basePath),
            });
            queryClient.invalidateQueries({
                queryKey: CRM_EMAIL_KEYS.thread(leadId, threadId, companyId, basePath),
            });
            options?.onSuccess?.(message);
        },
    });
}

export function useMarkLeadEmailRead(
    leadId: number | string,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
) {
    const queryClient = useQueryClient();
    const token = getAuthTokenFromDocument();

    return useMutation({
        mutationFn: async (messageId: number | string) => {
            const response = await markLeadEmailRead(
                basePath,
                leadId,
                messageId,
                { company_id: companyId },
                token!,
            );
            return response.data.message;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: CRM_EMAIL_KEYS.lead(leadId, companyId, basePath),
            });
        },
    });
}

export function useDeleteLeadEmail(
    leadId: number | string,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
) {
    const queryClient = useQueryClient();
    const token = getAuthTokenFromDocument();

    return useMutation({
        mutationFn: async (messageId: number | string) => {
            await deleteLeadEmail(basePath, leadId, messageId, { company_id: companyId }, token!);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: CRM_EMAIL_KEYS.lead(leadId, companyId, basePath),
            });
        },
    });
}

export function useUploadEmailAttachment(
    leadId: number | string,
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
) {
    const token = getAuthTokenFromDocument();

    return useMutation({
        mutationFn: async (file: File) => {
            const response = await uploadLeadEmailAttachment(
                basePath,
                leadId,
                file,
                companyId,
                token!,
            );
            return response.data.attachment;
        },
    });
}

export function useCrmEmailActivity(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin",
) {
    const token = getAuthTokenFromDocument();

    return useQuery({
        queryKey: CRM_EMAIL_KEYS.activity(companyId, basePath),
        enabled: Boolean(token && companyId),
        queryFn: async () => {
            const response = await getCrmEmailActivity(
                basePath,
                { company_id: companyId, limit: 5 },
                token!,
            );
            return response.data;
        },
    });
}
