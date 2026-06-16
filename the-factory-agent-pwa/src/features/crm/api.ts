import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import {
  leadSchema,
  leadListSchema,
  crmLabelSchema,
  crmPipelineSchema,
  agentUploadOverviewSchema,
} from './schema';
import type {
  Lead,
  CrmLabel,
  CrmPipeline,
  AgentUploadOverview,
  LeadsResult,
  CreateLeadPayload,
  UpdateLeadPayload,
  LeadFilters,
  PaginationData,
} from './types';

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const w = raw as Record<string, unknown>;
  const data = w?.data as Record<string, unknown> | undefined;
  if (Array.isArray(data?.items)) return data.items as unknown[];
  if (Array.isArray(data)) return data as unknown[];
  if (Array.isArray(w?.items)) return w.items as unknown[];
  return [];
}

function unwrapPagination(raw: unknown): PaginationData {
  const w = raw as Record<string, unknown>;
  const data = (w?.data as Record<string, unknown>) ?? w;
  const pagination = (data?.pagination as Record<string, unknown>) ?? {};
  return {
    nextPageUrl: (pagination?.next_page_url as string | null) ?? null,
    prevPageUrl: (pagination?.prev_page_url as string | null) ?? null,
    perPage: (pagination?.per_page as number) ?? 15,
    currentPage: pagination?.current_page as number | undefined,
    total: pagination?.total as number | undefined,
    lastPage: pagination?.last_page as number | undefined,
  };
}

function unwrapItem<T>(raw: unknown, key: string): unknown {
  const w = raw as Record<string, unknown>;
  const data = (w?.data as Record<string, unknown>) ?? w;
  return (data?.[key] as T) ?? data;
}

export const crmApi = {
  listLeads: async (filters?: LeadFilters): Promise<LeadsResult> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/agent/crm/leads', {
      params: {
        company_id: companyId ?? undefined,
        ...filters,
      },
    });
    const items = unwrapList(response.data);
    const pagination = unwrapPagination(response.data);
    const leads = leadListSchema.parse(items);
    return { leads, pagination };
  },

  getLead: async (id: number | string): Promise<Lead> => {
    const companyId = getActiveCompanyId();
    const response = await client.get(`/agent/crm/leads/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
    const item = unwrapItem(response.data, 'lead');
    return leadSchema.parse(item);
  },

  createLead: async (payload: CreateLeadPayload): Promise<Lead> => {
    const response = await client.post('/agent/crm/leads', payload);
    const item = unwrapItem(response.data, 'lead');
    return leadSchema.parse(item);
  },

  updateLead: async (id: number | string, payload: UpdateLeadPayload): Promise<Lead> => {
    const response = await client.patch(`/agent/crm/leads/${id}`, payload);
    const item = unwrapItem(response.data, 'lead');
    return leadSchema.parse(item);
  },

  listLabels: async (): Promise<CrmLabel[]> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/agent/crm/labels', {
      params: { company_id: companyId ?? undefined },
    });
    const w = response.data as Record<string, unknown>;
    const data = (w?.data as Record<string, unknown>) ?? w;
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((item: unknown) => crmLabelSchema.parse(item));
  },

  listPipelines: async (): Promise<CrmPipeline[]> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/agent/crm/pipelines', {
      params: { company_id: companyId ?? undefined },
    });
    const w = response.data as Record<string, unknown>;
    const data = (w?.data as Record<string, unknown>) ?? w;
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((item: unknown) => crmPipelineSchema.parse(item));
  },

  getAgentUploadsOverview: async (): Promise<AgentUploadOverview> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/agent/crm/leads/agent-uploads-overview', {
      params: { company_id: companyId ?? undefined },
    });
    const w = response.data as Record<string, unknown>;
    const data = (w?.data as Record<string, unknown>) ?? w;
    return agentUploadOverviewSchema.parse(data);
  },
};
