import type { LeadFieldDefinition } from "@/lib/api/crm";
import { isPendingUniversalRequest } from "@/lib/crm/custom-fields";

export type FieldRequestSort = "newest" | "oldest";

/** How many requests the review panel shows before "Show more". */
export const FIELD_REQUESTS_PAGE_SIZE = 10;

/** Agent requests to make a lead field universal, still waiting for a manager. */
export function pendingFieldRequests(fields: LeadFieldDefinition[] | undefined | null): LeadFieldDefinition[] {
    return (fields ?? []).filter(isPendingUniversalRequest);
}

function createdTime(field: LeadFieldDefinition): number {
    const time = field.created_at ? Date.parse(field.created_at) : Number.NaN;
    return Number.isNaN(time) ? 0 : time;
}

/** Search by field name, type or requesting agent, then sort by request date. */
export function filterFieldRequests(
    requests: LeadFieldDefinition[],
    query: string,
    sort: FieldRequestSort,
): LeadFieldDefinition[] {
    const needle = query.trim().toLowerCase();
    const matched = needle
        ? requests.filter((field) =>
            [field.label, field.key, field.type, field.created_by?.name ?? ""]
                .some((value) => value.toLowerCase().includes(needle)),
        )
        : [...requests];

    return matched.sort((a, b) => {
        const diff = createdTime(b) - createdTime(a) || b.id - a.id;
        return sort === "newest" ? diff : -diff;
    });
}

/** "on 4 leads" / "on 1 lead"; nothing when the count is unknown or zero. */
export function usageLabel(count: number | null | undefined): string | null {
    if (typeof count !== "number" || count <= 0) return null;
    return `on ${count.toLocaleString()} ${count === 1 ? "lead" : "leads"}`;
}

export function bannerLabel(count: number): string {
    return `${count.toLocaleString()} field ${count === 1 ? "request" : "requests"} waiting for review`;
}
