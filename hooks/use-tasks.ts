"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  createTask,
  getTask,
  assignTask,
  updateTaskStatus,
  createSelfTask,
  uploadTaskProof,
  type ListTasksParams,
  type CreateTaskPayload,
  type CreateSelfTaskPayload,
  type AssignTaskPayload,
  type UpdateTaskStatusPayload,
  type TaskApiItem,
  type PaginationData,
} from "@/lib/api/tasks";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export const TASK_KEYS = {
  all: ["tasks"] as const,
  list: (params: ListTasksParams) => ["tasks", params] as const,
  detail: (taskId: number | string, companyId?: number | string) =>
    ["tasks", "detail", taskId, companyId] as const,
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

export function useTaskDetail(taskId: number | string, companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: TASK_KEYS.detail(taskId, companyId),
    queryFn: async () => (await getTask(taskId, { company_id: companyId }, token)).data.task,
    enabled: !!token && !!taskId,
  });
}

export function useAssignTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number | string; payload: AssignTaskPayload }) =>
      assignTask(taskId, payload, token),
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

export function useUploadTaskProof(options?: {
  onSuccess?: (proof: { id: number; file_url: string | null }) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({ taskId, formData }: { taskId: number | string; formData: FormData }) =>
      uploadTaskProof(taskId, formData, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.proof);
    },
  });
}
