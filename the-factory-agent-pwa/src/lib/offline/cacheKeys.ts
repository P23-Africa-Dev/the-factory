export function stableFilterKey(filters: unknown): string {
  if (filters == null || typeof filters !== 'object') return 'default';

  const sorted = Object.keys(filters as object)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (filters as Record<string, unknown>)[key];
      return acc;
    }, {});

  return JSON.stringify(sorted);
}

export function buildCacheId(companyId: number, suffix: string): string {
  return `${companyId}:${suffix}`;
}

export function urlPageKey(url: string): string {
  return `url:${url}`;
}
