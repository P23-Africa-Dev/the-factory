import { describe, expect, it } from 'vitest';

import { createSelfTaskSchema, taskSchema } from './schema';

const baseTask = {
  id: 42,
  title: 'Visit the client office',
  status: 'pending' as const,
};

describe('task observers', () => {
  it('maps observers and the observer flag from the API', () => {
    const task = taskSchema.parse({
      ...baseTask,
      observers: [
        { id: 7, name: 'Grace Hopper', avatar_url: 'https://cdn.example.com/a.png' },
        { id: '8', name: 'Alan Turing', avatar_url: null },
      ],
      is_observer: true,
    });

    expect(task.observers).toEqual([
      { id: '7', name: 'Grace Hopper', avatarUrl: 'https://cdn.example.com/a.png' },
      { id: '8', name: 'Alan Turing', avatarUrl: null },
    ]);
    expect(task.isObserver).toBe(true);
  });

  it('defaults to no observers for tasks from older API responses', () => {
    const task = taskSchema.parse(baseTask);

    expect(task.observers).toEqual([]);
    expect(task.isObserver).toBe(false);
  });

  it('accepts observer ids when creating a task', () => {
    const parsed = createSelfTaskSchema.safeParse({ title: 'Visit store', observer_ids: [3, 4] });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.observer_ids).toEqual([3, 4]);
  });
});
