"use client";

import { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import type { EmailRecipient } from "@/lib/api/crm-emails";
import type { EmailMessageView } from "./email-types";
import { EmailRecipientField } from "./email-recipient-field";

type ComposeEmailPanelProps = {
    leadName: string;
    leadEmail: string;
    companyId?: number | string;
    connectedAccountEmail?: string | null;
    replyTo?: EmailMessageView | null;
    isSending?: boolean;
    onSend: (payload: {
        to: EmailRecipient[];
        cc: EmailRecipient[];
        bcc: EmailRecipient[];
        subject: string;
        body_text: string;
        body_html: string;
        attachment_ids: number[];
        reply_to_gmail_message_id?: string;
        gmail_thread_id?: string;
    }) => void;
    onClose: () => void;
    onUploadAttachment: (file: File) => Promise<{ id: number }>;
};

export function ComposeEmailPanel({
    leadName,
    leadEmail,
    companyId,
    connectedAccountEmail,
    replyTo,
    isSending = false,
    onSend,
    onClose,
    onUploadAttachment,
}: ComposeEmailPanelProps) {
    const [to] = useState<EmailRecipient[]>([{ email: leadEmail, name: leadName }]);
    const [cc, setCc] = useState<EmailRecipient[]>([]);
    const [bcc, setBcc] = useState<EmailRecipient[]>([]);
    const [subject, setSubject] = useState(
        replyTo
            ? replyTo.subject.startsWith("Re:")
                ? replyTo.subject
                : `Re: ${replyTo.subject}`
            : "",
    );
    const [body, setBody] = useState("");
    const [attachmentIds, setAttachmentIds] = useState<number[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (!subject.trim() || !body.trim() || !leadEmail) return;
        onSend({
            to,
            cc,
            bcc,
            subject: subject.trim(),
            body_text: body.trim(),
            body_html: `<p>${body.trim().replace(/\n/g, "<br />")}</p>`,
            attachment_ids: attachmentIds,
            reply_to_gmail_message_id: replyTo?.gmailMessageId,
            gmail_thread_id: replyTo?.gmailThreadId,
        });
    };

    const handleAttachmentPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const attachment = await onUploadAttachment(file);
            setAttachmentIds((prev) => [...prev, attachment.id]);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between px-0 pb-4 border-b border-gray-100">
                <div>
                    <h3 className="text-[14px] sm:text-[15px] font-semibold text-[#0B1215]">
                        {replyTo ? "Reply" : "New Message"}
                    </h3>
                    {connectedAccountEmail && (
                        <p className="text-[10px] text-gray-400 mt-0.5">From {connectedAccountEmail}</p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                >
                    <X size={14} className="text-gray-500" />
                </button>
            </div>

            <div className="flex flex-col gap-0 mt-4">
                <div className="flex items-center gap-3 py-3 border-b border-gray-50">
                    <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider">
                        To
                    </label>
                    <div className="flex-1 flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-[#0B1215] text-white px-3 py-1.5 rounded-full text-[11px] font-medium">
                            {leadName || leadEmail}
                        </div>
                        <span className="text-[12px] text-gray-400">{leadEmail}</span>
                    </div>
                </div>

                <EmailRecipientField
                    label="CC"
                    recipients={cc}
                    onChange={setCc}
                    companyId={companyId}
                    placeholder="Add CC..."
                />

                <EmailRecipientField
                    label="BCC"
                    recipients={bcc}
                    onChange={setBcc}
                    companyId={companyId}
                    placeholder="Add BCC..."
                />

                <div className="flex items-center gap-3 py-3 border-b border-gray-50">
                    <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider">
                        Subj
                    </label>
                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What's this about?"
                        className="flex-1 outline-none text-[14px] font-medium text-[#0B1215] placeholder:text-gray-300 bg-transparent"
                    />
                </div>
            </div>

            <div className="flex-1 mt-4 min-h-0">
                <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your message..."
                    className="w-full h-full min-h-[200px] resize-none outline-none text-[13px] text-[#374151] leading-relaxed placeholder:text-gray-300 bg-transparent"
                />
            </div>

            {attachmentIds.length > 0 && (
                <p className="text-[11px] text-gray-500 mb-2">{attachmentIds.length} attachment(s) ready to send</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleAttachmentPick}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                        <Paperclip size={15} className="text-gray-400" />
                    </button>
                </div>

                <button
                    onClick={handleSend}
                    disabled={!subject.trim() || !body.trim() || isSending || uploading || !leadEmail}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-[12px] sm:rounded-[14px] text-[13px] font-semibold transition-all shadow-md ${
                        subject.trim() && body.trim() && !isSending && !uploading && leadEmail
                            ? "bg-[#0B1215] text-white hover:opacity-90"
                            : "bg-gray-100 text-gray-300 cursor-not-allowed"
                    }`}
                >
                    {isSending ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send size={15} />
                            Send Email
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
