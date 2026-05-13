"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPayroll,
  createPayroll,
  updatePayroll,
  type PayrollSettings,
  type CreatePayrollPayload,
  type UpdatePayrollPayload,
} from "@/lib/api/payroll";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export const PAYROLL_KEYS = {
  all: ["payroll"] as const,
  detail: (companyId: number | string) => ["payroll", companyId] as const,
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
