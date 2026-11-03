import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyProximityFromSync,
  subscribeProximityFromSync,
  type ProximitySyncPayload,
} from './proximityFromSync';
import { useTrackingStore } from '@/store/tracking';

describe('applyProximityFromSync', () => {
  beforeEach(() => {
    useTrackingStore.setState({
      liveTaskMap: {
        7: {
          taskId: 7,
          trackingSessionId: 11,
          agentId: 3,
          agentName: 'Agent',
          agentAvatar: null,
          taskTitle: 'Visit',
          lastPosition: [3.4, 6.5],
          lastHeadingDegrees: null,
          lastSpeedMps: null,
          polyline: [[3.4, 6.5]],
          status: 'tracking',
          arrivedAt: null,
          lastUpdatedAt: null,
          destination: null,
        },
      },
      activeTrackingTaskId: 7,
      wsStatus: 'idle',
      serverSimulatesMovement: false,
    });
  });

  it('marks arrived and notifies listeners', () => {
    const seen: Array<{ taskId: number; payload: ProximitySyncPayload }> = [];
    const unsubscribe = subscribeProximityFromSync((taskId, payload) => {
      seen.push({ taskId, payload });
    });

    applyProximityFromSync(7, {
      arrived: true,
      near_destination: false,
      distance_remaining_meters: 12,
    });

    expect(useTrackingStore.getState().liveTaskMap[7]?.status).toBe('arrived');
    expect(useTrackingStore.getState().liveTaskMap[7]?.arrivedAt).toBeTruthy();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.taskId).toBe(7);
    expect(seen[0]?.payload.arrived).toBe(true);

    unsubscribe();
  });

  it('notifies listeners without marking arrived when still en route', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProximityFromSync(listener);

    applyProximityFromSync(7, {
      arrived: false,
      near_destination: true,
      distance_remaining_meters: 80,
    });

    expect(useTrackingStore.getState().liveTaskMap[7]?.status).toBe('tracking');
    expect(listener).toHaveBeenCalledWith(7, {
      arrived: false,
      near_destination: true,
      distance_remaining_meters: 80,
    });

    unsubscribe();
  });
});
