"use client";

import {
    useCalendarIntegrationStatus,
    useCreateCalendarConnectUrl,
    useCalendarIntegrationReconnect,
    useCalendarIntegrationSwitch,
    useDisconnectCalendarIntegration,
} from "@/hooks/use-calendar-integration";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import { AlertCircle, Link2 } from "lucide-react";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

type EmailConnectionBannerProps = {
    companyId?: number | string;
};

function openAuthorizationPopup(authorizationUrl: string, popupName: string) {
    const popup = window.open(authorizationUrl, popupName, "width=560,height=720");
    if (!popup) {
        window.location.href = authorizationUrl;
        return;
    }
    toast.info("Complete Google sign-in in the popup. Connection status will update automatically.");
}

export function EmailConnectionBanner({ companyId }: EmailConnectionBannerProps) {
    const user = useAuthStore((s) => s.user);
    const resolvedCompanyId = companyId ?? getActiveCompanyContext(user)?.apiCompanyId ?? undefined;
    const statusQuery = useCalendarIntegrationStatus(resolvedCompanyId);
    const connectMutation = useCreateCalendarConnectUrl();
    const disconnectMutation = useDisconnectCalendarIntegration();
    const switchMutation = useCalendarIntegrationSwitch();
    const reconnectMutation = useCalendarIntegrationReconnect();

    const status = statusQuery.data;
    const canManage = status?.can_manage_connection !== false;
    const gmailReady =
        status?.connected === true &&
        status.gmail_enabled === true &&
        status.requires_gmail_reconnect !== true &&
        status.requires_reauthentication !== true;
    const needsConnection = !status?.connected || status?.requires_gmail_reconnect || status?.requires_reauthentication;

    const handleOAuthSuccess = useCallback(async (payload: {
        gmail_enabled?: boolean;
        requires_gmail_reconnect?: boolean;
        message?: string;
    }) => {
        const result = await statusQuery.refetch();
        const ready =
            payload.gmail_enabled === true ||
            (result.data?.gmail_enabled === true && result.data?.requires_gmail_reconnect !== true);

        if (ready) {
            toast.success(payload.message || "Google account connected for calendar and email.");
            return;
        }

        toast.warning(
            "Google connected for calendar only. Reconnect and approve Gmail permissions to send CRM emails.",
        );
    }, [statusQuery]);

    useEffect(() => {
        const handleOAuthMessage = async (event: MessageEvent) => {
            const payload = event.data as {
                type?: string;
                status?: "success" | "error";
                message?: string;
                gmail_enabled?: boolean;
                requires_gmail_reconnect?: boolean;
            };
            if (!payload || payload.type !== "google-calendar-oauth") return;

            if (payload.status === "success") {
                await handleOAuthSuccess(payload);
                return;
            }

            toast.error(payload.message || "Google connection failed.");
        };

        window.addEventListener("message", handleOAuthMessage);
        return () => window.removeEventListener("message", handleOAuthMessage);
    }, [handleOAuthSuccess]);

    const requireCompanyId = (): number | string | null => {
        if (!resolvedCompanyId) {
            toast.error("Company context is required.");
            return null;
        }
        return resolvedCompanyId;
    };

    const handleConnect = () => {
        const id = requireCompanyId();
        if (!id) return;

        connectMutation.mutate(
            { company_id: id },
            {
                onSuccess: (response) => {
                    const url = response.data.authorization_url;
                    if (!url) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }
                    openAuthorizationPopup(url, "google-calendar-connect");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start Google connection.");
                },
            },
        );
    };

    const handleDisconnect = () => {
        const id = requireCompanyId();
        if (!id) return;

        disconnectMutation.mutate(
            { company_id: id },
            {
                onSuccess: () => {
                    toast.success("Google account disconnected.");
                    statusQuery.refetch();
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to disconnect Google account.");
                },
            },
        );
    };

    const handleSwitchAccount = () => {
        const id = requireCompanyId();
        if (!id) return;

        switchMutation.mutate(
            { company_id: id },
            {
                onSuccess: (response) => {
                    const url = response.data.authorization_url;
                    if (!url) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }
                    openAuthorizationPopup(url, "google-calendar-switch");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start account switch.");
                },
            },
        );
    };

    const handleReconnect = () => {
        const id = requireCompanyId();
        if (!id) return;

        reconnectMutation.mutate(
            { company_id: id },
            {
                onSuccess: (response) => {
                    const url = response.data.authorization_url;
                    if (!url) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }
                    openAuthorizationPopup(url, "google-calendar-reconnect");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start reconnect.");
                },
            },
        );
    };

    const accountLabel =
        status?.google_account_name ?? status?.organizer_email ?? status?.connected_google_email ?? null;

    const actionButtons = canManage ? (
        <div className="flex flex-wrap gap-2 shrink-0">
            {gmailReady && (
                <>
                    <button
                        type="button"
                        onClick={handleSwitchAccount}
                        disabled={switchMutation.isPending}
                        className="inline-flex items-center justify-center rounded-[10px] border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0B1215] hover:bg-gray-50 disabled:opacity-60"
                    >
                        {switchMutation.isPending ? "Preparing..." : "Switch Account"}
                    </button>
                    <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={disconnectMutation.isPending}
                        className="inline-flex items-center justify-center rounded-[10px] border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0B1215] hover:bg-gray-50 disabled:opacity-60"
                    >
                        {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                    </button>
                </>
            )}
            <button
                type="button"
                onClick={handleReconnect}
                disabled={reconnectMutation.isPending}
                className="inline-flex items-center justify-center rounded-[10px] border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0B1215] hover:bg-gray-50 disabled:opacity-60"
            >
                {reconnectMutation.isPending ? "Preparing..." : "Reconnect"}
            </button>
        </div>
    ) : null;

    if (gmailReady && accountLabel) {
        return (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[14px] border border-emerald-100 bg-emerald-50/80 px-4 py-3">
                <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-emerald-900">
                        Gmail connected
                    </p>
                    <p className="text-[11px] text-emerald-800/80 truncate">
                        Sending from{" "}
                        <span className="font-medium">{accountLabel}</span>
                        {status?.organizer_email && status.organizer_email !== accountLabel
                            ? ` (${status.organizer_email})`
                            : ""}
                    </p>
                </div>
                {actionButtons}
            </div>
        );
    }

    if (!needsConnection) {
        return null;
    }

    return (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[14px] border border-amber-100 bg-amber-50/80 px-4 py-3">
            <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-amber-900">
                        {status?.requires_gmail_reconnect
                            ? "Gmail permissions required"
                            : status?.requires_reauthentication
                              ? "Google sign-in expired"
                              : "Connect Google Workspace"}
                    </p>
                    <p className="text-[11px] text-amber-800/80">
                        {status?.requires_gmail_reconnect
                            ? "Reconnect and approve Gmail permissions to send and receive CRM emails."
                            : "Connect or reconnect your Google account to send and receive CRM emails."}
                    </p>
                    {status?.last_error_message && (
                        <p className="mt-1 text-[10px] text-amber-700 font-medium">
                            {status.last_error_message}
                        </p>
                    )}
                </div>
            </div>
            {canManage && (
                <div className="flex flex-wrap gap-2 shrink-0">
                    {!status?.connected && (
                        <button
                            type="button"
                            onClick={handleConnect}
                            disabled={connectMutation.isPending}
                            className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0B1215] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                            <Link2 size={14} />
                            {connectMutation.isPending ? "Opening..." : "Connect Google"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleReconnect}
                        disabled={reconnectMutation.isPending}
                        className="inline-flex items-center justify-center rounded-[10px] border border-amber-200 bg-white px-4 py-2 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                        {reconnectMutation.isPending ? "Preparing..." : "Reconnect"}
                    </button>
                    {status?.connected && (
                        <>
                            <button
                                type="button"
                                onClick={handleSwitchAccount}
                                disabled={switchMutation.isPending}
                                className="inline-flex items-center justify-center rounded-[10px] border border-amber-200 bg-white px-4 py-2 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                            >
                                {switchMutation.isPending ? "Preparing..." : "Switch Account"}
                            </button>
                            <button
                                type="button"
                                onClick={handleDisconnect}
                                disabled={disconnectMutation.isPending}
                                className="inline-flex items-center justify-center rounded-[10px] border border-amber-200 bg-white px-4 py-2 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                            >
                                {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
