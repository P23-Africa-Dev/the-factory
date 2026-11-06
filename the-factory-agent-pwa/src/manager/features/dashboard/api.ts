/**
 * Manager Dashboard & Workforce Summary API (`/admin/dashboard/overview`, `/admin/workforce/summary`)
 */
import { useQuery } from '@tanstack/react-query';
import { client } from '@/lib/api/client';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export type DashboardOverviewData = {
  period?: string;
  leads?: {
    total?: number;
    converted?: number;
    conversion_rate?: number;
  };
  tasks?: {
    total?: number;
    completed?: number;
    in_progress?: number;
    pending?: number;
    overdue?: number;
    completion_rate?: number;
  };
  kpis?: {
    total?: number;
    completed?: number;
    in_progress?: number;
    completion_rate?: number;
  };
  workforce?: {
    total_agents?: number;
    active_agents?: number;
    online_agents?: number;
  };
  ongoing_tasks?: Array<{
    id: number;
    title: string;
    status: string;
    priority?: string;
    due_date?: string | null;
    assignee_name?: string | null;
  }>;
  [key: string]: unknown;
};

export type WorkforceSummaryData = {
  total_users?: number;
  total_agents?: number;
  total_supervisors?: number;
  total_admins?: number;
  active_users?: number;
  online_agents?: number;
  present_today?: number;
  late_today?: number;
  absent_today?: number;
  [key: string]: unknown;
};

export const dashboardApi = {
  async getOverview(params?: { period?: string }): Promise<DashboardOverviewData> {
    const { data } = await client.get('/admin/dashboard/overview', { params });
    return unwrap<DashboardOverviewData>(data);
  },

  async getWorkforceSummary(): Promise<WorkforceSummaryData> {
    const { data } = await client.get('/admin/workforce/summary');
    return unwrap<WorkforceSummaryData>(data);
  },
};

export function useDashboardOverview(period = 'month', enabled = true) {
  return useQuery({
    queryKey: ['admin-dashboard-overview', period],
    queryFn: () => dashboardApi.getOverview({ period }),
    enabled,
    staleTime: 60_000,
  });
}

export function useWorkforceSummary(enabled = true) {
  return useQuery({
    queryKey: ['admin-workforce-summary'],
    queryFn: () => dashboardApi.getWorkforceSummary(),
    enabled,
    staleTime: 60_000,
  });
}

