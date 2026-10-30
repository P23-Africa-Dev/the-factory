import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import type { AcceptDailyPlanResult, PlanTaskDraft } from './types';

export const planningApi = {
  acceptDailyPlan: async (params: {
    planDate: string;
    companyId?: number | null;
    items: PlanTaskDraft[];
  }): Promise<AcceptDailyPlanResult> => {
    const companyId = params.companyId ?? getActiveCompanyId();
    const created: unknown[] = [];
    let skipped = 0;

    for (const item of params.items) {
      if (!item.creates_task) {
        skipped += 1;
        continue;
      }
      try {
        const res = await client.post('/admin/tasks', {
          company_id: companyId ?? undefined,
          title: item.title,
          description: item.description,
          due_date: item.due_date ?? params.planDate,
          priority: item.priority ?? 'medium',
          location: item.location,
          latitude: item.latitude,
          longitude: item.longitude,
        });
        created.push(res.data);
      } catch {
        skipped += 1;
      }
    }

    return {
      created,
      skipped,
      linked_existing: 0,
    };
  },
};
