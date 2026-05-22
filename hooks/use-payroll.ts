"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPayrollOverview,
  getPayrollAgents,
  getPayrollAgentProfile,
  getPayroll,
  createPayroll,
  updatePayroll,
  updatePayrollAgent,
  type PayrollSettings,
  type CreatePayrollPayload,
  type UpdatePayrollPayload,
  type PayrollOverview,
  type PayrollAgentListParams,
  type PayrollAgentListResponse,
  type PayrollAgentProfile,
  type PayrollOverviewParams,
  type PayrollAgentProfileParams,
  type UpdateAgentPayrollPayload,
} from "@/lib/api/payroll";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export const PAYROLL_KEYS = {
  all: ["payroll"] as const,
  detail: (companyId: number | string) => ["payroll", companyId] as const,
  overview: (params: PayrollOverviewParams) => ["payroll", "overview", params] as const,
  agents: (params: PayrollAgentListParams) => ["payroll", "agents", params] as const,
  agentProfile: (userId: number | string, params: PayrollAgentProfileParams) => ["payroll", "agent", userId, params] as const,
};

export function usePayroll(companyId: number | string | null | undefined) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PAYROLL_KEYS.detail(companyId ?? ""),
    queryFn: async (): Promise<PayrollSettings | null> => {
      const res = await getPayroll(companyId!, token);
      return res.data.payroll;
    },
    enabled: !!token && !!companyId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreatePayroll(options?: {
  onSuccess?: (payroll: PayrollSettings | null) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreatePayrollPayload) => createPayroll(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PAYROLL_KEYS.all });
      options?.onSuccess?.(res.data.payroll);
    },
  });
}

export function useUpdatePayroll(
  id: number | undefined,
  options?: { onSuccess?: (payroll: PayrollSettings | null) => void }
) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: UpdatePayrollPayload) => {
      if (!id) throw new Error("Payroll ID is required for update.");
      return updatePayroll(id, payload, token);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PAYROLL_KEYS.all });
      options?.onSuccess?.(res.data.payroll);
    },
  });
}

export function usePayrollOverview(params: PayrollOverviewParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PAYROLL_KEYS.overview(params),
    queryFn: async (): Promise<PayrollOverview> => {
      const res = await getPayrollOverview(params, token);
      return res.data;
    },
    enabled: !!token && !!params.company_id,
    staleTime: 1000 * 60,
  });
}

export function usePayrollAgents(params: PayrollAgentListParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PAYROLL_KEYS.agents(params),
    queryFn: async (): Promise<PayrollAgentListResponse> => {
      const res = await getPayrollAgents(params, token);
      return res.data;
    },
    enabled: !!token && !!params.company_id,
    staleTime: 1000 * 60,
  });
}

export function usePayrollAgentProfile(userId: number | string | null | undefined, params: PayrollAgentProfileParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: userId ? PAYROLL_KEYS.agentProfile(userId, params) : ["payroll", "agent", "missing"] as const,
    queryFn: async (): Promise<PayrollAgentProfile> => {
      const res = await getPayrollAgentProfile(userId!, params, token);
      return res.data;
    },
    enabled: !!token && !!userId && !!params.company_id,
    staleTime: 1000 * 60,
  });
}

export function useUpdateAgentPayroll(userId: number | string | undefined, options?: { onSuccess?: (profile: PayrollAgentProfile) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: UpdateAgentPayrollPayload) => {
      if (!userId) throw new Error("User ID is required for agent payroll update.");
      return updatePayrollAgent(userId, payload, token);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PAYROLL_KEYS.all });
      options?.onSuccess?.(res.data);
    },
  });
}
