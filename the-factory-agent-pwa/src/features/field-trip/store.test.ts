import { beforeEach, describe, expect, it } from 'vitest';
import { useFieldTripStore } from './store';
import type { LocalTrip } from './types';

const trip: LocalTrip = {
  clientTripId: '11111111-1111-4111-8111-111111111111',
  serverId: null,
  startedAt: '2026-11-25T09:00:00.000Z',
  startPosition: null,
  phase: 'active',
  endRequestedAt: null,
  endPosition: null,
};

describe('field trip store', () => {
  beforeEach(() => {
    localStorage.clear();
    useFieldTripStore.setState({ local: null });
  });

  it('survives a reload and resumes with the server id', () => {
    useFieldTripStore.getState().setLocal(trip);
    useFieldTripStore.getState().patchLocal({ serverId: 42 });

    useFieldTripStore.setState({ local: null }); // simulate a reload
    useFieldTripStore.getState().hydrate();

    expect(useFieldTripStore.getState().local).toMatchObject({ clientTripId: trip.clientTripId, serverId: 42 });
  });

  it('builds the on-map trail from fixes, skipping jitter and very noisy readings', () => {
    useFieldTripStore.getState().setLocal(trip);
    const fix = useFieldTripStore.getState().recordFix;
    fix(8, [3.3792, 6.5244]);
    fix(8, [3.37921, 6.52441]); // ~1.5 m away: jitter, not drawn
    fix(8, [3.3802, 6.5254]); // ~150 m away: drawn
    fix(400, [3.39, 6.53]); // too inaccurate for the line, still "you are here"

    const state = useFieldTripStore.getState();
    expect(state.trail).toEqual([
      [3.3792, 6.5244],
      [3.3802, 6.5254],
    ]);
    expect(state.lastPosition).toEqual([3.39, 6.53]);

    useFieldTripStore.getState().setLocal(null);
    expect(useFieldTripStore.getState().trail).toEqual([]);
  });

  it('forgets the trip once it ends', () => {
    useFieldTripStore.getState().setLocal(trip);
    useFieldTripStore.getState().setLocal(null);
    useFieldTripStore.getState().hydrate();
    expect(useFieldTripStore.getState().local).toBeNull();
  });
});
