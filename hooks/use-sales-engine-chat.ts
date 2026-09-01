"use client";

import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useResetSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import {
  SalesEngineApiError,
  createChatSession,
  sendChatMessage,
  type ChatIntent,
  type SendChatMessageResult,
} from "@/lib/api/sales-engine";

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

/** True when the backend rejected the message because no ICP profile is active. */
export function isMissingActiveIcp(error: unknown): boolean {
  return error instanceof SalesEngineApiError && error.status === 422;
}

type SendMessageOptions = {
  onSuccess?: (result: SendChatMessageResult) => void;
  onError?: (error: unknown) => void;
};

/**
 * Sends a chat message, creating the session lazily on first use (one session per
 * page load — history isn't persisted or reloaded across visits).
 */
export function useSendChatMessage(options?: SendMessageOptions) {
  const resetAuth = useResetSalesEngineAuth();
  const sessionIdRef = useRef<number | null>(null);

  return useMutation({
    mutationFn: async ({ body, intent }: { body: string; intent: ChatIntent }) => {
      if (sessionIdRef.current == null) {
        const session = await createChatSession();
        sessionIdRef.current = session.id;
      }
      return sendChatMessage(sessionIdRef.current, { body, intent });
    },
    onSuccess: (result) => options?.onSuccess?.(result),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });
}
