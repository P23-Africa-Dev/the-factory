import { describe, expect, it } from "vitest";

import { dedupeLeadsById } from "@/lib/crm/dedupe-leads";

describe("dedupeLeadsById", () => {
  it("keeps the most recently updated copy of a lead seen in two stage pages", () => {
    const stale = { id: 2389, status: "proposal_sent", updated_at: "2026-11-20T10:00:00Z" };
    const fresh = { id: 2389, status: "contacted", updated_at: "2026-11-20T10:05:00Z" };
    const other = { id: 7, status: "qualified", updated_at: "2026-11-01T00:00:00Z" };

    expect(dedupeLeadsById([fresh, other, stale])).toEqual([fresh, other]);
    expect(dedupeLeadsById([stale, other, fresh])).toEqual([other, fresh]);
  });

  it("prefers the later copy when timestamps are equal or missing", () => {
    const a = { id: "5", status: "new" };
    const b = { id: 5, status: "won" };
    expect(dedupeLeadsById([a, b])).toEqual([b]);
  });

  it("leaves distinct leads untouched", () => {
    const leads = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(dedupeLeadsById(leads)).toEqual(leads);
  });
});
