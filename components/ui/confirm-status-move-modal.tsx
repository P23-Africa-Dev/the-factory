"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";

type ConfirmStatusMoveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Incomplete checklist items or other blockers to list. */
  items?: string[];
  children?: ReactNode;
  confirming?: boolean;
};

/**
 * Shown when a board drag would complete a card that still has unfinished work.
 * Confirm means accept the move (and clear listed blockers); Cancel keeps the card put.
 */
export default function ConfirmStatusMoveModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm status change",
  description = "Some requirements are still incomplete. Confirming will mark them done and move the card.",
  confirmLabel = "Confirm & move",
  cancelLabel = "Cancel",
  items = [],
  children,
  confirming = false,
}: ConfirmStatusMoveModalProps) {
  return (
    <ModalPortal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!confirming) onClose();
              }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", duration: 0.28 }}
              className="relative bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 max-w-[420px] w-full shadow-2xl flex flex-col z-10"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-status-move-title"
            >
              <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-5 shrink-0 self-center">
                <AlertTriangle size={22} className="text-amber-600" />
              </div>

              <h3
                id="confirm-status-move-title"
                className="text-[17px] font-bold text-[#0B1215] mb-2 text-center"
              >
                {title}
              </h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-4 text-center">
                {description}
              </p>

              {items.length > 0 && (
                <ul className="w-full mb-4 max-h-48 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-left space-y-2">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="text-[13px] text-[#0B1215] font-medium flex gap-2"
                    >
                      <span className="text-amber-600 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              {children ? <div className="w-full mb-6 text-left">{children}</div> : null}

              <div className="flex gap-3 w-full mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={confirming}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-[#0B1215] rounded-xl text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={confirming}
                  className="flex-1 py-3 bg-[#0B1215] hover:opacity-90 text-white rounded-xl text-[13px] font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {confirming ? <Loader2 size={14} className="animate-spin" /> : null}
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
