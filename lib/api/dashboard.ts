"use client";

import { ApiLeadPriority, ApiLeadStatus, ApiRoleBasePath, PipelineSnapshot } from "./crm";
import { apiRequest, ApiEnvelope } from "./onboarding";

export type DashboardQueryParams = {
    company_id?: number | string;
    from_date?: string;
    to_date?: string;
};

export type DashboardDateRange = {
    from_date: string;
    to_date: string;
};

export type DashboardKpis = {
    total_tasks: number;
    completed_tasks: number;
    active_agents: number;
    total_leads: number;
    converted_leads: number;
    payroll_configured: boolean;
};

export type ActivitySummary = {
    range: DashboardDateRange;
    tasks_created: number;
    tasks_completed: number;
    leads_created: number;
    leads_won: number;
};

export type SelfTaskSlices = {
    pending: number;
    in_progress: number;
    completed: number;
    cancelled: number;
};

export type TopProspect = {
    id: number;
    name: string;
    status: ApiLeadStatus | null;
    priority: ApiLeadPriority | null;
    assigned_to_user_id: number | null;
    /** Name of the lead's CRM stage. */
    stage_name?: string | null;
    /** How far the stage is along the company's pipeline (0-100, won = 100). */
    progress?: number;
};

export type CalendarTaskItem = {
    id: number;
    title: string;
    due_at: string | null;
    status: string | null;
    assigned_agent_id: number | null;
    project_id: number | null;
};

export type AgentLiveActivity = {
    agents_with_recent_location_ping: number;
};

export type ActivityMetricDailyPoint = {
    name: string;
    value: number;
};

export type ActivityMetric = {
    activity_score: number;
    direction: "up" | "down" | "flat";
    /** "self" = the agent's own actions, "team" = everyone in the company (managers). */
    scope?: "self" | "team";
    /** Actions this week so far. */
    current_week: number;
    /** Actions last week up to the same weekday and time. */
    previous_week: number;
    current_week_daily: ActivityMetricDailyPoint[];
    previous_week_daily?: ActivityMetricDailyPoint[];
};

export type OngoingTaskAgent = {
    id: number | null;
    name: string;
    avatar_url: string | null;
    initials: string;
};

export type OngoingTaskState = "active" | "paused" | "near_destination" | "arrived";

/** How a task's progress was measured. */
export type OngoingProgressSource = "checklist" | "travel" | "schedule" | "started";

export type OngoingTask = {
    task_id: number;
    task_title: string;
    status: string;
    state?: OngoingTaskState;
    progress_source?: OngoingProgressSource;
    tracking_state: "in_progress" | "near_destination" | "arrived" | "completed";
    progress_percent: number;
    total_distance_meters: number | null;
    covered_distance_meters: number | null;
    remaining_distance_meters: number | null;
    eta_minutes: number | null;
    agent: OngoingTaskAgent;
};

export type ProjectKpis = {
    total_projects: number;
    active_projects: number;
    planning_projects: number;
    completed_projects: number;
    completion_rate: number;
};

export type OngoingAgentTask = {
    id: number;
    title: string;
    progress_percent: number;
    progress_source: OngoingProgressSource;
    state: OngoingTaskState;
};

/** One agent's ongoing work: progress is the average of their ongoing tasks. */
export type OngoingAgent = {
    agent: OngoingTaskAgent;
    progress_percent: number;
    task_count: number;
    current_task: {
        id: number;
        title: string;
        state: OngoingTaskState;
        progress_source: OngoingProgressSource;
    };
    tasks: OngoingAgentTask[];
};

export type LeadsTrendPoint = {
    /** Weekday short name, e.g. "Thu". */
    name: string;
    date?: string;
    v1: number;
    v2: number;
};

export type DashboardOverviewData = {
    kpis: DashboardKpis;
    project_kpis: ProjectKpis;
    activity_summary: ActivitySummary;
    self_task_slices: SelfTaskSlices;
    top_prospects: TopProspect[];
    crm_pipeline_snapshot: PipelineSnapshot;
    /** Progress 0-100 per stage slug, from the company's label order (won stages = 100). */
    stage_progress?: Record<string, number>;
    calendar_task_feed: CalendarTaskItem[];
    agent_live_activity: AgentLiveActivity;
    activity_metric: ActivityMetric;
    ongoing_tasks: OngoingTask[];
    ongoing_agents?: OngoingAgent[];
    leads_trend: LeadsTrendPoint[];
};

export type AgentSummary = {
    total_agents: number;
    active_agents: number;
    inactive_agents: number;
    pending_onboarding: number;
};

export type TaskDistribution = {
    pending: number;
    in_progress: number;
    completed: number;
    cancelled: number;
};

export type AttendanceProxy = {
    agents_with_location_ping_last_30m: number;
    agents_without_location_ping_last_30m: number;
};

export type WorkloadTopAgent = {
    agent_id: number;
    agent_name: string | null;
    agent_email: string | null;
    open_tasks: number;
};

export type WorkforceRecentTrackingItem = {
    agent_id: number;
    agent_name: string | null;
    last_seen_at: string | null;
};

export type WorkforceSummaryData = {
    range: DashboardDateRange;
    agent_summary: AgentSummary;
    task_distribution: TaskDistribution;
    attendance_proxy: AttendanceProxy;
    workload_top_agents: WorkloadTopAgent[];
    recent_tracking: WorkforceRecentTrackingItem[];
};

function buildQuery(params: DashboardQueryParams): string {
    const qs = new URLSearchParams();

    if (params.company_id !== undefined) {
        qs.set("company_id", String(params.company_id));
    }

    if (params.from_date) {
        qs.set("from_date", params.from_date);
    }

    if (params.to_date) {
        qs.set("to_date", params.to_date);
    }

    const query = qs.toString();
    return query ? `?${query}` : "";
}

function withBase(basePath: ApiRoleBasePath, path: string) {
    return `${basePath}${path}`;
}

export function getDashboardOverview(
    params: DashboardQueryParams,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<DashboardOverviewData>> {
    const query = buildQuery(params);

    return apiRequest<DashboardOverviewData>({
        method: "GET",
        path: withBase(basePath, `/dashboard/overview${query}`),
        token,
    });
}

export function getWorkforceSummary(
    params: DashboardQueryParams,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<WorkforceSummaryData>> {
    const query = buildQuery(params);

    return apiRequest<WorkforceSummaryData>({
        method: "GET",
        path: withBase(basePath, `/workforce/summary${query}`),
        token,
    });
}
