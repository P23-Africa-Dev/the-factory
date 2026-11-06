import { client } from '@/lib/api/client';
import { getActiveCompanyId, setActiveCompanyId } from '@/lib/storage/stores';
import { kpiSchema, kpisListSchema } from './schema';
import type {
  Kpi,
  KpiFilters,
  KpiStatus,
  CreateKpiPayload,
  UpdateKpiPayload,
} from './types';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export const kpiApi = {
  list: async (filters?: KpiFilters): Promise<Kpi[]> => {
    const companyId = filters?.company_id ?? getActiveCompanyId();
    const response = await client.get('/admin/kpis', {
      params: { ...filters, company_id: companyId ?? undefined },
    });
    const raw = unwrap<{ kpis?: unknown[]; data?: unknown[] } | unknown[]>(response.data);
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.kpis)
        ? raw.kpis
        : Array.isArray((raw as { data?: unknown[] })?.data)
          ? (raw as { data: unknown[] }).data
          : [];
    const parsed = kpisListSchema.parse(items);
    if (!companyId && parsed[0]?.companyId) {
      setActiveCompanyId(parsed[0].companyId);
    }
    return parsed;
  },

  get: async (kpiId: number): Promise<Kpi> => {
    const companyId = getActiveCompanyId();
    const response = await client.get(`/admin/kpis/${kpiId}`, {
      params: { company_id: companyId ?? undefined },
    });
    const raw = unwrap<{ kpi?: unknown }>(response.data);
    return kpiSchema.parse(raw?.kpi ?? raw);
  },

  create: async (payload: CreateKpiPayload): Promise<Kpi> => {
    const companyId = getActiveCompanyId();
    const response = await client.post('/admin/kpis', {
      ...payload,
      company_id: companyId ?? undefined,
    });
    const raw = unwrap<{ kpi?: unknown }>(response.data);
    return kpiSchema.parse(raw?.kpi ?? raw);
  },

  update: async ({ id, ...payload }: UpdateKpiPayload): Promise<Kpi> => {
    const companyId = getActiveCompanyId();
    const response = await client.patch(`/admin/kpis/${id}`, {
      ...payload,
      company_id: companyId ?? undefined,
    });
    const raw = unwrap<{ kpi?: unknown }>(response.data);
    return kpiSchema.parse(raw?.kpi ?? raw);
  },

  delete: async (kpiId: number): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.delete(`/admin/kpis/${kpiId}`, {
      params: { company_id: companyId ?? undefined },
    });
  },

  updateStatus: async (kpiId: number, status: KpiStatus): Promise<Kpi> => {
    const companyId = getActiveCompanyId();
    const response = await client.patch(`/admin/kpis/${kpiId}/status`, {
      status,
      company_id: companyId,
    });
    const raw = unwrap<{ kpi?: unknown }>(response.data);
    return kpiSchema.parse(raw?.kpi ?? raw);
  },
};
