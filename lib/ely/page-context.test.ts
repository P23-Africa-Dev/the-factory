import { describe, expect, it } from "vitest";

import { elyPageContextFromPath } from "./page-context";

describe("elyPageContextFromPath", () => {
    it("detects a lead page for managers and agents", () => {
        expect(elyPageContextFromPath("/crm/leads/42")).toEqual({ path: "/crm/leads/42", entity_type: "lead", entity_id: 42 });
        expect(elyPageContextFromPath("/agent/crm/leads/7")).toEqual({ path: "/agent/crm/leads/7", entity_type: "lead", entity_id: 7 });
    });

    it("detects project and task pages", () => {
        expect(elyPageContextFromPath("/projects/3")).toMatchObject({ entity_type: "project", entity_id: 3 });
        expect(elyPageContextFromPath("/agent/tasks/9/tracking")).toMatchObject({ entity_type: "task", entity_id: 9 });
    });

    it("sends only the path for other pages", () => {
        expect(elyPageContextFromPath("/crm/leads")).toEqual({ path: "/crm/leads" });
        expect(elyPageContextFromPath("/dashboard?tab=1")).toEqual({ path: "/dashboard" });
        expect(elyPageContextFromPath(null)).toBeUndefined();
    });
});
