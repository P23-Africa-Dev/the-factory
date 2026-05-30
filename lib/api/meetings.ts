import { apiRequest, ApiEnvelope } from "./onboarding";

export type MeetingSyncStatus = "pending" | "synced" | "failed" | "pending_setup";
export type MeetingStatus = "scheduled" | "cancelled" | "completed";

export type MeetingAttendee = {
    id?: number;
    user_id?: number | null;
    email: string;
    display_name?: string | null;
    response_status?: "needs_action" | "accepted" | "tentative" | "declined";
    is_optional?: boolean;
    is_organizer?: boolean;
};

export type MeetingItem = {
    id: number;
    company_id: number;
    created_by_user_id: number;
    project_id: number | null;
    task_id: number | null;
    title: string;
    description?: string | null;
    location?: string | null;
    timezone: string;
    start_at: string;
    end_at: string;
    status: MeetingStatus;
    source_page: "dashboard" | "operations" | "project" | "task" | "api";
    google_event_id?: string | null;
    google_calendar_id?: string | null;
    google_meet_url?: string | null;
    google_html_link?: string | null;
    sync_status: MeetingSyncStatus;
    sync_error_message?: string | null;
    synced_at?: string | null;
    external_updated_at?: string | null;
    attendees?: MeetingAttendee[];
};

export type MeetingsListParams = {
    company_id?: number | string;
    status?: MeetingStatus;
    project_id?: number | string;
    task_id?: number | string;
    from?: string;
    to?: string;
    per_page?: number;
};

export type MeetingsListData = {
    items: MeetingItem[];
    pagination: {
        next_page_url: string | null;
        prev_page_url: string | null;
        per_page: number;
    };
};

export type CreateMeetingPayload = {
    company_id: number | string;
    project_id?: number | string | null;
    task_id?: number | string | null;
    title: string;
    description?: string;
    location?: string;
    timezone: string;
    start_at: string;
    end_at: string;
    source_page?: "dashboard" | "operations" | "project" | "task" | "api";
    attendees?: Array<{
        email: string;
        display_name?: string;
        user_id?: number;
        is_optional?: boolean;
    }>;
};

export type UpdateMeetingPayload = Partial<
    Omit<CreateMeetingPayload, "company_id"> & {
        status: MeetingStatus;
        attendees: Array<{
            email: string;
            display_name?: string;
            user_id?: number;
            is_optional?: boolean;
        }>;
    }
> & {
    company_id: number | string;
};

export type MeetingMutationData = {
    meeting: MeetingItem;
    integration: {
        connected: boolean;
        status: string;
        requires_owner_action: boolean;
    };
    warnings: string[];
};

export type MeetingDetailData = {
    meeting: MeetingItem;
};

export function listMeetings(
    params: MeetingsListParams,
    token: string
): Promise<ApiEnvelope<MeetingsListData>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    if (params.status) qs.set("status", params.status);
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.task_id != null) qs.set("task_id", String(params.task_id));
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.per_page != null) qs.set("per_page", String(params.per_page));

    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<MeetingsListData>({
        method: "GET",
        path: `/meetings${query}`,
        token,
    });
}

export function createMeeting(
    payload: CreateMeetingPayload,
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "POST",
        path: "/meetings",
        body: payload,
        token,
    });
}

export function getMeeting(
    meetingId: number | string,
    params: { company_id?: number | string },
    token: string
): Promise<ApiEnvelope<MeetingDetailData>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<MeetingDetailData>({
        method: "GET",
        path: `/meetings/${meetingId}${query}`,
        token,
    });
}

export function updateMeeting(
    meetingId: number | string,
    payload: UpdateMeetingPayload,
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "PATCH",
        path: `/meetings/${meetingId}`,
        body: payload,
        token,
    });
}

export function cancelMeeting(
    meetingId: number | string,
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "DELETE",
        path: `/meetings/${meetingId}`,
        body: payload,
        token,
    });
}

export function resyncMeeting(
    meetingId: number | string,
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "POST",
        path: `/meetings/${meetingId}/resync`,
        body: payload,
        token,
    });
}
