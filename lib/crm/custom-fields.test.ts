import { describe, expect, it } from "vitest";

import type { LeadFieldDefinition } from "@/lib/api/crm";
import {
    buildMappedImportRows,
    inferLeadFieldType,
    visibleLeadFieldsForCreate,
    visibleLeadFieldsForDetail,
} from "@/lib/crm/custom-fields";

function field(partial: Partial<LeadFieldDefinition> & Pick<LeadFieldDefinition, "id" | "key" | "label">): LeadFieldDefinition {
    return {
        company_id: 1,
        type: "text",
        options: [],
        is_required: false,
        show_on_create: true,
        show_in_list: true,
        is_universal: false,
        status: "active",
        sort_order: 0,
        ...partial,
    };
}

describe("inferLeadFieldType", () => {
    it("suggests a type from sample values", () => {
        expect(inferLeadFieldType(["40", "12"])).toBe("number");
        expect(inferLeadFieldType(["yes", "no"])).toBe("checkbox");
        expect(inferLeadFieldType(["2026-10-16"])).toBe("date");
        expect(inferLeadFieldType(["SaaS", "Retail"])).toBe("text");
    });
});

describe("visible lead fields", () => {
    const universal = field({ id: 1, key: "region", label: "Region", is_universal: true, show_on_create: true });
    const leadOnly = field({ id: 2, key: "note", label: "Note", is_universal: false, show_on_create: false });

    it("shows universal fields on create plus session fields", () => {
        expect(visibleLeadFieldsForCreate([universal, leadOnly]).map((item) => item.key)).toEqual(["region"]);
        expect(visibleLeadFieldsForCreate([universal, leadOnly], [2]).map((item) => item.key)).toEqual(["region", "note"]);
    });

    it("shows lead-only fields on detail when the lead already has them", () => {
        expect(visibleLeadFieldsForDetail([universal, leadOnly], {}).map((item) => item.key)).toEqual(["region"]);
        expect(visibleLeadFieldsForDetail([universal, leadOnly], { note: "Hi" }).map((item) => item.key)).toEqual(["region", "note"]);
    });
});

describe("buildMappedImportRows", () => {
    it("maps a new column onto a custom field and keeps an empty cell", () => {
        const rows = buildMappedImportRows(
            ["Name", "Industry"],
            [
                ["Ada Lovelace", "SaaS"],
                ["Grace Hopper", ""],
            ],
            { 0: "name", 1: "custom:industry" },
        );

        expect(rows[0]).toEqual({
            name: "Ada Lovelace",
            custom_fields: { industry: "SaaS" },
        });
        expect(rows[1]).toEqual({
            name: "Grace Hopper",
            custom_fields: { industry: "" },
        });
    });

    it("leaves an unmapped column out of the import row", () => {
        const rows = buildMappedImportRows(
            ["Name", "Favorite color"],
            [["Ada", "Blue"]],
            { 0: "name", 1: "" },
        );

        expect(rows[0]).toEqual({ name: "Ada" });
        expect(rows[0]).not.toHaveProperty("custom_fields");
    });
});
