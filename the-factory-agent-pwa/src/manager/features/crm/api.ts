import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { isOffline, shouldUseCache } from '@/lib/offline/connectivity';
import { setShowingCachedData } from '@/lib/offline/cacheIndicator';
import { queueOfflineAction } from '@/lib/offline/queue';
import {
  leadSchema,
  leadListSchema,
  crmLabelSchema,
  crmPipelineSchema,
  agentUploadOverviewSchema,
  leadFieldDefinitionSchema,
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
  LeadFieldDefinition,
  CreateLeadFieldPayload,
} from './types';
import {
  buildOptimisticLead,
  getCachedCrmLabels,
  getCachedCrmPipelines,
  getCachedLeadDetail,
  getCachedLeadsList,
  mergeLeadInCaches,
  nextTempLeadId,
  prependLeadToListCaches,
  putCachedCrmLabels,
  putCachedCrmPipelines,
  putCachedLeadDetail,
  putCachedLeadsList,
} from './cache';

function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const w = raw as Record<string, unknown>;
  const data = w?.data as Record<string, unknown> | undefined;
  if (Array.isArray(data?.items)) return data.items as unknown[];
  if (Array.isArray(data?.leads)) return data.leads as unknown[];
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

export type CrmAssigneeOption = {
  id: number;
  name: string;
  email: string;
  role?: string | null;
  avatar_url?: string | null;
};

export type CrmAnalyticsData = {
  total_leads?: number;
  converted_leads?: number;
  conversion_rate?: number;
  total_value?: number;
  by_status?: Record<string, number>;
  by_priority?: Record<string, number>;
  [key: string]: unknown;
};

export const crmApi = {
  listLeads: async (filters?: LeadFilters): Promise<LeadsResult> => {
    const companyId = getActiveCompanyId();

    if (isOffline() && companyId != null) {
      const cached = await getCachedLeadsList(companyId, filters);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get('/admin/crm/leads', {
        params: {
          company_id: companyId ?? undefined,
          ...filters,
        },
      });
      const items = unwrapList(response.data);
      const pagination = unwrapPagination(response.data);
      const leads = leadListSchema.parse(items);
      const result = { leads, pagination };
      if (companyId != null) {
        void putCachedLeadsList(companyId, filters, result).catch(() => {});
      }
      setShowingCachedData(false);
      return result;
    } catch (err) {
      if (companyId != null && shouldUseCache(err)) {
        const cached = await getCachedLeadsList(companyId, filters);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      throw err;
    }
  },

  getLead: async (id: number | string): Promise<Lead> => {
    const companyId = getActiveCompanyId();
    const leadId = Number(id);

    if (isOffline() && companyId != null) {
      const cached = await getCachedLeadDetail(companyId, leadId);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get(`/admin/crm/leads/${id}`, {
        params: { company_id: companyId ?? undefined },
      });
      const item = unwrapItem(response.data, 'lead');
      const lead = leadSchema.parse(item);
      if (companyId != null) {
        void putCachedLeadDetail(companyId, lead, 0).catch(() => {});
      }
      setShowingCachedData(false);
      return lead;
    } catch (err) {
      if (companyId != null && shouldUseCache(err)) {
        const cached = await getCachedLeadDetail(companyId, leadId);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      throw err;
    }
  },

  createLead: async (payload: CreateLeadPayload): Promise<Lead> => {
    const companyId = Number(payload.company_id || getActiveCompanyId());

    if (isOffline()) {
      const tempId = await nextTempLeadId();
      const optimistic = buildOptimisticLead({
        tempId,
        companyId,
        payload: {
          pipeline_id: payload.pipeline_id,
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          location: payload.location,
          source: payload.source,
          status: payload.status,
          priority: payload.priority,
          next_action: payload.next_action,
          assigned_to_user_id: payload.assigned_to_user_id,
          meta: payload.meta,
          custom_fields: payload.custom_fields,
        },
      });
      await putCachedLeadDetail(companyId, optimistic, 1);
      await prependLeadToListCaches(companyId, optimistic);
      await queueOfflineAction({
        actionType: 'crm.lead.create',
        payload: { tempId, body: payload },
        companyId,
      });
      return optimistic;
    }

    const response = await client.post('/admin/crm/leads', payload);
    const item = unwrapItem(response.data, 'lead');
    const lead = leadSchema.parse(item);
    void putCachedLeadDetail(companyId, lead, 0).catch(() => {});
    return lead;
  },

  updateLead: async (id: number | string, payload: UpdateLeadPayload): Promise<Lead> => {
    const companyId = getActiveCompanyId();
    const leadId = Number(id);

    if (isOffline() && companyId != null) {
      const cached = await getCachedLeadDetail(companyId, leadId);
      const merged = cached
        ? {
            ...cached,
            name: payload.name ?? cached.name,
            email: payload.email !== undefined ? payload.email : cached.email,
            phone: payload.phone !== undefined ? payload.phone : cached.phone,
            location: payload.location !== undefined ? payload.location : cached.location,
            status: payload.status ?? cached.status,
            priority: payload.priority ?? cached.priority,
            nextAction: payload.next_action !== undefined ? payload.next_action : cached.nextAction,
            customFields: payload.custom_fields
              ? { ...cached.customFields, ...payload.custom_fields }
              : cached.customFields,
            updatedAt: new Date().toISOString(),
          }
        : null;

      if (merged) {
        await putCachedLeadDetail(companyId, merged, 1);
        await mergeLeadInCaches(companyId, leadId, merged);
      }

      await queueOfflineAction({
        actionType: 'crm.lead.update',
        payload: { id: leadId, body: payload },
        companyId,
      });

      if (merged) return merged;
      throw new Error('Lead not available offline for update.');
    }

    const response = await client.patch(`/admin/crm/leads/${id}`, payload);
    const item = unwrapItem(response.data, 'lead');
    const lead = leadSchema.parse(item);
    if (companyId != null) {
      void putCachedLeadDetail(companyId, lead, 0).catch(() => {});
    }
    return lead;
  },

  deleteLead: async (id: number | string): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.delete(`/admin/crm/leads/${id}`, {
      params: { company_id: companyId ?? undefined },
    });
  },

  addLeadNote: async (leadId: number | string, note: string): Promise<unknown> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.post(`/admin/crm/leads/${leadId}/notes`, {
      note,
      company_id: companyId ?? undefined,
    });
    return data;
  },

  addLeadActivity: async (
    leadId: number | string,
    payload: { type: string; title?: string; description?: string; happened_at?: string },
  ): Promise<unknown> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.post(`/admin/crm/leads/${leadId}/activities`, {
      ...payload,
      company_id: companyId ?? undefined,
    });
    return data;
  },

  getAssignees: async (): Promise<CrmAssigneeOption[]> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.get('/admin/crm/assignees', {
      params: { company_id: companyId ?? undefined },
    });
    const raw = (data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data) as unknown;
    if (Array.isArray(raw)) return raw as CrmAssigneeOption[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.assignees ?? obj.users ?? obj.agents ?? obj.data ?? []) as CrmAssigneeOption[];
    return Array.isArray(list) ? list : [];
  },

  getAnalytics: async (params?: { pipeline_id?: number }): Promise<CrmAnalyticsData> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.get('/admin/crm/leads/analytics', {
      params: { ...params, company_id: companyId ?? undefined },
    });
    const raw = data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data;
    return (raw ?? {}) as CrmAnalyticsData;
  },

  listLabels: async (): Promise<CrmLabel[]> => {
    const companyId = getActiveCompanyId();

    if (isOffline() && companyId != null) {
      const cached = await getCachedCrmLabels(companyId);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get('/admin/crm/labels', {
        params: { company_id: companyId ?? undefined },
      });
      const w = response.data as Record<string, unknown>;
      const data = (w?.data as Record<string, unknown>) ?? w;
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.labels)
          ? data.labels
          : Array.isArray(data)
            ? data
            : [];
      const labels = items.map((item: unknown) => crmLabelSchema.parse(item));
      if (companyId != null) {
        void putCachedCrmLabels(companyId, labels).catch(() => {});
      }
      setShowingCachedData(false);
      return labels;
    } catch (err) {
      if (companyId != null && shouldUseCache(err)) {
        const cached = await getCachedCrmLabels(companyId);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      throw err;
    }
  },

  listPipelines: async (): Promise<CrmPipeline[]> => {
    const companyId = getActiveCompanyId();

    if (isOffline() && companyId != null) {
      const cached = await getCachedCrmPipelines(companyId);
      if (cached) {
        setShowingCachedData(true);
        return cached;
      }
    }

    try {
      const response = await client.get('/admin/crm/pipelines', {
        params: { company_id: companyId ?? undefined },
      });
      const w = response.data as Record<string, unknown>;
      const data = (w?.data as Record<string, unknown>) ?? w;
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.pipelines)
          ? data.pipelines
          : Array.isArray(data)
            ? data
            : [];
      const pipelines = items.map((item: unknown) => crmPipelineSchema.parse(item));
      if (companyId != null) {
        void putCachedCrmPipelines(companyId, pipelines).catch(() => {});
      }
      setShowingCachedData(false);
      return pipelines;
    } catch (err) {
      if (companyId != null && shouldUseCache(err)) {
        const cached = await getCachedCrmPipelines(companyId);
        if (cached) {
          setShowingCachedData(true);
          return cached;
        }
      }
      throw err;
    }
  },

  getAgentUploadsOverview: async (): Promise<AgentUploadOverview> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/admin/crm/leads/agent-uploads-overview', {
      params: { company_id: companyId ?? undefined },
    });
    const w = response.data as Record<string, unknown>;
    const data = (w?.data as Record<string, unknown>) ?? w;
    return agentUploadOverviewSchema.parse(data);
  },

  listLeadFields: async (): Promise<LeadFieldDefinition[]> => {
    const companyId = getActiveCompanyId();
    if (isOffline()) return [];

    const response = await client.get('/admin/crm/lead-fields', {
      params: { company_id: companyId ?? undefined },
    });
    const w = response.data as Record<string, unknown>;
    const data = (w?.data as Record<string, unknown>) ?? w;
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.fields)
        ? data.fields
        : Array.isArray(data)
          ? data
          : [];
    return items.map((item: unknown) => leadFieldDefinitionSchema.parse(item));
  },

  createLeadField: async (payload: CreateLeadFieldPayload): Promise<LeadFieldDefinition> => {
    if (isOffline()) {
      throw new Error('Connect to the internet to add a lead field.');
    }
    const response = await client.post('/admin/crm/lead-fields', payload);
    const item = unwrapItem(response.data, 'field');
    return leadFieldDefinitionSchema.parse(item);
  },

  approveLeadField: async (fieldId: number | string): Promise<LeadFieldDefinition> => {
    const companyId = getActiveCompanyId();
    const response = await client.post(`/admin/crm/lead-fields/${fieldId}/approve`, {
      company_id: companyId ?? undefined,
    });
    const item = unwrapItem(response.data, 'field');
    return leadFieldDefinitionSchema.parse(item);
  },

  declineLeadField: async (fieldId: number | string): Promise<LeadFieldDefinition> => {
    const companyId = getActiveCompanyId();
    const response = await client.post(`/admin/crm/lead-fields/${fieldId}/decline`, {
      company_id: companyId ?? undefined,
    });
    const item = unwrapItem(response.data, 'field');
    return leadFieldDefinitionSchema.parse(item);
  },
};
