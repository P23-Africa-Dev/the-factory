"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadFieldDefinition, LeadFieldType } from "@/lib/api/crm";
import { LEAD_FIELD_TYPE_OPTIONS, findExistingLeadField, isSelectField } from "@/lib/crm/custom-fields";
import { useCreateLeadField, useUpdateLeadField } from "@/hooks/use-crm";
import { ModalPortal } from "@/components/ui/modal-portal";
import { FieldError } from "@/components/ui/field-error";
import { scrollToFirstError } from "@/lib/forms/scroll-to-first-error";
import { mapApiFieldErrors } from "@/lib/forms/api-field-errors";

export function LeadFieldDialog({
    companyId,
    apiBasePath,
    initialLabel = "",
    initialType = "text",
    title,
    submitLabel,
    field,
    canManage = false,
    isAgentContext = false,
    onClose,
    onCreated,
    onUpdated,
    existingFields,
    onUseExisting,
}: {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    initialLabel?: string;
    initialType?: LeadFieldType;
    title?: string;
    submitLabel?: string;
    field?: LeadFieldDefinition | null;
    canManage?: boolean;
    isAgentContext?: boolean;
    onClose: () => void;
    onCreated?: (field: LeadFieldDefinition) => void;
    onUpdated?: (field: LeadFieldDefinition) => void;
    /** Company fields; when given with onUseExisting, a taken name offers the existing field. */
    existingFields?: LeadFieldDefinition[];
    onUseExisting?: (field: LeadFieldDefinition) => void;
}) {
    const editing = Boolean(field);
    const [label, setLabel] = useState(field?.label ?? initialLabel);
    const [type, setType] = useState<LeadFieldType>(field?.type ?? initialType);
    const [optionsText, setOptionsText] = useState(
        (field?.options ?? []).map((option) => option.label).join("\n"),
    );
    const [description, setDescription] = useState(field?.description ?? "");
    const [makeUniversal, setMakeUniversal] = useState(field?.is_universal ?? false);
    const [isRequired, setIsRequired] = useState(Boolean(field?.is_required && field?.is_universal));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const createField = useCreateLeadField(undefined, apiBasePath);
    const updateField = useUpdateLeadField(undefined, apiBasePath);
    const pending = createField.isPending || updateField.isPending;

    // Only one field per name per company: point to the existing one instead of a dead end.
    const existingMatch =
        !editing && onUseExisting && existingFields ? findExistingLeadField(existingFields, label) : undefined;

    const resolvedTitle = title ?? (editing ? "Edit lead field" : "Add lead field");
    const resolvedSubmit = submitLabel ?? (editing ? "Save field" : "Add field");

    const helperText = (() => {
        if (editing) {
            return makeUniversal
                ? "Universal fields appear on every new lead form and import for this company."
                : "Lead-only fields stay on leads that already use them.";
        }
        if (makeUniversal && isAgentContext) {
            return "This lead keeps the field now. An owner, admin, or supervisor must approve it before it appears on every new lead form.";
        }
        if (makeUniversal) {
            return "This field will appear on every new lead form and import for the organization.";
        }
        return "By default this field is saved only on the lead you are working on. It will not appear on later add-lead forms.";
    })();

    const submit = () => {
        const trimmed = label.trim();
        const nextErrors: Record<string, string> = {};
        if (!trimmed) nextErrors.label = "Enter a field name.";
        const options = optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        if (isSelectField(type) && options.length === 0) {
            nextErrors.options = "Add at least one option, one per line.";
        }
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            void scrollToFirstError();
            return;
        }
        setErrors({});

        if (editing && field) {
            updateField.mutate({
                fieldId: field.id,
                payload: {
                    company_id: companyId,
                    label: trimmed,
                    description: description.trim() || null,
                    options: isSelectField(type) ? options : undefined,
                    is_universal: makeUniversal,
                    is_required: makeUniversal ? isRequired : false,
                    show_on_create: makeUniversal,
                    show_in_list: makeUniversal,
                },
            }, {
                onSuccess: (response) => {
                    toast.success("Lead field updated.");
                    onUpdated?.(response.data.field);
                    onClose();
                },
                onError: (error: unknown) => {
                    const mapped = mapApiFieldErrors(error, {
                        label: "label",
                        options: "options",
                        type: "type",
                    });
                    if (Object.keys(mapped).length > 0) {
                        setErrors(mapped as Record<string, string>);
                        void scrollToFirstError();
                    }
                    toast.error(error instanceof Error ? error.message : "Could not update that field.");
                },
            });
            return;
        }

        createField.mutate({
            company_id: companyId,
            label: trimmed,
            type,
            description: description.trim() || null,
            options: isSelectField(type) ? options : undefined,
            is_required: makeUniversal ? isRequired : false,
            make_universal: makeUniversal,
        }, {
            onSuccess: (response) => {
                const created = response.data.field;
                if (created.universal_request_status === "pending") {
                    toast.success("Field saved on this lead. Universal use is awaiting approval.");
                } else if (created.is_universal) {
                    toast.success("Universal lead field added.");
                } else {
                    toast.success("Lead field added for this lead.");
                }
                onCreated?.(created);
                onClose();
            },
            onError: (error: unknown) => {
                const mapped = mapApiFieldErrors(error, {
                    label: "label",
                    options: "options",
                    type: "type",
                });
                if (Object.keys(mapped).length > 0) {
                    setErrors(mapped as Record<string, string>);
                    void scrollToFirstError();
                }
                toast.error(error instanceof Error ? error.message : "Could not add that field.");
            },
        });
    };

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close field dialog" onClick={onClose} />
                <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                    <h3 className="text-[16px] font-bold text-[#0B1215]">{resolvedTitle}</h3>
                    <p className="mt-1 text-[12px] text-gray-500">{helperText}</p>
                    <div className="mt-4 space-y-3">
                        <div data-field="label">
                            <label className="block text-[12px] font-semibold text-gray-600">
                                Field name
                                <input
                                    value={label}
                                    onChange={(event) => {
                                        setLabel(event.target.value);
                                        if (errors.label) setErrors((prev) => ({ ...prev, label: "" }));
                                    }}
                                    aria-invalid={errors.label ? true : undefined}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
                                    placeholder="Phone Number"
                                    maxLength={80}
                                />
                            </label>
                            {existingMatch ? (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                                    <p>
                                        <span className="font-semibold">{existingMatch.label}</span> already exists as{" "}
                                        {existingMatch.is_universal ? "a company field" : "a lead-only field"}
                                        {existingMatch.created_by?.name ? ` (created by ${existingMatch.created_by.name}` : ""}
                                        {existingMatch.created_by?.name && existingMatch.created_at
                                            ? `, ${new Date(existingMatch.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })})`
                                            : existingMatch.created_by?.name ? ")" : ""}
                                        . Use it for this column instead of creating a new one.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onUseExisting?.(existingMatch);
                                            onClose();
                                        }}
                                        className="mt-2 rounded-lg bg-[#0B1215] px-3 py-1.5 text-[12px] font-semibold text-white"
                                    >
                                        Use this field
                                    </button>
                                </div>
                            ) : (
                                <FieldError message={errors.label} />
                            )}
                        </div>
                        <div data-field="type">
                            <label className="block text-[12px] font-semibold text-gray-600">
                                Type
                                <select
                                    value={type}
                                    onChange={(event) => setType(event.target.value as LeadFieldType)}
                                    disabled={editing}
                                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] bg-white disabled:bg-gray-50"
                                >
                                    {LEAD_FIELD_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <FieldError message={errors.type} />
                        </div>
                        {isSelectField(type) && (
                            <div data-field="options">
                                <label className="block text-[12px] font-semibold text-gray-600">
                                    Options
                                    <textarea
                                        value={optionsText}
                                        onChange={(event) => {
                                            setOptionsText(event.target.value);
                                            if (errors.options) setErrors((prev) => ({ ...prev, options: "" }));
                                        }}
                                        aria-invalid={errors.options ? true : undefined}
                                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
                                        rows={4}
                                        placeholder={"SaaS\nRetail"}
                                    />
                                </label>
                                <FieldError message={errors.options} />
                            </div>
                        )}
                        <label className="block text-[12px] font-semibold text-gray-600">
                            Description
                            <input
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
                                maxLength={255}
                            />
                        </label>
                        <label className="flex items-start gap-2 text-[12px] text-gray-700">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={makeUniversal}
                                onChange={(event) => {
                                    const checked = event.target.checked;
                                    setMakeUniversal(checked);
                                    if (!checked) setIsRequired(false);
                                }}
                                disabled={editing && !canManage}
                            />
                            <span>
                                <span className="font-semibold">Use on every new lead</span>
                                <span className="block text-gray-500">
                                    {isAgentContext && !editing
                                        ? "Requests approval before this becomes a company-wide field."
                                        : "Shows on add-lead and import for everyone in the organization."}
                                </span>
                            </span>
                        </label>
                        {makeUniversal ? (
                            <label className="flex items-center gap-2 text-[12px] text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={isRequired}
                                    onChange={(event) => setIsRequired(event.target.checked)}
                                />
                                Make field required
                            </label>
                        ) : null}
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600">
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={pending || Boolean(existingMatch)}
                            className="rounded-lg bg-[#0B1215] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                        >
                            {pending ? "Saving…" : resolvedSubmit}
                        </button>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
