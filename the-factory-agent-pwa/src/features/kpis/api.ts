import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { kpisListSchema, kpiSchema } from './schema';
import type { Kpi, KpiFilters, KpiStatus } from './types';

const isDev = process.env.NODE_ENV !== 'production';

export const kpiApi = {
  list: async (filters?: KpiFilters): Promise<Kpi[]> => {
    const companyId = getActiveCompanyId();
    if (isDev) {
      console.log('[kpiApi.list] companyId:', companyId, 'filters:', filters);
    }
    const response = await client.get('/agent/kpis', {
      params: { company_id: companyId ?? undefined, ...filters },
    });
    if (isDev) {
      console.log('[kpiApi.list] raw response:', JSON.stringify(response.data, null, 2));
    }
    
    const raw = response.data;
    const wrappedData = (raw?.data as Record<string, unknown> | undefined) ?? raw;
    
    let items: unknown[] = [];
    if (Array.isArray(wrappedData?.items)) {
      items = wrappedData.items;
    } else if (Array.isArray(wrappedData)) {
      items = wrappedData;
    } else if (Array.isArray(raw?.items)) {
      items = raw.items;
    }

    try {
      return kpisListSchema.parse(items);
    } catch (err) {
      if (isDev) {
        console.error('[kpiApi.list] parse error:', err);
      }
      throw err;
    }
  },

  updateStatus: async (kpiId: number, status: KpiStatus): Promise<Kpi> => {
    const companyId = getActiveCompanyId();
    if (isDev) {
      console.log('[kpiApi.updateStatus] kpiId:', kpiId, 'status:', status);
    }
    const response = await client.patch(`/agent/kpis/${kpiId}/status`, {
      company_id: companyId ?? undefined,
      status,
    });
    if (isDev) {
      console.log('[kpiApi.updateStatus] raw response:', JSON.stringify(response.data, null, 2));
    }

    const raw = response.data;
    const item = (raw?.data?.kpi ?? raw?.data ?? raw) as unknown;
    
    try {
      return kpiSchema.parse(item);
    } catch (err) {
      if (isDev) {
        console.error('[kpiApi.updateStatus] parse error:', err);
      }
      throw err;
    }
  },
};
