"use client";

import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChatSession,
  sendChatMessage,
  SalesEngineApiError,
  type ChatIntent,
  type SendChatMessageResult,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_ICP_KEYS } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";
import { SALES_ENGINE_OUTREACH_KEYS } from "@/hooks/use-sales-engine-outreach";

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

/** True when the backend rejected the message because no ICP profile is active. */
export function isMissingActiveIcp(error: unknown): boolean {
  return error instanceof SalesEngineApiError && error.status === 422;
}

export function useChatSession() {
  const sessionIdRef = useRef<number | null>(null);
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();

  const ensureSession = useCallback(async (): Promise<number> => {
    if (sessionIdRef.current !== null) {
      return sessionIdRef.current;
    }
    if (!token) {
      throw new SalesEngineApiError("Sales Engine session is not ready.", 401);
    }
    const session = await createChatSession();
    sessionIdRef.current = session.id;
    return session.id;
  }, [token]);

  return { ensureSession, isAuthLoading, hasToken: Boolean(token) };
}

type SendMessageVariables = {
  body: string;
  intent: ChatIntent;
};

type SendMessageOptions = {
  onSuccess?: (result: SendChatMessageResult) => void;
  onError?: (error: unknown) => void;
};

export function useSendChatMessage(options?: SendMessageOptions) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();
  const { ensureSession } = useChatSession();

  return useMutation({
    mutationFn: async ({ body, intent }: SendMessageVariables) => {
      const sessionId = await ensureSession();
      return sendChatMessage(sessionId, { body, intent });
    },
    onSuccess: (result, variables) => {
      if (variables.intent === "generate_leads" || variables.intent === "quick_research") {
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ICP_KEYS.all });
      }
      if (variables.intent === "create_outreach") {
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
      }
      options?.onSuccess?.(result);
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });
}
