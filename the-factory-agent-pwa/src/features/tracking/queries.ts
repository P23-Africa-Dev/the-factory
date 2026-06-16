import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trackingApi } from './api';
import { trackingKeys } from './queryKeys';
import { taskKeys } from '@/features/tasks/queryKeys';
import type { StartTaskPayload } from './types';

export const useTaskRoute = (taskId: number, companyId: number) =>
  useQuery({
    queryKey: trackingKeys.route(taskId),
    queryFn: () => trackingApi.getTaskRoute(taskId, companyId),
    enabled: !!taskId && !!companyId,
    refetchInterval: 1000 * 30, // Poll for updates on route
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
