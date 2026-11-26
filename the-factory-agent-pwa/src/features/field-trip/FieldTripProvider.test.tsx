import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FieldTripCurrent, FieldTripDto } from './types';

const api = vi.hoisted(() => ({
  current: vi.fn(),
  start: vi.fn(),
  end: vi.fn(),
  recordPoints: vi.fn(),
}));
vi.mock('./api', () => ({ fieldTripApi: api }));
const reporter = vi.hoisted(() => ({ flush: vi.fn(async () => true) }));
vi.mock('./useFieldTripReporter', () => ({ useFieldTripReporter: () => reporter }));
const toasts = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast: toasts }));

import { FieldTripProvider, useFieldTrip } from './FieldTripProvider';
import { useFieldTripStore } from './store';
import { isTripNotActiveError, notifyFieldTripServerEnded } from './serverEnded';

const trip = (over: Partial<FieldTripDto> = {}): FieldTripDto => ({
  id: 77,
  source: 'field_trip',
  client_trip_id: null,
  status: 'active',
  started_at: '2026-11-25T09:00:00Z',
  ended_at: null,
  end_reason: null,
  distance_meters: 0,
  stop_count: 0,
  visit_count: 0,
  elapsed_seconds: 0,
  last_recorded_at: null,
  ...over,
});

const current = (t: FieldTripDto | null): FieldTripCurrent => ({
  enabled: true,
  can_manage_settings: false,
  trip: t,
  today: { trip_count: 0, distance_meters: 0, stop_count: 0 },
  settings: {
    stop_dwell_seconds: 300,
    trip_reminder_seconds: 18000,
    trip_auto_end_seconds: 7200,
    moving_interval_seconds: 30,
    stationary_interval_seconds: 60,
  },
});

const sink: { current: ReturnType<typeof useFieldTrip> | null } = { current: null };
function Probe() {
  const value = useFieldTrip();
  React.useEffect(() => {
    sink.current = value;
  });
  return null;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FieldTripProvider>
        <Probe />
      </FieldTripProvider>
    </QueryClientProvider>,
  );
  return client;
}

const flushAsync = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

describe('FieldTripProvider first-tap reliability', () => {
  beforeEach(() => {
    localStorage.clear();
    useFieldTripStore.setState({ local: null, trail: [], lastPosition: null });
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toasts).forEach((fn) => fn.mockReset());
    reporter.flush.mockReset();
    reporter.flush.mockResolvedValue(true);
    sink.current = null;
  });

  it('a stale "no trip" answer arriving after Start does not end the new trip', async () => {
    api.current.mockResolvedValue(current(null));
    const client = setup();
    await flushAsync();

    // A status check that was already on its way and answers late with "no trip".
    let resolveStale: (v: FieldTripCurrent) => void = () => {};
    api.current.mockImplementationOnce(() => new Promise((r) => (resolveStale = r)));
    void client.refetchQueries({ queryKey: ['field-trip', 'current'] });
    api.start.mockResolvedValue({ trip: trip(), created: true });

    await act(async () => {
      await sink.current!.startTrip(null);
    });
    await act(async () => {
      resolveStale(current(null));
    });
    await flushAsync();

    expect(useFieldTripStore.getState().local?.serverId).toBe(77);
    expect(toasts.info).not.toHaveBeenCalled(); // no "has ended" / "started offline"
    expect(api.start).toHaveBeenCalledTimes(1); // button + background retry share one request
  });

  it('a stale "trip running" answer arriving after End does not bring the trip back', async () => {
    api.current.mockResolvedValue(current(null));
    api.start.mockResolvedValue({ trip: trip(), created: true });
    setup();
    await flushAsync();
    await act(async () => {
      await sink.current!.startTrip(null);
    });

    api.current.mockResolvedValue(current(trip())); // server still says running (stale)
    api.end.mockResolvedValue({ trip: trip({ status: 'completed', ended_at: '2026-11-25T10:00:00Z', end_reason: 'user' }) });

    let ended: FieldTripDto | null = null;
    await act(async () => {
      ended = await sink.current!.endTrip(null);
    });
    await flushAsync();

    expect(ended).not.toBeNull();
    expect(api.end).toHaveBeenCalledTimes(1);
    expect(useFieldTripStore.getState().local).toBeNull();
    expect(toasts.success).toHaveBeenCalledWith('Field trip saved', expect.any(String));
    expect(toasts.info).not.toHaveBeenCalled();
  });

  it('stops the trip at once when an upload says the server already ended it', async () => {
    api.current.mockResolvedValue(current(null));
    api.start.mockResolvedValue({ trip: trip(), created: true });
    setup();
    await flushAsync();
    await act(async () => {
      await sink.current!.startTrip(null);
    });
    expect(useFieldTripStore.getState().local?.serverId).toBe(77);

    // Another trip's refusal is ignored.
    await act(async () => notifyFieldTripServerEnded(12));
    expect(useFieldTripStore.getState().local?.serverId).toBe(77);

    // Server still says "running" in a stale cache: the refusal wins.
    api.current.mockResolvedValue(current(trip()));
    api.end.mockResolvedValue({ trip: trip({ status: 'auto_closed', end_reason: 'auto_no_signal' }) });
    await act(async () => notifyFieldTripServerEnded(77));
    await flushAsync();

    expect(useFieldTripStore.getState().local).toBeNull();
    expect(sink.current!.lastEnded?.end_reason).toBe('auto_no_signal'); // card can say why
    expect(toasts.info).toHaveBeenCalledWith('Your field trip has ended', expect.any(String));
  });
});

describe('FieldTripProvider end keeps the whole route', () => {
  beforeEach(() => {
    localStorage.clear();
    useFieldTripStore.setState({ local: null, trail: [], lastPosition: null });
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toasts).forEach((fn) => fn.mockReset());
    reporter.flush.mockReset();
    reporter.flush.mockResolvedValue(true);
  });

  it('does not end the trip on the server while points are still waiting to upload', async () => {
    api.current.mockResolvedValue(current(null));
    api.start.mockResolvedValue({ trip: trip(), created: true });
    setup();
    await flushAsync();
    await act(async () => {
      await sink.current!.startTrip(null);
    });

    reporter.flush.mockResolvedValue(false); // offline: points still on the phone
    let ended: FieldTripDto | null = null;
    await act(async () => {
      ended = await sink.current!.endTrip(null);
    });

    expect(ended).toBeNull();
    expect(api.end).not.toHaveBeenCalled();
    expect(useFieldTripStore.getState().local?.phase).toBe('ending');
    expect(toasts.info).toHaveBeenCalledWith('Ending when back online', expect.any(String));
  });

  it('ends anyway once End has waited too long for the last points', async () => {
    api.current.mockResolvedValue(current(null));
    api.start.mockResolvedValue({ trip: trip(), created: true });
    setup();
    await flushAsync();
    await act(async () => {
      await sink.current!.startTrip(null);
    });

    reporter.flush.mockResolvedValue(false);
    api.end.mockResolvedValue({ trip: trip({ status: 'completed', end_reason: 'user' }) });
    const longAgo = new Date(Date.now() - 11 * 60_000).toISOString();
    let ended: FieldTripDto | null = null;
    await act(async () => {
      ended = await sink.current!.endTrip({ latitude: 6.5, longitude: 3.3, accuracyMeters: 5, recordedAt: longAgo });
    });

    expect(ended).not.toBeNull();
    expect(api.end).toHaveBeenCalledTimes(1);
  });
});

describe('isTripNotActiveError', () => {
  it('matches only the server "not active" refusal', () => {
    expect(isTripNotActiveError({ status: 422, message: 'Field activity session is not active.' })).toBe(true);
    expect(isTripNotActiveError({ status: 422, message: 'The points field is required.' })).toBe(false);
    expect(isTripNotActiveError({ status: 500, message: 'not active' })).toBe(false);
  });
});

describe('FieldTripProvider never ends a running trip on one wrong status answer', () => {
  beforeEach(() => {
    localStorage.clear();
    useFieldTripStore.setState({ local: null, trail: [], lastPosition: null });
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toasts).forEach((fn) => fn.mockReset());
    reporter.flush.mockReset();
    reporter.flush.mockResolvedValue(true);
  });

  it('keeps the trip when the fresh re-check says it is still running, and never calls End', async () => {
    api.current.mockResolvedValue(current(null));
    api.start.mockResolvedValue({ trip: trip(), created: true });
    const client = setup();
    await flushAsync();
    await act(async () => {
      await sink.current!.startTrip(null);
    });

    // A stale "no trip" answer arrives (e.g. from a cache)…
    api.current.mockResolvedValueOnce(current(null)).mockResolvedValue(current(trip()));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await client.refetchQueries({ queryKey: ['field-trip', 'current'] });
    });
    await flushAsync();

    expect(useFieldTripStore.getState().local?.serverId).toBe(77);
    expect(api.end).not.toHaveBeenCalled();
    expect(toasts.info).not.toHaveBeenCalled();
  });

  it('drops the trip only when the re-check confirms it ended, still without calling End', async () => {
    api.current.mockResolvedValue(current(null));
    api.start.mockResolvedValue({ trip: trip(), created: true });
    const client = setup();
    await flushAsync();
    await act(async () => {
      await sink.current!.startTrip(null);
    });

    api.current.mockResolvedValue(current(null));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
      await client.refetchQueries({ queryKey: ['field-trip', 'current'] });
    });
    await flushAsync();

    expect(useFieldTripStore.getState().local).toBeNull();
    expect(api.end).not.toHaveBeenCalled();
    expect(toasts.info).toHaveBeenCalledWith('Your field trip has ended', expect.any(String));
  });
});
