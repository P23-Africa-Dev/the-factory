import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import type { AcceptDailyPlanResult, PlanTaskDraft } from './types';

function unwrap(data: unknown): Record<string, unknown> {
  const body = (data ?? {}) as Record<string, unknown>;
  if (body.data && typeof body.data === 'object') {
    return body.data as Record<string, unknown>;
  }
  return body;
}

export const planningApi = {
  acceptDailyPlan: async (params: {
    planDate: string;
    items: PlanTaskDraft[];
  }): Promise<AcceptDailyPlanResult> => {
    const companyId = getActiveCompanyId();
    const res = await client.post('/agent/planning/accept', {
      company_id: companyId ?? undefined,
      plan_date: params.planDate,
      items: params.items,
    });
    const data = unwrap(res.data);
    return {
      created: Array.isArray(data.created) ? data.created : [],
      skipped: Number(data.skipped ?? 0),
      linked_existing: Number(data.linked_existing ?? 0),
    };
  },
};
