'use client';

import { CheckCircle2, XCircle } from 'lucide-react';

export type PendingActionProposal = {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  pendingActionId: string | null;
  preview: Array<{ label: string; value: string }>;
};

/**
 * Reads the "please confirm" payload ELY returns before a risky action
 * (sending an email, deleting a task). Returns null for any other reply.
 */
export function asPendingActionProposal(
  payload: Record<string, unknown> | null | undefined,
): PendingActionProposal | null {
  if (!payload || payload.confirmation_required !== true) return null;
  const args =
    payload.action_args && typeof payload.action_args === 'object'
      ? (payload.action_args as Record<string, unknown>)
      : {};
  const labels =
    payload.field_labels && typeof payload.field_labels === 'object'
      ? (payload.field_labels as Record<string, string>)
      : {};
  const fields = Array.isArray(payload.preview_fields)
    ? (payload.preview_fields as string[])
    : Object.keys(args).filter((key) => !key.endsWith('_id') && !key.endsWith('_ids'));
  const preview = fields
    .filter((field) => args[field] !== undefined && args[field] !== null && args[field] !== '')
    .map((field) => ({
      label: labels[field] ?? field.replace(/_/g, ' '),
      value: typeof args[field] === 'object' ? JSON.stringify(args[field]) : String(args[field]),
    }));
  const tool = String(payload.tool ?? payload.action ?? 'action');
  const label = String(payload.action_label || tool);

  return {
    tool,
    label,
    args,
    pendingActionId: typeof payload.pending_action_id === 'string' ? payload.pending_action_id : null,
    preview,
  };
}

export function ActionConfirmCard({
  proposal,
  state,
  disabled,
  onConfirm,
  onCancel,
}: {
  proposal: PendingActionProposal;
  state: 'open' | 'confirmed' | 'cancelled';
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 p-3.5 rounded-2xl bg-[#0A1D25]/90 border border-[#75ADAF]/40">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#75ADAF]">
        Please confirm
      </div>
      <div className="text-xs font-semibold text-white">{proposal.label}</div>
      {proposal.preview.length > 0 && (
        <dl className="mt-2 space-y-1">
          {proposal.preview.map((item) => (
            <div key={item.label} className="flex gap-2 text-[11px]">
              <dt className="text-white/50 shrink-0">{item.label}:</dt>
              <dd className="text-white/85 break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {state === 'confirmed' ? (
        <div className="mt-3 flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4" /> Confirmed
        </div>
      ) : state === 'cancelled' ? (
        <div className="mt-3 flex items-center gap-1.5 text-white/60 text-xs font-semibold">
          <XCircle className="w-4 h-4" /> Cancelled
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="flex-1 py-2 px-3 rounded-xl bg-[#FD6046] hover:bg-[#E0533C] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onCancel}
            className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white/80 text-xs font-semibold flex items-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
