import type { ApiError } from '@/types';

export function flattenApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const apiError = error as ApiError;
    if (apiError.errors) {
      return Object.values(apiError.errors).flat().join(' ');
    }
    if (typeof apiError.message === 'string' && apiError.message) {
      return apiError.message;
    }
  }
  if (error instanceof Error) return error.message;
  return '';
}

export function isTrackingAlreadyActiveError(error: unknown): boolean {
  const text = flattenApiError(error).toLowerCase();
  return text.includes('already active') || text.includes('already tracking');
}
