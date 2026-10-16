"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadFieldDefinition } from "@/lib/api/crm";
import { useLeadFields, useReviewLeadField, useUpdateLeadField } from "@/hooks/use-crm";

export function LeadFieldsManager({
    companyId,
    apiBasePath = "/admin",
}: {
    companyId: number | string;
    apiBasePath?: ApiRoleBasePath;
}) {
    const { data: fields = [], isLoading } = useLeadFields(companyId, apiBasePath);
    const review = useReviewLeadField(undefined, apiBasePath);
    const update = useUpdateLeadField(undefined, apiBasePath);
    const [reason, setReason] = useState("");

    const run = (field: LeadFieldDefinition, action: "approve" | "decline" | "archive" | "restore") => {
        review.mutate({
            fieldId: field.id,
            action,
            payload: { company_id: companyId, reason: action === "decline" ? reason : undefined },
        }, {
            onSuccess: () => toast.success(action === "decline" ? "Field declined." : "Lead field updated."),
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update the field."),
        });
    };

    const toggle = (field: LeadFieldDefinition, key: "show_in_list" | "show_on_create" | "is_required") => {
        update.mutate({
            fieldId: field.id,
            payload: { company_id: companyId, [key]: !field[key] },
        }, {
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update the field."),
        });
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-gray-400" size={20} />
            </div>
        );
    }

    const groups: Array<{ title: string; status: LeadFieldDefinition["status"]; empty: string }> = [
        { title: "Pending approval", status: "pending", empty: "No fields are waiting for review." },
        { title: "Active fields", status: "active", empty: "No custom lead fields yet." },
        { title: "Declined", status: "declined", empty: "No declined fields." },
        { title: "Archived", status: "archived", empty: "No archived fields." },
    ];

    return (
        <div className="space-y-4">
            {groups.map((group) => {
                const items = fields.filter((field) => field.status === group.status);
                return (
                    <div key={group.status} className="rounded-xl border border-gray-100 p-4">
                        <p className="text-[13px] font-bold text-dash-dark">{group.title}</p>
                        {items.length === 0 ? (
                            <p className="mt-1 text-[12px] text-gray-500">{group.empty}</p>
                        ) : (
                            <ul className="mt-3 space-y-3">
                                {items.map((field) => (
                                    <li key={field.id} className="flex flex-col gap-2 border-t border-gray-50 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-[13px] font-semibold text-[#0B1215]">
                                                {field.label} <span className="font-normal text-gray-400">({field.type})</span>
                                            </p>
                                            {field.decline_reason ? (
                                                <p className="text-[12px] text-gray-500">{field.decline_reason}</p>
                                            ) : null}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {field.status === "active" ? (
                                                <>
                                                    <button type="button" className="text-[12px] font-semibold text-gray-600" onClick={() => toggle(field, "show_in_list")}>
                                                        {field.show_in_list ? "Hide column" : "Show column"}
                                                    </button>
                                                    <button type="button" className="text-[12px] font-semibold text-gray-600" onClick={() => toggle(field, "is_required")}>
                                                        {field.is_required ? "Optional" : "Required"}
                                                    </button>
                                                    <button type="button" className="text-[12px] font-semibold text-amber-700" onClick={() => run(field, "archive")}>
                                                        Archive
                                                    </button>
                                                </>
                                            ) : null}
                                            {field.status === "pending" ? (
                                                <>
                                                    <button type="button" className="text-[12px] font-semibold text-emerald-700" onClick={() => run(field, "approve")}>
                                                        Approve
                                                    </button>
                                                    <button type="button" className="text-[12px] font-semibold text-red-600" onClick={() => run(field, "decline")}>
                                                        Decline
                                                    </button>
                                                </>
                                            ) : null}
                                            {field.status === "declined" ? (
                                                <button type="button" className="text-[12px] font-semibold text-emerald-700" onClick={() => run(field, "approve")}>
                                                    Approve
                                                </button>
                                            ) : null}
                                            {field.status === "archived" ? (
                                                <button type="button" className="text-[12px] font-semibold text-emerald-700" onClick={() => run(field, "restore")}>
                                                    Restore
                                                </button>
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}
            <label className="block text-[12px] font-semibold text-gray-600">
                Decline reason
                <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
                    placeholder="Optional note for the next decline"
                />
            </label>
        </div>
    );
}
