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
import type { AssistantMessage, ThreadSummary } from './types';
import {
  labelsForMessage,
  PROCESSING_LABEL_INTERVAL_MS,
} from '@/lib/ely-processing-labels';

let messageSeq = 0;
function nextId(suffix: string): string {
  messageSeq += 1;
  return `${Date.now()}-${messageSeq}-${suffix}`;
}

/** True when the server says the chat is gone (deleted, or not this user's). */
function isMissingThread(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 404 || status === 403;
}

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
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  // Bumped on every switch / new chat so a slow load can't overwrite a newer choice.
  const loadSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) return;

    (async () => {
      setIsRestoring(true);
      const seq = loadSeqRef.current;
      const isStale = () => cancelled || seq !== loadSeqRef.current;
      try {
        let list: ThreadSummary[] | null = null;
        const loadList = async (): Promise<ThreadSummary[]> => {
          const loaded = await assistantApi.listThreads();
          list = loaded;
          if (!isStale()) setThreads(loaded);
          return loaded;
        };

        let detail: Awaited<ReturnType<typeof assistantApi.getThread>> | null = null;
        const savedId = getActiveThreadId(userId);
        if (savedId) {
          try {
            detail = await assistantApi.getThread(savedId);
          } catch (err) {
            if (!isMissingThread(err)) throw err;
            // The saved chat was deleted (here or on another device): forget it
            // and fall back to the newest chat instead of an empty screen.
            clearActiveThreadId(userId);
          }
        }
        if (!detail) {
          const newest = (await loadList()).find((t) => t.thread_id !== savedId);
          if (newest) detail = await assistantApi.getThread(newest.thread_id);
        }
        if (isStale()) return;
        if (detail) {
          setThreadId(detail.thread_id);
          setMessages(detail.messages);
          setActiveThreadId(userId, detail.thread_id);
        }
        if (!list) void loadList().catch(() => undefined);
      } catch {
        // No recoverable conversation — start fresh with the empty state.
      } finally {
        if (!isStale()) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

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
        actionConfirmed?: boolean;
        actionArgs?: Record<string, unknown> | null;
        idempotencyKey?: string;
        context?: {
          latitude?: number;
          longitude?: number;
          focus?: 'all' | 'visits' | 'followups' | 'tasks';
          limit?: number;
          attachment?: { id: string; name: string };
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

      const labels = labelsForMessage(content);
      let labelIndex = 0;
      setProcessingLabel(labels[0] ?? 'Thinking...');
      const labelTimer = window.setInterval(() => {
        labelIndex = (labelIndex + 1) % labels.length;
        setProcessingLabel(labels[labelIndex] ?? 'Thinking...');
      }, PROCESSING_LABEL_INTERVAL_MS);

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
          actionConfirmed: options?.actionConfirmed,
          actionArgs: options?.actionArgs,
          idempotencyKey: options?.idempotencyKey,
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
          // A first message starts a new chat on the server: list it.
          if (result.thread_id !== threadId) {
            assistantApi.listThreads().then(setThreads).catch(() => undefined);
          }
        }
      } catch {
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
    return send('Plan team operations for today', {
      withGeolocation: true,
      context: { focus: 'all', limit: 15 },
    });
  }, [send]);

  const confirmAction = useCallback(
    (actionLabel: string, actionArgs: Record<string, unknown>) => {
      return send(`Confirm action: ${actionLabel}`, {
        actionConfirmed: true,
        actionArgs,
        idempotencyKey: `confirm-${Date.now()}`,
      });
    },
    [send],
  );

  /** Undoes an action ELY ran (the receipt's Undo button). Resolves true when undone. */
  const undoAction = useCallback(async (auditId: number): Promise<boolean> => {
    try {
      const result = await assistantApi.undoAction(auditId);
      if (result.content) {
        setMessages((prev) => [...prev, { id: nextId('ai'), role: 'assistant', content: result.content }]);
      }
      return result.undone;
    } catch {
      return false;
    }
  }, []);

  /** Cancels the waiting action on the server, so it can't run later. */
  const cancelAction = useCallback(async (pendingActionId: string) => {
    try {
      const reply = await assistantApi.cancelAction(pendingActionId);
      setMessages((prev) => [...prev, { id: nextId('ai'), role: 'assistant', content: reply }]);
    } catch {
      // Already done, cancelled or expired: nothing is left to cancel.
    }
  }, []);

  /** Adds an ELY reply that came from outside the chat (e.g. the weekly summary job). */
  const appendAssistantMessage = useCallback((content: string, failed = false) => {
    setMessages((prev) => [...prev, { id: nextId(failed ? 'err' : 'ai'), role: 'assistant', content, failed }]);
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await assistantApi.listThreads());
    } catch {
      // Keep the list we have.
    }
  }, []);

  /** Opens another chat. Resolves false (and changes nothing) if it can't be loaded. */
  const switchThread = useCallback(
    async (id: string): Promise<boolean> => {
      if (!id || id === threadId) return true;
      loadSeqRef.current += 1;
      const seq = loadSeqRef.current;
      setIsRestoring(true);
      try {
        const detail = await assistantApi.getThread(id);
        // A newer switch or new chat won; that is not a failure.
        if (seq !== loadSeqRef.current) return true;
        setThreadId(detail.thread_id);
        setMessages(detail.messages);
        setActiveThreadId(userId, detail.thread_id);
        return true;
      } catch (err) {
        if (isMissingThread(err)) {
          setThreads((prev) => prev.filter((t) => t.thread_id !== id));
        }
        return false;
      } finally {
        if (seq === loadSeqRef.current) setIsRestoring(false);
      }
    },
    [threadId, userId],
  );

  /** Starts an empty chat; the server creates it with the first message. Deletes nothing. */
  const startNewChat = useCallback(() => {
    loadSeqRef.current += 1;
    setIsRestoring(false);
    setMessages([]);
    setThreadId(null);
    clearActiveThreadId(userId);
  }, [userId]);

  /** Deletes the open chat and leaves an empty new chat. */
  const clearCurrent = useCallback(async () => {
    const current = threadId;
    loadSeqRef.current += 1;
    setIsRestoring(false);
    if (current) setThreads((prev) => prev.filter((t) => t.thread_id !== current));
    setMessages([]);
    setThreadId(null);
    clearActiveThreadId(userId);
    if (current) {
      try {
        await assistantApi.deleteThread(current);
      } catch {
        // Best-effort
      }
    }
  }, [threadId, userId]);

  const clearAll = useCallback(async () => {
    loadSeqRef.current += 1;
    setIsRestoring(false);
    setThreads([]);
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
    confirmAction,
    cancelAction,
    undoAction,
    runPlanMyDay,
    clearCurrent,
    clearAll,
    threads,
    refreshThreads,
    switchThread,
    startNewChat,
    appendAssistantMessage,
  };
}
