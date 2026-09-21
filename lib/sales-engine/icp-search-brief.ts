/**
 * Mirrors backend IcpBrief::searchBrief() priority:
 * customPrompt → description → industries → neutral fallback.
 * Territory / size / revenue / personas are gates only — never search text.
 */

export type IcpSearchBriefInput = {
  customPrompt?: string | null;
  description?: string | null;
  industries?: string[] | null;
};

export function composeIcpSearchBrief(input: IcpSearchBriefInput): string {
  const interest = (input.customPrompt ?? "").trim();
  if (interest) return interest;

  const description = (input.description ?? "").trim();
  if (description) return description;

  const industries = (input.industries ?? [])
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  if (industries.length > 0) {
    return `${industries.join(" ")} companies`;
  }

  return "companies announcements partnerships market entry";
}

export function composeIcpQualifySummary(input: {
  industries?: string[] | null;
  territories?: string[] | null;
  companySizes?: string[] | null;
  revenueRanges?: string[] | null;
}): string {
  const parts = [
    ...(input.industries ?? []).filter(Boolean),
    ...(input.territories ?? []).filter(Boolean),
    ...(input.companySizes ?? []).filter(Boolean),
    ...(input.revenueRanges ?? []).filter(Boolean),
  ];
  return parts.length > 0 ? parts.join(" · ") : "No firmographic filters set";
}
