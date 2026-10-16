import type {
    LeadCustomFieldValue,
    LeadCustomFields,
    LeadFieldDefinition,
    LeadFieldType,
} from "@/lib/api/crm";

export const LEAD_FIELD_TYPE_OPTIONS: Array<{ value: LeadFieldType; label: string }> = [
    { value: "text", label: "Single-line text" },
    { value: "textarea", label: "Multi-line text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "select", label: "Dropdown" },
    { value: "multi_select", label: "Multiple options" },
    { value: "checkbox", label: "Checkbox" },
    { value: "url", label: "URL" },
    { value: "phone", label: "Phone" },
];

export function isSelectField(type: LeadFieldType): boolean {
    return type === "select" || type === "multi_select";
}

export function readCustomFields(value: unknown): LeadCustomFields {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as LeadCustomFields;
}

export function inferLeadFieldType(samples: string[]): LeadFieldType {
    const values = samples.map((sample) => sample.trim()).filter(Boolean).slice(0, 25);
    if (values.length === 0) return "text";
    if (values.every((value) => /^(yes|no|true|false|y|n|0|1)$/i.test(value))) return "checkbox";
    if (values.every((value) => /^-?\d[\d,]*(\.\d+)?$/.test(value))) return "number";
    if (values.every((value) => /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value))) {
        return "date";
    }
    return "text";
}

export function customFieldMappingKey(key: string): string {
    return `custom:${key}`;
}

export function customFieldKeyFromMapping(value: string): string | null {
    return value.startsWith("custom:") ? value.slice("custom:".length) : null;
}

export function formatCustomFieldValue(field: LeadFieldDefinition, value: LeadCustomFieldValue | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    if (field.type === "checkbox") return value === true || value === "true" || value === "Yes" || value === 1 ? "Yes" : "No";
    if (Array.isArray(value)) {
        const labels = value.map((item) => field.options.find((option) => option.value === item)?.label ?? item);
        return labels.length > 0 ? labels.join(", ") : "—";
    }
    if (field.type === "select") {
        return field.options.find((option) => option.value === String(value))?.label ?? String(value);
    }
    return String(value);
}

export function validateCustomFieldValues(
    fields: LeadFieldDefinition[],
    values: LeadCustomFields,
): Record<string, string> {
    const errors: Record<string, string> = {};
    fields.forEach((field) => {
        if (field.status !== "active" || !field.is_required) return;
        const value = values[field.key];
        const empty = value === null
            || value === undefined
            || value === ""
            || value === false
            || (Array.isArray(value) && value.length === 0);
        if (empty) errors[field.key] = `${field.label} is required.`;
    });
    return errors;
}

export function serializeCustomFields(
    fields: LeadFieldDefinition[],
    values: LeadCustomFields,
): Record<string, string> {
    const payload: Record<string, string> = {};
    fields.forEach((field) => {
        if (field.status !== "active" && field.status !== "pending") return;
        const value = values[field.key];
        if (field.type === "checkbox") {
            if (value === true || value === false) payload[field.key] = value ? "true" : "false";
            return;
        }
        if (Array.isArray(value)) {
            if (value.length > 0) payload[field.key] = value.join(", ");
            else if (field.is_required && field.status === "active") payload[field.key] = "";
            return;
        }
        if (value === null || value === undefined || value === "") {
            if (field.is_required && field.status === "active") payload[field.key] = "";
            return;
        }
        payload[field.key] = String(value);
    });
    return payload;
}

export function formValuesFromLead(
    fields: LeadFieldDefinition[],
    stored: LeadCustomFields | null | undefined,
): LeadCustomFields {
    const source = readCustomFields(stored);
    const values: LeadCustomFields = {};
    fields.forEach((field) => {
        if (field.status !== "active" && field.status !== "pending") return;
        const current = source[field.key];
        if (field.type === "checkbox") {
            values[field.key] = current === true || current === "true" || current === "Yes" || current === 1;
            return;
        }
        if (field.type === "multi_select") {
            values[field.key] = Array.isArray(current)
                ? current.map(String)
                : typeof current === "string" && current
                    ? current.split(",").map((item) => item.trim()).filter(Boolean)
                    : [];
            return;
        }
        values[field.key] = current === null || current === undefined ? "" : String(current);
    });
    return values;
}

const HIDDEN_COLUMNS_PREFIX = "factory23.crm.hiddenLeadColumns.";

export function readHiddenLeadColumns(companyId: number | string): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(`${HIDDEN_COLUMNS_PREFIX}${companyId}`);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
        return [];
    }
}

export function writeHiddenLeadColumns(companyId: number | string, hidden: string[]): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`${HIDDEN_COLUMNS_PREFIX}${companyId}`, JSON.stringify(hidden));
}

export type ImportFieldMapping = string;

export function buildMappedImportRows(
    headers: string[],
    rawRows: string[][],
    mapping: Record<number, ImportFieldMapping>,
): Array<Record<string, unknown>> {
    return rawRows.map((values) => {
        const row: Record<string, unknown> = {};
        const customFields: Record<string, string> = {};
        let hasCustom = false;

        headers.forEach((_, index) => {
            const field = mapping[index];
            if (!field) return;
            const val = (values[index] ?? "").trim();
            const customKey = customFieldKeyFromMapping(field);
            if (customKey) {
                hasCustom = true;
                customFields[customKey] = val;
                return;
            }
            if (!val) return;
            if (field === "priority") row.priority = val.toLowerCase();
            else if (field === "budget_currency") row.budget_currency = val.toUpperCase();
            else row[field] = val;
        });

        if (hasCustom) row.custom_fields = customFields;
        return row;
    });
}
