import { describe, expect, it } from "vitest";

import { countActiveCrmFilters, crmFiltersToQuery, readCrmFilters } from "@/hooks/use-crm-filters";

describe("CRM URL filters", () => {
  it("reads known filters and ignores empty or unknown params", () => {
    const params = new URLSearchParams("pipeline=12&stage=qualified&q=&created_by=7&lead=99");
    expect(readCrmFilters(params)).toEqual({ pipeline: "12", stage: "qualified", created_by: "7" });
  });

  it("builds a query string carrying only set filters", () => {
    expect(crmFiltersToQuery({ source: "agent_upload", created_by: "7", stage: "" })).toBe(
      "?created_by=7&source=agent_upload",
    );
    expect(crmFiltersToQuery({})).toBe("");
  });

  it("encodes values with special characters", () => {
    expect(crmFiltersToQuery({ industry: "Fintech & Payments" })).toBe("?industry=Fintech+%26+Payments");
  });

  it("counts a date range once and ignores pipeline and search", () => {
    expect(
      countActiveCrmFilters({ pipeline: "3", q: "acme", stage: "won", from: "2026-11-01", to: "2026-11-19", industry: "Legal" }),
    ).toBe(3);
  });
});
