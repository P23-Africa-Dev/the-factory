"use client";

import type { LeadCustomFields, LeadFieldDefinition } from "@/lib/api/crm";
import { isUniversalLeadField } from "@/lib/crm/custom-fields";

export function LeadCustomFieldsEditor({
    fields,
    values,
    errors,
    disabled = false,
    onChange,
    onAddField,
    showAdd = true,
    agentNotice = false,
}: {
    fields: LeadFieldDefinition[];
    values: LeadCustomFields;
    errors?: Record<string, string>;
    disabled?: boolean;
    onChange: (key: string, value: LeadCustomFields[string]) => void;
    onAddField?: () => void;
    showAdd?: boolean;
    agentNotice?: boolean;
}) {
    return (
        <div className="space-y-3">
            {fields.map((field) => (
                <label key={field.id} className="block">
                    <span className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-gray-600">
                        {field.label}
                        {isUniversalLeadField(field) && field.is_required ? <span className="text-red-500">*</span> : null}
                        {!field.is_universal ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                This lead
                            </span>
                        ) : null}
                        {field.universal_request_status === "pending" ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                Awaiting approval
                            </span>
                        ) : null}
                    </span>
                    <FieldControl field={field} value={values[field.key]} disabled={disabled} onChange={(value) => onChange(field.key, value)} />
                    {field.description ? <span className="mt-1 block text-[11px] text-gray-400">{field.description}</span> : null}
                    {errors?.[field.key] ? <span data-field-error="" role="alert" className="mt-1 block text-[11px] text-red-500">{errors[field.key]}</span> : null}
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
                    New fields stay on this lead unless you request universal use. Universal requests need manager approval before they appear on every form.
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
    const base = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] disabled:bg-gray-50";

    if (field.type === "textarea") {
        return (
            <textarea
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={base}
                rows={3}
            />
        );
    }

    if (field.type === "checkbox") {
        return (
            <input
                type="checkbox"
                checked={value === true || value === "true" || value === "Yes" || value === 1}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                className="mt-1"
            />
        );
    }

    if (field.type === "select") {
        return (
            <select
                value={value == null ? "" : String(value)}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={`${base} bg-white`}
            >
                <option value="">Select…</option>
                {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        );
    }

    if (field.type === "multi_select") {
        const selected = Array.isArray(value) ? value.map(String) : [];
        return (
            <select
                multiple
                value={selected}
                disabled={disabled}
                onChange={(event) => {
                    const next = Array.from(event.target.selectedOptions).map((option) => option.value);
                    onChange(next);
                }}
                className={`${base} bg-white min-h-24`}
            >
                {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        );
    }

    const inputType = field.type === "number"
        ? "number"
        : field.type === "date"
            ? "date"
            : field.type === "url"
                ? "url"
                : field.type === "phone"
                    ? "tel"
                    : "text";

    return (
        <input
            type={inputType}
            value={value == null ? "" : String(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={base}
        />
    );
}
