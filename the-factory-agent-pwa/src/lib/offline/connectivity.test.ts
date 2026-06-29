import { describe, expect, it } from 'vitest';

import { isOffline, shouldUseCache } from './connectivity';

describe('isOffline', () => {
  it('returns true when navigator.onLine is false', () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(isOffline()).toBe(true);
    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
  });
});

describe('shouldUseCache', () => {
  it('returns true for offline', () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(shouldUseCache(new Error('anything'))).toBe(true);
    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
  });

  it('returns true for axios network errors', () => {
    expect(shouldUseCache({ status: 0, message: 'Network Error' })).toBe(true);
  });

  it('returns true for timeout messages', () => {
    expect(shouldUseCache({ status: 500, message: 'timeout of 15000ms exceeded' })).toBe(true);
  });

  it('returns false for normal API errors while online', () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(shouldUseCache({ status: 422, message: 'Validation failed' })).toBe(false);
    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
  });
});
