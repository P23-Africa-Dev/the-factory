import type { ChatIntent } from "@/lib/api/sales-engine";

export type SalesEngineIcpContext = {
  industries?: string[];
  territories?: string[];
  name?: string;
};

/** Late-stage fillers when a step hasn't changed for a while. */
export const LATE_ENGAGEMENT_LABELS = [
  "Cross-checking sources…",
  "Ranking by ICP fit…",
  "Validating match quality…",
  "Almost ready…",
  "Preparing your results…",
  "Just a little more…",
] as const;

export const PROCESSING_LABEL_INTERVAL_MS = 1200;
export const LATE_LABEL_AFTER_MS = 6_000;
export const PROCESSING_PIPELINE_STEPS = [
  "Analyze",
  "Search",
  "Extract",
  "Results",
] as const;

export const PROCESSING_TIPS = [
  "Leads with recent hiring signals often convert 2× faster.",
  "Personalized outreach referencing a prospect's public post boosts reply rates.",
  "ICPs with tighter industry + territory filters produce higher-quality matches.",
  "Follow up within 24 hours when a buying-intent signal is detected.",
  "Social listening catches prospects before they appear in traditional databases.",
  "Short, problem-focused emails outperform generic product pitches.",
] as const;

const FORBIDDEN_LABELS = /queued/i;

function withFillers(prefix: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const label of [...prefix, ...LATE_ENGAGEMENT_LABELS]) {
    if (seen.has(label) || FORBIDDEN_LABELS.test(label)) continue;
    seen.add(label);
    merged.push(label);
  }

  return merged;
}

function icpScanLine(context?: SalesEngineIcpContext): string | null {
  const industry = context?.industries?.[0];
  const territory = context?.territories?.[0];

  if (industry && territory) {
    return `Scanning ${industry} accounts in ${territory}…`;
  }
  if (industry) {
    return `Scanning ${industry} accounts…`;
  }
  if (territory) {
    return `Searching prospects in ${territory}…`;
  }

  return null;
}

const INTENT_PREFIXES: Record<Exclude<ChatIntent, "freeform">, string[]> = {
  quick_research: [
    "Reviewing your question…",
    "Scanning public sources…",
    "Cross-referencing market signals…",
    "Synthesizing insights…",
  ],
  generate_leads: [
    "Parsing your ICP brief…",
    "Searching LinkedIn, Reddit & web…",
    "Scoring buying intent…",
    "Ranking top matches…",
  ],
  create_outreach: [
    "Reading target context…",
    "Matching tone to your ICP…",
    "Drafting personalized message…",
    "Polishing for deliverability…",
  ],
};

export function labelsForIntent(
  intent: ChatIntent,
  userMessage: string,
  icpContext?: SalesEngineIcpContext
): string[] {
  if (intent === "freeform") {
    return labelsForFreeformMessage(userMessage, icpContext);
  }

  const prefix = [...INTENT_PREFIXES[intent]];
  const icpLine = icpScanLine(icpContext);
  if (icpLine) {
    prefix.splice(1, 0, icpLine);
  }

  return withFillers(prefix);
}

export function labelsForFreeformMessage(
  message: string,
  icpContext?: SalesEngineIcpContext
): string[] {
  const normalized = message.toLowerCase().trim();
  const icpLine = icpScanLine(icpContext);

  let prefix: string[];

  if (/\b(research|market|trend|competitor|analysis)\b/.test(normalized)) {
    prefix = [
      "Reviewing your question…",
      "Gathering market context…",
      "Cross-referencing sources…",
      "Synthesizing insights…",
    ];
  } else if (/\b(lead|prospect|company|account)\b/.test(normalized)) {
    prefix = [
      "Understanding your target…",
      "Scanning lead databases…",
      "Scoring ICP fit…",
      "Preparing recommendations…",
    ];
  } else if (/\b(outreach|email|message|follow[\s-]?up|pitch)\b/.test(normalized)) {
    prefix = [
      "Reading your brief…",
      "Matching tone to audience…",
      "Drafting message options…",
      "Refining for clarity…",
    ];
  } else if (/\b(crm|pipeline|sync)\b/.test(normalized)) {
    prefix = [
      "Checking CRM context…",
      "Reviewing pipeline data…",
      "Preparing response…",
    ];
  } else {
    prefix = ["Understanding your request…", "Analyzing context…", "Preparing response…"];
  }

  if (icpLine && !prefix.includes(icpLine)) {
    prefix.splice(1, 0, icpLine);
  }

  return withFillers(prefix);
}

export function intentDisplayLabel(intent: ChatIntent): string {
  switch (intent) {
    case "quick_research":
      return "Quick Research";
    case "generate_leads":
      return "Generate Leads";
    case "create_outreach":
      return "Create Outreach";
    default:
      return "Sales Engine";
  }
}

export function nextProcessingLabelIndex(labels: readonly string[], currentIndex: number): number {
  if (labels.length === 0) return 0;
  return (currentIndex + 1) % labels.length;
}

export function firstStageLabelForIntent(intent: ChatIntent): string {
  if (intent === "freeform") return "Understanding your request…";
  return INTENT_PREFIXES[intent][0] ?? "Processing your request…";
}
