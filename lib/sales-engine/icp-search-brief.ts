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

export type GenerateProspectCount = 12 | 25 | 40;

/** Encode confirm-card count in chat body so QueryIntentService.parseLimit sees it. */
export function withProspectCountCue(body: string, count: GenerateProspectCount): string {
  const trimmed = body.trim();
  const alreadyNumbered =
    /\b(?:give me|find|get|show|list|need|want)\s+\d{1,3}\b/i.test(trimmed) ||
    /\b\d{1,3}\s+(?:people|persons|leads|prospects|contacts|names|executives|companies|accounts)\b/i.test(
      trimmed
    );
  if (alreadyNumbered) return trimmed;
  if (count === 12) return trimmed;
  if (/^give me prospects\b/i.test(trimmed)) {
    return trimmed.replace(/^give me prospects/i, `give me ${count} prospects`);
  }
  return `give me ${count} prospects`;
}

const INDUSTRY_SEARCH_SEEDS: Array<[needle: string, seed: string]> = [
  ["logistics", "3PL warehousing last-mile delivery"],
  ["fleet", "3PL freight fleet operators"],
  ["fmcg", "FMCG distributors wholesale retail chains"],
  ["retail", "retail distributors supermarket chains"],
  ["fintech", "payments processors lending platforms"],
  ["payment", "payments processors merchant acquiring"],
  ["health", "healthcare distributors pharmacies clinics"],
  ["pharma", "pharma distributors hospital suppliers"],
  ["manufactur", "industrial manufacturers plant equipment"],
  ["energy", "energy utilities power distributors"],
  ["utilit", "utilities power water distributors"],
  ["construction", "construction contractors developers"],
  ["real estate", "property developers commercial real estate"],
  ["agro", "agribusiness commodity traders processors"],
  ["commodit", "commodity traders agribusiness processors"],
];

export type IcpSearchBriefSuggestion = {
  brief: string;
  keywords: string[];
};

/** Instant, no-network draft from selected industries. Geography stays out. */
export function suggestIcpSearchBriefLocal(input: {
  industries?: string[] | null;
  description?: string | null;
}): IcpSearchBriefSuggestion {
  const parts: string[] = [];
  for (const industry of input.industries ?? []) {
    const lower = industry.toLowerCase();
    const match = INDUSTRY_SEARCH_SEEDS.find(([needle]) => lower.includes(needle));
    if (match) {
      parts.push(match[1]);
      continue;
    }
    const nouns = industry.replace(/[&,/]+/g, " ").trim();
    if (nouns) parts.push(`${nouns} companies`);
  }
  const unique = [...new Set(parts)].slice(0, 2);
  let brief = unique.join(" ").trim();
  const description = (input.description ?? "").trim();
  if (!brief && description && !/industries specialize/i.test(description)) {
    brief = description;
  }
  return {
    brief,
    keywords: keywordsFromBrief(brief),
  };
}

function keywordsFromBrief(brief: string): string[] {
  const fillers = new Set(["and", "the", "for", "with", "from", "into", "that", "this", "companies", "company"]);
  const picked: string[] = [];
  for (const token of brief.toLowerCase().split(/[^\p{L}\p{N}\-&]+/u)) {
    const t = token.trim();
    if (t.length < 3 || fillers.has(t) || picked.includes(t)) continue;
    picked.push(t);
    if (picked.length >= 5) break;
  }
  return picked;
}
