import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trackingApi } from './api';
import { trackingKeys } from './queryKeys';
import { taskKeys } from '@/features/tasks/queryKeys';
import type { StartTaskPayload } from './types';

export const useTaskRoute = (taskId: number | null, companyId: number, enabled = true) =>
  useQuery({
    queryKey: trackingKeys.route(taskId ?? 0),
    queryFn: () => trackingApi.getTaskRoute(taskId!, companyId),
    enabled: enabled && !!taskId && !!companyId,
    staleTime: 1000 * 15,
  });

export const useStartTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: StartTaskPayload }) =>
      trackingApi.startTask(taskId, payload),

    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(String(taskId)) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
};
