"use client";

import { useMemo, useState } from "react";
import { Mail, Pencil } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import {
    useDeleteLeadEmail,
    useLeadEmails,
    useMarkLeadEmailRead,
    useSendLeadEmail,
    useUploadEmailAttachment,
} from "@/hooks/use-crm-emails";
import { useCalendarIntegrationStatus } from "@/hooks/use-calendar-integration";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import { ComposeEmailPanel } from "./compose-email-panel";
import { EmailConnectionBanner } from "./email-connection-banner";
import { EmailDetailView } from "./email-detail-view";
import { EmailEmptyIcon } from "./email-empty-icon";
import { EmailThreadItem } from "./email-thread-item";
import { flattenThreadsToMessages, mapMessageToView, type EmailMessageView } from "./email-types";

type EmailPanelProps = {
    leadId: number | string;
    leadName: string;
    leadEmail?: string | null;
    companyId?: number | string;
    basePath?: ApiRoleBasePath;
};

export function EmailPanel({
    leadId,
    leadName,
    leadEmail,
    companyId,
    basePath = "/admin",
}: EmailPanelProps) {
    const [view, setView] = useState<"list" | "compose" | "detail">("list");
    const [selectedEmail, setSelectedEmail] = useState<EmailMessageView | null>(null);
    const [replyTo, setReplyTo] = useState<EmailMessageView | null>(null);
    const [showDeleteEmailConfirm, setShowDeleteEmailConfirm] = useState(false);
    const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

    const emailsQuery = useLeadEmails(leadId, companyId, basePath, { sync: true });
    const statusQuery = useCalendarIntegrationStatus(companyId);
    const sendMutation = useSendLeadEmail(leadId, companyId, basePath, {
        onSuccess: () => {
            toast.success("Email queued for sending.");
            setView("list");
            setReplyTo(null);
        },
    });
    const markReadMutation = useMarkLeadEmailRead(leadId, companyId, basePath);
    const deleteMutation = useDeleteLeadEmail(leadId, companyId, basePath);
    const uploadMutation = useUploadEmailAttachment(leadId, companyId, basePath);

    const emails = useMemo(() => {
        const mapped = flattenThreadsToMessages(emailsQuery.data?.items, leadName).map((email) => ({
            ...email,
            isStarred: starredIds.has(email.id) || email.isStarred,
        }));
        return mapped;
    }, [emailsQuery.data?.items, leadName, starredIds]);

    const unreadCount = emails.filter((email) => !email.isRead).length;
    const resolvedLeadEmail = leadEmail?.trim() ?? "";

    const handleEmailClick = (email: EmailMessageView) => {
        setSelectedEmail(email);
        setView("detail");
        if (!email.isRead) {
            markReadMutation.mutate(email.messageId);
        }
    };

    const handleStar = (id: string) => {
        setStarredIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSend = (payload: Parameters<typeof sendMutation.mutate>[0]) => {
        sendMutation.mutate(payload);
    };

    if (!resolvedLeadEmail) {
        return (
            <div className="flex-1 bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col min-h-[500px]">
                <EmailConnectionBanner companyId={companyId} />
                <div className="flex-1 flex flex-col items-center justify-center py-20">
                    <div className="mb-8 opacity-20 grayscale scale-125">
                        <EmailEmptyIcon />
                    </div>
                    <p className="text-gray-400 text-[18px] text-center leading-relaxed max-w-[320px] font-normal italic">
                        Add an email address to this lead to start email communication.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col min-h-[500px]">
            <EmailConnectionBanner companyId={companyId} />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-sm relative shrink-0">
                        <Mail size={18} className="text-[#0B1215]" />
                        {unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 w-4.5 h-4.5 sm:w-5 sm:h-5 bg-[#3B82F6] text-white text-[8px] sm:text-[9px] font-semibold rounded-full flex items-center justify-center shadow-sm">
                                {unreadCount}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[16px] sm:text-[18px] font-semibold text-[#0B1215] truncate">
                            Email communication
                        </h2>
                        <p className="text-[10px] sm:text-[11px] text-gray-400 font-normal truncate">
                            {emails.length} message{emails.length !== 1 ? "s" : ""} with {leadName}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setReplyTo(null);
                        setView("compose");
                    }}
                    className="flex items-center justify-center gap-2.5 px-5 sm:px-6 py-2.5 sm:py-3 bg-[#0B1215] text-white rounded-[12px] sm:rounded-[14px] text-[13px] font-semibold hover:opacity-90 transition-all shadow-md whitespace-nowrap"
                    id="compose-email-btn"
                >
                    <Pencil size={16} />
                    Compose
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {view === "compose" ? (
                    <ComposeEmailPanel
                        leadName={leadName}
                        leadEmail={resolvedLeadEmail}
                        companyId={companyId}
                        connectedAccountEmail={statusQuery.data?.organizer_email}
                        replyTo={replyTo}
                        isSending={sendMutation.isPending}
                        onSend={handleSend}
                        onClose={() => {
                            setView("list");
                            setReplyTo(null);
                        }}
                        onUploadAttachment={async (file) => uploadMutation.mutateAsync(file)}
                    />
                ) : view === "detail" && selectedEmail ? (
                    <>
                        <EmailDetailView
                            email={selectedEmail}
                            onBack={() => {
                                setSelectedEmail(null);
                                setView("list");
                            }}
                            onReply={() => {
                                setReplyTo(selectedEmail);
                                setView("compose");
                            }}
                            onDelete={() => setShowDeleteEmailConfirm(true)}
                        />
                        <ConfirmDeleteModal
                            isOpen={showDeleteEmailConfirm}
                            onClose={() => setShowDeleteEmailConfirm(false)}
                            onConfirm={() => {
                                deleteMutation.mutate(selectedEmail.messageId, {
                                    onSuccess: () => {
                                        toast.success("Email deleted.");
                                        setSelectedEmail(null);
                                        setView("list");
                                    },
                                });
                                setShowDeleteEmailConfirm(false);
                            }}
                            title="Delete Email"
                            description="Are you sure you want to delete this email? This action cannot be undone."
                        />
                    </>
                ) : emailsQuery.isLoading ? (
                    <div className="flex-1 flex items-center justify-center text-[13px] text-gray-400">
                        Loading emails...
                    </div>
                ) : emails.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20">
                        <div className="mb-8 opacity-20 grayscale scale-125">
                            <EmailEmptyIcon />
                        </div>
                        <p className="text-gray-400 text-[18px] text-center leading-relaxed max-w-[320px] font-normal italic">
                            No emails yet. Send the first email to start a conversation
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
                        {emails.map((email) => (
                            <EmailThreadItem
                                key={email.id}
                                email={email}
                                onClick={() => handleEmailClick(email)}
                                onStar={() => handleStar(email.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export { mapMessageToView };
