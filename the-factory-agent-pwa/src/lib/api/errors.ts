import type { ApiError } from '@/types';
import { toast } from '@/lib/toast';

const GENERIC_API_MESSAGES = new Set(['The given data was invalid.', 'Request failed.']);

export function resolveApiErrorMessage(
  message: string | null | undefined,
  errors?: Record<string, string[]> | null,
): string {
  const fromErrors = errors
    ? Object.values(errors)
        .flat()
        .map((entry) => entry?.trim())
        .filter((entry): entry is string => Boolean(entry))
    : [];

  if (fromErrors.length > 0) {
    return fromErrors.join(' ');
  }

  const trimmed = message?.trim();
  if (trimmed && !GENERIC_API_MESSAGES.has(trimmed)) {
    return trimmed;
  }

  return trimmed || 'Request failed.';
}

export function flattenApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const apiError = error as ApiError;
    return resolveApiErrorMessage(apiError.message, apiError.errors);
  }
  if (error instanceof Error) return error.message;
  return '';
}

export function isTrackingAlreadyActiveError(error: unknown): boolean {
  const text = flattenApiError(error).toLowerCase();
  return text.includes('already active') || text.includes('already tracking');
}

export function showApiErrorToast(error: unknown, title = 'Something went wrong'): void {
  const message = flattenApiError(error);
  toast.error(title, message || 'Please try again.');
}
