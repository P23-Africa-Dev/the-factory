import { describe, expect, it } from 'vitest';
import { formatTripSummaryToast, summarizeTaskRoute } from './tripSummary';
import type { TaskRoute } from './types';

function route(overrides: Partial<TaskRoute> = {}): TaskRoute {
  return {
    task_id: 1,
    company_id: 1,
    status: 'completed',
    destination: { latitude: 6.5, longitude: 3.4, radius_meters: 75 },
    start: {
      latitude: 6.4,
      longitude: 3.3,
      recorded_at: '2026-07-12T11:00:00.000Z',
    },
    arrival: {
      latitude: 6.5,
      longitude: 3.4,
      recorded_at: '2026-07-12T11:30:00.000Z',
    },
    end: {
      latitude: 6.5,
      longitude: 3.4,
      recorded_at: '2026-07-12T11:45:00.000Z',
    },
    summary: {
      points_count: 40,
      total_distance_meters: 4200,
    },
    points: [],
    polyline: [],
    ...overrides,
  };
}

describe('tripSummary', () => {
  it('summarizes distance and duration from route payload', () => {
    const summary = summarizeTaskRoute(route());
    expect(summary.distanceLabel).toBe('4.2 km');
    expect(summary.durationLabel).toBe('45 min');
    expect(summary.pointsCount).toBe(40);
  });

  it('formats toast copy for pause and complete', () => {
    const summary = summarizeTaskRoute(route());
    expect(formatTripSummaryToast(summary, 'paused')).toContain('Trip paused');
    expect(formatTripSummaryToast(summary, 'completed')).toContain('Trip complete');
  });
});
