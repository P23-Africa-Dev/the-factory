import { describe, expect, it } from "vitest";

import type { ChatLead } from "@/lib/api/sales-engine";
import {
  formatLeadContactLine,
  formatLeadRoleLine,
  leadEntityBadge,
  primaryProfileUrl,
} from "@/lib/enriched-lead-card";

describe("enriched lead card fields", () => {
  it("formats title at company line for person leads", () => {
    const lead: ChatLead = {
      id: 1,
      name: "Elon Musk",
      source: "serper",
      score: 90,
      summary: "CEO of Tesla.",
      entity_type: "person",
      title: "CEO",
      company: "Tesla",
      location: "Austin, TX",
      profile_urls: ["https://linkedin.com/in/elonmusk"],
    };

    expect(formatLeadRoleLine(lead)).toBe("CEO at Tesla");
    expect(formatLeadContactLine(lead)).toBeNull();
    expect(leadEntityBadge(lead)).toBe("Contact");
    expect(primaryProfileUrl(lead)).toBe("https://linkedin.com/in/elonmusk");
  });

  it("formats account card fields for company leads", () => {
    const lead: ChatLead = {
      id: 3,
      name: "Acme Distributors",
      source: "serper",
      score: 82,
      summary: "FMCG distributor in Lagos.",
      entity_type: "company",
      title: "CEO",
      company: "Acme Distributors",
      contact_person: "Ada Okoye",
      location: "Lagos, NG",
      linkedin_url: "https://linkedin.com/company/acme-distributors",
      website: "https://acme.example.com",
    };

    expect(formatLeadRoleLine(lead)).toBe("Lagos, NG");
    expect(formatLeadContactLine(lead)).toBe("Contact: Ada Okoye · CEO");
    expect(leadEntityBadge(lead)).toBe("Account");
    expect(primaryProfileUrl(lead)).toBe("https://linkedin.com/company/acme-distributors");
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
    expect(leadEntityBadge(lead)).toBe("Contact");
  });
});
