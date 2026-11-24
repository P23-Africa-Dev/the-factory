import { describe, expect, it } from "vitest";

import type { LeadFieldDefinition } from "@/lib/api/crm";
import {
    buildMappedImportRows,
    findExistingLeadField,
    importableLeadFields,
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

describe("findExistingLeadField", () => {
    const fields = [
        field({ id: 1, key: "founded", label: "Founded", is_universal: false }),
        field({ id: 2, key: "headcount", label: "Headcount", is_universal: true }),
        field({ id: 3, key: "old_notes", label: "Old Notes", status: "archived" }),
        field({ id: 4, key: "email_custom", label: "Email" }),
    ];

    it("finds a lead-only field from an earlier upload by name, ignoring case and spacing", () => {
        expect(findExistingLeadField(fields, "Founded")?.id).toBe(1);
        expect(findExistingLeadField(fields, "  founded ")?.id).toBe(1);
        expect(findExistingLeadField(fields, "HEADCOUNT")?.id).toBe(2);
    });

    it("matches reserved names stored with a suffix", () => {
        expect(findExistingLeadField(fields, "email")?.id).toBe(4);
    });

    it("ignores archived fields (the server revives them) and unknown names", () => {
        expect(findExistingLeadField(fields, "Old Notes")).toBeUndefined();
        expect(findExistingLeadField(fields, "Shut Down")).toBeUndefined();
        expect(findExistingLeadField(fields, "   ")).toBeUndefined();
    });
});

describe("importableLeadFields", () => {
    it("includes lead-only fields from earlier uploads, grouped apart from company fields", () => {
        const groups = importableLeadFields([
            field({ id: 1, key: "founded", label: "Founded", is_universal: false }),
            field({ id: 2, key: "headcount", label: "Headcount", is_universal: true }),
            field({ id: 3, key: "old", label: "Old", status: "archived" }),
            field({ id: 4, key: "declined", label: "Declined", status: "declined" }),
        ]);

        expect(groups.company.map((item) => item.key)).toEqual(["headcount"]);
        expect(groups.leadOnly.map((item) => item.key)).toEqual(["founded"]);
    });
});
