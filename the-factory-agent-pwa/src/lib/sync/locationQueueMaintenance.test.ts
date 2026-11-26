import { describe, expect, it, vi } from 'vitest';

type Row = { id: number; synced: number; recordedAt: string; fieldTripClientId?: string; fieldActivitySessionId?: number | null };
const rows = vi.hoisted(() => new Map<number, Row>());

vi.mock('@/lib/db/client', () => ({
  getDb: async () => ({
    getAllFromIndex: async (_store: string, _index: string, value: number) => [...rows.values()].filter((r) => r.synced === value),
    getAll: async () => [...rows.values()],
    transaction: () => ({
      store: { delete: async (id: number) => void rows.delete(id) },
      done: Promise.resolve(),
    }),
  }),
}));

import { deleteTripRows, pruneSyncedLocationRows } from './locationQueueMaintenance';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('location queue maintenance', () => {
  it('deletes only uploaded points older than 48 h', async () => {
    rows.clear();
    rows.set(1, { id: 1, synced: 1, recordedAt: hoursAgo(50) });
    rows.set(2, { id: 2, synced: 1, recordedAt: hoursAgo(10) });
    rows.set(3, { id: 3, synced: 0, recordedAt: hoursAgo(80) }); // still waiting: never deleted

    expect(await pruneSyncedLocationRows(NOW, true)).toBe(1);
    expect([...rows.keys()]).toEqual([2, 3]);
  });

  it('drops the points of a trip the server refused to start', async () => {
    rows.clear();
    rows.set(1, { id: 1, synced: 0, recordedAt: hoursAgo(1), fieldTripClientId: 'refused', fieldActivitySessionId: null });
    rows.set(2, { id: 2, synced: 0, recordedAt: hoursAgo(1), fieldTripClientId: 'other', fieldActivitySessionId: null });

    await deleteTripRows('refused');
    expect([...rows.keys()]).toEqual([2]);
  });
});
