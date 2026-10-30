import { describe, expect, it } from 'vitest';

import { parseStartTaskResponse } from './schema';

describe('parseStartTaskResponse', () => {
  it('accepts the nested tracking payload from TaskTrackingController', () => {
    const parsed = parseStartTaskResponse({
      data: {
        tracking: {
          id: 42,
          task_id: 7,
          company_id: 1,
          start: {
            latitude: 6.45,
            longitude: 3.39,
            accuracy_meters: 12,
            recorded_at: '2026-07-16T20:00:00+00:00',
          },
          arrival: {
            latitude: null,
            longitude: null,
            recorded_at: null,
          },
          near: {
            latitude: null,
            longitude: null,
            recorded_at: null,
          },
          end: {
            latitude: null,
            longitude: null,
            accuracy_meters: null,
            recorded_at: null,
          },
          destination: {
            latitude: 6.5,
            longitude: 3.4,
            radius_meters: 50,
          },
          updated_at: '2026-07-16T20:00:00+00:00',
        },
        arrived: false,
        near_destination: false,
        proximity_state: 'in_progress',
        distance_to_destination_meters: 1200,
        distance_remaining_meters: 1200,
        movement_started: false,
        demo_simulation_active: false,
      },
    });

    expect(parsed.tracking.id).toBe(42);
    expect(parsed.tracking.task_id).toBe(7);
    expect(parsed.arrived).toBe(false);
    expect(parsed.tracking.start?.latitude).toBe(6.45);
  });
});
