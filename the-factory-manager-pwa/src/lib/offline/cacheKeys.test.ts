import { describe, expect, it } from 'vitest';

import { buildCacheId, stableFilterKey, urlPageKey } from './cacheKeys';

describe('stableFilterKey', () => {
  it('returns default for nullish filters', () => {
    expect(stableFilterKey(undefined)).toBe('default');
    expect(stableFilterKey(null)).toBe('default');
  });

  it('sorts keys for stable hashing', () => {
    expect(stableFilterKey({ b: 2, a: 1 })).toBe(stableFilterKey({ a: 1, b: 2 }));
  });
});

describe('buildCacheId', () => {
  it('combines company id and suffix', () => {
    expect(buildCacheId(42, 'task-9')).toBe('42:task-9');
  });
});

describe('urlPageKey', () => {
  it('prefixes pagination urls', () => {
    expect(urlPageKey('/agent/tasks?page=2')).toBe('url:/agent/tasks?page=2');
  });
});
