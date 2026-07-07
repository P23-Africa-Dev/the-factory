export interface PlanTaskDraft {
  creates_task: boolean;
  linked_task_id?: number | null;
  dedupe_key?: string | null;
  title: string;
  type?: string | null;
  description?: string | null;
  due_date?: string | null;
  priority?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DailyPlanItem {
  item_id?: string;
  parent_item_id?: string | null;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  editable?: boolean;
  removable?: boolean;
  rank: number;
  type: string;
  title: string;
  reason: string;
  entity_id: number;
  entity_type: string;
  due_at?: string | null;
  distance_km?: number | null;
  suggested_action: string;
  score: number;
  scheduled_start?: string;
  scheduled_end?: string;
  task_draft: PlanTaskDraft;
}

export interface DailyPlanProfileSummary {
  tasks_due?: number;
  overdue_tasks?: number;
  meetings_today?: number;
  active_kpis?: number;
  stale_leads?: number;
  nearby_opportunities?: number;
}

export interface DailyPlanPayload {
  plan_date: string;
  agent_location_available?: boolean;
  items: DailyPlanItem[];
  profile_summary?: DailyPlanProfileSummary;
  summary_counts?: Record<string, number>;
  kpi_snapshot?: Record<string, number>;
  acceptance?: {
    plan_date: string;
    item_count: number;
    creatable_count: number;
    already_task_count: number;
    accepted_at?: string | null;
  };
}

export interface PlanItemEditState {
  selected: boolean;
  removed: boolean;
  draft?: Partial<PlanTaskDraft>;
}

export type PlanEditsMap = Record<string, PlanItemEditState>;

export interface AcceptDailyPlanInput {
  payload: DailyPlanPayload;
  edits: PlanEditsMap;
}

export interface AcceptDailyPlanResult {
  created: unknown[];
  skipped: number;
  linked_existing: number;
}
