"use client";

import { useCalendarIntegrationStatus, useCreateCalendarConnectUrl } from "@/hooks/use-calendar-integration";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import { AlertCircle, Link2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

type EmailConnectionBannerProps = {
    companyId?: number | string;
};

export function EmailConnectionBanner({ companyId }: EmailConnectionBannerProps) {
    const user = useAuthStore((s) => s.user);
    const resolvedCompanyId = companyId ?? getActiveCompanyContext(user)?.companyId;
    const statusQuery = useCalendarIntegrationStatus(resolvedCompanyId);
    const connectMutation = useCreateCalendarConnectUrl();

    const status = statusQuery.data;
    const needsConnection = !status?.connected || status?.requires_gmail_reconnect || status?.requires_reauthentication;

    useEffect(() => {
        const handleOAuthMessage = (event: MessageEvent) => {
            const payload = event.data as { type?: string; status?: "success" | "error"; message?: string };
            if (!payload || payload.type !== "google-calendar-oauth") return;
            if (payload.status === "success") {
                toast.success(payload.message || "Google account connected successfully.");
                statusQuery.refetch();
                return;
            }
            toast.error(payload.message || "Google connection failed.");
            statusQuery.refetch();
        };

        window.addEventListener("message", handleOAuthMessage);
        return () => window.removeEventListener("message", handleOAuthMessage);
    }, [statusQuery]);

    if (!needsConnection) {
        if (status?.organizer_email) {
            return (
                <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal mb-4">
                    Sending from{" "}
                    <span className="font-medium text-gray-500">{status.google_account_name ?? status.organizer_email}</span>
                    {" "}({status.organizer_email})
                </p>
            );
        }
        return null;
    }

    const handleConnect = () => {
        if (!resolvedCompanyId) return;
        connectMutation.mutate(
            { company_id: resolvedCompanyId },
            {
                onSuccess: (response) => {
                    const url = response.data.authorization_url;
                    const popup = window.open(url, "google-calendar-connect", "width=560,height=720");
                    if (!popup) window.location.href = url;
                    else toast.info("Complete Google sign-in in the popup to enable email.");
                },
            },
        );
    };

    return (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[14px] border border-amber-100 bg-amber-50/80 px-4 py-3">
            <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                    <p className="text-[12px] font-semibold text-amber-900">
                        {status?.requires_gmail_reconnect
                            ? "Gmail permissions required"
                            : "Connect Google Workspace"}
                    </p>
                    <p className="text-[11px] text-amber-800/80">
                        Connect or reconnect your Google account to send and receive CRM emails.
                    </p>
                </div>
            </div>
            {status?.can_manage_connection !== false && (
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
        </div>
    );
}
