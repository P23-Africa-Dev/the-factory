import { describe, expect, it } from "vitest";

import type { CrmLabel } from "@/lib/api/crm";
import { checkImportField, importCellText, importFieldLabel, matchImportStatus } from "@/lib/crm/import-row-fixes";

const label = (slug: string, name: string): CrmLabel => ({
    id: slug.length, company_id: 1, slug, name, color: "#000", sort_order: 0, is_default: false,
});
const labels = [label("new_lead", "New Lead"), label("proposal_sent", "Proposal Sent")];

describe("import row fixes", () => {
    it("matches a typed status by slug or by stage name", () => {
        expect(matchImportStatus(labels, "New Lead")?.slug).toBe("new_lead");
        expect(matchImportStatus(labels, "proposal sent")?.slug).toBe("proposal_sent");
        expect(matchImportStatus(labels, "Won")).toBeUndefined();
    });

    it("flags the values a retry would reject", () => {
        expect(checkImportField("email", "faith@", labels)).toMatch(/valid email/);
        expect(checkImportField("email", "faith@example.com", labels)).toBeNull();
        expect(checkImportField("budget_amount", "5,001", labels)).toBeNull();
        expect(checkImportField("budget_amount", "five", labels)).toMatch(/numbers only/);
        expect(checkImportField("priority", "MEDIUM", labels)).toBeNull();
        expect(checkImportField("status", "Won", labels)).toMatch(/isn't one of your stages/);
        expect(checkImportField("name", "  ", labels)).toMatch(/required/);
    });

    it("shows profile URL lists as comma-separated text", () => {
        expect(importCellText(["https://a.com", " https://b.com "])).toBe("https://a.com, https://b.com");
        expect(importCellText(undefined)).toBe("");
    });

    it("names server error keys for the user", () => {
        expect(importFieldLabel("company_email")).toBe("Company email");
        expect(importFieldLabel("custom_fields.region_code")).toBe("region code");
    });
});
