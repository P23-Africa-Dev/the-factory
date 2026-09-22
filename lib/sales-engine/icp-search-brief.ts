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

const GENERIC_BRIEF_FILLERS = new Set([
  "companies",
  "company",
  "decision",
  "makers",
  "maker",
  "prospects",
  "prospect",
  "leads",
  "lead",
  "accounts",
  "account",
  "businesses",
  "business",
  "customers",
  "customer",
  "buyers",
  "buyer",
  "people",
  "persons",
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "your",
  "our",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "or",
]);

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

/**
 * True when the composed brief is empty or only generic filler (no niche nouns).
 * Used to require a real "What we search for" before save/activate.
 */
export function isInsufficientIcpSearchBrief(input: IcpSearchBriefInput): boolean {
  const custom = (input.customPrompt ?? "").trim();
  if (!custom) {
    // Description-only or industries-only is allowed as a soft fallback, but
    // saving without any customPrompt when description is also empty/generic fails.
    const description = (input.description ?? "").trim();
    if (!description) return true;
    return isMostlyGenericFiller(description);
  }

  return isMostlyGenericFiller(custom);
}

function isMostlyGenericFiller(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}\-&]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const concrete = tokens.filter((t) => t.length >= 3 && !GENERIC_BRIEF_FILLERS.has(t));
  return concrete.length === 0;
}

export function composeSearchGeoCaption(territories?: string[] | null): string {
  const unique = [
    ...new Set(
      (territories ?? [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    ),
  ];
  if (unique.length === 0) return "";

  const shown = unique.slice(0, 3);
  const extra = unique.length > 3 ? ` +${unique.length - 3}` : "";
  return `Searching in: ${shown.join(" · ")}${extra}`;
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

export type GenerateEntityMode = "both" | "companies" | "people";

export function entityModeLabel(mode: GenerateEntityMode): string {
  switch (mode) {
    case "companies":
      return "accounts only";
    case "people":
      return "people only";
    default:
      return "accounts + people";
  }
}

/** Append a cue the backend QueryIntentService already understands. */
export function withEntityModeCue(body: string, mode: GenerateEntityMode): string {
  const trimmed = body.trim();
  if (mode === "both") return trimmed;
  if (/\(\s*(companies|people|accounts|contacts)\s+only\s*\)\s*$/i.test(trimmed)) {
    return trimmed;
  }
  if (mode === "companies") return `${trimmed} (companies only)`;
  return `${trimmed} (people only)`;
}
