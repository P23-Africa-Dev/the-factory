import type { ChatLead } from "@/lib/api/sales-engine";

export function hasMixedIcpRecommendations(leads: ChatLead[]): boolean {
  const hasRecommended = leads.some((lead) => lead.icp_recommended === true);
  const hasOutside = leads.some((lead) => lead.icp_recommended === false);

  return hasRecommended && hasOutside;
}

export function showIcpAdvisoryBanner(leads: ChatLead[]): boolean {
  return leads.some((lead) => lead.icp_recommended === false);
}

export function icpBadgeLabel(lead: ChatLead): "ICP match" | "Outside ICP" | null {
  if (lead.icp_recommended === true) {
    return "ICP match";
  }

  if (lead.icp_recommended === false) {
    return "Outside ICP";
  }

  return null;
}
