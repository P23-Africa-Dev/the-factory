import { describe, expect, it } from 'vitest';
import { coordinatesOf, journeySubtitle, journeyTitle, playbackIndex, type JourneyRouteDto } from './journeyDetail';

describe('journey detail helpers', () => {
  it('titles a field trip with its time range, and a running one "– now"', () => {
    const t = journeyTitle({ id: 1, date: '2026-11-26', distance_meters: 0, source: 'field_trip', started_at: '2026-11-26T09:05:00Z', ended_at: '2026-11-26T11:40:00Z' });
    expect(t).toMatch(/^Field trip · .+ – .+$/);
    expect(journeyTitle({ id: 1, date: null, distance_meters: 0, source: 'field_trip', started_at: '2026-11-26T09:05:00Z', ended_at: null })).toMatch(/– now$/);
    expect(journeyTitle({ id: 2, date: '2026-11-20', distance_meters: 0, source: 'attendance' })).toBe('2026-11-20');
  });

  it('explains an automatic end', () => {
    expect(journeySubtitle({ id: 1, date: '2026-11-26', distance_meters: 0, source: 'field_trip', end_reason: 'auto_no_signal' })).toBe(
      '2026-11-26 · Ended automatically (no location)',
    );
  });

  it('plays back by time, so a long stop takes its real share of the timeline', () => {
    const route: JourneyRouteDto = {
      type: 'LineString',
      coordinates: [[3, 6], [3.1, 6], [3.2, 6], [3.3, 6]],
      timestamps: ['2026-11-26T09:00:00Z', '2026-11-26T09:01:00Z', '2026-11-26T09:09:00Z', '2026-11-26T09:10:00Z'],
      point_count: 4,
    };
    expect(playbackIndex(route, 0)).toBe(0);
    expect(playbackIndex(route, 0.5)).toBe(1); // 09:05 is still at the stop after point 1
    expect(playbackIndex(route, 1)).toBe(3);
    expect(playbackIndex({ ...route, timestamps: undefined }, 0.5)).toBe(2);
    expect(playbackIndex({ ...route, coordinates: [] }, 0.5)).toBe(-1);
  });

  it('reads stop coordinates sent as strings', () => {
    expect(coordinatesOf({ id: 1, latitude: '6.5', longitude: '3.3', address: null, arrived_at: null, departed_at: null, duration_seconds: 0, classification: null })).toEqual([3.3, 6.5]);
  });
});
