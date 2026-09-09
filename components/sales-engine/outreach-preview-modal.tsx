"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useRegenerateOutreach, useSendOutreachActivity } from "@/hooks/use-sales-engine-outreach";
import { useOutreachSenderSettings } from "@/hooks/use-sales-engine-outreach-sender";
import { SalesEngineApiError } from "@/lib/api/sales-engine";

export type OutreachPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  activityId: number | null;
  channel: "email" | "whatsapp";
  initialSubject?: string | null;
  initialBody: string;
  initialToEmail?: string;
  contextLabel?: string;
  alignmentNote?: string;
  onSent: () => void;
  onConfigureSender?: () => void;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SalesEngineApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function OutreachPreviewModal({
  open,
  onClose,
  activityId,
  channel,
  initialSubject,
  initialBody,
  initialToEmail = "",
  contextLabel,
  alignmentNote,
  onSent,
  onConfigureSender,
}: OutreachPreviewModalProps) {
  const sendOutreach = useSendOutreachActivity();
  const regenerate = useRegenerateOutreach();
  const { data: senderSettings } = useOutreachSenderSettings(open && channel === "email");

  const [toEmail, setToEmail] = useState(initialToEmail);
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody);
  const [instructions, setInstructions] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [alignmentDismissed, setAlignmentDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToEmail(initialToEmail);
    setSubject(initialSubject ?? "");
    setBody(initialBody);
    setInstructions("");
    setShowRegen(false);
    setAlignmentDismissed(false);
    setCopied(false);
  }, [open, activityId, initialSubject, initialBody, initialToEmail]);

  const emailValid = useMemo(() => isValidEmail(toEmail), [toEmail]);
  const bodyReady = body.trim().length > 0;
  const isBusy = sendOutreach.isPending || regenerate.isPending;
  const canSendEmail =
    channel === "email" && Boolean(activityId) && emailValid && bodyReady && !isBusy;

  const fromAddress = useMemo(() => {
    if (
      senderSettings?.sender_mode === "organization" &&
      senderSettings.org_connection_status === "verified" &&
      senderSettings.org_verified_from_email
    ) {
      return senderSettings.org_verified_from_email;
    }
    return senderSettings?.platform_from_email || "The Factory platform email";
  }, [senderSettings]);

  const handleCopy = async () => {
    try {
      const text =
        channel === "email" && subject.trim()
          ? `Subject: ${subject.trim()}\n\n${body}`
          : body;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Message copied to clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy message.");
    }
  };

  const handleRegenerate = () => {
    if (!activityId) return;
    regenerate.mutate(
      {
        activityId,
        instructions: instructions.trim() || undefined,
        channel,
      },
      {
        onSuccess: (result) => {
          setSubject(result.subject ?? "");
          setBody(result.body);
          toast.success("Draft regenerated.");
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not regenerate draft.")),
      }
    );
  };

  const handleSend = () => {
    if (!activityId || !canSendEmail) return;
    sendOutreach.mutate(
      {
        activityId,
        to_email: toEmail.trim(),
        subject: subject.trim() || undefined,
        body: body.trim(),
      },
      {
        onSuccess: () => {
          toast.success(`Outreach sent to ${toEmail.trim()}.`);
          onSent();
          onClose();
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not send outreach email.")),
      }
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isBusy && onClose()}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", duration: 0.32 }}
            role="dialog"
            aria-modal="true"
            aria-label="Review outreach"
            className="relative z-10 flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] border border-[#e8e8e8] bg-white text-[#09232d] shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#ececec] px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold">Review outreach</h3>
                  <span
                    className={`rounded-[6px] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      channel === "whatsapp"
                        ? "bg-[#E8F8EF] text-[#16A34A]"
                        : "bg-[#EEF2FF] text-[#4F46E5]"
                    }`}
                  >
                    {channel === "whatsapp" ? "WhatsApp" : "Email"}
                  </span>
                </div>
                {contextLabel && (
                  <p className="mt-1 text-[11px] text-[#616263]">{contextLabel}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => !isBusy && onClose()}
                className="grid size-8 place-items-center rounded-full text-[#616263] transition hover:bg-[#f3f3f3] hover:text-[#09232d]"
                aria-label="Close review"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              {alignmentNote && !alignmentDismissed && (
                <div className="flex items-start gap-2 rounded-[12px] border border-[#e8eef8] bg-[#f5f8ff] px-3 py-2.5">
                  <p className="flex-1 text-[10px] leading-[14px] text-[#3b4a6b]">{alignmentNote}</p>
                  <button
                    type="button"
                    onClick={() => setAlignmentDismissed(true)}
                    className="shrink-0 text-[#9aa3b5] hover:text-[#09232d]"
                    aria-label="Dismiss alignment note"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-[#616263]">To</span>
                <input
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="recipient@company.com"
                  disabled={channel === "whatsapp"}
                  className="h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] text-[#09232d] outline-none focus:border-[#09232d]/50 disabled:bg-[#f7f7f7] disabled:text-[#9d9d9d]"
                />
                {channel === "email" && toEmail.trim() && !emailValid && (
                  <p className="mt-1 text-[9px] text-[#b91c1c]">Enter a valid email address.</p>
                )}
              </label>

              {channel === "email" && (
                <div className="rounded-[12px] border border-[#ececec] bg-[#fafafa] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-[#616263]">From</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#09232d]">{fromAddress}</p>
                    </div>
                    {onConfigureSender && (
                      <button
                        type="button"
                        onClick={onConfigureSender}
                        className="shrink-0 text-[10px] font-semibold text-[#09232d] underline underline-offset-2 hover:opacity-80"
                      >
                        Configure sender
                      </button>
                    )}
                  </div>
                </div>
              )}

              {channel === "email" && (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold text-[#616263]">Subject</span>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject"
                    className="h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] text-[#09232d] outline-none focus:border-[#09232d]/50"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-[#616263]">Message</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  placeholder="Outreach message body"
                  className="min-h-[180px] w-full resize-y rounded-[12px] border border-[#d1d1d1] bg-white px-3 py-2.5 text-[12px] leading-[17px] text-[#09232d] outline-none focus:border-[#09232d]/50"
                />
              </label>

              <div className="rounded-[12px] border border-[#ececec] bg-[#fafafa] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setShowRegen((v) => !v)}
                  className="text-[10px] font-semibold text-[#09232d] hover:underline"
                >
                  {showRegen ? "Hide regenerate options" : "Regenerate with more context"}
                </button>
                {showRegen && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Add context to improve this draft (optional)"
                      className="w-full resize-y rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2 text-[11px] leading-[15px] text-[#09232d] outline-none focus:border-[#09232d]/50"
                    />
                    <button
                      type="button"
                      disabled={!activityId || regenerate.isPending}
                      onClick={handleRegenerate}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#d1d1d1] bg-white px-3 text-[10px] font-semibold text-[#09232d] transition hover:bg-[#f3f3f3] disabled:opacity-50"
                    >
                      {regenerate.isPending ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Regenerating…
                        </>
                      ) : (
                        "Regenerate"
                      )}
                    </button>
                  </div>
                )}
              </div>

              {channel === "whatsapp" && (
                <p className="rounded-[10px] border border-[#e8f5ee] bg-[#f3fbf6] px-3 py-2 text-[10px] leading-[14px] text-[#166534]">
                  WhatsApp sending isn&apos;t available yet — copy this message to send manually.
                </p>
              )}

              {!activityId && (
                <p className="text-[9px] text-[#b91c1c]">
                  This draft isn&apos;t linked to a sendable record — try creating outreach again.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#ececec] bg-[#f7f7f7] px-5 py-3.5">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[11px] font-medium text-[#09232d] transition hover:bg-[#f3f3f3]"
              >
                {copied ? <Check size={13} className="text-[#16b37d]" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onClose}
                  className="h-9 rounded-[10px] border border-[#d1d1d1] bg-white px-4 text-[11px] font-medium text-[#09232d] transition hover:bg-[#f3f3f3] disabled:opacity-50"
                >
                  Cancel
                </button>
                {channel === "email" ? (
                  <button
                    type="button"
                    disabled={!canSendEmail}
                    onClick={handleSend}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#09232d] px-4 text-[11px] font-semibold text-white transition hover:bg-[#0f3340] disabled:opacity-50"
                  >
                    {sendOutreach.isPending ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send"
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="h-9 rounded-[10px] bg-[#09232d] px-4 text-[11px] font-semibold text-white opacity-50"
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
