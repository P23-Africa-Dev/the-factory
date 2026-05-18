"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type ApiRoleBasePath = "/admin" | "/agent";

export type ApiLeadStatus =
    | "new"
    | "contacted"
    | "qualified"
    | "proposal_sent"
    | "won"
    | "lost"
    | "unqualified";

export type ApiLeadPriority = "high" | "medium" | "low";

export type LeadActor = {
    id: number;
    name: string;
    email: string;
};

export type LeadNote = {
    id: number;
    lead_id: number;
    company_id: number;
    note: string;
    creator?: LeadActor | null;
    created_at?: string;
    updated_at?: string;
};

export type LeadActivity = {
    id: number;
    lead_id: number;
    company_id: number;
    type: string;
    title?: string | null;
    description?: string | null;
    happened_at?: string | null;
    meta?: Record<string, unknown> | null;
    creator?: LeadActor | null;
    created_at?: string;
    updated_at?: string;
};

export type LeadApiItem = {
    id: number;
    company_id: number;
    created_by_user_id: number;
    assigned_to_user_id?: number | null;
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    source?: string | null;
    status?: ApiLeadStatus | null;
    priority?: ApiLeadPriority | null;
    next_action?: string | null;
    last_interaction?: string | null;
    last_interaction_at?: string | null;
    meta?: Record<string, unknown> | null;
    converted_at?: string | null;
    creator?: LeadActor | null;
    assignee?: LeadActor | null;
    notes?: LeadNote[];
    activities?: LeadActivity[];
    created_at?: string;
    updated_at?: string;
};

export type PaginationData = {
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
    current_page?: number;
    total?: number;
    last_page?: number;
};

export type ListLeadsParams = {
    company_id?: number | string;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    source?: string;
    search?: string;
    assigned_to_user_id?: number | string;
    page?: number;
};

export type LeadsListData = {
    items: LeadApiItem[];
    pagination: PaginationData;
};

export type LeadDetailData = {
    lead: LeadApiItem;
};

export type PipelineStage = {
    status: ApiLeadStatus;
    count: number;
};

export type PipelineSnapshot = {
    total: number;
    stages: PipelineStage[];
};

export type CreateLeadPayload = {
    company_id: number | string;
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    source?: string | null;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    next_action?: string | null;
    last_interaction?: string | null;
    last_interaction_at?: string | null;
    assigned_to_user_id?: number | null;
    meta?: Record<string, unknown> | null;
};

export type UpdateLeadPayload = {
    company_id?: number | string;
    name?: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    source?: string | null;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    next_action?: string | null;
    last_interaction?: string | null;
    last_interaction_at?: string | null;
    assigned_to_user_id?: number | null;
    converted_at?: string | null;
    meta?: Record<string, unknown> | null;
};

export type AddLeadNotePayload = {
    company_id?: number | string;
    note: string;
};

export type AddLeadActivityPayload = {
    company_id?: number | string;
    type: string;
    title?: string;
    description?: string;
    happened_at?: string;
    meta?: Record<string, unknown> | null;
};

function buildQuery(params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            qs.set(key, String(value));
        }
    });

    const query = qs.toString();
    return query ? `?${query}` : "";
}

function withBase(basePath: ApiRoleBasePath, path: string) {
    return `${basePath}${path}`;
}

export function listLeads(
    params: ListLeadsParams,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadsListData>> {
    const query = buildQuery({
        company_id: params.company_id,
        status: params.status,
        priority: params.priority,
        source: params.source,
        search: params.search,
        assigned_to_user_id: params.assigned_to_user_id,
        page: params.page,
    });

    return apiRequest<LeadsListData>({
        method: "GET",
        path: withBase(basePath, `/crm/leads${query}`),
        token,
    });
}

export function getLead(
    leadId: number | string,
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadDetailData>> {
    const query = buildQuery({ company_id: params.company_id });

    return apiRequest<LeadDetailData>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/${leadId}${query}`),
        token,
    });
}

export function createLead(
    payload: CreateLeadPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadDetailData>> {
    return apiRequest<LeadDetailData>({
        method: "POST",
        path: withBase(basePath, "/crm/leads"),
        body: payload,
        token,
    });
}

export function updateLead(
    leadId: number | string,
    payload: UpdateLeadPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadDetailData>> {
    return apiRequest<LeadDetailData>({
        method: "PATCH",
        path: withBase(basePath, `/crm/leads/${leadId}`),
        body: payload,
        token,
    });
}

export function getLeadPipeline(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<PipelineSnapshot>> {
    const query = buildQuery({ company_id: params.company_id });

    return apiRequest<PipelineSnapshot>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/pipeline${query}`),
        token,
    });
}

export function addLeadNote(
    leadId: number | string,
    payload: AddLeadNotePayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ note: LeadNote }>> {
    return apiRequest<{ note: LeadNote }>({
        method: "POST",
        path: withBase(basePath, `/crm/leads/${leadId}/notes`),
        body: payload,
        token,
    });
}

export function addLeadActivity(
    leadId: number | string,
    payload: AddLeadActivityPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ activity: LeadActivity }>> {
    return apiRequest<{ activity: LeadActivity }>({
        method: "POST",
        path: withBase(basePath, `/crm/leads/${leadId}/activities`),
        body: payload,
        token,
    });
}
