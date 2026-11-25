"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadFieldDefinition } from "@/lib/api/crm";
import { useReviewLeadField } from "@/hooks/use-crm";
import { isPendingUniversalRequest } from "@/lib/crm/custom-fields";

export function PendingUniversalFieldsCard({
    fields,
    companyId,
    apiBasePath = "/admin",
}: {
    fields: LeadFieldDefinition[];
    companyId: number | string;
    apiBasePath?: ApiRoleBasePath;
}) {
    const pending = fields.filter(isPendingUniversalRequest);
    const review = useReviewLeadField(undefined, apiBasePath);
    const [reasons, setReasons] = useState<Record<number, string>>({});

    if (pending.length === 0) return null;

    const run = (field: LeadFieldDefinition, action: "approve" | "decline") => {
        review.mutate({
            fieldId: field.id,
            action,
            payload: {
                company_id: companyId,
                reason: action === "decline" ? reasons[field.id] : undefined,
            },
        }, {
            onSuccess: () => toast.success(
                action === "approve"
                    ? `"${field.label}" is now a universal field.`
                    : `"${field.label}" stays on existing leads only.`,
            ),
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update the field."),
        });
    };

    return (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-amber-800">
                Universal field requests ({pending.length})
            </p>
            <p className="mt-1 text-[11px] text-amber-700">
                Approve to show the field on every new lead form. Decline keeps it only on leads that already use it.
            </p>
            <ul className="mt-3 space-y-2">
                {pending.map((field) => (
                    <li key={field.id} className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[#0B1215]">
                                    {field.label}
                                    <span className="ml-1 font-normal text-gray-400">({field.type})</span>
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    {field.created_by?.name ? `Requested by ${field.created_by.name}` : "Requested by an agent"}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={review.isPending}
                                    onClick={() => run(field, "approve")}
                                    className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
                                >
                                    Approve
                                </button>
                                <button
                                    type="button"
                                    disabled={review.isPending}
                                    onClick={() => run(field, "decline")}
                                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 disabled:opacity-60"
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                        <input
                            value={reasons[field.id] ?? ""}
                            onChange={(event) => setReasons((current) => ({ ...current, [field.id]: event.target.value }))}
                            placeholder="Optional decline reason"
                            className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px]"
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}
