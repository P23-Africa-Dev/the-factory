import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';

export const TASK_COMMENT_MAX_LENGTH = 2000;

export type TaskComment = {
  id: number;
  taskId: number;
  body: string;
  author: {
    id: number;
    name: string;
    role: string | null;
    avatarUrl: string | null;
  } | null;
  isMine: boolean;
  createdAt: string | null;
};

export type TaskCommentThread = {
  items: TaskComment[];
  canComment: boolean;
};

type RawComment = {
  id: number | string;
  task_id: number | string;
  body?: string | null;
  author?: {
    id: number | string;
    name?: string | null;
    role?: string | null;
    avatar_url?: string | null;
  } | null;
  is_mine?: boolean;
  created_at?: string | null;
};

export function normalizeTaskComment(raw: RawComment): TaskComment {
  return {
    id: Number(raw.id),
    taskId: Number(raw.task_id),
    body: String(raw.body ?? ''),
    author: raw.author
      ? {
          id: Number(raw.author.id),
          name: raw.author.name ?? 'Former user',
          role: raw.author.role ?? null,
          avatarUrl: raw.author.avatar_url ?? null,
        }
      : null,
    isMine: Boolean(raw.is_mine),
    createdAt: raw.created_at ?? null,
  };
}

export function normalizeTaskCommentThread(payload: unknown): TaskCommentThread {
  const data = ((payload as { data?: unknown })?.data ?? payload) as {
    items?: RawComment[];
    can_comment?: boolean;
  };
  return {
    items: Array.isArray(data?.items) ? data.items.map(normalizeTaskComment) : [],
    canComment: data?.can_comment !== false,
  };
}

export function validateTaskComment(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Comment cannot be empty.';
  if (trimmed.length > TASK_COMMENT_MAX_LENGTH) {
    return `Comment may not be longer than ${TASK_COMMENT_MAX_LENGTH} characters.`;
  }
  return null;
}

export function canLoadTaskComments(taskId: string): boolean {
  return Boolean(taskId) && !taskId.startsWith('temp-');
}

export const taskCommentApi = {
  list: async (taskId: string): Promise<TaskCommentThread> => {
    const companyId = getActiveCompanyId();
    const response = await client.get(`/admin/tasks/${taskId}/comments`, {
      params: { company_id: companyId ?? undefined },
    });
    return normalizeTaskCommentThread(response.data);
  },

  create: async (taskId: string, body: string): Promise<TaskComment> => {
    const companyId = getActiveCompanyId();
    const response = await client.post(`/admin/tasks/${taskId}/comments`, {
      body: body.trim(),
      company_id: companyId ?? undefined,
    });
    const comment =
      (response.data as { data?: { comment?: RawComment } })?.data?.comment ??
      (response.data as { data?: RawComment })?.data;
    if (!comment) throw new Error('Unexpected response while posting comment.');
    return normalizeTaskComment(comment);
  },
};
