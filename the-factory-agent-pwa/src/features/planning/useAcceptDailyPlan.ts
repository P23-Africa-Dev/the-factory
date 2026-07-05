'use client';

import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { taskKeys } from '@/features/tasks/queryKeys';
import { toast } from '@/lib/toast';
import { planningApi } from './api';
import type { DailyPlanPayload } from './types';

export function useAcceptDailyPlan() {
  return useMutation({
    mutationFn: async (payload: DailyPlanPayload) => {
      const drafts = payload.items
        .map((item) => item.task_draft)
        .filter((draft) => draft && typeof draft === 'object');

      return planningApi.acceptDailyPlan({
        planDate: payload.plan_date,
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
    onError: () => {
      toast.error('Could not accept plan', 'Please try again in a moment.');
    },
  });
}
