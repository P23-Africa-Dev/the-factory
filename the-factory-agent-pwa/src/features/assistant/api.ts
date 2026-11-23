/**
 * AI Assistant (ELY) API client — talks to the shared Laravel copilot endpoints
 * (`/copilot/*`) using the same bearer-token Axios client as every other agent
 * feature. Conversations are scoped server-side by the authenticated user +
 * company, so no cross-user access is possible.
 *
 * Agent role note: the server decides which actions an agent may take. Risky
 * ones (sending an email, deleting a task) come back with
 * `confirmation_required`; the app shows a card, and Confirm re-sends the chat
 * with `action_confirmed` while Cancel calls `/copilot/actions/{id}/cancel`.
 */
import { client } from '@/lib/api/client';
import { flattenApiError } from '@/lib/api/errors';
import { getActiveCompanyId } from '@/lib/storage/stores';
import type { AssistantMessage, SendMessageResult, ThreadDetail, ThreadSummary } from './types';

function resolveTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function companyQuery(): string {
  const id = getActiveCompanyId();
  return id != null ? `?company_id=${encodeURIComponent(String(id))}` : '';
}

function unwrap(data: unknown): Record<string, unknown> {
  const body = (data ?? {}) as Record<string, unknown>;
  if (body.data && typeof body.data === 'object') {
    return body.data as Record<string, unknown>;
  }
  return body;
}

export const assistantApi = {
  sendMessage: async (params: {
    message: string;
    threadId?: string | null;
    context?: {
      latitude?: number;
      longitude?: number;
      focus?: 'all' | 'visits' | 'followups' | 'tasks';
      limit?: number;
      /** A CSV attached with attachFile (e.g. leads to import). */
      attachment?: { id: string; name: string };
    };
    actionConfirmed?: boolean;
    actionArgs?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<SendMessageResult> => {
    const companyId = getActiveCompanyId();
    const res = await client.post('/copilot/chat', {
      message: params.message,
      company_id: companyId ?? undefined,
      thread_id: params.threadId ?? undefined,
      client_timezone: resolveTimezone(),
      context: params.context,
      action_confirmed: params.actionConfirmed ?? undefined,
      action_args: params.actionArgs ?? undefined,
      idempotency_key: params.idempotencyKey ?? undefined,
      stream: false,
    });
    const data = unwrap(res.data);
    const response = (data.response && typeof data.response === 'object'
      ? data.response
      : {}) as Record<string, unknown>;
    return {
      thread_id: String(data.thread_id ?? params.threadId ?? ''),
      content: String(response.content ?? ''),
      sources: Array.isArray(response.sources) ? (response.sources as string[]) : [],
      tool: (response.tool as string | null) ?? null,
      payload:
        response.payload && typeof response.payload === 'object'
          ? (response.payload as Record<string, unknown>)
          : null,
    };
  },

  /** Turns a voice note into text. Throws with a readable message on failure. */
  transcribeVoice: async (file: File): Promise<string> => {
    const companyId = getActiveCompanyId();
    const formData = new FormData();
    formData.append('audio', file);
    if (companyId != null) formData.append('company_id', String(companyId));
    let data: Record<string, unknown>;
    try {
      const res = await client.post('/copilot/voice/transcriptions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        suppressErrorToast: true,
      });
      data = unwrap(res.data);
    } catch (err) {
      throw new Error(flattenApiError(err) || 'Could not transcribe that recording. Please try again.');
    }
    const transcript = String(data.transcript ?? '').trim();
    if (!transcript) {
      throw new Error(String(data.error ?? 'No speech was detected. Try again, closer to the microphone.'));
    }
    return transcript;
  },

  /** Attaches a CSV to the chat; ELY can then import it when asked. */
  attachFile: async (file: File): Promise<{ id: string; name: string }> => {
    const companyId = getActiveCompanyId();
    const formData = new FormData();
    formData.append('file', file);
    if (companyId != null) formData.append('company_id', String(companyId));
    const res = await client.post('/copilot/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const attachment = (unwrap(res.data).attachment ?? {}) as Record<string, unknown>;
    return { id: String(attachment.id ?? ''), name: String(attachment.name ?? file.name) };
  },

  /** Undoes an action ELY ran. Returns ELY's reply and whether it was undone. */
  undoAction: async (auditId: number): Promise<{ content: string; undone: boolean }> => {
    const companyId = getActiveCompanyId();
    const res = await client.post(`/copilot/actions/undo/${encodeURIComponent(String(auditId))}`, {
      company_id: companyId ?? undefined,
    });
    const response = (unwrap(res.data).response ?? {}) as {
      content?: unknown;
      payload?: { undone?: unknown } | null;
    };
    return {
      content: String(response.content ?? ''),
      undone: response.payload?.undone === true,
    };
  },

  /** Cancels an action ELY is waiting to have confirmed. */
  cancelAction: async (pendingActionId: string): Promise<string> => {
    const companyId = getActiveCompanyId();
    const res = await client.post(
      `/copilot/actions/${encodeURIComponent(pendingActionId)}/cancel`,
      { company_id: companyId ?? undefined },
    );
    const response = unwrap(res.data).response as { content?: unknown } | undefined;
    return String(response?.content ?? 'Okay, I cancelled that. Nothing was changed.');
  },

  listThreads: async (): Promise<ThreadSummary[]> => {
    const res = await client.get(`/copilot/threads${companyQuery()}`);
    const data = unwrap(res.data);
    return Array.isArray(data.items) ? (data.items as ThreadSummary[]) : [];
  },

  getThread: async (threadId: string): Promise<ThreadDetail> => {
    const res = await client.get(
      `/copilot/threads/${encodeURIComponent(threadId)}${companyQuery()}`,
    );
    const data = unwrap(res.data);
    const thread = (data.thread && typeof data.thread === 'object'
      ? data.thread
      : data) as Record<string, unknown>;
    const messages = Array.isArray(thread.messages)
      ? (thread.messages as AssistantMessage[])
      : [];
    return {
      thread_id: String(thread.thread_id ?? threadId),
      created_at: String(thread.created_at ?? ''),
      updated_at: String(thread.updated_at ?? ''),
      message_count: Number(thread.message_count ?? messages.length),
      messages,
      pagination: thread.pagination as ThreadDetail['pagination'],
    };
  },

  deleteThread: async (threadId: string): Promise<void> => {
    await client.delete(`/copilot/threads/${encodeURIComponent(threadId)}${companyQuery()}`);
  },

  /**
   * The backend has no bulk-delete endpoint, so clearing all history means
   * listing the user's threads and deleting each. Failures are swallowed per
   * thread so one stuck delete does not abort the rest.
   */
  deleteAllThreads: async (): Promise<void> => {
    const threads = await assistantApi.listThreads();
    await Promise.all(
      threads.map((t) => assistantApi.deleteThread(t.thread_id).catch(() => undefined)),
    );
  },

  analyzeFile: async (file: File): Promise<{ summary: string }> => {
    const companyId = getActiveCompanyId();
    const formData = new FormData();
    formData.append('file', file);
    if (companyId != null) {
      formData.append('company_id', String(companyId));
    }

    const res = await client.post('/copilot/files/analyze', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    const data = unwrap(res.data);
    const analysis = (data.analysis && typeof data.analysis === 'object'
      ? data.analysis
      : {}) as Record<string, unknown>;
    return {
      summary: String(analysis.summary ?? 'File analysis completed.'),
    };
  },
};
