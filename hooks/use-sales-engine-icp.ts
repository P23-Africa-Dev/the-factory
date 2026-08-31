"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "@/lib/api/onboarding";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import {
  activateIcpProfile,
  createIcpProfile,
  deleteIcpProfile,
  duplicateIcpProfile,
  getActiveIcpProfile,
  listIcpProfiles,
  updateIcpProfile,
  type IcpProfilePayload,
} from "@/lib/api/sales-engine";
import type { IcpProfile } from "@/components/sales-engine/icp-builder-modal";

export const SALES_ENGINE_ICP_KEYS = {
  all: ["sales-engine", "icp-profiles"] as const,
  list: () => ["sales-engine", "icp-profiles", "list"] as const,
  active: () => ["sales-engine", "icp-profiles", "active"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}

export function useIcpProfiles() {
  const { data: token, isLoading: isAuthLoading, error: authError } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  const query = useQuery({
    queryKey: SALES_ENGINE_ICP_KEYS.list(),
    queryFn: async (): Promise<IcpProfile[]> => {
      try {
        return await listIcpProfiles(token as string);
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 60,
  });

  return { ...query, isAuthLoading, authError };
}

export function useActiveIcpProfile() {
  const { data: token, isLoading: isAuthLoading, error: authError } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  const query = useQuery({
    queryKey: SALES_ENGINE_ICP_KEYS.active(),
    queryFn: async (): Promise<IcpProfile | null> => {
      try {
        return await getActiveIcpProfile(token as string);
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 60,
  });

  return { ...query, isAuthLoading, authError };
}

type MutationOptions<TData> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: unknown) => void;
};

function useIcpMutation<TVariables, TData>(
  mutationFn: (variables: TVariables, token: string) => Promise<TData>,
  options?: MutationOptions<TData>
) {
  const queryClient = useQueryClient();
  const { data: token } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (variables: TVariables) => {
      if (!token) {
        return Promise.reject(new Error("Sales Engine session isn't ready yet. Please retry in a moment."));
      }
      return mutationFn(variables, token);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ICP_KEYS.all });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });
}

export function useCreateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<IcpProfilePayload, IcpProfile>(
    (payload, token) => createIcpProfile(payload, token),
    options
  );
}

export function useUpdateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<{ id: string; payload: Partial<IcpProfilePayload> }, IcpProfile>(
    ({ id, payload }, token) => updateIcpProfile(id, payload, token),
    options
  );
}

export function useDeleteIcpProfile(options?: MutationOptions<null>) {
  return useIcpMutation<string, null>((id, token) => deleteIcpProfile(id, token), options);
}

export function useActivateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<string, IcpProfile>((id, token) => activateIcpProfile(id, token), options);
}

export function useDuplicateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<string, IcpProfile>((id, token) => duplicateIcpProfile(id, token), options);
}
