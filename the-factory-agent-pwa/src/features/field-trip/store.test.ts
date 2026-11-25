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

  it('forgets the trip once it ends', () => {
    useFieldTripStore.getState().setLocal(trip);
    useFieldTripStore.getState().setLocal(null);
    useFieldTripStore.getState().hydrate();
    expect(useFieldTripStore.getState().local).toBeNull();
  });
});
