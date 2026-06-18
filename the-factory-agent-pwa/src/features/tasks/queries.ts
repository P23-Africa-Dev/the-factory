import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useTrackingStore } from '@/store/tracking';
import { toast } from '@/lib/toast';
import { taskApi } from './api';
import { taskKeys } from './queryKeys';
import type { Task, TaskFilters, UpdateTaskStatusPayload } from './types';

export function useTaskList(filters?: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => taskApi.list(filters),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskApi.get(id),
    enabled: Boolean(id),
  });
}

export function useUpdateTaskStatus() {
  return useMutation({
    mutationFn: taskApi.updateStatus,
    onMutate: async ({ id, status }: UpdateTaskStatusPayload) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(id) });
      const previous = queryClient.getQueryData<Task>(taskKeys.detail(id));
      queryClient.setQueryData<Task>(taskKeys.detail(id), (old) =>
        old ? { ...old, status } : old,
      );
      return { previous };
    },
    onError: (_, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.detail(id), context.previous);
      }
    },
    onSettled: (_, __, { id }) => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
      }
    },
    onSuccess: () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.info('Offline queue', 'Task status update queued for synchronization.');
      }
    },
  });
}

export function useCompleteTask() {
  return useMutation({
    mutationFn: ({ taskId, formData }: { taskId: number; formData: FormData }) =>
      taskApi.completeTask(taskId, formData),

    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(String(taskId)) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      useTrackingStore.getState().setActiveTrackingTaskId(null);
      useTrackingStore.getState().markCompleted(taskId);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.info('Offline queue', 'Task completion queued and will sync automatically.');
      }
    },
  });
}
