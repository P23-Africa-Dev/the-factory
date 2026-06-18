"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { resolveUserTimezone } from "@/lib/meeting-timezone";
import {
    CopilotAssigneeOption,
    CopilotMessage,
    CopilotThread,
    WeeklySummaryStatusResponse,
    analyzeCopilotFile,
    deleteCopilotThread,
    downloadWeeklySummaryReport,
    getForecastOverview,
    getCopilotThreadMessages,
    getCopilotThread,
    getWeeklySummaryStatus,
    lookupCopilotAssignees,
    listCopilotThreads,
    queueWeeklySummaryReport,
    sendCopilotMessageStream,
    summarizeMeetingTranscript,
    transcribeVoiceInput,
} from "@/lib/api/copilot";
import { useAuthStore } from "@/store/auth";

function storageKey(companyId: string | number | undefined, userId: number | undefined): string {
    return `factory_copilot_thread:${String(companyId ?? "unknown")}:${String(userId ?? "unknown")}`;
}

function normalizeThreadMessages(thread: CopilotThread | null): CopilotMessage[] {
    if (!thread || !Array.isArray(thread.messages)) {
        return [];
    }

    return thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sources: message.sources ?? [],
        tool: message.tool ?? null,
        payload: message.payload ?? null,
        created_at: message.created_at,
    }));
}

type SendMessageParams = {
    message: string;
    companyId?: number | string;
    actionArgs?: Record<string, unknown>;
    actionConfirmed?: boolean;
    idempotencyKey?: string;
};

function createIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `copilot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useCopilotChat() {
    const user = useAuthStore((state) => state.user);
    const [threadId, setThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<CopilotMessage[]>([]);
    const [threadPagination, setThreadPagination] = useState<{
        has_more: boolean;
        next_cursor: string | null;
        loaded_count: number;
    } | null>(null);
    const [threadMessageCount, setThreadMessageCount] = useState<number | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [weeklyReport, setWeeklyReport] = useState<WeeklySummaryStatusResponse | null>(null);
    const [isQueueingWeeklyReport, setIsQueueingWeeklyReport] = useState(false);
    const pollingIntervalRef = useRef<number | null>(null);

    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    const persistedKey = useMemo(() => storageKey(user?.active_company?.company_id ?? user?.active_company?.id, user?.id), [user?.active_company?.company_id, user?.active_company?.id, user?.id]);

    const loadThread = useCallback(
        async (targetThreadId: string, companyId?: string | number) => {
            if (!token) return;
            const threadRes = await getCopilotThread(targetThreadId, token, companyId);
            const thread = threadRes.data.thread;
            setThreadId(thread.thread_id);
            setMessages(normalizeThreadMessages(thread));
            setThreadMessageCount(thread.message_count ?? thread.messages.length);
            setThreadPagination(thread.pagination ?? null);
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(persistedKey, thread.thread_id);
            }
        },
        [persistedKey, token]
    );


    const initialize = useCallback(
        async (companyId?: string | number) => {
            if (!token) {
                setMessages([]);
                setThreadId(null);
                return;
            }

            setError(null);

            const threadsRes = await listCopilotThreads(token, companyId);
            const items = threadsRes.data.items ?? [];
            const preferred = typeof localStorage !== "undefined" ? localStorage.getItem(persistedKey) : null;
            const selected =
                (preferred && items.find((item) => item.thread_id === preferred)?.thread_id) ||
                items[0]?.thread_id ||
                null;

            if (!selected) {
                setMessages([]);
                setThreadId(null);
                return;
            }

            await loadThread(selected, companyId);
        },
        [loadThread, persistedKey, token]
    );

    const clearCurrentThread = useCallback(
        async (companyId?: string | number) => {
            if (!token || !threadId) return;
            await deleteCopilotThread(threadId, token, companyId);
            setMessages([]);
            setThreadId(null);
            if (typeof localStorage !== "undefined") {
                localStorage.removeItem(persistedKey);
            }
        },
        [persistedKey, threadId, token]
    );

    const loadOlderThreadMessages = useCallback(
        async (companyId?: string | number) => {
            if (!token || !threadId || !threadPagination?.next_cursor) {
                return;
            }

            const response = await getCopilotThreadMessages(threadId, token, companyId, threadPagination.next_cursor);
            const olderMessages = response.data.messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                sources: message.sources ?? [],
                tool: message.tool ?? null,
                payload: message.payload ?? null,
                created_at: message.created_at,
            }));

            setMessages((prev) => [...olderMessages, ...prev]);
            setThreadPagination(response.data.pagination);
        },
        [threadId, threadPagination?.next_cursor, token]
    );

    const stopWeeklyReportPolling = useCallback(() => {
        if (pollingIntervalRef.current !== null && typeof window !== "undefined") {
            window.clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    }, []);

    const pollWeeklyReportStatus = useCallback(
        (reportId: string, companyId?: string | number) => {
            if (!token) {
                return;
            }

            stopWeeklyReportPolling();

            const tick = async () => {
                try {
                    const res = await getWeeklySummaryStatus(reportId, token, companyId);
                    const status = res.data;
                    setWeeklyReport(status);

                    if (status.status === "completed" || status.status === "failed") {
                        stopWeeklyReportPolling();
                    }
                } catch (err) {
                    setError(err instanceof Error ? err.message : "Unable to fetch weekly report status.");
                    stopWeeklyReportPolling();
                }
            };

            void tick();

            if (typeof window !== "undefined") {
                pollingIntervalRef.current = window.setInterval(() => {
                    void tick();
                }, 2500);
            }
        },
        [stopWeeklyReportPolling, token]
    );

    const queueWeeklyReport = useCallback(
        async (companyId?: string | number) => {
            if (!token) {
                return;
            }

            setIsQueueingWeeklyReport(true);
            setError(null);

            try {
                const res = await queueWeeklySummaryReport(token, companyId);
                const reportId = res.data.report_id;
                setWeeklyReport({
                    report_id: reportId,
                    status: "queued",
                    progress: 0,
                    error: null,
                    available: false,
                });
                pollWeeklyReportStatus(reportId, companyId);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unable to queue weekly summary report.");
            } finally {
                setIsQueueingWeeklyReport(false);
            }
        },
        [pollWeeklyReportStatus, token]
    );

    const downloadWeeklyReport = useCallback(
        async (companyId?: string | number) => {
            if (!token || !weeklyReport?.report_id || weeklyReport.status !== "completed") {
                return;
            }

            try {
                const file = await downloadWeeklySummaryReport(weeklyReport.report_id, token, companyId);
                if (typeof window !== "undefined") {
                    // Determine MIME type based on file extension
                    let mimeType = "application/json";
                    if (file.filename.endsWith(".docx")) {
                        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                    } else if (file.filename.endsWith(".doc")) {
                        mimeType = "application/msword";
                    } else if (file.filename.endsWith(".txt")) {
                        mimeType = "text/plain";
                    } else if (file.filename.endsWith(".pdf")) {
                        mimeType = "application/pdf";
                    }

                    const blob = new Blob([file.content], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = file.filename;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    URL.revokeObjectURL(url);
                }
            } catch (err) {
                console.error("Failed to download weekly report:", err);
                throw err;
            }
        },
        [token, weeklyReport]
    );

    const runVoiceTranscription = useCallback(
        async (file: File, companyId?: string | number) => {
            if (!token) return null;
            const res = await transcribeVoiceInput(file, token, companyId);
            return res.data;
        },
        [token]
    );

    const runFileAnalysis = useCallback(
        async (file: File, companyId?: string | number) => {
            if (!token) return null;
            const res = await analyzeCopilotFile(file, token, companyId);
            return res.data;
        },
        [token]
    );

    const runTranscriptSummary = useCallback(
        async (transcript: string, companyId?: string | number, meetingId?: number) => {
            if (!token) return null;
            const res = await summarizeMeetingTranscript(token, {
                transcript,
                meeting_id: meetingId,
                company_id: companyId,
            });
            return res.data;
        },
        [token]
    );

    const loadForecastOverview = useCallback(
        async (companyId?: string | number) => {
            if (!token) return null;
            const res = await getForecastOverview(token, companyId);
            return res.data;
        },
        [token]
    );

    const searchAssignees = useCallback(
        async (query: string, companyId?: string | number, limit = 8): Promise<CopilotAssigneeOption[]> => {
            if (!token) {
                return [];
            }

            const res = await lookupCopilotAssignees(token, query, companyId, limit);
            return Array.isArray(res?.data?.items) ? res.data.items : [];
        },
        [token]
    );

    useEffect(() => () => stopWeeklyReportPolling(), [stopWeeklyReportPolling]);

    const sendMessage = useCallback(
        async ({ message, companyId, actionArgs, actionConfirmed, idempotencyKey }: SendMessageParams) => {
            if (!token || !message.trim()) return;

            const userMessage: CopilotMessage = {
                id: `local-user-${Date.now()}`,
                role: "user",
                content: message.trim(),
                sources: [],
                tool: null,
                payload: null,
                created_at: new Date().toISOString(),
            };

            const assistantMessageId = `local-ai-${Date.now()}`;

            setError(null);
            setIsStreaming(true);
            setMessages((prev) => [
                ...prev,
                userMessage,
                {
                    id: assistantMessageId,
                    role: "assistant",
                    content: "",
                    sources: [],
                    tool: null,
                    payload: null,
                    created_at: new Date().toISOString(),
                },
            ]);

            try {
                const done = await sendCopilotMessageStream(
                    {
                        message: message.trim(),
                        company_id: companyId,
                        thread_id: threadId ?? undefined,
                        action_args: actionArgs,
                        action_confirmed: actionConfirmed,
                        idempotency_key: idempotencyKey ?? createIdempotencyKey(),
                        client_timezone: resolveUserTimezone(),
                    },
                    token,
                    {
                        onMeta: (meta) => {
                            setThreadId(meta.thread_id);
                            if (typeof localStorage !== "undefined") {
                                localStorage.setItem(persistedKey, meta.thread_id);
                            }
                        },
                        onDelta: (delta) => {
                            setMessages((prev) =>
                                prev.map((item) =>
                                    item.id === assistantMessageId
                                        ? { ...item, content: `${item.content}${delta.chunk}` }
                                        : item
                                )
                            );
                        },
                        onDone: (event) => {
                            setThreadId(event.thread_id);
                            setMessages((prev) =>
                                prev.map((item) =>
                                    item.id === assistantMessageId
                                        ? {
                                            ...item,
                                            content: event.message,
                                            tool: event.tool,
                                            sources: event.sources ?? [],
                                            payload: event.payload ?? null,
                                        }
                                        : item
                                )
                            );
                        },
                    }
                );

                if (typeof localStorage !== "undefined") {
                    localStorage.setItem(persistedKey, done.thread_id);
                }
            } catch (err) {
                const fallbackMessage = err instanceof Error ? err.message : "Unable to process ELY request.";
                setError(fallbackMessage);
                setMessages((prev) =>
                    prev.map((item) =>
                        item.id === assistantMessageId
                            ? {
                                ...item,
                                content: fallbackMessage,
                            }
                            : item
                    )
                );
            } finally {
                setIsStreaming(false);
            }
        },
        [persistedKey, threadId, token]
    );

    return {
        threadId,
        messages,
        threadPagination,
        threadMessageCount,
        isStreaming,
        error,
        weeklyReport,
        isQueueingWeeklyReport,
        initialize,
        sendMessage,
        clearCurrentThread,
        loadOlderThreadMessages,
        queueWeeklyReport,
        downloadWeeklyReport,
        runVoiceTranscription,
        runFileAnalysis,
        runTranscriptSummary,
        loadForecastOverview,
        searchAssignees,
    };
}
