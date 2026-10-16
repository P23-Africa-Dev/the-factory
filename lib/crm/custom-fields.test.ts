import { describe, expect, it } from "vitest";

import { buildMappedImportRows, inferLeadFieldType } from "@/lib/crm/custom-fields";

describe("inferLeadFieldType", () => {
    it("suggests a type from sample values", () => {
        expect(inferLeadFieldType(["40", "12"])).toBe("number");
        expect(inferLeadFieldType(["yes", "no"])).toBe("checkbox");
        expect(inferLeadFieldType(["2026-10-16"])).toBe("date");
        expect(inferLeadFieldType(["SaaS", "Retail"])).toBe("text");
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
