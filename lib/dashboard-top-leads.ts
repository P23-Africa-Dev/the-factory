import type { DashboardKpis, TopProspect } from "@/lib/api/dashboard";

export const TOP_LEADS_FILTER_OPTIONS = ["Weekly", "Monthly", "Yearly"] as const;

export type TopLeadsFilter = (typeof TOP_LEADS_FILTER_OPTIONS)[number];

export const TOP_LEADS_RING_COLORS = ["#7BB6B8", "#146AFA", "#FD6046"] as const;

export type TopLeadsChartItem = {
  id: string;
  name: string;
  value: number;
  fill: string;
};

/** Fallback only, used when the API does not send `stage_progress`. */
const LEAD_STATUS_PROGRESS: Record<string, number> = {
  new: 15,
  newly_lead: 15,
  contacted: 35,
  qualified: 55,
  proposal_sent: 75,
  won: 100,
  lost: 0,
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTopLeadsDateRange(
  filter: TopLeadsFilter,
  referenceDate = new Date(),
): { from_date: string; to_date: string } {
  const to = new Date(referenceDate);
  const from = new Date(referenceDate);

  switch (filter) {
    case "Weekly":
      from.setDate(to.getDate() - 6);
      break;
    case "Monthly":
      from.setDate(to.getDate() - 29);
      break;
    case "Yearly":
      from.setDate(to.getDate() - 364);
      break;
  }

  return {
    from_date: toDateKey(from),
    to_date: toDateKey(to),
  };
}

/**
 * How far along the pipeline a lead's stage is (0-100).
 * Uses the server's per-company `stage_progress` (label order, won = 100) when given.
 */
export function getLeadStatusProgress(
  status?: string | null,
  stageProgress?: Record<string, number> | null,
): number {
  if (!status) {
    return LEAD_STATUS_PROGRESS.new;
  }

  const fromCompany = stageProgress?.[status];
  if (typeof fromCompany === "number") {
    return fromCompany;
  }

  return LEAD_STATUS_PROGRESS[status.toLowerCase()] ?? LEAD_STATUS_PROGRESS.new;
}

/**
 * Share of leads in scope that are converted (sitting in a stage flagged "won").
 * Both KPIs share the same scope: whole company for managers, created-or-assigned for agents.
 */
export function getLeadConversionRate(
  kpis?: Pick<DashboardKpis, "total_leads" | "converted_leads">,
): number {
  const totalLeads = kpis?.total_leads ?? 0;
  const convertedLeads = kpis?.converted_leads ?? 0;

  return totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
}

export function getTopLeadsCenterRate(chartData: TopLeadsChartItem[]): number {
  if (chartData.length === 0) {
    return 0;
  }

  return Math.max(...chartData.map((item) => item.value));
}

export function buildTopLeadsChartData(
  prospects: TopProspect[],
  conversionRate: number,
  stageProgress?: Record<string, number> | null,
): TopLeadsChartItem[] {
  if (prospects.length === 0) {
    return TOP_LEADS_RING_COLORS.map((fill, index) => ({
      id: `placeholder-${index}`,
      name: `Lead ${index + 1}`,
      value: conversionRate,
      fill,
    }));
  }

  return prospects.slice(0, 3).map((prospect, index) => ({
    id: String(prospect.id),
    name: prospect.name,
    value:
      typeof prospect.progress === "number"
        ? prospect.progress
        : getLeadStatusProgress(prospect.status, stageProgress),
    fill: TOP_LEADS_RING_COLORS[index] ?? TOP_LEADS_RING_COLORS[0],
  }));
}
