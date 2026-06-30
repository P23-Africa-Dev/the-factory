import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildOptimisticLead, nextTempLeadId } from './cache';

const store = new Map<string, unknown>();

vi.mock('../../lib/db/client', () => ({
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async () => Array.from(store.values())),
    get: vi.fn(async (_store: string, key: string) => store.get(key)),
    put: vi.fn(async (_store: string, value: { id: string }) => {
      store.set(value.id, value);
    }),
    getAllFromIndex: vi.fn(async () => []),
    delete: vi.fn(async (_store: string, key: string) => {
      store.delete(key);
    }),
  })),
}));

describe('buildOptimisticLead', () => {
  it('creates a pending lead with negative temp id', () => {
    const lead = buildOptimisticLead({
      tempId: -5,
      companyId: 10,
      payload: {
        pipeline_id: 2,
        name: 'Acme Corp',
        email: 'ops@acme.test',
        status: 'new',
      },
    });

    expect(lead.id).toBe(-5);
    expect(lead.companyId).toBe(10);
    expect(lead.name).toBe('Acme Corp');
    expect(lead.email).toBe('ops@acme.test');
    expect(lead.status).toBe('new');
    expect(lead.createdAt).toBeTruthy();
  });
});

describe('nextTempLeadId', () => {
  beforeEach(() => {
    store.clear();
  });

  it('returns -1 when cache is empty', async () => {
    await expect(nextTempLeadId()).resolves.toBe(-1);
  });

  it('returns one less than the current minimum id', async () => {
    store.set('10:-3', { leadId: -3 });
    await expect(nextTempLeadId()).resolves.toBe(-4);
  });
});
