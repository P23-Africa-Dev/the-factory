"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authorizeOutreachMailboxOAuth,
  connectOutreachMailboxSmtp,
  disconnectOutreachMailbox,
  fetchOutreachMailboxes,
  SalesEngineApiError,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_OUTREACH_SENDER_KEYS } from "@/hooks/use-sales-engine-outreach-sender";

export const SALES_ENGINE_OUTREACH_MAILBOX_KEYS = {
  all: ["sales-engine", "outreach", "mailboxes"] as const,
  list: () => ["sales-engine", "outreach", "mailboxes", "list"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useOutreachMailboxes(enabled = true) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_OUTREACH_MAILBOX_KEYS.list(),
    queryFn: async () => {
      try {
        return await fetchOutreachMailboxes();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: enabled && Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 30,
  });
}

export function useAuthorizeOutreachMailbox() {
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (provider: "google" | "microsoft" | "zoho") =>
      authorizeOutreachMailboxOAuth(provider),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useConnectOutreachMailboxSmtp() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: connectOutreachMailboxSmtp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_MAILBOX_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useDisconnectOutreachMailbox() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (id: number) => disconnectOutreachMailbox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_MAILBOX_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
