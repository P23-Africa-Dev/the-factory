/**
 * AI Assistant (ELY) API client for Managers — talks to the shared Laravel
 * copilot endpoints (`/copilot/*`) with full manager write-action confirmation,
 * weekly executive summaries, and sales/operations forecasting.
 */
import { client } from '@/lib/api/client';
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
    actionConfirmed?: boolean;
    actionArgs?: Record<string, unknown> | null;
    idempotencyKey?: string;
    context?: {
      latitude?: number;
      longitude?: number;
      focus?: 'all' | 'visits' | 'followups' | 'tasks';
      limit?: number;
    };
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

  getAssignees: async (): Promise<Array<{ id: number; name: string; email?: string }>> => {
    const res = await client.get(`/copilot/assignees${companyQuery()}`, {
      suppressErrorToast: true,
    });
    const data = unwrap(res.data);
    const items = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.assignees)
        ? data.assignees
        : [];
    return items as Array<{ id: number; name: string; email?: string }>;
  },

  generateWeeklySummary: async (): Promise<{ summary: string }> => {
    const companyId = getActiveCompanyId();
    const res = await client.post('/copilot/reports/weekly-summary', {
      company_id: companyId ?? undefined,
      client_timezone: resolveTimezone(),
    });
    const data = unwrap(res.data);
    return {
      summary: String(
        data.summary ??
          (data.report as { summary?: string } | undefined)?.summary ??
          'Weekly executive report generated.',
      ),
    };
  },

  getForecastOverview: async (): Promise<Record<string, unknown>> => {
    const res = await client.get(`/copilot/forecast/overview${companyQuery()}`, {
      suppressErrorToast: true,
    });
    return unwrap(res.data);
  },
};
