import { describe, expect, it } from "vitest";

import type { LeadFieldDefinition } from "@/lib/api/crm";
import {
    bannerLabel,
    filterFieldRequests,
    pendingFieldRequests,
    usageLabel,
} from "@/lib/crm/field-requests";

function request(id: number, label: string, agent: string, createdAt: string, extra: Partial<LeadFieldDefinition> = {}): LeadFieldDefinition {
    return {
        id,
        company_id: 1,
        key: label.toLowerCase().replace(/\s+/g, "_"),
        label,
        type: "text",
        options: [],
        is_required: false,
        show_on_create: false,
        show_in_list: false,
        is_universal: false,
        universal_request_status: "pending",
        status: "active",
        sort_order: id,
        created_by: { id: 100 + id, name: agent },
        created_at: createdAt,
        ...extra,
    };
}

const founded = request(1, "Founded", "Siro", "2026-11-20T10:00:00Z", { type: "date" });
const shutDown = request(2, "Shut Down", "Donald", "2026-11-22T10:00:00Z");
const reason = request(3, "Primary Reason", "Salim", "2026-11-18T10:00:00Z");

describe("field requests", () => {
    it("keeps only active fields waiting for universal review", () => {
        const approved = request(4, "Industry", "Ada", "2026-11-01T00:00:00Z", { universal_request_status: "approved", is_universal: true });
        const archived = request(5, "Old", "Ada", "2026-11-01T00:00:00Z", { status: "archived" });
        expect(pendingFieldRequests([founded, approved, archived, shutDown]).map((f) => f.id)).toEqual([1, 2]);
        expect(pendingFieldRequests(undefined)).toEqual([]);
    });

    it("sorts newest or oldest first", () => {
        const all = [founded, shutDown, reason];
        expect(filterFieldRequests(all, "", "newest").map((f) => f.label)).toEqual(["Shut Down", "Founded", "Primary Reason"]);
        expect(filterFieldRequests(all, "", "oldest").map((f) => f.label)).toEqual(["Primary Reason", "Founded", "Shut Down"]);
    });

    it("searches by field name, type and requesting agent", () => {
        const all = [founded, shutDown, reason];
        expect(filterFieldRequests(all, "shut", "newest").map((f) => f.id)).toEqual([2]);
        expect(filterFieldRequests(all, "SALIM", "newest").map((f) => f.id)).toEqual([3]);
        expect(filterFieldRequests(all, "date", "newest").map((f) => f.id)).toEqual([1]);
        expect(filterFieldRequests(all, "nothing", "newest")).toEqual([]);
    });

    it("labels usage and the banner count", () => {
        expect(usageLabel(4)).toBe("on 4 leads");
        expect(usageLabel(1)).toBe("on 1 lead");
        expect(usageLabel(0)).toBeNull();
        expect(usageLabel(null)).toBeNull();
        expect(bannerLabel(1)).toBe("1 field request waiting for review");
        expect(bannerLabel(23)).toBe("23 field requests waiting for review");
    });
});
