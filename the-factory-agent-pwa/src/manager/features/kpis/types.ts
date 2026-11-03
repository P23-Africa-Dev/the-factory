export type KpiStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type KpiPriority = 'low' | 'medium' | 'high' | 'critical';
export type KpiCategory =
  | 'sales'
  | 'customer_visits'
  | 'lead_generation'
  | 'collection'
  | 'survey'
  | 'merchandising'
  | 'others';

export interface KpiAssignee {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
}

export interface Kpi {
  id: number;
  companyId: number;
  createdByUserId: number;
  assignedToUserId?: number | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  assigneeAvatarUrl?: string | null;
  name: string;
  category: KpiCategory;
  objective: string;
  targetValue: string;
  expectedOutcome: string;
  priority: KpiPriority;
  status: KpiStatus;
  startDate: string;
  endDate: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface KpiFilters {
  company_id?: number | string;
  status?: KpiStatus;
  priority?: KpiPriority;
  category?: KpiCategory;
  assigned_to_user_id?: number | string;
  search?: string;
}

export interface CreateKpiPayload {
  name: string;
  category: KpiCategory;
  objective: string;
  target_value: string;
  expected_outcome: string;
  priority: KpiPriority;
  start_date: string;
  end_date: string;
  assigned_to_user_id?: number | null;
}

export interface UpdateKpiPayload extends Partial<CreateKpiPayload> {
  id: number;
  status?: KpiStatus;
}
