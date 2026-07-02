"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import {
  createSavedLocation,
  deleteSavedLocation,
  listSavedLocations,
  updateSavedLocation,
  type ApiRoleBasePath,
  type CreateSavedLocationPayload,
  type ListSavedLocationsParams,
  type SavedLocation,
  type UpdateSavedLocationPayload,
} from "@/lib/api/saved-locations";
import { CRM_KEYS } from "@/hooks/use-crm";

export const SAVED_LOCATION_KEYS = {
  all: ["saved-locations"] as const,
  list: (companyId: number | string | undefined, params: ListSavedLocationsParams) =>
    ["saved-locations", "list", companyId, params] as const,
};

const MANAGEMENT_ROLES = ["owner", "admin", "supervisor"];

export type SavedLocationPermissions = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function useSavedLocationPermissions(): SavedLocationPermissions {
  const user = useAuthStore((s) => s.user);
  return useMemo(() => {
    const role = (getActiveCompanyContext(user).role ?? "").toLowerCase();
    const isManagement = MANAGEMENT_ROLES.includes(role);
    return {
      canCreate: isManagement || role === "agent",
      canEdit: isManagement || role === "agent",
      canDelete: role === "owner" || role === "admin",
    };
  }, [user]);
}

export function useSavedLocations(params: ListSavedLocationsParams = {}) {
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const context = getActiveCompanyContext(user);
  const companyId = params.company_id ?? context.apiCompanyId ?? undefined;
  const basePath: ApiRoleBasePath =
    (context.role ?? "").toLowerCase() === "agent" ? "/agent" : "/admin";

  const queryParams: ListSavedLocationsParams = { ...params, company_id: companyId };

  return useQuery({
    queryKey: SAVED_LOCATION_KEYS.list(companyId, queryParams),
    queryFn: async (): Promise<SavedLocation[]> => {
      const res = await listSavedLocations(queryParams, token, basePath);
      return res.data.items;
    },
    enabled: !!token && !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

function useCompanyContextValues() {
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const context = getActiveCompanyContext(user);
  const basePath: ApiRoleBasePath =
    (context.role ?? "").toLowerCase() === "agent" ? "/agent" : "/admin";
  return { token, companyId: context.apiCompanyId ?? undefined, basePath };
}

export function useCreateSavedLocation(options?: { onSuccess?: (location: SavedLocation) => void }) {
  const queryClient = useQueryClient();
  const { token, companyId, basePath } = useCompanyContextValues();

  return useMutation({
    mutationFn: (payload: Omit<CreateSavedLocationPayload, "company_id"> & { company_id?: number | string }) =>
      createSavedLocation(
        { ...payload, company_id: payload.company_id ?? (companyId as number | string) },
        token,
        basePath
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
      if (res.data.location.linked_to_crm || res.data.location.crm_lead_id) {
        queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
      }
      options?.onSuccess?.(res.data.location);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to save location.");
    },
  });
}

export function useUpdateSavedLocation(options?: {
  onSuccess?: (location: SavedLocation) => void;
  onError?: (error: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const { token, companyId, basePath } = useCompanyContextValues();

  return useMutation({
    mutationFn: ({
      locationId,
      payload,
    }: {
      locationId: number | string;
      payload: UpdateSavedLocationPayload;
    }) =>
      updateSavedLocation(
        locationId,
        { company_id: companyId as number | string, ...payload },
        token,
        basePath
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
      if (res.data.location.linked_to_crm || res.data.location.crm_lead_id) {
        queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
      }
      options?.onSuccess?.(res.data.location);
    },
    onError: (err: unknown) => {
      if (options?.onError) {
        options.onError(err);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update location.");
    },
  });
}

export function useDeleteSavedLocation(options?: { onSuccess?: (deletedId: number) => void }) {
  const queryClient = useQueryClient();
  const { token, companyId, basePath } = useCompanyContextValues();

  return useMutation({
    mutationFn: (locationId: number | string) =>
      deleteSavedLocation(locationId, { company_id: companyId as number | string }, token, basePath),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
      options?.onSuccess?.(res.data.deleted_location_id);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete location.");
    },
  });
}
