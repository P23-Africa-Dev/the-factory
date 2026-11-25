"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Inbox, Loader2, Search, X } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadFieldDefinition } from "@/lib/api/crm";
import { useReviewLeadField } from "@/hooks/use-crm";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
    FIELD_REQUESTS_PAGE_SIZE,
    bannerLabel,
    filterFieldRequests,
    pendingFieldRequests,
    usageLabel,
    type FieldRequestSort,
} from "@/lib/crm/field-requests";

type Props = {
    fields: LeadFieldDefinition[];
    companyId: number | string;
    apiBasePath?: ApiRoleBasePath;
    className?: string;
};

function requestedAgo(field: LeadFieldDefinition): string | null {
    if (!field.created_at) return null;
    try {
        return `${formatDistanceToNowStrict(parseISO(field.created_at))} ago`;
    } catch {
        return null;
    }
}

/**
 * One line ("N field requests waiting for review · Review") that opens the review
 * panel. Renders nothing when there are no pending requests, so it never grows
 * with the number of requests. Show it to managers only.
 */
export function FieldRequestsBanner({ fields, companyId, apiBasePath = "/admin", className }: Props) {
    const [open, setOpen] = useState(false);
    const count = pendingFieldRequests(fields).length;

    if (count === 0) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-amber-800 transition-colors hover:bg-amber-100 ${className ?? ""}`}
            >
                <Inbox size={15} className="shrink-0" aria-hidden />
                <span className="flex-1 text-[12px] font-medium">{bannerLabel(count)}</span>
                <span className="flex items-center gap-0.5 text-[12px] font-semibold">
                    Review <ChevronRight size={14} aria-hidden />
                </span>
            </button>
            {open ? (
                <FieldRequestsReviewPanel
                    fields={fields}
                    companyId={companyId}
                    apiBasePath={apiBasePath}
                    onClose={() => setOpen(false)}
                />
            ) : null}
        </>
    );
}

/**
 * Review panel: search, sort, approve or decline one request (a reason box appears
 * only after Decline), or several at once. Handled rows leave the list.
 */
export function FieldRequestsReviewPanel({
    fields,
    companyId,
    apiBasePath = "/admin",
    onClose,
}: Props & { onClose: () => void }) {
    const review = useReviewLeadField(undefined, apiBasePath);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<FieldRequestSort>("newest");
    const [visible, setVisible] = useState(FIELD_REQUESTS_PAGE_SIZE);
    const [selected, setSelected] = useState<number[]>([]);
    const [decliningId, setDecliningId] = useState<number | null>(null);
    const [reason, setReason] = useState("");
    const [busyIds, setBusyIds] = useState<number[]>([]);
    const [handledIds, setHandledIds] = useState<number[]>([]);

    const pending = useMemo(
        () => pendingFieldRequests(fields).filter((field) => !handledIds.includes(field.id)),
        [fields, handledIds],
    );
    const filtered = useMemo(() => filterFieldRequests(pending, query, sort), [pending, query, sort]);
    const shown = filtered.slice(0, visible);
    const selectedPending = selected.filter((id) => pending.some((field) => field.id === id));

    const act = async (field: LeadFieldDefinition, action: "approve" | "decline", declineReason?: string): Promise<boolean> => {
        setBusyIds((ids) => [...ids, field.id]);
        try {
            await review.mutateAsync({
                fieldId: field.id,
                action,
                payload: { company_id: companyId, reason: action === "decline" ? declineReason || undefined : undefined },
            });
            setHandledIds((ids) => [...ids, field.id]);
            setSelected((ids) => ids.filter((id) => id !== field.id));
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Couldn't update "${field.label}".`);
            return false;
        } finally {
            setBusyIds((ids) => ids.filter((id) => id !== field.id));
        }
    };

    const actOne = async (field: LeadFieldDefinition, action: "approve" | "decline") => {
        const ok = await act(field, action, action === "decline" ? reason.trim() : undefined);
        if (!ok) return;
        if (action === "decline") {
            setDecliningId(null);
            setReason("");
        }
        toast.success(
            action === "approve"
                ? `"${field.label}" is now on every new lead`
                : `"${field.label}" stays on its existing leads only`,
        );
    };

    const actMany = async (action: "approve" | "decline") => {
        const targets = pending.filter((field) => selectedPending.includes(field.id));
        let done = 0;
        for (const field of targets) {
            if (await act(field, action)) done += 1;
        }
        if (done > 0) {
            toast.success(`${action === "approve" ? "Approved" : "Declined"} ${done} ${done === 1 ? "request" : "requests"}`);
        }
    };

    const toggleSelected = (id: number) =>
        setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));

    const allShownSelected = shown.length > 0 && shown.every((field) => selectedPending.includes(field.id));
    const bulkBusy = busyIds.length > 0;

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close field requests" onClick={onClose} />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Field requests"
                    className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
                >
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <div>
                            <h3 className="text-[15px] font-bold text-[#0B1215]">
                                Field requests <span className="font-normal text-gray-400">· {pending.length}</span>
                            </h3>
                            <p className="text-[11px] text-gray-500">
                                Approve to add the field to every new lead. Decline keeps it only on leads that already use it.
                            </p>
                        </div>
                        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="flex gap-2 border-b border-gray-100 px-4 py-2.5">
                        <label className="flex flex-1 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5">
                            <Search size={13} className="text-gray-400" aria-hidden />
                            <input
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setVisible(FIELD_REQUESTS_PAGE_SIZE);
                                }}
                                placeholder="Search field or agent"
                                aria-label="Search field requests"
                                className="h-8 w-full bg-transparent text-[12px] outline-none"
                            />
                        </label>
                        <select
                            value={sort}
                            onChange={(event) => setSort(event.target.value as FieldRequestSort)}
                            aria-label="Sort field requests"
                            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-600"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                        </select>
                    </div>

                    {shown.length > 0 ? (
                        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-[11px] text-gray-500">
                            <label className="flex items-center gap-1.5">
                                <input
                                    type="checkbox"
                                    checked={allShownSelected}
                                    onChange={() =>
                                        setSelected((ids) =>
                                            allShownSelected
                                                ? ids.filter((id) => !shown.some((field) => field.id === id))
                                                : Array.from(new Set([...ids, ...shown.map((field) => field.id)])),
                                        )
                                    }
                                    aria-label="Select all shown requests"
                                />
                                {selectedPending.length > 0 ? `${selectedPending.length} selected` : "Select all"}
                            </label>
                            {selectedPending.length > 0 ? (
                                <span className="ml-auto flex gap-2">
                                    <button
                                        type="button"
                                        disabled={bulkBusy}
                                        onClick={() => actMany("approve")}
                                        className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 disabled:opacity-50"
                                    >
                                        Approve {selectedPending.length}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={bulkBusy}
                                        onClick={() => actMany("decline")}
                                        className="rounded-md border border-red-200 px-2 py-1 font-semibold text-red-600 disabled:opacity-50"
                                    >
                                        Decline {selectedPending.length}
                                    </button>
                                </span>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="flex-1 overflow-y-auto">
                        {pending.length === 0 ? (
                            <p className="px-4 py-8 text-center text-[12px] text-gray-500">All field requests are handled.</p>
                        ) : shown.length === 0 ? (
                            <p className="px-4 py-8 text-center text-[12px] text-gray-500">No requests match &quot;{query}&quot;.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {shown.map((field) => {
                                    const busy = busyIds.includes(field.id);
                                    const meta = [field.created_by?.name ?? "An agent", requestedAgo(field), usageLabel(field.usage_count)]
                                        .filter(Boolean)
                                        .join(" · ");
                                    return (
                                        <li key={field.id} className={`px-4 py-2.5 ${decliningId === field.id ? "bg-gray-50" : ""}`}>
                                            <div className="flex items-center gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPending.includes(field.id)}
                                                    onChange={() => toggleSelected(field.id)}
                                                    aria-label={`Select ${field.label}`}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] font-semibold text-[#0B1215]">
                                                        {field.label}
                                                        <span className="ml-1 font-normal text-gray-400">· {field.type}</span>
                                                    </p>
                                                    <p className="truncate text-[11px] text-gray-500">{meta}</p>
                                                </div>
                                                {busy ? <Loader2 size={14} className="animate-spin text-gray-400" aria-hidden /> : null}
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => actOne(field, "approve")}
                                                    className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-50"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        setDecliningId(decliningId === field.id ? null : field.id);
                                                        setReason("");
                                                    }}
                                                    className="rounded-md border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 disabled:opacity-50"
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                            {decliningId === field.id ? (
                                                <div className="mt-2 flex gap-2 pl-6">
                                                    <input
                                                        value={reason}
                                                        onChange={(event) => setReason(event.target.value)}
                                                        placeholder="Reason (optional)"
                                                        aria-label={`Decline reason for ${field.label}`}
                                                        className="h-8 flex-1 rounded-lg border border-gray-200 px-2.5 text-[12px]"
                                                        autoFocus
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => actOne(field, "decline")}
                                                        className="rounded-lg bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                                                    >
                                                        Confirm decline
                                                    </button>
                                                </div>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {filtered.length > shown.length ? (
                        <button
                            type="button"
                            onClick={() => setVisible((count) => count + FIELD_REQUESTS_PAGE_SIZE)}
                            className="border-t border-gray-100 px-4 py-2.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
                        >
                            Showing {shown.length} of {filtered.length} · Show more
                        </button>
                    ) : null}
                </div>
            </div>
        </ModalPortal>
    );
}
