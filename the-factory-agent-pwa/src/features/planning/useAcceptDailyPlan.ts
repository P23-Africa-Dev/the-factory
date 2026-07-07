'use client';

import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { taskKeys } from '@/features/tasks/queryKeys';
import { flattenApiError } from '@/lib/api/errors';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { planningApi } from './api';
import { buildAcceptDrafts } from './planEditorState';
import type { AcceptDailyPlanInput, PlanTaskDraft } from './types';

function isPlanTaskDraft(draft: PlanTaskDraft | null | undefined): draft is PlanTaskDraft {
  return Boolean(draft && typeof draft === 'object');
}

function normalizeDraftForAccept(draft: PlanTaskDraft): PlanTaskDraft {
  const normalized = { ...draft };

  for (const field of ['type', 'description', 'location', 'priority', 'dedupe_key'] as const) {
    const value = normalized[field];
    if (typeof value === 'string' && value.trim() === '') {
      normalized[field] = null;
    }
  }

  return normalized;
}

export function useAcceptDailyPlan() {
  return useMutation({
    mutationFn: async ({ payload, edits }: AcceptDailyPlanInput) => {
      const drafts = buildAcceptDrafts(payload, edits)
        .filter(isPlanTaskDraft)
        .map(normalizeDraftForAccept);

      if (drafts.length === 0) {
        throw new Error('Select at least one item to accept.');
      }

      return planningApi.acceptDailyPlan({
        planDate: payload.plan_date,
        companyId: getActiveCompanyId(),
        items: drafts,
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      const createdCount = result.created.length;
      if (createdCount > 0) {
        toast.success(
          createdCount === 1
            ? '1 task added to your day'
            : `${createdCount} tasks added to your day`,
        );
      } else if (result.skipped > 0) {
        toast.info('Plan already applied', 'These tasks were already created from your plan.');
      } else {
        toast.info('Plan accepted', 'Your existing tasks are ready to work on.');
      }
    },
    onError: (error) => {
      toast.error('Could not accept plan', flattenApiError(error) || 'Please try again in a moment.');
    },
  });
}
