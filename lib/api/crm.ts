"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type ApiRoleBasePath = "/admin" | "/agent";

export type ApiLeadStatus = string;

export type ApiLeadPriority = "high" | "medium" | "low" | "urgent";

export type LeadActor = {
    id: number;
    name: string;
    email: string;
    avatar_url?: string | null;
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
    pipeline_id?: number | null;
    company_location_id?: number | null;
    linked_to_map?: boolean;
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
    pipeline?: {
        id: number;
        name: string;
        currency_code: string;
    } | null;
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
    pipeline_id?: number | string;
    source?: string;
    search?: string;
    assigned_to_user_id?: number | string;
    per_page?: number;
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
    name?: string;
    color?: string;
    count: number;
};

export type PipelineSnapshot = {
    total: number;
    stages: PipelineStage[];
};

export type CreateLeadPayload = {
    company_id: number | string;
    pipeline_id: number | string;
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
    pipeline_id?: number | string;
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

export type CrmPipeline = {
    id: number;
    company_id: number;
    name: string;
    currency_code: string;
    sort_order: number;
    is_default: boolean;
};

export type CrmLabel = {
    id: number;
    company_id: number;
    name: string;
    slug: string;
    color: string;
    sort_order: number;
    is_default: boolean;
};

export type ImportLeadRow = {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    source?: string;
    status?: string;
    priority?: ApiLeadPriority;
};

export type FailedImportRow = {
    row_index: number;
    data: ImportLeadRow;
    errors: string[];
};

export type ImportLeadsResult = {
    imported_count: number;
    failed_rows: FailedImportRow[];
};

export type AgentUploadOverview = {
    total_uploaded_leads: number;
    top_agent: {
        id: number;
        name: string;
        email: string;
        avatar_url: string | null;
        total_uploads: number;
    } | null;
    recent_leads: Array<{
        id: number;
        name: string;
        status: string;
        source?: string | null;
        created_at?: string | null;
        creator?: LeadActor | null;
    }>;
    source_filter: string;
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
        pipeline_id: params.pipeline_id,
        source: params.source,
        search: params.search,
        assigned_to_user_id: params.assigned_to_user_id,
        per_page: params.per_page,
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

export function listCrmPipelines(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ items: CrmPipeline[] }>> {
    const query = buildQuery({ company_id: params.company_id });
    return apiRequest<{ items: CrmPipeline[] }>({
        method: "GET",
        path: withBase(basePath, `/crm/pipelines${query}`),
        token,
    });
}

export function createCrmPipeline(
    payload: { company_id: number | string; name: string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ pipeline: CrmPipeline }>> {
    return apiRequest<{ pipeline: CrmPipeline }>({
        method: "POST",
        path: withBase(basePath, "/crm/pipelines"),
        body: payload,
        token,
    });
}

export function updateCrmPipeline(
    pipelineId: number | string,
    payload: { company_id?: number | string; name?: string; sort_order?: number },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ pipeline: CrmPipeline }>> {
    return apiRequest<{ pipeline: CrmPipeline }>({
        method: "PATCH",
        path: withBase(basePath, `/crm/pipelines/${pipelineId}`),
        body: payload,
        token,
    });
}

export function listCrmLabels(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ items: CrmLabel[] }>> {
    const query = buildQuery({ company_id: params.company_id });
    return apiRequest<{ items: CrmLabel[] }>({
        method: "GET",
        path: withBase(basePath, `/crm/labels${query}`),
        token,
    });
}

export function createCrmLabel(
    payload: { company_id: number | string; name: string; color: string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ label: CrmLabel }>> {
    return apiRequest<{ label: CrmLabel }>({
        method: "POST",
        path: withBase(basePath, "/crm/labels"),
        body: payload,
        token,
    });
}

export function updateCrmLabel(
    labelId: number | string,
    payload: { company_id?: number | string; name?: string; color?: string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ label: CrmLabel }>> {
    return apiRequest<{ label: CrmLabel }>({
        method: "PATCH",
        path: withBase(basePath, `/crm/labels/${labelId}`),
        body: payload,
        token,
    });
}

export function deleteCrmLabel(
    labelId: number | string,
    payload: { company_id?: number | string; force?: boolean },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ deleted_label_id: number; deleted_leads_count: number; reassigned_to_label_slug?: string | null; reassigned_to_label_name?: string | null }>> {
    return apiRequest<{ deleted_label_id: number; deleted_leads_count: number; reassigned_to_label_slug?: string | null; reassigned_to_label_name?: string | null }>({
        method: "POST",
        path: withBase(basePath, `/crm/labels/${labelId}/delete`),
        body: payload,
        token,
    });
}

export function reorderCrmLabels(
    payload: { company_id: number | string; ordered_label_ids: Array<number | string> },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ items: CrmLabel[] }>> {
    return apiRequest<{ items: CrmLabel[] }>({
        method: "POST",
        path: withBase(basePath, "/crm/labels/reorder"),
        body: payload,
        token,
    });
}

export function importCrmLeads(
    payload: { company_id: number | string; pipeline_id: number | string; rows: ImportLeadRow[] },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<ImportLeadsResult>> {
    return apiRequest<ImportLeadsResult>({
        method: "POST",
        path: withBase(basePath, "/crm/leads/import"),
        body: payload,
        token,
    });
}

export function getAgentUploadsOverview(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<AgentUploadOverview>> {
    const query = buildQuery({ company_id: params.company_id });

    return apiRequest<AgentUploadOverview>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/agent-uploads-overview${query}`),
        token,
    });
}
