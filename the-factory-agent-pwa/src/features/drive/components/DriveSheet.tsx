'use client';

import React from 'react';
import { X } from 'lucide-react';
import { OverlayPortal } from '@/components/shared/OverlayPortal';

/** Bottom sheet shell shared by the Drive preview, share and confirm views. */
export function DriveSheet({
  title,
  onClose,
  children,
  footer,
  labelledBy,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy?: string;
}) {
  const headingId = labelledBy ?? 'drive-sheet-title';
  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-[10050] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl bg-[#0B2733] border-t border-white/10 shadow-2xl pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/10">
          <h2 id={headingId} className="text-sm font-semibold text-white truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-white/10">{footer}</div>}
      </div>
    </div>
    </OverlayPortal>
  );
}

export function DriveConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-[10060] flex items-center justify-center px-6" role="alertdialog" aria-modal="true" aria-labelledby="drive-confirm-title">
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#0B2733] border border-white/10 p-5 shadow-2xl">
        <h3 id="drive-confirm-title" className="text-base font-semibold text-white">
          {title}
        </h3>
        <p className="mt-2 text-sm text-white/70 break-words">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-white/10 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-red-500/90 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}
