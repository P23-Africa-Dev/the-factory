import type { CrmLabel, ImportLeadRow } from "@/lib/api/crm";

/**
 * Helpers for fixing failed import rows on the Results step: which input each
 * error belongs to, quick checks while the user edits (so a retry is less likely to
 * fail again), and matching a typed status ("New Lead") to a stage.
 */

export type ImportFieldKey = Exclude<keyof ImportLeadRow, "custom_fields">;

export type ImportFieldKind = "text" | "email" | "url" | "number" | "status" | "priority" | "currency" | "industry" | "source";

export const IMPORT_ROW_FIELDS: Array<{ key: ImportFieldKey; label: string; kind: ImportFieldKind; hint?: string }> = [
    { key: "name", label: "Name", kind: "text" },
    { key: "email", label: "Email", kind: "email", hint: "e.g. jane@acme.com" },
    { key: "phone", label: "Phone", kind: "text" },
    { key: "location", label: "Location", kind: "text" },
    { key: "company_name", label: "Company name", kind: "text" },
    { key: "company_email", label: "Company email", kind: "email", hint: "e.g. hello@acme.com" },
    { key: "website", label: "Website", kind: "url", hint: "e.g. https://acme.com" },
    { key: "position", label: "Position", kind: "text" },
    { key: "industry", label: "Industry", kind: "industry" },
    { key: "profile_urls", label: "Profile URLs", kind: "text", hint: "Separate links with commas" },
    { key: "source", label: "Source", kind: "source" },
    { key: "status", label: "Status (stage)", kind: "status" },
    { key: "priority", label: "Priority", kind: "priority" },
    { key: "budget_amount", label: "Budget amount", kind: "number", hint: "Numbers only, e.g. 5000" },
    { key: "budget_currency", label: "Currency", kind: "currency" },
];

export const IMPORT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const IMPORT_SOURCE_SUGGESTIONS = [
    "Referral",
    "Website",
    "Social media",
    "Cold call",
    "Email campaign",
    "Event",
    "Partner",
    "Walk-in",
];

const FIELD_LABELS = new Map(IMPORT_ROW_FIELDS.map((f) => [f.key as string, f.label]));

/** Display label for a server error key ("email", "custom_fields.region"). */
export function importFieldLabel(key: string): string {
    if (FIELD_LABELS.has(key)) return FIELD_LABELS.get(key)!;
    if (key.startsWith("custom_fields.")) return key.slice("custom_fields.".length).replace(/_/g, " ");
    return key.replace(/_/g, " ");
}

/** Value shown in an input: lists (profile URLs) become "a, b". */
export function importCellText(value: unknown): string {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(", ");
    if (value == null) return "";
    return String(value);
}

/** The stage a typed status refers to, by slug or by name (case-insensitive). */
export function matchImportStatus(labels: CrmLabel[], value: string): CrmLabel | undefined {
    const wanted = value.trim().toLowerCase();
    if (!wanted) return undefined;
    const asSlug = wanted.replace(/[\s-]+/g, "_");
    return labels.find((label) => label.slug.toLowerCase() === wanted || label.slug.toLowerCase() === asSlug)
        ?? labels.find((label) => label.name.trim().toLowerCase() === wanted);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Quick check for one edited value. Mirrors the server rules closely enough to catch
 * the common mistakes before a retry; the server stays the final judge.
 */
export function checkImportField(key: ImportFieldKey, value: string, labels: CrmLabel[]): string | null {
    const v = value.trim();
    switch (key) {
        case "name":
            return v ? null : "Name is required.";
        case "email":
        case "company_email":
            return !v || EMAIL_RE.test(v) ? null : "Enter a valid email address, e.g. jane@acme.com.";
        case "website":
            return !v || /^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i.test(v) ? null : "Enter a web address, e.g. https://acme.com.";
        case "budget_amount":
            if (!v) return null;
            if (!/^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ""))) return "Use numbers only, e.g. 5000.";
            return Number(v.replace(/,/g, "")) < 0 ? "Budget can't be negative." : null;
        case "budget_currency":
            return !v || /^[A-Za-z]{3}$/.test(v) ? null : "Pick a 3-letter currency such as USD.";
        case "priority":
            return !v || (IMPORT_PRIORITIES as readonly string[]).includes(v.toLowerCase()) ? null : "Pick low, medium, high or urgent.";
        case "status":
            return !v || labels.length === 0 || matchImportStatus(labels, v) ? null : `"${v}" isn't one of your stages. Pick one from the list.`;
        default:
            return null;
    }
}
