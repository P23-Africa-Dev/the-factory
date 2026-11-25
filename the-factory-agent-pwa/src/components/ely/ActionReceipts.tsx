'use client';

import Link from 'next/link';
import { useState } from 'react';

export type ElyActionReceipt = {
  tool: string;
  summary: string;
  link?: string | null;
  audit_id?: number | null;
  undo_label?: string | null;
};

/** Reads the "done" receipts from an ELY reply. */
export function receiptsFromPayload(payload: unknown): ElyActionReceipt[] {
  if (!payload || typeof payload !== 'object') return [];
  const raw = (payload as { receipts?: unknown }).receipts;
  if (!Array.isArray(raw)) return [];

  return raw.filter(
    (item): item is ElyActionReceipt =>
      !!item && typeof item === 'object' && typeof (item as ElyActionReceipt).summary === 'string',
  );
}

/**
 * ELY links point at web app pages (`/crm/leads/12`, `/tasks`). Maps them to
 * the matching mobile screen, or null when the mobile app has no such screen.
 */
export function receiptHref(link: string, area: 'agent' | 'manager'): string | null {
  const prefix = area === 'manager' ? '/manager' : '';
  const path = link.replace(/^\/agent(?=\/)/, '').split(/[?#]/)[0];

  const lead = path.match(/^\/crm\/leads\/(\d+)\/?$/);
  if (lead) return `${prefix}/crm/leads/${lead[1]}`;
  if (/^\/crm\/leads\/?$/.test(path)) return `${prefix}/crm/leads`;
  if (/^\/crm\/?$/.test(path)) return `${prefix}/crm`;

  const task = path.match(/^\/tasks\/(\d+)\/?$/);
  if (task) return `${prefix}/task/${task[1]}`;
  if (/^\/tasks\/?$/.test(path)) return `${prefix}/tasks`;

  const meeting = path.match(/^\/meetings\/(\d+)\/?$/);
  if (meeting) return `${prefix}/meetings/${meeting[1]}`;
  if (/^\/meetings\/?$/.test(path)) return `${prefix}/meetings`;

  return null;
}

type Props = {
  receipts: ElyActionReceipt[];
  area: 'agent' | 'manager';
  disabled?: boolean;
  /** Undo the action; resolves true when it was undone. */
  onUndo: (auditId: number) => Promise<boolean>;
};

/**
 * "Done" receipts under an ELY reply: what was done, an Open link to the
 * record, and an Undo button when the action can be reversed.
 */
export function ActionReceipts({ receipts, area, disabled = false, onUndo }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [undone, setUndone] = useState<Record<number, boolean>>({});

  if (receipts.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1.5" aria-label="Actions ELY completed">
      {receipts.map((receipt, index) => {
        const auditId = typeof receipt.audit_id === 'number' ? receipt.audit_id : null;
        const isUndone = auditId !== null && undone[auditId] === true;
        const canUndo = auditId !== null && !!receipt.undo_label && !isUndone;
        const href = receipt.link ? receiptHref(receipt.link, area) : null;

        return (
          <li
            key={`${receipt.tool}-${auditId ?? index}`}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[#2D6F63]/60 bg-[#113B37]/60 px-3 py-2 text-[11px] text-[#B9E9DD]"
          >
            <span className="font-bold text-[#7BB6B8]">{isUndone ? 'Undone' : 'Done'}</span>
            <span className="min-w-0 flex-1 break-words">{receipt.summary}</span>
            {href && !isUndone && (
              <Link href={href} className="font-semibold text-white underline-offset-2 hover:underline">
                Open
              </Link>
            )}
            {canUndo && (
              <button
                type="button"
                disabled={disabled || busy !== null}
                onClick={async () => {
                  setBusy(auditId);
                  try {
                    if (await onUndo(auditId)) {
                      setUndone((prev) => ({ ...prev, [auditId]: true }));
                    }
                  } finally {
                    setBusy(null);
                  }
                }}
                className="rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white/85 active:bg-white/10 disabled:opacity-60"
              >
                {busy === auditId ? 'Undoing…' : receipt.undo_label}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
