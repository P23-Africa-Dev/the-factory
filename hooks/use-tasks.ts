"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  createTask,
  getTask,
  updateTaskStatus,
  reassignTask,
  createSelfTask,
  uploadTaskProof,
  type ListTasksParams,
  type CreateTaskPayload,
  type UpdateTaskStatusPayload,
  type ReassignTaskPayload,
  type CreateSelfTaskPayload,
  type UploadProofPayload,
  type TaskApiItem,
  type PaginationData,
} from "@/lib/api/tasks";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export const TASK_KEYS = {
  all: ["tasks"] as const,
  list: (params: ListTasksParams) => ["tasks", "list", params] as const,
  detail: (taskId: number | string) => ["tasks", "detail", taskId] as const,
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

export function useTask(taskId: number | string | null, companyId: number | string | null) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: TASK_KEYS.detail(taskId ?? ""),
    queryFn: async (): Promise<TaskApiItem> => {
      const res = await getTask(taskId!, companyId!, token);
      return res.data.task;
    },
    enabled: !!token && !!taskId && !!companyId,
    staleTime: 1000 * 30,
  });
}

export function useCreateTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => createTask(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useUpdateTaskStatus(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: UpdateTaskStatusPayload;
    }) => updateTaskStatus(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useReassignTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: ReassignTaskPayload;
    }) => reassignTask(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useCreateSelfTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateSelfTaskPayload) => createSelfTask(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useUploadTaskProof(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: UploadProofPayload;
    }) => uploadTaskProof(taskId, payload, token),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.detail(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.();
    },
  });
}
