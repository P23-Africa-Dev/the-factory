import { apiRequest, ApiEnvelope } from "./onboarding";

export type CalendarIntegrationStatus = {
    connected: boolean;
    status: string;
    organizer_email?: string | null;
    owner_user_id?: number | null;
    requires_owner_action: boolean;
    last_error_message?: string | null;
    connected_at?: string | null;
    disconnected_at?: string | null;
};

export function getCalendarIntegrationStatus(
    params: { company_id?: number | string },
    token: string
): Promise<ApiEnvelope<CalendarIntegrationStatus>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<CalendarIntegrationStatus>({
        method: "GET",
        path: `/calendar/integration/status${query}`,
        token,
    });
}

export function createCalendarConnectUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/integration/connect-url",
        body: payload,
        token,
    });
}

export function disconnectCalendarIntegration(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ disconnected: boolean }>> {
    return apiRequest<{ disconnected: boolean }>({
        method: "DELETE",
        path: "/calendar/integration/disconnect",
        body: payload,
        token,
    });
}
