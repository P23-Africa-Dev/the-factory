/**
 * Axios HTTP client — ported from mobile app's src/lib/api/client.ts
 *
 * Key changes from mobile:
 * - Token read from localStorage (via appStore) instead of MMKV
 * - Sentry import path changed to @sentry/nextjs (or console fallback)
 * - __DEV__ check replaced with process.env.NODE_ENV
 */
import axios, { AxiosError } from 'axios';
import type { ApiError } from '@/types';
import { env } from '@/constants/env';
import { appStore } from '@/lib/storage/stores';
import { sessionEvents } from '@/lib/auth/sessionEvents';
import { toast } from '@/lib/toast';

// Prevents multiple concurrent 401s from stacking the modal
let sessionExpiredPending = false;

export const client = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(async (config) => {
  try {
    const token = appStore.getString('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Token read failure is non-fatal — request proceeds unauthenticated
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    const apiError: ApiError = {
      status: error.response?.status ?? 0,
      message:
        (responseData?.message as string) ??
        error.message ??
        'An unexpected error occurred',
      code: responseData?.code as string | undefined,
      errors: responseData?.errors as Record<string, string[]> | undefined,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('[API Error]', error.config?.method?.toUpperCase(), error.config?.url);
      console.log('[API Error] status:', apiError.status, '| message:', apiError.message);
      console.log('[API Error] raw response:', JSON.stringify(responseData, null, 2));
    }

    // 401 Unauthenticated — show session-expired modal then auto-logout
    if (apiError.status === 401 && !sessionExpiredPending) {
      sessionExpiredPending = true;
      // Reset flag after the modal's countdown (4s + small buffer)
      setTimeout(() => {
        sessionExpiredPending = false;
      }, 5_500);
      sessionEvents.emit();
    } else if (apiError.status !== 401) {
      const description = apiError.errors
        ? Object.values(apiError.errors).flat().join('\n')
        : undefined;
      toast.error(apiError.message, description);
    }

    return Promise.reject(apiError);
  },
);
