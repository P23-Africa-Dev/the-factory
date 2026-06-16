import type { LeadFilters } from './types';

export const crmKeys = {
  all: ['crm'] as const,
  leads: (filters?: LeadFilters) =>
    [...crmKeys.all, 'leads', filters ?? {}] as const,
  lead: (id: number | string) =>
    [...crmKeys.all, 'lead', String(id)] as const,
  labels: (companyId?: number | string | null) =>
    [...crmKeys.all, 'labels', companyId ?? 'unknown'] as const,
  pipelines: (companyId?: number | string | null) =>
    [...crmKeys.all, 'pipelines', companyId ?? 'unknown'] as const,
  agentOverview: (companyId?: number | string | null) =>
    [...crmKeys.all, 'agent-overview', companyId ?? 'unknown'] as const,
};
