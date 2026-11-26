import { describe, expect, it } from 'vitest';
import { mergeTrails } from './serverRoute';

describe('mergeTrails', () => {
  it('keeps the whole trip from the server and adds the phone\'s newer points', () => {
    const server: [number, number][] = [[3.0, 6.0], [3.001, 6.0], [3.002, 6.0]];
    const local: [number, number][] = [[3.0015, 6.0], [3.002, 6.0], [3.003, 6.0], [3.004, 6.0]];
    expect(mergeTrails(server, local)).toEqual([[3.0, 6.0], [3.001, 6.0], [3.002, 6.0], [3.003, 6.0], [3.004, 6.0]]);
  });

  it('uses whichever is available when the other is empty', () => {
    expect(mergeTrails([], [[3, 6]])).toEqual([[3, 6]]);
    expect(mergeTrails([[3, 6]], [])).toEqual([[3, 6]]);
  });

  it('does not join trails that do not meet; keeps the longer one', () => {
    const server: [number, number][] = [[3.0, 6.0], [3.001, 6.0]];
    const far: [number, number][] = [[3.5, 6.5]];
    expect(mergeTrails(server, far)).toEqual(server);
  });
});
