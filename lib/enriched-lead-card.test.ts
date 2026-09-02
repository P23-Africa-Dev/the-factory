import { describe, expect, it } from "vitest";

import type { ChatLead } from "@/lib/api/sales-engine";

export function formatLeadRoleLine(lead: ChatLead): string | null {
  if (!lead.title && !lead.company) {
    return null;
  }

  return [lead.title, lead.company].filter(Boolean).join(" at ");
}

export function primaryProfileUrl(lead: ChatLead): string | null {
  return lead.profile_urls?.[0] ?? null;
}

describe("enriched lead card fields", () => {
  it("formats title at company line", () => {
    const lead: ChatLead = {
      id: 1,
      name: "Elon Musk",
      source: "serper",
      score: 90,
      summary: "CEO of Tesla.",
      title: "CEO",
      company: "Tesla",
      location: "Austin, TX",
      profile_urls: ["https://linkedin.com/in/elonmusk"],
    };

    expect(formatLeadRoleLine(lead)).toBe("CEO at Tesla");
    expect(primaryProfileUrl(lead)).toBe("https://linkedin.com/in/elonmusk");
  });

  it("returns null role line when title and company missing", () => {
    const lead: ChatLead = {
      id: 2,
      name: "Unknown Person",
      source: "serper",
      score: 50,
      summary: "Limited data.",
    };

    expect(formatLeadRoleLine(lead)).toBeNull();
    expect(primaryProfileUrl(lead)).toBeNull();
  });
});
