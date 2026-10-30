import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  client: { get: mocks.get, post: mocks.post },
}));

vi.mock('@/lib/storage/stores', () => ({
  getActiveCompanyId: () => 12,
}));

import {
  canLoadTaskComments,
  normalizeTaskCommentThread,
  taskCommentApi,
  validateTaskComment,
} from './comments';
import { createSelfTaskSchema } from './schema';
import { validateTaskDescription } from './description';

const rawComment = {
  id: 4,
  task_id: 9,
  body: 'Shop was closed.',
  author: { id: 3, name: 'Ada Agent', role: 'agent', avatar_url: null },
  is_mine: true,
  created_at: '2026-10-30T09:00:00.000Z',
};

describe('task comments', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('normalizes the API envelope', () => {
    const thread = normalizeTaskCommentThread({
      success: true,
      data: { items: [rawComment], can_comment: true },
    });

    expect(thread.canComment).toBe(true);
    expect(thread.items).toEqual([
      {
        id: 4,
        taskId: 9,
        body: 'Shop was closed.',
        author: { id: 3, name: 'Ada Agent', role: 'agent', avatarUrl: null },
        isMine: true,
        createdAt: '2026-10-30T09:00:00.000Z',
      },
    ]);
  });

  it('falls back safely for missing data', () => {
    expect(normalizeTaskCommentThread({ data: null })).toEqual({ items: [], canComment: false });
  });

  it('loads comments from the agent-scoped endpoint', async () => {
    mocks.get.mockResolvedValue({ data: { data: { items: [rawComment], can_comment: true } } });

    const thread = await taskCommentApi.list('9');

    expect(mocks.get).toHaveBeenCalledWith('/agent/tasks/9/comments', { params: { company_id: 12 } });
    expect(thread.items).toHaveLength(1);
  });

  it('posts a trimmed comment and never sends an author id', async () => {
    mocks.post.mockResolvedValue({ data: { data: { comment: rawComment } } });

    const comment = await taskCommentApi.create('9', '  Shop was closed.  ');

    expect(mocks.post).toHaveBeenCalledWith('/agent/tasks/9/comments', {
      body: 'Shop was closed.',
      company_id: 12,
    });
    expect(comment.id).toBe(4);
  });

  it('validates comment text', () => {
    expect(validateTaskComment('')).toBe('Comment cannot be empty.');
    expect(validateTaskComment('   \n ')).toBe('Comment cannot be empty.');
    expect(validateTaskComment('a'.repeat(2001))).toMatch(/2000 characters/);
    expect(validateTaskComment('On my way')).toBeNull();
  });

  it('skips comment loading for offline-created tasks', () => {
    expect(canLoadTaskComments('temp-123')).toBe(false);
    expect(canLoadTaskComments('')).toBe(false);
    expect(canLoadTaskComments('42')).toBe(true);
  });
});

describe('task description validation', () => {
  it.each([undefined, null, '', '   ', '\n\t '])('requires a description (%j)', (value) => {
    expect(validateTaskDescription(value)).toBe('Task description is required.');
  });

  it('enforces the minimum length after trimming', () => {
    expect(validateTaskDescription('  short  ')).toBe('Task description must be at least 10 characters.');
    expect(validateTaskDescription('Check stock at the store')).toBeNull();
  });

  it('rejects missing or blank descriptions in the self-task schema', () => {
    const base = { title: 'Visit store', type: 'inspection' as const };
    expect(createSelfTaskSchema.safeParse(base).success).toBe(false);
    expect(createSelfTaskSchema.safeParse({ ...base, description: '    ' }).success).toBe(false);
    expect(createSelfTaskSchema.safeParse({ ...base, description: 'Check stock levels' }).success).toBe(true);
  });
});
