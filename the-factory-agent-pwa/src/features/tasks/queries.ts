import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
import { useTrackingStore } from '@/store/tracking';
import { toast } from '@/lib/toast';
import { taskApi } from './api';
import type { TaskListResult } from './api';
import { taskKeys } from './queryKeys';
import type { Task, TaskFilters, UpdateTaskStatusPayload } from './types';

export function flattenTaskPages(data: InfiniteData<TaskListResult> | undefined): Task[] {
  if (!data?.pages.length) return [];
  const seen = new Set<string>();
  const result: Task[] = [];
  for (const page of data.pages) {
    for (const task of page.tasks) {
      if (!seen.has(task.id)) {
        seen.add(task.id);
        result.push(task);
      }
    }
  }
  return result;
}

export function useTaskList(filters?: TaskFilters) {
  // The /agent/tasks endpoint is scoped by the bearer token and returns the
  // agent's tasks even without a company_id param; taskApi.list seeds company_id
  // from the response for subsequent company-scoped calls. Gating on company_id
  // (which can be absent on a freshly hydrated session) would wrongly disable the
  // query and leave the task page and map destination picker empty.
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useInfiniteQuery({
    queryKey: taskKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      if (pageParam) return taskApi.listByUrl(pageParam as string);
      return taskApi.list(filters);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pagination.nextPageUrl ?? null,
    enabled: isAuthenticated,
    staleTime: 1000 * 30,
  });
}

/** Convenience hook returning a flat task array (dashboard, map). */
export function useTaskListItems(filters?: TaskFilters) {
  const query = useTaskList(filters);
  return {
    ...query,
    data: flattenTaskPages(query.data),
  };
}

export function useTask(id: string) {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskApi.get(id),
    enabled: Boolean(id) && companyId != null,
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
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
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
      useTrackingStore.getState().removeTask(taskId);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.info('Offline queue', 'Task completion queued and will sync automatically.');
      }
    },
  });
}
