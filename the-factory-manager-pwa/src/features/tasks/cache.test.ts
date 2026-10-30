import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskListResult } from './api';
import { getCachedTaskList, putCachedTaskList } from './cache';

const store = new Map<string, unknown>();

vi.mock('../../lib/db/client', () => ({
  getDb: vi.fn(async () => ({
    get: vi.fn(async (_store: string, key: string) => store.get(key)),
    put: vi.fn(async (_store: string, value: { id: string }) => {
      store.set(value.id, value);
    }),
  })),
}));

const sampleResult: TaskListResult = {
  tasks: [
    {
      id: '1',
      title: 'Visit site',
      status: 'pending',
    } as TaskListResult['tasks'][number],
  ],
  pagination: {
    nextPageUrl: null,
    prevPageUrl: null,
    perPage: 15,
  },
};

describe('tasks cache', () => {
  beforeEach(() => {
    store.clear();
  });

  it('round-trips list cache entries', async () => {
    await putCachedTaskList(7, { status: 'pending' }, sampleResult);
    const cached = await getCachedTaskList(7, { status: 'pending' });
    expect(cached).toEqual(sampleResult);
  });

  it('returns null for missing cache entries', async () => {
    await expect(getCachedTaskList(7, {})).resolves.toBeNull();
  });
});
