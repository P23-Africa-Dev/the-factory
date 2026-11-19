"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignInternalUserSupervisor,
  createCompanyZone,
  createInternalUser,
  deleteCompanyZone,
  getInternalUsersOnboardingStatus,
  listCompanyZones,
  listInternalUsers,
  listInternalUsersPaginated,
  listSupervisorCandidates,
  updateCompanyZone,
  updateInternalUser,
  type CreateCompanyZonePayload,
  type CreateInternalUserPayload,
  type CreatedInternalUser,
  type InternalOnboardingStatusData,
  type InternalUserListItem,
  type CompanyZoneOption,
  type ListInternalUsersParams,
  type PaginatedInternalUsersData,
  type SupervisorCandidate,
  type UpdateCompanyZonePayload,
  type UpdateInternalUserPayload,
} from "@/lib/api/internal-users";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

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
    enabled: hasActiveApiSession(token) && !!params.company_id,
    staleTime: 1000 * 60 * 2,
  });
}

export function useInternalUsersPaginated(
  params: ListInternalUsersParams = {},
  options?: { refetchInterval?: number | false },
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["internal-users", "paginated", params] as const,
    queryFn: async (): Promise<PaginatedInternalUsersData> => {
      const res = await listInternalUsersPaginated(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!params.company_id,
    staleTime: 1000 * 60 * 2,
    refetchInterval: options?.refetchInterval,
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
    enabled: hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

/** Owners, admins and supervisors who can supervise an agent. */
export function useSupervisorCandidates(companyId?: number | string, enabled = true) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["internal-users", "supervisor-candidates", companyId] as const,
    queryFn: async (): Promise<SupervisorCandidate[]> => {
      const res = await listSupervisorCandidates(companyId as number | string, token);
      return res.data;
    },
    enabled: enabled && hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useAssignInternalUserSupervisor() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      userId,
      companyId,
      supervisorUserId,
    }: {
      userId: number | string;
      companyId: number | string;
      supervisorUserId: number;
    }) =>
      assignInternalUserSupervisor(
        userId,
        { company_id: companyId, supervisor_user_id: supervisorUserId },
        token
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
    },
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
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
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

export function useCompanyZones(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["company-zones", companyId] as const,
    queryFn: async (): Promise<CompanyZoneOption[]> => {
      const res = await listCompanyZones({ company_id: companyId, is_active: 1 }, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateCompanyZone(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateCompanyZonePayload) => createCompanyZone(payload, token),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ["company-zones", payload.company_id] });
      options?.onSuccess?.();
    },
  });
}

export function useUpdateCompanyZone(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ zoneId, payload }: { zoneId: number | string; payload: UpdateCompanyZonePayload }) =>
      updateCompanyZone(zoneId, payload, token),
    onSuccess: (_, { payload }) => {
      queryClient.invalidateQueries({ queryKey: ["company-zones", payload.company_id] });
      options?.onSuccess?.();
    },
  });
}

export function useDeleteCompanyZone(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ zoneId, companyId }: { zoneId: number | string; companyId: number | string }) =>
      deleteCompanyZone(zoneId, companyId, token),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ["company-zones", companyId] });
      options?.onSuccess?.();
    },
  });
}
