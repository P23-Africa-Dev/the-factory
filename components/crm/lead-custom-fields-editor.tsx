"use client";

import type { LeadCustomFields, LeadFieldDefinition } from "@/lib/api/crm";

export function LeadCustomFieldsEditor({
    fields,
    values,
    errors,
    disabled = false,
    onChange,
    onAddField,
    showAdd = true,
    agentNotice = false,
    visibility = "create",
}: {
    fields: LeadFieldDefinition[];
    values: LeadCustomFields;
    errors?: Record<string, string>;
    disabled?: boolean;
    onChange: (key: string, value: LeadCustomFields[string]) => void;
    onAddField?: () => void;
    showAdd?: boolean;
    agentNotice?: boolean;
    visibility?: "create" | "all";
}) {
    const visible = fields.filter((field) => {
        if (field.status !== "active" && field.status !== "pending") return false;
        return visibility === "all" || field.show_on_create;
    });

    return (
        <div className="space-y-3">
            {visible.map((field) => (
                <label key={field.id} className="block">
                    <span className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-gray-600">
                        {field.label}
                        {field.is_required && field.status === "active" ? <span className="text-red-500">*</span> : null}
                        {field.status === "pending" ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                Pending
                            </span>
                        ) : null}
                    </span>
                    <FieldControl field={field} value={values[field.key]} disabled={disabled} onChange={(value) => onChange(field.key, value)} />
                    {field.description ? <span className="mt-1 block text-[11px] text-gray-400">{field.description}</span> : null}
                    {errors?.[field.key] ? <span className="mt-1 block text-[11px] text-red-500">{errors[field.key]}</span> : null}
                </label>
            ))}
            {showAdd && onAddField ? (
                <button
                    type="button"
                    onClick={onAddField}
                    className="text-[12px] font-semibold text-[#2563EB]"
                >
                    Add field
                </button>
            ) : null}
            {agentNotice ? (
                <p className="text-[11px] text-gray-500">
                    Fields you add are visible to the company and stay pending until a manager approves them.
                </p>
            ) : null}
        </div>
    );
}

function FieldControl({
    field,
    value,
    disabled,
    onChange,
}: {
    field: LeadFieldDefinition;
    value: LeadCustomFields[string];
    disabled: boolean;
    onChange: (value: LeadCustomFields[string]) => void;
}) {
    const className = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] bg-white disabled:bg-gray-50";

    if (field.type === "textarea") {
        return (
            <textarea
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={className}
                rows={3}
            />
        );
    }

    if (field.type === "select") {
        return (
            <select
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={className}
            >
                <option value="">Select {field.label}</option>
                {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        );
    }

    if (field.type === "multi_select") {
        const selected = Array.isArray(value) ? value : [];
        return (
            <select
                multiple
                value={selected}
                disabled={disabled}
                onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
                className={className}
            >
                {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        );
    }

    if (field.type === "checkbox") {
        return (
            <input
                type="checkbox"
                checked={value === true}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                className="h-4 w-4"
            />
        );
    }

    const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text";

    return (
        <input
            type={inputType}
            value={typeof value === "string" || typeof value === "number" ? value : ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={className}
        />
    );
}
