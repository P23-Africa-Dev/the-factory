"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInternalUser,
  getInternalUsersOnboardingStatus,
  listInternalUsers,
  listInternalUsersPaginated,
  updateInternalUser,
  type CreateInternalUserPayload,
  type CreatedInternalUser,
  type InternalOnboardingStatusData,
  type InternalUserListItem,
  type ListInternalUsersParams,
  type PaginatedInternalUsersData,
  type UpdateInternalUserPayload,
} from "@/lib/api/internal-users";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export const INTERNAL_USER_KEYS = {
  all: ["internal-users"] as const,
  list: (params: ListInternalUsersParams) => ["internal-users", params] as const,
  onboardingStatus: (companyId?: number | string) =>
    ["internal-users", "onboarding-status", companyId] as const,
};

export function useInternalUsers(params: ListInternalUsersParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: INTERNAL_USER_KEYS.list(params),
    queryFn: async (): Promise<InternalUserListItem[]> => {
      const res = await listInternalUsers(params, token);
      return res.data;
    },
    enabled: !!token && !!params.company_id,
    staleTime: 1000 * 60 * 2,
  });
}

export function useInternalUsersPaginated(params: ListInternalUsersParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["internal-users", "paginated", params] as const,
    queryFn: async (): Promise<PaginatedInternalUsersData> => {
      const res = await listInternalUsersPaginated(params, token);
      return res.data;
    },
    enabled: !!token && !!params.company_id,
    staleTime: 1000 * 60 * 2,
  });
}

export function useInternalUsersOnboardingStatus(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: INTERNAL_USER_KEYS.onboardingStatus(companyId),
    queryFn: async (): Promise<InternalOnboardingStatusData> => {
      const res = await getInternalUsersOnboardingStatus({ company_id: companyId }, token);
      return res.data;
    },
    enabled: !!token && !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateInternalUser(options?: {
  onSuccess?: (user: CreatedInternalUser) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateInternalUserPayload) =>
      createInternalUser(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
      options?.onSuccess?.(res.data.user);
    },
  });
}

export function useUpdateInternalUser() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number | string; payload: UpdateInternalUserPayload }) =>
      updateInternalUser(userId, payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
    },
  });
}
