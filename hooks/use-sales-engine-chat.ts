"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearChatMessages,
  createChatSession,
  fetchCurrentChatSession,
  listChatMessages,
  sendChatMessage,
  SalesEngineApiError,
  type ChatIntent,
  type ChatMessageApi,
  type SendChatMessageResult,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_ICP_KEYS } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";
import { SALES_ENGINE_OUTREACH_KEYS } from "@/hooks/use-sales-engine-outreach";

export const SALES_ENGINE_CHAT_KEYS = {
  all: ["sales-engine", "chat"] as const,
  history: (icpId: string | undefined) => ["sales-engine", "chat", "history", icpId] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

/** True when the backend rejected the message because no ICP profile is active. */
export function isMissingActiveIcp(error: unknown): boolean {
  return error instanceof SalesEngineApiError && error.status === 422;
}

export function mapApiMessagesToUi(messages: ChatMessageApi[]) {
  return messages.map((message, index) => ({
    id: index + 2,
    role: message.role,
    body: message.body,
    intent: message.intent,
    leads: message.leads ?? undefined,
  }));
}

const sessionIdsByIcp = new Map<string, number>();

export function useChatSessionManager() {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();

  const ensureSession = useCallback(
    async (icpProfileId?: string): Promise<number> => {
      if (!token) {
        throw new SalesEngineApiError("Sales Engine session is not ready.", 401);
      }

      const key = icpProfileId ?? "default";
      const cached = sessionIdsByIcp.get(key);
      if (cached) {
        return cached;
      }

      const existing = icpProfileId ? await fetchCurrentChatSession(icpProfileId) : await fetchCurrentChatSession();
      if (existing?.id) {
        sessionIdsByIcp.set(key, existing.id);

        return existing.id;
      }

      const created = await createChatSession(icpProfileId);
      sessionIdsByIcp.set(key, created.id);

      return created.id;
    },
    [token]
  );

  const setSessionId = useCallback((icpProfileId: string | undefined, sessionId: number) => {
    sessionIdsByIcp.set(icpProfileId ?? "default", sessionId);
  }, []);

  const clearSessionCache = useCallback((icpProfileId?: string) => {
    sessionIdsByIcp.delete(icpProfileId ?? "default");
  }, []);

  return { ensureSession, setSessionId, clearSessionCache, isAuthLoading, hasToken: Boolean(token) };
}

export function useChatHistory(icpProfileId?: string) {
  const { hasToken, isAuthLoading, setSessionId } = useChatSessionManager();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId),
    queryFn: async () => {
      if (!icpProfileId) {
        return { sessionId: null as number | null, messages: [] as ChatMessageApi[] };
      }

      try {
        const existing = await fetchCurrentChatSession(icpProfileId);
        if (!existing?.id) {
          const created = await createChatSession(icpProfileId);
          setSessionId(icpProfileId, created.id);

          return { sessionId: created.id, messages: [] as ChatMessageApi[] };
        }

        setSessionId(icpProfileId, existing.id);
        const messages = await listChatMessages(existing.id);

        return { sessionId: existing.id, messages };
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(hasToken) && !isAuthLoading && Boolean(icpProfileId),
    staleTime: 1000 * 30,
  });
}

type SendMessageVariables = {
  body: string;
  intent: ChatIntent;
};

type SendMessageOptions = {
  onSuccess?: (result: SendChatMessageResult) => void;
  onError?: (error: unknown) => void;
};

export function useSendChatMessage(icpProfileId?: string, options?: SendMessageOptions) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();
  const { ensureSession } = useChatSessionManager();
  const [processingStage, setProcessingStage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ body, intent }: SendMessageVariables) => {
      setProcessingStage(null);
      const sessionId = await ensureSession(icpProfileId);

      return sendChatMessage(sessionId, { body, intent }, {
        onStage: (label) => setProcessingStage(label),
      });
    },
    onSuccess: (result, variables) => {
      setProcessingStage(null);
      if (variables.intent === "generate_leads" || variables.intent === "quick_research") {
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ICP_KEYS.all });
      }
      if (variables.intent === "create_outreach") {
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
      }
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
      options?.onSuccess?.(result);
    },
    onError: (error) => {
      setProcessingStage(null);
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });

  return { ...mutation, processingStage };
}

export function useClearChatHistory(icpProfileId?: string) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();
  const { ensureSession, clearSessionCache } = useChatSessionManager();

  return useMutation({
    mutationFn: async () => {
      const sessionId = await ensureSession(icpProfileId);
      await clearChatMessages(sessionId);
      clearSessionCache(icpProfileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

/** @deprecated Use useChatSessionManager instead. */
export function useChatSession() {
  const manager = useChatSessionManager();

  return {
    ensureSession: () => manager.ensureSession(),
    isAuthLoading: manager.isAuthLoading,
    hasToken: manager.hasToken,
  };
}
