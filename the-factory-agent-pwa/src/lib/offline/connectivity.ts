import type { ApiError } from '@/types';

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function shouldUseCache(error: unknown): boolean {
  if (isOffline()) return true;

  const apiError = error as ApiError | undefined;
  if (!apiError) return false;

  if (apiError.status === 0) return true;

  const message = apiError.message?.toLowerCase() ?? '';
  return message.includes('network') || message.includes('timeout');
}
