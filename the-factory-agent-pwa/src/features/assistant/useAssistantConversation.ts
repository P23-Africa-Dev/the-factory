'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { appStore } from '@/lib/storage/stores';
import { useAuth } from '@/features/auth';
import { assistantApi } from './api';
import { resolveAssistantGeolocationContext } from './geolocation';
import {
  clearActiveThreadId,
  getActiveThreadId,
  setActiveThreadId,
} from './storage';
import type { AssistantMessage } from './types';

const PROCESSING_LABELS = [
  'Thinking...',
  'Analyzing...',
  'Sorting results...',
  'Preparing response...',
];

function processingLabelsForMessage(text: string): string[] {
  const normalized = text.toLowerCase();
  if (/\b(perform|performance|team|kpi|rank)\b/.test(normalized)) {
    return ['Thinking...', 'Analyzing team KPIs...', 'Ranking performers...'];
  }
  if (/\bplan\s+my\s+day\b/.test(normalized)) {
    return ['Thinking...', 'Reviewing your schedule...', 'Prioritizing actions...'];
  }
  if (/\b(crm|lead|follow[\s-]?up)\b/.test(normalized)) {
    return ['Thinking...', 'Scanning CRM records...', 'Sorting leads...'];
  }
  return PROCESSING_LABELS;
}

let messageSeq = 0;
function nextId(suffix: string): string {
  messageSeq += 1;
  return `${Date.now()}-${messageSeq}-${suffix}`;
}

/**
 * Centralizes the agent AI conversation lifecycle:
 * - restores the last active thread on mount / resume (Phases 4 & 6),
 * - sends messages to the backend copilot and appends replies (Phase 7 context
 *   is resolved server-side),
 * - clears the current thread or all threads (Phase 5).
 *
 * Chat state is kept in component state but always re-hydrated from the backend,
 * which is the durable source of truth, so a refresh or restart continues the
 * exact same conversation.
 */
export function useAssistantConversation() {
  const { user } = useAuth();
  const userId = user?.id;

  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(isAuthenticated);
  const [isSending, setIsSending] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);

  // Restore the most recent conversation on mount (and when the signed-in user
  // changes). Prefer the persisted active thread; otherwise fall back to the
  // newest thread from the server list.
  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) return;

    (async () => {
      setIsRestoring(true);
      try {
        let targetId = getActiveThreadId(userId);
        if (!targetId) {
          const threads = await assistantApi.listThreads();
          targetId = threads[0]?.thread_id ?? null;
        }
        if (targetId) {
          const detail = await assistantApi.getThread(targetId);
          if (cancelled) return;
          setThreadId(detail.thread_id);
          setMessages(detail.messages);
          setActiveThreadId(userId, detail.thread_id);
        }
      } catch {
        // No recoverable conversation — start fresh with the empty state.
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  // Reload the active thread when the app resumes from the background so a
  // conversation continued on another device/tab stays in sync.
  const threadIdRef = useRef<string | null>(null);
  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const current = threadIdRef.current;
      if (!current) return;
      assistantApi
        .getThread(current)
        .then((detail) => {
          setMessages(detail.messages);
        })
        .catch(() => undefined);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated]);

  const send = useCallback(
    async (
      text: string,
      options?: {
        withGeolocation?: boolean;
        context?: {
          latitude?: number;
          longitude?: number;
          focus?: 'all' | 'visits' | 'followups' | 'tasks';
          limit?: number;
        };
      },
    ) => {
      const content = text.trim();
      if (!content || isSending) return;

      const userMsg: AssistantMessage = {
        id: nextId('user'),
        role: 'user',
        content,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);

      const labels = processingLabelsForMessage(content);
      let labelIndex = 0;
      setProcessingLabel(labels[0] ?? 'Thinking...');
      const labelTimer = window.setInterval(() => {
        labelIndex = (labelIndex + 1) % labels.length;
        setProcessingLabel(labels[labelIndex] ?? 'Thinking...');
      }, 900);

      try {
        const geoContext = options?.withGeolocation
          ? await resolveAssistantGeolocationContext()
          : undefined;
        const context = geoContext
          ? { ...geoContext, ...options?.context }
          : options?.context;
        const result = await assistantApi.sendMessage({
          message: content,
          threadId,
          context,
        });
        const aiMsg: AssistantMessage = {
          id: nextId('ai'),
          role: 'assistant',
          content: result.content || 'I could not generate a response. Please try rephrasing.',
          sources: result.sources,
          tool: result.tool,
          payload: result.payload,
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (result.thread_id) {
          setThreadId(result.thread_id);
          setActiveThreadId(userId, result.thread_id);
        }
      } catch {
        // Surface a recoverable error in-thread; the Axios interceptor already
        // shows a toast for non-401 failures.
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('err'),
            role: 'assistant',
            content: "Sorry, I couldn't reach the assistant just now. Please try again.",
            failed: true,
          },
        ]);
      } finally {
        window.clearInterval(labelTimer);
        setProcessingLabel(null);
        setIsSending(false);
      }
    },
    [threadId, isSending, userId],
  );

  const runPlanMyDay = useCallback(() => {
    return send('Plan my day', {
      withGeolocation: true,
      context: { focus: 'all', limit: 15 },
    });
  }, [send]);

  const clearCurrent = useCallback(async () => {
    const current = threadId;
    setMessages([]);
    setThreadId(null);
    clearActiveThreadId(userId);
    if (current) {
      try {
        await assistantApi.deleteThread(current);
      } catch {
        // Best-effort: local state is already reset for the user.
      }
    }
  }, [threadId, userId]);

  const clearAll = useCallback(async () => {
    setMessages([]);
    setThreadId(null);
    clearActiveThreadId(userId);
    try {
      await assistantApi.deleteAllThreads();
    } catch {
      // Best-effort.
    }
  }, [userId]);

  return {
    messages,
    threadId,
    isRestoring,
    isSending,
    processingLabel,
    send,
    runPlanMyDay,
    clearCurrent,
    clearAll,
  };
}
