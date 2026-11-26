import { describe, expect, it } from 'vitest';
import { formatDistance, formatElapsed, plural, secondsSince } from './format';

describe('field trip formatting', () => {
  it('formats elapsed time as hh:mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(5050)).toBe('01:24:10');
  });

  it('formats distance', () => {
    expect(formatDistance(640)).toBe('640 m');
    expect(formatDistance(6800)).toBe('6.8 km');
    expect(formatDistance(18400)).toBe('18 km');
  });

  it('counts seconds since a timestamp', () => {
    expect(secondsSince('2026-11-25T09:00:00Z', Date.parse('2026-11-25T09:01:30Z'))).toBe(90);
    expect(secondsSince(null)).toBe(0);
  });

  it('pluralises', () => {
    expect(plural(1, 'stop')).toBe('1 stop');
    expect(plural(3, 'stop')).toBe('3 stops');
  });
});
