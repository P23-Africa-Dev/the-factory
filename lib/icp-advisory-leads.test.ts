import { describe, expect, it } from "vitest";

import type { ChatLead } from "@/lib/api/sales-engine";
import {
  hasMixedIcpRecommendations,
  icpBadgeLabel,
  showIcpAdvisoryBanner,
} from "@/lib/icp-advisory-leads";

const sampleLeads: ChatLead[] = [
  {
    id: 1,
    name: "Elon Musk",
    source: "serper",
    score: 88,
    summary: "Tech founder",
    icp_recommended: false,
  },
  {
    id: 2,
    name: "HealthCo CEO",
    source: "serper",
    score: 92,
    summary: "Health tech leader",
    icp_recommended: true,
  },
];

describe("icp-advisory-leads", () => {
  it("shows advisory banner when any lead is outside ICP", () => {
    expect(showIcpAdvisoryBanner(sampleLeads)).toBe(true);
    expect(showIcpAdvisoryBanner([sampleLeads[1]])).toBe(false);
  });

  it("detects mixed recommended and outside leads", () => {
    expect(hasMixedIcpRecommendations(sampleLeads)).toBe(true);
    expect(hasMixedIcpRecommendations([sampleLeads[0]])).toBe(false);
  });

  it("returns badge labels for ICP recommendation state", () => {
    expect(icpBadgeLabel(sampleLeads[0])).toBe("Outside ICP");
    expect(icpBadgeLabel(sampleLeads[1])).toBe("ICP match");
    expect(icpBadgeLabel({ ...sampleLeads[0], icp_recommended: undefined })).toBeNull();
  });
});
