"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  fetchInternalUsers,
  type ListProjectsParams,
  type CreateProjectPayload,
  type UpdateProjectPayload,
  type ProjectsListData,
  type ProjectDetailData,
  type PaginationData,
  type InternalUser,
  type InternalUsersParams,
} from "@/lib/api/projects";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { mapApiProject } from "@/types/operations";
import type { Project } from "@/types/operations";

export const PROJECT_KEYS = {
  all: ["projects"] as const,
  list: (params: ListProjectsParams) => ["projects", params] as const,
  detail: (id: number | string) => ["project", id] as const,
};

export const INTERNAL_USER_KEYS = {
  all: ["internal-users"] as const,
  list: (params: InternalUsersParams) => ["internal-users", params] as const,
};

// ─── List ─────────────────────────────────────────────────────────────────────

export type ProjectsResult = {
  projects: Project[];
  pagination: PaginationData;
};

export function useProjects(params: ListProjectsParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PROJECT_KEYS.list(params),
    queryFn: async (): Promise<ProjectsResult> => {
      const res = await listProjects(params, token);
      return {
        projects: res.data.items.map(mapApiProject),
        pagination: res.data.pagination,
      };
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Single ───────────────────────────────────────────────────────────────────

export function useProject(id: number | string | null | undefined) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PROJECT_KEYS.detail(id ?? ""),
    queryFn: async (): Promise<Project> => {
      const res = await getProject(id!, token);
      return mapApiProject(res.data.project);
    },
    enabled: !!token && !!id,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateProject(options?: { onSuccess?: (project: Project) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => createProject(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      options?.onSuccess?.(mapApiProject(res.data.project));
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateProject(
  id: number | string,
  options?: { onSuccess?: (project: Project) => void }
) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) => updateProject(id, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.detail(id) });
      options?.onSuccess?.(mapApiProject(res.data.project));
    },
  });
}

// ─── Internal Users (supervisors for project lead) ────────────────────────────

export function useInternalUsers(params: InternalUsersParams = { role: "supervisor" }) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: INTERNAL_USER_KEYS.list(params),
    queryFn: async (): Promise<InternalUser[]> => {
      const res = await fetchInternalUsers(params, token);
      return res.data;
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  });
}

