"use client";

import Link from "next/link";
import { useState } from "react";

export type ElyActionReceipt = {
    tool: string;
    summary: string;
    link?: string | null;
    audit_id?: number | null;
    undo_label?: string | null;
};

/** Read receipts from an assistant payload (agent engine). */
export function receiptsFromPayload(payload: unknown): ElyActionReceipt[] {
    if (!payload || typeof payload !== "object") return [];
    const raw = (payload as { receipts?: unknown }).receipts;
    if (!Array.isArray(raw)) return [];

    return raw.filter(
        (item): item is ElyActionReceipt =>
            !!item && typeof item === "object" && typeof (item as ElyActionReceipt).summary === "string"
    );
}

/** Agents use the /agent area of the app; links from ELY point at the manager paths. */
export function receiptHref(link: string, isAgent: boolean): string {
    if (!isAgent || link.startsWith("/agent/")) return link;
    if (/^\/(crm|projects|tasks|dashboard|drive|operations)(\/|$)/.test(link)) {
        return `/agent${link}`;
    }
    return link;
}

type Props = {
    receipts: ElyActionReceipt[];
    isAgent: boolean;
    disabled?: boolean;
    onUndo: (auditId: number) => Promise<unknown>;
};

/**
 * "Done" receipts under an ELY reply: what was done, an Open link to the
 * record, and an Undo button when the action can be reversed.
 */
export function ElyActionReceipts({ receipts, isAgent, disabled = false, onUndo }: Props) {
    const [busy, setBusy] = useState<number | null>(null);
    const [undone, setUndone] = useState<Record<number, boolean>>({});

    if (receipts.length === 0) return null;

    return (
        <ul className="mt-2 space-y-1.5" aria-label="Actions ELY completed">
            {receipts.map((receipt, index) => {
                const auditId = typeof receipt.audit_id === "number" ? receipt.audit_id : null;
                const canUndo = auditId !== null && !!receipt.undo_label && !undone[auditId];

                return (
                    <li
                        key={`${receipt.tool}-${auditId ?? index}`}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2D6F63]/60 bg-[#113B37]/60 px-3 py-2 text-[12px] text-[#B9E9DD]"
                    >
                        <span className="font-semibold text-[#7BB6B8]">{auditId !== null && undone[auditId] ? "Undone" : "Done"}</span>
                        <span className="min-w-0 flex-1 break-words">{receipt.summary}</span>
                        {receipt.link && (
                            <Link href={receiptHref(receipt.link, isAgent)} className="font-semibold text-white underline-offset-2 hover:underline">
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
                                        const result = (await onUndo(auditId)) as { response?: { payload?: { undone?: boolean } } } | null;
                                        if (result?.response?.payload?.undone) {
                                            setUndone((prev) => ({ ...prev, [auditId]: true }));
                                        }
                                    } finally {
                                        setBusy(null);
                                    }
                                }}
                                className="rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {busy === auditId ? "Undoing…" : receipt.undo_label}
                            </button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
