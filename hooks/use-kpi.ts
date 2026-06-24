"use client";

import { useMutation } from "@tanstack/react-query";
import { createKpi, type CreateKpiPayload, type KpiItem } from "@/lib/api/kpi";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export function useCreateKpi(options?: { onSuccess?: (kpi: KpiItem) => void }) {
  return useMutation({
    mutationFn: (payload: CreateKpiPayload) => {
      const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
      return createKpi(payload, token);
    },
    onSuccess: (res) => {
      options?.onSuccess?.(res.data.kpi);
    },
  });
}
