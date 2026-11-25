"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadFieldDefinition } from "@/lib/api/crm";
import {
    useDeleteLeadField,
    useLeadFields,
    useReorderLeadFields,
    useReviewLeadField,
    useUpdateLeadField,
} from "@/hooks/use-crm";
import { LeadFieldDialog } from "@/components/crm/lead-field-dialog";
import { FieldRequestsBanner } from "@/components/crm/field-requests-review";
import { isUniversalLeadField } from "@/lib/crm/custom-fields";

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
    const remove = useDeleteLeadField(undefined, apiBasePath);
    const reorder = useReorderLeadFields(undefined, apiBasePath);
    const [editingField, setEditingField] = useState<LeadFieldDefinition | null>(null);

    const declinedRequests = useMemo(
        () => fields.filter((field) => field.status === "active" && field.universal_request_status === "declined"),
        [fields],
    );
    const universalFields = useMemo(
        () => fields.filter((field) => isUniversalLeadField(field)),
        [fields],
    );
    const leadSpecificFields = useMemo(
        () => fields.filter((field) => field.status === "active" && !field.is_universal && field.universal_request_status !== "pending"),
        [fields],
    );
    const archivedFields = useMemo(
        () => fields.filter((field) => field.status === "archived"),
        [fields],
    );

    const orderedActive = useMemo(
        () => fields.filter((field) => field.status === "active"),
        [fields],
    );

    const run = (field: LeadFieldDefinition, action: "approve" | "decline" | "archive" | "restore") => {
        review.mutate({
            fieldId: field.id,
            action,
            payload: { company_id: companyId },
        }, {
            onSuccess: () => toast.success(
                action === "approve"
                    ? "Field is now universal."
                    : action === "decline"
                        ? "Universal request declined."
                        : "Lead field updated.",
            ),
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update the field."),
        });
    };

    const toggle = (field: LeadFieldDefinition, key: "show_in_list" | "show_on_create" | "is_required" | "is_universal") => {
        update.mutate({
            fieldId: field.id,
            payload: { company_id: companyId, [key]: !field[key] },
        }, {
            onSuccess: () => {
                if (key === "is_universal" && !field.is_universal) {
                    toast.success("Field is now universal.");
                }
            },
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not update the field."),
        });
    };

    const move = (field: LeadFieldDefinition, direction: "up" | "down") => {
        if (reorder.isPending) return;
        const index = orderedActive.findIndex((item) => item.id === field.id);
        if (index < 0) return;
        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= orderedActive.length) return;
        const next = [...orderedActive];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        reorder.mutate({
            company_id: companyId,
            ordered_ids: next.map((item) => item.id),
        }, {
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not reorder fields."),
        });
    };

    const destroy = (field: LeadFieldDefinition) => {
        const confirmed = window.confirm(
            `Delete ${field.label}? Saved values stay on existing leads, but the column is removed from forms and lists.`,
        );
        if (!confirmed) return;
        remove.mutate({
            fieldId: field.id,
            payload: { company_id: companyId },
        }, {
            onSuccess: () => toast.success("Lead field deleted."),
            onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not delete the field."),
        });
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-gray-400" size={20} />
            </div>
        );
    }

    const renderControls = (field: LeadFieldDefinition, indexInGroup: number, groupItems: LeadFieldDefinition[]) => {
        const activeIndex = orderedActive.findIndex((item) => item.id === field.id);
        return (
            <div className="flex flex-wrap gap-2">
                <button type="button" className="text-[12px] font-semibold text-gray-600" onClick={() => setEditingField(field)}>
                    Edit
                </button>
                <button
                    type="button"
                    aria-label={`Move ${field.label} up`}
                    disabled={activeIndex <= 0 || reorder.isPending}
                    onClick={() => move(field, "up")}
                    className="rounded-md border border-gray-200 p-1 text-gray-500 disabled:opacity-40"
                >
                    <ChevronUp size={14} />
                </button>
                <button
                    type="button"
                    aria-label={`Move ${field.label} down`}
                    disabled={activeIndex < 0 || activeIndex >= orderedActive.length - 1 || reorder.isPending}
                    onClick={() => move(field, "down")}
                    className="rounded-md border border-gray-200 p-1 text-gray-500 disabled:opacity-40"
                >
                    <ChevronDown size={14} />
                </button>
                {field.is_universal ? (
                    <>
                        <button type="button" className="text-[12px] font-semibold text-gray-600" onClick={() => toggle(field, "show_in_list")}>
                            {field.show_in_list ? "Hide column" : "Show column"}
                        </button>
                        <button type="button" className="text-[12px] font-semibold text-gray-600" onClick={() => toggle(field, "is_required")}>
                            {field.is_required ? "Optional" : "Required"}
                        </button>
                    </>
                ) : (
                    <button type="button" className="text-[12px] font-semibold text-emerald-700" onClick={() => toggle(field, "is_universal")}>
                        Make universal
                    </button>
                )}
                <button type="button" className="text-[12px] font-semibold text-amber-700" onClick={() => run(field, "archive")}>
                    Archive
                </button>
                <button type="button" className="text-[12px] font-semibold text-red-600" onClick={() => destroy(field)}>
                    Delete
                </button>
                <span className="sr-only">{indexInGroup + 1} of {groupItems.length}</span>
            </div>
        );
    };

    const renderGroup = (
        title: string,
        items: LeadFieldDefinition[],
        empty: string,
        mode: "active" | "declined" | "archived",
    ) => (
        <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[13px] font-bold text-dash-dark">{title}</p>
            {items.length === 0 ? (
                <p className="mt-1 text-[12px] text-gray-500">{empty}</p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {items.map((field, index) => (
                        <li key={field.id} className="flex flex-col gap-2 border-t border-gray-50 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-[13px] font-semibold text-[#0B1215]">
                                    {field.label} <span className="font-normal text-gray-400">({field.type})</span>
                                </p>
                                {field.created_by?.name ? (
                                    <p className="text-[12px] text-gray-500">Requested by {field.created_by.name}</p>
                                ) : null}
                                {field.decline_reason ? (
                                    <p className="text-[12px] text-gray-500">{field.decline_reason}</p>
                                ) : null}
                            </div>
                            {mode === "declined" ? (
                                <button type="button" className="text-[12px] font-semibold text-emerald-700" onClick={() => run(field, "approve")}>
                                    Approve
                                </button>
                            ) : null}
                            {mode === "archived" ? (
                                <button type="button" className="text-[12px] font-semibold text-emerald-700" onClick={() => run(field, "restore")}>
                                    Restore
                                </button>
                            ) : null}
                            {mode === "active" ? renderControls(field, index, items) : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    return (
        <div className="space-y-4">
            {/* Requests stay one line here; the review panel holds the list. */}
            <FieldRequestsBanner fields={fields} companyId={companyId} apiBasePath={apiBasePath} />
            {renderGroup("Universal fields", universalFields, "No universal lead fields yet.", "active")}
            {renderGroup("Lead-specific fields", leadSpecificFields, "No lead-specific fields yet.", "active")}
            {renderGroup("Declined requests", declinedRequests, "No declined universal requests.", "declined")}
            {renderGroup("Archived", archivedFields, "No archived fields.", "archived")}
            {editingField ? (
                <LeadFieldDialog
                    companyId={companyId}
                    apiBasePath={apiBasePath}
                    field={editingField}
                    canManage
                    onClose={() => setEditingField(null)}
                    onUpdated={() => setEditingField(null)}
                />
            ) : null}
        </div>
    );
}
