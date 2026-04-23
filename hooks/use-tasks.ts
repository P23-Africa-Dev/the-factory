"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  createTask,
  type ListTasksParams,
  type CreateTaskPayload,
  type TaskApiItem,
  type PaginationData,
} from "@/lib/api/tasks";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export const TASK_KEYS = {
  all: ["tasks"] as const,
  list: (params: ListTasksParams) => ["tasks", params] as const,
};

export type TasksResult = {
  tasks: TaskApiItem[];
  pagination: PaginationData;
};

export function useTasks(params: ListTasksParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: TASK_KEYS.list(params),
    queryFn: async (): Promise<TasksResult> => {
      const res = await listTasks(params, token);
      return {
        tasks: res.data.items,
        pagination: res.data.pagination,
      };
    },
    enabled: !!token && (!!params.company_id || !!params.project_id),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => createTask(payload, token),
    onSuccess: (res) => {
      // Invalidate the tasks queries to refresh the list
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.task);
    },
  });
}
