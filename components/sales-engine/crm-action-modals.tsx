"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";

export type CrmPipelineOption = { id: string; name: string };

export function AddToCrmPipelineModal({
  isOpen,
  onClose,
  prospectName,
  pipelines,
  isLoading = false,
  isConfirming = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  prospectName: string | null;
  pipelines: CrmPipelineOption[];
  isLoading?: boolean;
  isConfirming?: boolean;
  onConfirm: (pipelineId: string) => void;
}) {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPipelineId(pipelines[0]?.id ?? null);
  }, [isOpen, pipelines]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ type: "spring", duration: 0.32 }}
            className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-[24px] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#09232d]/40">
                  Add to CRM
                </p>
                <h3 className="mt-1 text-[16px] font-semibold text-[#09232d]">
                  {prospectName ? `Select a pipeline for ${prospectName}` : "Select a pipeline"}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full text-[#09232d]/50 transition hover:bg-black/5 hover:text-[#09232d] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1.5 px-6 py-4">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-[#09232d]/60">
                  <Loader2 size={14} className="animate-spin" />
                  Loading pipelines…
                </div>
              ) : pipelines.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-[#09232d]/60">
                  No CRM pipelines found. Create one in CRM first.
                </p>
              ) : (
                pipelines.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    type="button"
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                    className={`flex w-full items-center justify-between rounded-[12px] border px-3.5 py-2.5 text-left text-[12px] font-medium transition cursor-pointer ${
                      selectedPipelineId === pipeline.id
                        ? "border-[#09232d] bg-[#09232d]/5 text-[#09232d]"
                        : "border-[#e4e4e9] text-[#09232d]/70 hover:bg-gray-50"
                    }`}
                  >
                    {pipeline.name}
                    {selectedPipelineId === pipeline.id && (
                      <Check size={14} className="text-[#09232d]" />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-black/5 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isConfirming}
                className="h-9 rounded-[10px] px-4 text-[12px] font-semibold text-[#09232d]/60 transition hover:bg-gray-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedPipelineId || isConfirming || pipelines.length === 0}
                onClick={() => selectedPipelineId && onConfirm(selectedPipelineId)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#09232d] px-4 text-[12px] font-semibold text-white transition disabled:opacity-50 cursor-pointer"
              >
                {isConfirming && <Loader2 size={13} className="animate-spin" />}
                {isConfirming ? "Adding…" : "Add Prospect"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ConfirmActionShell({
  isOpen,
  onClose,
  eyebrow,
  title,
  children,
  confirmLabel,
  isConfirming = false,
  confirmDisabled = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ type: "spring", duration: 0.32 }}
            className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-[24px] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#09232d]/40">
                  {eyebrow}
                </p>
                <h3 className="mt-1 text-[16px] font-semibold text-[#09232d]">{title}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full text-[#09232d]/50 transition hover:bg-black/5 hover:text-[#09232d] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 px-6 py-4">{children}</div>
            <div className="flex justify-end gap-2 border-t border-black/5 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isConfirming}
                className="h-9 rounded-[10px] px-4 text-[12px] font-semibold text-[#09232d]/60 transition hover:bg-gray-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmDisabled || isConfirming}
                onClick={onConfirm}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#09232d] px-4 text-[12px] font-semibold text-white transition disabled:opacity-50 cursor-pointer"
              >
                {isConfirming && <Loader2 size={13} className="animate-spin" />}
                {isConfirming ? "Working…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="rounded-[12px] border border-[#e4e4e9] px-3.5 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#09232d]/40">{label}</p>
      <p className="mt-1 whitespace-pre-line text-[12px] font-medium leading-[16px] text-[#09232d]">
        {value}
      </p>
    </div>
  );
}

export function CreateOutreachConfirmModal({
  isOpen,
  onClose,
  prospectName,
  company,
  channel,
  suggestedMessage,
  source,
  intent,
  isConfirming = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  prospectName: string;
  company: string;
  channel: string;
  suggestedMessage: string;
  source: string;
  intent: string;
  isConfirming?: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmActionShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Create Outreach"
      title={`Draft outreach for ${prospectName}`}
      confirmLabel="Create Outreach"
      isConfirming={isConfirming}
      onConfirm={onConfirm}
    >
      <DetailRow label="Prospect" value={prospectName} />
      <DetailRow label="Company" value={company} />
      <DetailRow label="Channel" value={channel} />
      <DetailRow label="Source" value={source} />
      <DetailRow label="Intent" value={intent} />
      <DetailRow label="Suggested message" value={suggestedMessage} />
    </ConfirmActionShell>
  );
}

export function SetReminderConfirmModal({
  isOpen,
  onClose,
  prospectName,
  company,
  remindAtLabel,
  note,
  isConfirming = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  prospectName: string;
  company: string;
  remindAtLabel: string;
  note: string;
  isConfirming?: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmActionShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Set Reminder"
      title={`Remind me about ${prospectName}`}
      confirmLabel="Set Reminder"
      isConfirming={isConfirming}
      onConfirm={onConfirm}
    >
      <DetailRow label="Prospect" value={prospectName} />
      <DetailRow label="Company" value={company} />
      <DetailRow label="Remind at" value={remindAtLabel} />
      <DetailRow label="Note" value={note || "Follow up on this social opportunity."} />
    </ConfirmActionShell>
  );
}
