"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadFieldDefinition, LeadFieldType } from "@/lib/api/crm";
import { LEAD_FIELD_TYPE_OPTIONS, isSelectField } from "@/lib/crm/custom-fields";
import { useCreateLeadField } from "@/hooks/use-crm";

export function LeadFieldDialog({
    companyId,
    apiBasePath,
    initialLabel = "",
    initialType = "text",
    title = "Add lead field",
    submitLabel = "Add field",
    onClose,
    onCreated,
}: {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    initialLabel?: string;
    initialType?: LeadFieldType;
    title?: string;
    submitLabel?: string;
    onClose: () => void;
    onCreated: (field: LeadFieldDefinition) => void;
}) {
    const [label, setLabel] = useState(initialLabel);
    const [type, setType] = useState<LeadFieldType>(initialType);
    const [optionsText, setOptionsText] = useState("");
    const [description, setDescription] = useState("");
    const [isRequired, setIsRequired] = useState(false);
    const createField = useCreateLeadField(undefined, apiBasePath);

    const submit = () => {
        const trimmed = label.trim();
        if (!trimmed) {
            toast.error("Enter a field name.");
            return;
        }
        const options = optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        if (isSelectField(type) && options.length === 0) {
            toast.error("Add at least one option, one per line.");
            return;
        }

        createField.mutate({
            company_id: companyId,
            label: trimmed,
            type,
            description: description.trim() || null,
            options: isSelectField(type) ? options : undefined,
            is_required: isRequired,
            show_on_create: true,
            show_in_list: true,
        }, {
            onSuccess: (response) => {
                const field = response.data.field;
                toast.success(field.status === "pending"
                    ? "Field submitted for approval. It stays visible until a manager reviews it."
                    : "Lead field added.");
                onCreated(field);
                onClose();
            },
            onError: (error: unknown) => {
                const message = error instanceof Error ? error.message : "Could not add that field.";
                toast.error(message);
            },
        });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close add field" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                <h3 className="text-[16px] font-bold text-[#0B1215]">{title}</h3>
                <p className="mt-1 text-[12px] text-gray-500">
                    This field is shared with the company. Agents’ new fields stay visible until a manager approves them.
                </p>
                <div className="mt-4 space-y-3">
                    <label className="block text-[12px] font-semibold text-gray-600">
                        Field name
                        <input
                            value={label}
                            onChange={(event) => setLabel(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
                            placeholder="Industry"
                            maxLength={80}
                        />
                    </label>
                    <label className="block text-[12px] font-semibold text-gray-600">
                        Type
                        <select
                            value={type}
                            onChange={(event) => setType(event.target.value as LeadFieldType)}
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] bg-white"
                        >
                            {LEAD_FIELD_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    {isSelectField(type) && (
                        <label className="block text-[12px] font-semibold text-gray-600">
                            Options
                            <textarea
                                value={optionsText}
                                onChange={(event) => setOptionsText(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px]"
                                rows={4}
                                placeholder={"SaaS\nRetail"}
                            />
                        </label>
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
                    <label className="flex items-center gap-2 text-[12px] text-gray-700">
                        <input type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} />
                        Required on manual create
                    </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={createField.isPending}
                        className="rounded-lg bg-[#0B1215] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                    >
                        {createField.isPending ? "Saving…" : submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
