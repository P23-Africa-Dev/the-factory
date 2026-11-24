"use client";

import { useMemo, useState } from "react";

/**
 * Tools that keep their dedicated editors in ai-chat.tsx (task assignee
 * picker, meeting attendees, email account checks, KPI and hiring forms).
 * Every other agent-engine action uses this card.
 */
export const LEGACY_CARD_TOOLS = new Set([
    "tasks.create",
    "meetings.schedule",
    "crm.send_email",
    "kpis.create",
    "org.users.create",
]);

export type AgentConfirmationPayload = {
    confirmation_required: true;
    engine: "agent";
    tool: string;
    pending_action_id: string;
    action_label?: string;
    action_args?: Record<string, unknown>;
    preview_fields?: string[];
    editable_fields?: string[];
    field_labels?: Record<string, string>;
    field_options?: Record<string, string[]>;
    missing_fields?: Array<{ key: string; label: string }>;
    expires_at?: string | null;
};

export function agentConfirmationFromPayload(payload: unknown): AgentConfirmationPayload | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Partial<AgentConfirmationPayload>;
    if (p.confirmation_required !== true || p.engine !== "agent" || typeof p.pending_action_id !== "string" || typeof p.tool !== "string") {
        return null;
    }
    return p as AgentConfirmationPayload;
}

/** Whether a message should use this card instead of the legacy one. */
export function usesAgentCard(payload: unknown): boolean {
    const card = agentConfirmationFromPayload(payload);
    return card !== null && !LEGACY_CARD_TOOLS.has(card.tool);
}

function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (Array.isArray(value)) {
        return value
            .map((item) => (item && typeof item === "object" ? Object.values(item as Record<string, unknown>).filter(Boolean).join(" ") : String(item)))
            .join(", ");
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function humanize(field: string): string {
    const base = field.replace(/_ids?$/, "").replace(/_/g, " ");
    return base.charAt(0).toUpperCase() + base.slice(1);
}

type Props = {
    payload: AgentConfirmationPayload;
    disabled?: boolean;
    onConfirm: (pendingId: string, edits: Record<string, unknown>) => Promise<unknown>;
    onCancel: (pendingId: string) => Promise<unknown>;
};

/**
 * Confirmation card for an action ELY prepared: what it will do, the details,
 * quick edits for plain fields, and Confirm / Cancel.
 */
export function AgentConfirmationCard({ payload, disabled = false, onConfirm, onCancel }: Props) {
    const args = useMemo(() => payload.action_args ?? {}, [payload.action_args]);
    const labels = payload.field_labels ?? {};
    const editable = new Set(payload.editable_fields ?? []);
    const options = payload.field_options ?? {};
    const fields = useMemo(() => {
        const preview = payload.preview_fields ?? [];
        const keys = preview.length > 0 ? preview : Object.keys(args);
        return keys.filter((key) => key !== "company_id");
    }, [args, payload.preview_fields]);

    const [edits, setEdits] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
    const [done, setDone] = useState(false);

    const missing = payload.missing_fields ?? [];
    const label = (key: string) => labels[key] ?? humanize(key);

    const editedArgs = (): Record<string, unknown> => {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(edits)) {
            const original = args[key];
            result[key] = typeof original === "number" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : value;
        }
        return result;
    };

    const run = async (kind: "confirm" | "cancel") => {
        setBusy(kind);
        try {
            const result = kind === "confirm"
                ? await onConfirm(payload.pending_action_id, editedArgs())
                : await onCancel(payload.pending_action_id);
            if (result) setDone(true);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mt-2 rounded-xl border border-[#2F5E5A]/70 bg-[#152B2A] px-3 py-3" data-testid="ely-agent-confirmation">
            <p className="text-[12px] font-semibold text-[#A6DFD2]">Review before ELY does this</p>
            {payload.action_label && <p className="mt-0.5 text-[11px] text-[#8CB9B3]">{payload.action_label}</p>}

            <div className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5">
                {fields.map((key) => (
                    <div key={key} className="contents">
                        <label htmlFor={`ely-field-${payload.pending_action_id}-${key}`} className="text-[11px] text-[#8CB9B3]">
                            {label(key)}
                        </label>
                        {editing && editable.has(key) ? (
                            options[key] ? (
                                <select
                                    id={`ely-field-${payload.pending_action_id}-${key}`}
                                    value={edits[key] ?? String(args[key] ?? "")}
                                    onChange={(event) => setEdits((prev) => ({ ...prev, [key]: event.target.value }))}
                                    className="rounded-md border border-white/15 bg-[#0F2221] px-2 py-1 text-[12px] text-white"
                                >
                                    <option value="">—</option>
                                    {options[key].map((option) => (
                                        <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    id={`ely-field-${payload.pending_action_id}-${key}`}
                                    value={edits[key] ?? (args[key] === null || args[key] === undefined ? "" : String(args[key]))}
                                    onChange={(event) => setEdits((prev) => ({ ...prev, [key]: event.target.value }))}
                                    className="rounded-md border border-white/15 bg-[#0F2221] px-2 py-1 text-[12px] text-white"
                                />
                            )
                        ) : (
                            <span className="break-words text-[12px] text-white">{displayValue(edits[key] ?? args[key])}</span>
                        )}
                    </div>
                ))}
            </div>

            {missing.length > 0 && (
                <p className="mt-2 text-[11px] text-[#F2B4A6]">
                    Missing: {missing.map((field) => field.label).join(", ")}. Tell ELY or edit the details.
                </p>
            )}

            {done ? (
                <p className="mt-2 text-[11px] text-[#8CB9B3]">Handled.</p>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {editable.size > 0 && (
                        <button
                            type="button"
                            onClick={() => setEditing((value) => !value)}
                            disabled={disabled || busy !== null}
                            className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10 disabled:opacity-60"
                        >
                            {editing ? "Done editing" : "Edit details"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => void run("confirm")}
                        disabled={disabled || busy !== null}
                        className="rounded-full bg-[#2D6F63] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#358372] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {busy === "confirm" ? "Working…" : "Confirm"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void run("cancel")}
                        disabled={disabled || busy !== null}
                        className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10 disabled:opacity-60"
                    >
                        {busy === "cancel" ? "Cancelling…" : "Cancel"}
                    </button>
                </div>
            )}
        </div>
    );
}
