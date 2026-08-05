"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  classifyAgentFieldStop,
  getAgentPendingReview,
} from "@/lib/api/field-activity";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";

export const AGENT_FIELD_REVIEW_KEYS = {
  pending: ["agent-field-activity", "pending-review"] as const,
};

export function useAgentPendingReview(enabled = true) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: [...AGENT_FIELD_REVIEW_KEYS.pending, apiCompanyId],
    queryFn: async () => {
      const res = await getAgentPendingReview(
        { company_id: apiCompanyId ?? undefined },
        token,
      );
      return res.data;
    },
    enabled: enabled && hasActiveApiSession(token) && !!apiCompanyId,
    refetchInterval: 60_000,
  });
}

export function useClassifyAgentFieldStop() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (args: {
      stopId: number;
      classification: string;
      lead_id?: number;
    }) =>
      classifyAgentFieldStop(
        args.stopId,
        {
          company_id: apiCompanyId ?? undefined,
          classification: args.classification,
          lead_id: args.lead_id,
          source: "agent",
        },
        token,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AGENT_FIELD_REVIEW_KEYS.pending });
      void queryClient.invalidateQueries({ queryKey: ["field-journeys"] });
    },
  });
}
