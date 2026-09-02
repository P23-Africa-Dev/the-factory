"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFactory23IntegrationStatus } from "@/lib/api/sales-engine";

export const FACTORY23_INTEGRATION_STATUS_KEY = ["sales-engine", "factory23-integration-status"] as const;

export function useFactory23IntegrationStatus() {
  return useQuery({
    queryKey: FACTORY23_INTEGRATION_STATUS_KEY,
    queryFn: fetchFactory23IntegrationStatus,
    staleTime: 60_000,
    retry: 1,
  });
}
