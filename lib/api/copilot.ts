"use client";

import { API_BASE_URL, apiRequest, ApiEnvelope, ApiRequestError } from "./onboarding";

export type CopilotSource = string;

export type CopilotMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources: CopilotSource[];
    tool: string | null;
    payload: unknown;
    created_at: string;
};

export type CopilotThread = {
    thread_id: string;
    company_id: number;
    user_id: number;
    created_at: string;
    updated_at: string;
    messages: CopilotMessage[];
};

export type CopilotThreadSummary = {
    thread_id: string;
    updated_at: string;
    created_at: string;
    message_count: number;
    last_message_preview: string | null;
};

export type CopilotChatRequest = {
    message: string;
    company_id?: number | string;
    thread_id?: string;
    action_args?: Record<string, unknown>;
    action_confirmed?: boolean;
    idempotency_key?: string;
};

export type CopilotChatResponse = {
    thread_id: string;
    role: string;
    company_id: number;
    intent: {
        type: string;
        tool: string | null;
        confidence: number;
    };
    response: {
        content: string;
        tool: string | null;
        sources: CopilotSource[];
        payload: unknown;
    };
};

export type StreamEventMeta = {
    thread_id: string;
};

export type StreamEventDelta = {
    chunk: string;
};

export type StreamEventDone = {
    thread_id: string;
    message: string;
    tool: string | null;
    sources: CopilotSource[];
    payload: unknown;
};

export type WeeklySummaryQueueResponse = {
    report_id: string;
    status: string;
    queued: boolean;
};

export type WeeklySummaryStatusResponse = {
    report_id: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    error: string | null;
    available: boolean;
};

export type CopilotAssigneeOption = {
    id: number;
    name: string;
    email: string;
    role: string | null;
};

function buildQuery(companyId?: number | string): string {
    if (companyId === undefined || companyId === null || String(companyId).trim() === "") {
        return "";
    }

    return `?company_id=${encodeURIComponent(String(companyId))}`;
}

export function listCopilotThreads(
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<{ items: CopilotThreadSummary[] }>> {
    return apiRequest<{ items: CopilotThreadSummary[] }>({
        method: "GET",
        path: `/copilot/threads${buildQuery(companyId)}`,
        token,
    });
}

export function getCopilotThread(
    threadId: string,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<{ thread: CopilotThread }>> {
    return apiRequest<{ thread: CopilotThread }>({
        method: "GET",
        path: `/copilot/threads/${encodeURIComponent(threadId)}${buildQuery(companyId)}`,
        token,
    });
}

export function deleteCopilotThread(
    threadId: string,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<{ deleted: boolean }>> {
    return apiRequest<{ deleted: boolean }>({
        method: "DELETE",
        path: `/copilot/threads/${encodeURIComponent(threadId)}${buildQuery(companyId)}`,
        token,
    });
}

export function sendCopilotMessage(
    payload: CopilotChatRequest,
    token: string
): Promise<ApiEnvelope<CopilotChatResponse>> {
    return apiRequest<CopilotChatResponse>({
        method: "POST",
        path: "/copilot/chat",
        body: {
            ...payload,
            stream: false,
        },
        token,
    });
}

export function lookupCopilotAssignees(
    token: string,
    query: string,
    companyId?: number | string,
    limit = 8
): Promise<ApiEnvelope<{ items: CopilotAssigneeOption[] }>> {
    const params = new URLSearchParams();
    const trimmed = query.trim();

    if (trimmed !== "") {
        params.set("query", trimmed);
    }

    params.set("limit", String(limit));

    if (companyId !== undefined && companyId !== null && String(companyId).trim() !== "") {
        params.set("company_id", String(companyId));
    }

    const suffix = params.toString();

    return apiRequest<{ items: CopilotAssigneeOption[] }>({
        method: "GET",
        path: `/copilot/assignees${suffix ? `?${suffix}` : ""}`,
        token,
    });
}

export function queueWeeklySummaryReport(
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<WeeklySummaryQueueResponse>> {
    return apiRequest<WeeklySummaryQueueResponse>({
        method: "POST",
        path: "/copilot/reports/weekly-summary",
        body: {
            ...(companyId !== undefined && companyId !== null ? { company_id: companyId } : {}),
        },
        token,
    });
}

export function getWeeklySummaryStatus(
    reportId: string,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<WeeklySummaryStatusResponse>> {
    return apiRequest<WeeklySummaryStatusResponse>({
        method: "GET",
        path: `/copilot/reports/weekly-summary/${encodeURIComponent(reportId)}${buildQuery(companyId)}`,
        token,
    });
}

export async function downloadWeeklySummaryReport(
    reportId: string,
    token: string,
    companyId?: number | string
): Promise<{ filename: string; content: string }> {
    const response = await fetch(
        `${API_BASE_URL}/copilot/reports/weekly-summary/${encodeURIComponent(reportId)}/download${buildQuery(companyId)}`,
        {
            method: "GET",
            headers: {
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiRequestError(payload?.message ?? "Unable to download weekly summary.", response.status, payload);
    }

    const body = String(payload?.data?.content ?? "");
    const filename = String(payload?.data?.filename ?? `weekly-summary-${reportId}.json`);
    return { filename, content: body };
}

export function transcribeVoiceInput(
    file: File,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<Record<string, unknown>>> {
    const formData = new FormData();
    formData.append("audio", file);
    if (companyId !== undefined && companyId !== null) {
        formData.append("company_id", String(companyId));
    }

    return apiRequest<Record<string, unknown>>({
        method: "POST",
        path: "/copilot/voice/transcriptions",
        body: formData,
        token,
    });
}

export function analyzeCopilotFile(
    file: File,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<Record<string, unknown>>> {
    const formData = new FormData();
    formData.append("file", file);
    if (companyId !== undefined && companyId !== null) {
        formData.append("company_id", String(companyId));
    }

    return apiRequest<Record<string, unknown>>({
        method: "POST",
        path: "/copilot/files/analyze",
        body: formData,
        token,
    });
}

export function summarizeMeetingTranscript(
    token: string,
    payload: {
        transcript: string;
        meeting_id?: number;
        company_id?: number | string;
    }
): Promise<ApiEnvelope<Record<string, unknown>>> {
    return apiRequest<Record<string, unknown>>({
        method: "POST",
        path: "/copilot/meetings/transcripts/summarize",
        body: payload,
        token,
    });
}

export function getForecastOverview(
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<Record<string, unknown>>> {
    return apiRequest<Record<string, unknown>>({
        method: "GET",
        path: `/copilot/forecast/overview${buildQuery(companyId)}`,
        token,
    });
}

export async function sendCopilotMessageStream(
    payload: CopilotChatRequest,
    token: string,
    handlers: {
        onMeta?: (event: StreamEventMeta) => void;
        onDelta?: (event: StreamEventDelta) => void;
        onDone?: (event: StreamEventDone) => void;
    } = {}
): Promise<StreamEventDone> {
    const response = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream, application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
            ...payload,
            stream: true,
        }),
    });

    if (!response.ok) {
        let message = "Unable to start Copilot streaming response.";
        try {
            const errorPayload = await response.json();
            message = errorPayload?.message ?? message;
        } catch { }

        throw new ApiRequestError(message, response.status, null);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const payloadJson = (await response.json()) as ApiEnvelope<CopilotChatResponse>;
        const doneEvent: StreamEventDone = {
            thread_id: payloadJson?.data?.thread_id ?? "",
            message: payloadJson?.data?.response?.content ?? "",
            tool: payloadJson?.data?.response?.tool ?? null,
            sources: payloadJson?.data?.response?.sources ?? [],
            payload: payloadJson?.data?.response?.payload ?? null,
        };

        handlers.onMeta?.({ thread_id: doneEvent.thread_id });
        handlers.onDone?.(doneEvent);
        return doneEvent;
    }

    if (!response.body) {
        throw new ApiRequestError("Copilot stream response body is empty.", 500, null);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneEvent: StreamEventDone | null = null;
    let lastMeta: StreamEventMeta | null = null;
    let accumulatedMessage = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
            const eventMatch = frame.match(/event:\s*(.+)/);
            const dataMatch = frame.match(/data:\s*(.+)/);
            if (!eventMatch || !dataMatch) {
                continue;
            }

            const eventName = eventMatch[1].trim();
            let parsed: unknown = null;
            try {
                parsed = JSON.parse(dataMatch[1]);
            } catch {
                continue;
            }

            if (eventName === "meta") {
                lastMeta = parsed as StreamEventMeta;
                handlers.onMeta?.(lastMeta);
            } else if (eventName === "delta") {
                const deltaEvent = parsed as StreamEventDelta;
                accumulatedMessage += deltaEvent.chunk ?? "";
                handlers.onDelta?.(deltaEvent);
            } else if (eventName === "done") {
                doneEvent = parsed as StreamEventDone;
                handlers.onDone?.(doneEvent);
            }
        }
    }

    if (!doneEvent) {
        if (lastMeta) {
            doneEvent = {
                thread_id: lastMeta.thread_id,
                message: accumulatedMessage.trim(),
                tool: null,
                sources: [],
                payload: null,
            };
            handlers.onDone?.(doneEvent);
            return doneEvent;
        }

        throw new ApiRequestError("Copilot stream ended unexpectedly.", 500, null);
    }

    return doneEvent;
}
