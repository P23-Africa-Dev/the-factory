export type LeadDetailSource = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  company_name?: string | null;
  website?: string | null;
  position?: string | null;
  profile_urls?: string[] | null;
  source?: string | null;
  status?: string | null;
  priority?: string | null;
  budget_amount?: number | null;
  budget_currency?: string | null;
  budget?: string | null;
  next_action?: string | null;
  last_interaction?: string | null;
  last_interaction_at?: string | null;
  converted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  linked_to_map?: boolean | null;
  meta?: Record<string, unknown> | null;
  creator?: { name?: string | null } | null;
  assignee?: { name?: string | null } | null;
  pipeline?: { name?: string | null; currency_code?: string | null } | null;
};

export type LeadDetailDisplay = {
  name: string;
  email: string;
  phone: string;
  location: string;
  companyName: string;
  website: string;
  position: string;
  profileUrls: string[];
  pipelineName: string;
  status: string;
  source: string;
  priority: string;
  budget: string;
  assigneeName: string;
  creatorName: string;
  nextAction: string;
  lastInteraction: string;
  lastInteractionAt: string;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mapLinkState: string;
  mapLocationLabel: string;
};

const NA = "N/A";
const NONE = "None";

function resolveBudgetAmount(lead: Pick<LeadDetailSource, "budget_amount" | "meta">): number {
  if (typeof lead.budget_amount === "number" && !Number.isNaN(lead.budget_amount)) {
    return lead.budget_amount;
  }
  if (typeof lead.meta?.value === "number" && !Number.isNaN(lead.meta.value)) {
    return lead.meta.value;
  }
  return 0;
}

export function formatLeadDetailDate(value?: string | null): string {
  if (!value) {
    return NA;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return NA;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLeadDetailDateOnly(value?: string | null): string {
  if (!value) {
    return NA;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return NA;
  }

  return date.toLocaleDateString();
}

export function formatLeadMapLinkState(linkedToMap?: boolean | null): string {
  return linkedToMap ? "Linked" : "Not linked";
}

export function formatLeadDetailBudget(lead: LeadDetailSource): string {
  const amount = resolveBudgetAmount(lead);
  if (amount <= 0 && lead.budget_amount == null && !lead.budget) {
    return NA;
  }

  const currency = lead.budget_currency ?? lead.pipeline?.currency_code ?? "USD";
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function getLeadDetailDisplay(lead: LeadDetailSource): LeadDetailDisplay {
  const location = lead.location?.trim() || "";

  return {
    name: lead.name?.trim() || NA,
    email: lead.email?.trim() || NA,
    phone: lead.phone?.trim() || NA,
    location: location || NA,
    companyName: lead.company_name?.trim() || NA,
    website: lead.website?.trim() || NA,
    position: lead.position?.trim() || NA,
    profileUrls: (lead.profile_urls ?? []).filter((url) => Boolean(url?.trim())),
    pipelineName: lead.pipeline?.name?.trim() || NA,
    status: lead.status?.trim() || NA,
    source: lead.source?.trim() || "Unknown",
    priority: lead.priority?.trim() || "Medium",
    budget: formatLeadDetailBudget(lead),
    assigneeName: lead.assignee?.name?.trim() || "Unassigned",
    creatorName: lead.creator?.name?.trim() || "System",
    nextAction: lead.next_action?.trim() || NONE,
    lastInteraction: lead.last_interaction?.trim() || NONE,
    lastInteractionAt: formatLeadDetailDate(lead.last_interaction_at),
    convertedAt: lead.converted_at ? formatLeadDetailDate(lead.converted_at) : null,
    createdAt: formatLeadDetailDateOnly(lead.created_at),
    updatedAt: formatLeadDetailDate(lead.updated_at),
    mapLinkState: formatLeadMapLinkState(lead.linked_to_map),
    mapLocationLabel: location || "No location",
  };
}
