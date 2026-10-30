/**
 * Axios HTTP client for Factory 23 Manager PWA
 *
 * Attaches Bearer token and X-Company-ID header from manager appStore.
 */
import axios, { AxiosError } from 'axios';
import type { ApiError } from '@/types';
import { env } from '@/constants/env';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
import { sessionEvents } from '@/lib/auth/sessionEvents';
import { resolveApiErrorMessage } from '@/lib/api/errors';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** When true, failed responses reject without a global toast (default for all requests). */
    suppressErrorToast?: boolean;
  }
}

const ACCOUNT_STATUS_CODES = new Set([
  'deactivated',
  'suspended_temporary',
  'suspended_permanent',
]);

function isAccountStatusCode(code: string | undefined): boolean {
  return code != null && ACCOUNT_STATUS_CODES.has(code);
}

let sessionExpiredPending = false;
let accountBlockedPending = false;

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
    const companyId = getActiveCompanyId();
    if (companyId && !config.headers['X-Company-ID']) {
      config.headers['X-Company-ID'] = String(companyId);
    }
  } catch {
    // Non-fatal
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const responseData = error.response?.data as Record<string, unknown> | undefined;
    const errors = responseData?.errors as Record<string, string[]> | undefined;
    const apiError: ApiError = {
      status: error.response?.status ?? 0,
      message: resolveApiErrorMessage(
        (responseData?.message as string) ?? error.message ?? 'An unexpected error occurred',
        errors,
      ),
      code:
        (responseData?.code as string) ??
        ((responseData?.data as Record<string, unknown> | undefined)?.account_status as string | undefined),
      errors,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('[API Error]', error.config?.method?.toUpperCase(), error.config?.url);
      console.log('[API Error] status:', apiError.status, '| message:', apiError.message);
    }

    if (apiError.status === 403 && isAccountStatusCode(apiError.code) && !accountBlockedPending) {
      accountBlockedPending = true;
      setTimeout(() => {
        accountBlockedPending = false;
      }, 5_500);

      try {
        appStore.delete('auth_token');
      } catch {
        // Non-fatal
      }

      const params = new URLSearchParams();
      if (apiError.code) params.set('account_status', apiError.code);
      if (apiError.message) params.set('message', apiError.message);
      const query = params.toString();
      window.location.href = query ? `/login?${query}` : '/login';
      return Promise.reject(apiError);
    }

    if (apiError.status === 401 && !sessionExpiredPending) {
      sessionExpiredPending = true;
      setTimeout(() => {
        sessionExpiredPending = false;
      }, 5_500);
      sessionEvents.emit();
    }

    return Promise.reject(apiError);
  },
);
