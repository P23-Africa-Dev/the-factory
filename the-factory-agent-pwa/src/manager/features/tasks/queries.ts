import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { appStore } from '@/lib/storage/stores';
import { useTrackingStore } from '@/store/tracking';
import { toast } from '@/lib/toast';
import { taskApi } from './api';
import type { TaskListResult } from './api';
import { taskKeys } from './queryKeys';
import { canLoadTaskComments, taskCommentApi, type TaskCommentThread } from './comments';
import type { Task, TaskFilters, UpdateTaskStatusPayload, CreateSelfTaskPayload } from './types';

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

export function useTaskListItems(filters?: TaskFilters) {
  const query = useTaskList(filters);
  return {
    ...query,
    data: flattenTaskPages(query.data),
  };
}

export function useTask(id: string) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskApi.get(id),
    enabled: Boolean(id) && isAuthenticated,
  });
}

export function useTaskAssignees(enabled = true) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: [...taskKeys.all, 'assignees'],
    queryFn: () => taskApi.getAssignees(),
    enabled: isAuthenticated && enabled,
    staleTime: 60_000,
  });
}

export function useAssignTask() {
  return useMutation({
    mutationFn: taskApi.assignTask,
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(String(payload.id)) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success('Task assigned successfully');
    },
  });
}

export function useTaskReassignmentsInbox(status?: string, enabled = true) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: [...taskKeys.all, 'reassignments-inbox', status ?? 'all'],
    queryFn: () => taskApi.getReassignmentsInbox(status ? { status } : undefined),
    enabled: isAuthenticated && enabled,
    staleTime: 30_000,
  });
}

export function useRespondTaskReassignment() {
  return useMutation({
    mutationFn: taskApi.respondReassignment,
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: [...taskKeys.all, 'reassignments-inbox'] });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success(
        payload.action === 'accept'
          ? 'Reassignment accepted'
          : 'Reassignment rejected',
      );
    },
  });
}

export function useTaskRoute(taskId: string | number | undefined, enabled = true) {
  return useQuery({
    queryKey: [...taskKeys.all, 'route', String(taskId ?? '')],
    queryFn: () => taskApi.getTaskRoute(taskId!),
    enabled: Boolean(taskId) && enabled,
    staleTime: 30_000,
  });
}

export function useProjects(enabled = true) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: [...taskKeys.all, 'projects'],
    queryFn: () => taskApi.listProjects(),
    enabled: isAuthenticated && enabled,
    staleTime: 60_000,
  });
}

export function useCreateProject() {
  return useMutation({
    mutationFn: taskApi.createProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...taskKeys.all, 'projects'] });
      toast.success('Project created');
    },
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
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
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
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(String(taskId)) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      useTrackingStore.getState().setActiveTrackingTaskId(null);
      useTrackingStore.getState().markCompleted(taskId);
      useTrackingStore.getState().removeTask(taskId);
    },
  });
}

export function useCreateSelfTask() {
  return useMutation({
    mutationFn: (payload: CreateSelfTaskPayload) => taskApi.createSelf(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.info('Offline queue', 'Task creation queued and will sync automatically.');
      } else {
        toast.success('Task created successfully');
      }
    },
  });
}

export const useCreateTask = useCreateSelfTask;

export function useUpdateTask() {
  return useMutation({
    mutationFn: taskApi.update,
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.detail(payload.id) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      toast.success('Task deleted');
    },
  });
}

export function useTaskComments(taskId: string) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: taskKeys.comments(taskId),
    queryFn: () => taskCommentApi.list(taskId),
    enabled: isAuthenticated && canLoadTaskComments(taskId),
    retry: (failureCount, error) => {
      const status = (error as { status?: number } | null)?.status ?? 0;
      return !(status >= 400 && status < 500) && failureCount < 2;
    },
    staleTime: 1000 * 15,
  });
}

export function useCreateTaskComment(taskId: string) {
  return useMutation({
    mutationFn: (body: string) => taskCommentApi.create(taskId, body),
    onSuccess: (comment) => {
      queryClient.setQueryData<TaskCommentThread>(taskKeys.comments(taskId), (current) =>
        current && !current.items.some((c) => c.id === comment.id)
          ? { ...current, items: [...current.items, comment] }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
    },
  });
}
