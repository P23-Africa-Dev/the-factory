import { describe, expect, it } from 'vitest';
import { useTrackingStore } from './tracking';

describe('tracking store', () => {
  it('appends a live point to a task added without a trail (no crash)', () => {
    useTrackingStore.setState({ liveTaskMap: {} });
    useTrackingStore.getState().upsertTask(569, { taskId: 569, taskTitle: 'Test' });
    expect(() => useTrackingStore.getState().appendPolylinePoint(569, [3.38, 6.53])).not.toThrow();
    expect(useTrackingStore.getState().liveTaskMap[569]?.polyline).toEqual([[3.38, 6.53]]);
  });
});
