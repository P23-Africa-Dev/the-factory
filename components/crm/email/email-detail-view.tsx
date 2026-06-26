"use client";

import { ArrowLeft, Clock, Paperclip, Reply, Send, Trash2 } from "lucide-react";
import type { EmailMessageView } from "./email-types";

type EmailDetailViewProps = {
    email: EmailMessageView;
    threadMessages?: EmailMessageView[];
    onBack: () => void;
    onReply: () => void;
    onDelete: () => void;
};

function MessageBlock({ email }: { email: EmailMessageView }) {
    const isSent = email.direction === "sent";

    return (
        <article className="rounded-[14px] border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0 ${
                            isSent
                                ? "bg-[#0B1215] text-white"
                                : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white"
                        }`}
                    >
                        {isSent ? (
                            <Send size={13} className="rotate-[-30deg]" />
                        ) : (
                            <span className="text-[12px] font-semibold">{email.from.charAt(0)}</span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-[#0B1215]">{email.from}</span>
                            {isSent && (
                                <span className="text-[10px] font-medium text-[#10B981] bg-emerald-50 px-2 py-0.5 rounded-full">
                                    {email.status === "failed" ? "Failed" : "Sent"}
                                </span>
                            )}
                            {!isSent && !email.isRead && (
                                <span className="text-[10px] font-medium text-[#3B82F6] bg-blue-50 px-2 py-0.5 rounded-full">
                                    New
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] text-gray-400 break-all">
                            {isSent ? `To: ${email.toEmail}` : email.fromEmail}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
                    <Clock size={12} />
                    <span className="text-[11px] font-normal">{email.timestamp}</span>
                </div>
            </div>

            <div className="text-[13px] text-[#374151] leading-[1.85] whitespace-pre-wrap">
                {email.body}
            </div>

            {email.errorMessage && (
                <p className="text-[11px] text-red-500 mt-3">{email.errorMessage}</p>
            )}

            {email.attachments && email.attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                        Attachments ({email.attachments.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {email.attachments.map((att) => (
                            <a
                                key={att.id ?? att.name}
                                href={att.downloadUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 bg-white hover:bg-gray-100 transition-colors rounded-xl px-3 py-2 border border-gray-100"
                            >
                                <Paperclip size={13} className="text-red-400" />
                                <span className="text-[12px] font-medium text-[#0B1215]">{att.name}</span>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
}

export function EmailDetailView({
    email,
    threadMessages,
    onBack,
    onReply,
    onDelete,
}: EmailDetailViewProps) {
    const conversation =
        threadMessages && threadMessages.length > 0
            ? [...threadMessages].sort((a, b) => a.messageId - b.messageId)
            : [email];

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-[12px] font-medium text-gray-500 hover:text-[#0B1215] transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back to inbox
                </button>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onReply}
                        className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                        <Reply size={15} className="text-gray-500" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-red-50 transition-colors border border-gray-100 group"
                    >
                        <Trash2
                            size={15}
                            className="text-gray-400 group-hover:text-red-500 transition-colors"
                        />
                    </button>
                </div>
            </div>

            <div className="py-4 sm:py-5 border-b border-gray-50">
                <h3 className="text-[15px] sm:text-[17px] font-semibold text-[#0B1215] leading-tight">
                    {email.subject}
                </h3>
                {conversation.length > 1 && (
                    <p className="text-[11px] text-gray-400 mt-1">
                        {conversation.length} messages in this thread
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
                {conversation.map((message) => (
                    <MessageBlock key={message.id} email={message} />
                ))}
            </div>

            <div className="pt-4 border-t border-gray-100">
                <button
                    onClick={onReply}
                    className="w-full flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 rounded-[14px] border border-gray-100 transition-colors text-left group"
                >
                    <Reply
                        size={16}
                        className="text-gray-400 group-hover:text-[#0B1215] transition-colors"
                    />
                    <span className="text-[13px] text-gray-400 group-hover:text-gray-500 transition-colors">
                        Click to reply...
                    </span>
                </button>
            </div>
        </div>
    );
}
